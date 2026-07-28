/* ULC Portal — hardened Supabase bridge (retries, health, batch, offline queue) */
(function (global) {
  const MAX_RETRIES = 8;
  const BASE_DELAY = 500;
  const LS_QUEUE = "ulc_cloud_queue_v1";

  let _client = null;
  let _health = { ok: false, checkedAt: 0, detail: "not checked" };
  let _flushing = false;

  function cfg() {
    return global.ULC_CONFIG || {};
  }
  function ready() {
    const c = cfg();
    return !!(c.supabaseUrl && c.supabaseAnonKey && global.supabase);
  }
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function loadQueue() {
    try { return JSON.parse(localStorage.getItem(LS_QUEUE) || "[]"); } catch { return []; }
  }
  function saveQueue(q) {
    localStorage.setItem(LS_QUEUE, JSON.stringify(q.slice(-200)));
  }

  function isRetryable(err) {
    const m = String(err?.message || err || "").toLowerCase();
    const status = Number(err?.status || err?.code || 0);
    return (
      status === 429 || status === 502 || status === 503 || status === 504 ||
      m.includes("rate limit") || m.includes("fetch") || m.includes("network") ||
      m.includes("timeout") || m.includes("temporar") || m.includes("failed to fetch")
    );
  }

  async function withRetry(label, fn) {
    let last;
    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        return await fn();
      } catch (err) {
        last = err;
        if (!isRetryable(err) || i === MAX_RETRIES - 1) throw err;
        const wait = BASE_DELAY * Math.pow(2, i) + Math.floor(Math.random() * 250);
        console.warn(`[ulc-cloud] retry ${i + 1}/${MAX_RETRIES} ${label} in ${wait}ms`, err?.message || err);
        await sleep(wait);
      }
    }
    throw last;
  }

  function getClient() {
    if (!ready()) return null;
    if (_client) return _client;
    const c = cfg();
    _client = global.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: global.localStorage,
      },
      global: { headers: { "x-ulc-client": "ulc-portal-metal" } },
      db: { schema: "public" },
    });
    return _client;
  }

  async function pingHealth() {
    const c = cfg();
    if (!c.supabaseUrl || !c.supabaseAnonKey) {
      _health = { ok: false, checkedAt: Date.now(), detail: "missing config" };
      return _health;
    }
    try {
      const res = await withRetry("health", async () => {
        const r = await fetch(`${c.supabaseUrl}/auth/v1/health`, {
          headers: { apikey: c.supabaseAnonKey, Authorization: `Bearer ${c.supabaseAnonKey}` },
        });
        if (!r.ok) throw Object.assign(new Error("health " + r.status), { status: r.status });
        return r.json();
      });
      // also probe REST
      const sb = getClient();
      if (sb) {
        const probe = await sb.from("profiles").select("id").limit(1);
        if (probe.error && probe.error.code !== "PGRST116") {
          // empty/permission still means API is up for anon
        }
      }
      _health = { ok: true, checkedAt: Date.now(), detail: res?.name || "ok", version: res?.version };
    } catch (err) {
      _health = { ok: false, checkedAt: Date.now(), detail: String(err?.message || err) };
    }
    return _health;
  }

  function lastHealth() { return _health; }

  async function sbCall(label, runner) {
    const sb = getClient();
    if (!sb) throw new Error("Supabase not configured");
    return withRetry(label, async () => {
      const result = await runner(sb);
      if (result && typeof result === "object" && "error" in result && result.error) {
        const err = result.error;
        const e = new Error(err.message || "Supabase error");
        e.status = err.status || err.code;
        e.code = err.code;
        e.details = err.details;
        throw e;
      }
      return result;
    });
  }

  function enqueue(op) {
    const q = loadQueue();
    q.push({ ...op, at: Date.now() });
    saveQueue(q);
  }

  async function flushQueue() {
    if (_flushing) return { flushed: 0 };
    _flushing = true;
    let flushed = 0;
    try {
      const q = loadQueue();
      const remain = [];
      for (const item of q) {
        try {
          if (item.type === "award_insert") {
            await insertAwardsBatch(item.rows);
          } else if (item.type === "profile_upsert") {
            await upsertProfile(item.row);
          } else if (item.type === "award_delete") {
            await deleteAward(item.userId, item.awardId);
          } else if (item.type === "workspace_upsert") {
            await saveWorkspace(item.userId, item.payload);
          }
          flushed++;
        } catch (err) {
          remain.push(item);
          if (!isRetryable(err)) console.warn("[ulc-cloud] drop queue item", item.type, err.message);
          else break; // stop on first retryable to preserve order
        }
      }
      saveQueue(remain);
    } finally {
      _flushing = false;
    }
    return { flushed };
  }

  async function upsertProfile(row) {
    try {
      return await sbCall("profiles.upsert", (sb) =>
        sb.from("profiles").upsert(row, { onConflict: "id" }).select("id").single()
      );
    } catch (err) {
      if (isRetryable(err)) enqueue({ type: "profile_upsert", row });
      throw err;
    }
  }

  async function listAwards(userId) {
    const { data } = await sbCall("awards.list", (sb) =>
      sb.from("award_lists").select("*").eq("user_id", userId)
    );
    return (data || [])
      .map((r) => ({ ...r, updatedAt: new Date(r.updated_at || Date.now()).getTime() }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async function insertAwardsBatch(rows) {
    if (!rows.length) return [];
    const CHUNK = 40;
    const out = [];
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const { data } = await sbCall("awards.batchInsert", (sb) =>
          sb.from("award_lists").insert(slice).select("id,subject_name,user_id")
        );
        out.push(...(data || []));
      }
      return out;
    } catch (err) {
      if (isRetryable(err)) enqueue({ type: "award_insert", rows });
      throw err;
    }
  }

  async function deleteAward(userId, awardId) {
    try {
      return await sbCall("awards.delete", (sb) =>
        sb.from("award_lists").delete().eq("id", awardId).eq("user_id", userId).select("id")
      );
    } catch (err) {
      if (isRetryable(err)) enqueue({ type: "award_delete", userId, awardId });
      throw err;
    }
  }

  async function publishInstructor(name) {
    name = String(name || "").trim();
    if (!name) return;
    try {
      await sbCall("instructors.upsert", (sb) =>
        sb.from("instructors").upsert({ official_name: name }, { onConflict: "official_name" })
      );
    } catch (_) { /* non-fatal */ }
  }

  function workspaceKind(payload) {
    const k = payload?.data?.kind || payload?.kind || "";
    return k === "student" ? "student" : "teacher";
  }

  function workspaceTable(kind) {
    return kind === "student" ? "student_workspaces" : "teacher_workspaces";
  }

  function buildWorkspaceRow(userId, payload) {
    const data = payload.data != null ? payload.data : (payload.user_id ? payload.data : {});
    const kind = workspaceKind(payload);
    const classes = Array.isArray(data?.classes) ? data.classes : [];
    const row = {
      user_id: userId,
      email: payload.email || null,
      full_name: payload.full_name || payload.fullName || null,
      data: data || {},
      updated_at: payload.updated_at || new Date().toISOString(),
    };
    if (kind === "teacher") {
      row.official_name = payload.official_name || payload.officialName || data?.officialName || null;
      row.class_count = Number(payload.class_count != null ? payload.class_count : classes.length) || 0;
      if (!row.full_name) row.full_name = row.official_name;
    }
    return { kind, row };
  }

  /** Per-user JSON workspace. Teachers → teacher_workspaces; students → student_workspaces (fallback teacher_workspaces). */
  async function saveWorkspace(userId, payload) {
    if (!userId) throw new Error("saveWorkspace: missing user id");
    // Queue flush may pass already-built row (with user_id)
    const incoming = payload && payload.user_id ? { data: payload.data, email: payload.email, full_name: payload.full_name, official_name: payload.official_name, class_count: payload.class_count, updated_at: payload.updated_at, kind: payload.data?.kind } : payload;
    const { kind, row } = buildWorkspaceRow(userId, incoming || {});
    const table = workspaceTable(kind);
    try {
      return await sbCall("workspace.upsert." + table, (sb) =>
        sb.from(table).upsert(row, { onConflict: "user_id" }).select("user_id,updated_at").single()
      );
    } catch (err) {
      // Older projects may not have student_workspaces yet — fall back for students
      if (kind === "student") {
        try {
          const teacherRow = {
            user_id: row.user_id,
            email: row.email,
            full_name: row.full_name,
            official_name: row.full_name,
            class_count: 0,
            data: row.data,
            updated_at: row.updated_at,
          };
          return await sbCall("workspace.upsert.teacher_workspaces.fallback", (sb) =>
            sb.from("teacher_workspaces").upsert(teacherRow, { onConflict: "user_id" }).select("user_id,updated_at").single()
          );
        } catch (err2) {
          if (isRetryable(err2)) enqueue({ type: "workspace_upsert", userId, payload: row });
          throw err2;
        }
      }
      // If new columns missing, retry with classic columns only
      const msg = String(err?.message || err || "").toLowerCase();
      if (msg.includes("email") || msg.includes("full_name") || msg.includes("class_count") || msg.includes("column") || msg.includes("schema cache")) {
        try {
          const classic = {
            user_id: row.user_id,
            official_name: row.official_name || row.full_name || null,
            data: row.data,
            updated_at: row.updated_at,
          };
          return await sbCall("workspace.upsert.classic", (sb) =>
            sb.from(table).upsert(classic, { onConflict: "user_id" }).select("user_id,updated_at").single()
          );
        } catch (err3) {
          if (isRetryable(err3)) enqueue({ type: "workspace_upsert", userId, payload: row });
          throw err3;
        }
      }
      if (isRetryable(err)) enqueue({ type: "workspace_upsert", userId, payload: row });
      throw err;
    }
  }

  async function loadWorkspace(userId, opts) {
    if (!userId) return null;
    const prefer = opts?.kind === "student" ? "student" : opts?.kind === "teacher" ? "teacher" : null;
    const tables = prefer === "student"
      ? ["student_workspaces", "teacher_workspaces"]
      : prefer === "teacher"
        ? ["teacher_workspaces"]
        : ["teacher_workspaces", "student_workspaces"];
    for (const table of tables) {
      try {
        const { data } = await sbCall("workspace.load." + table, (sb) =>
          sb.from(table).select("user_id,email,full_name,official_name,class_count,data,updated_at").eq("user_id", userId).maybeSingle()
        );
        if (data) return data;
      } catch (err) {
        const msg = String(err?.message || err || "").toLowerCase();
        if (msg.includes("column") || msg.includes("schema cache")) {
          const { data } = await sbCall("workspace.load.classic." + table, (sb) =>
            sb.from(table).select("user_id,official_name,data,updated_at").eq("user_id", userId).maybeSingle()
          );
          if (data) return data;
        } else if (table === "student_workspaces") {
          continue;
        } else {
          throw err;
        }
      }
    }
    return null;
  }

  async function fetchProfile(userId) {
    if (!userId) return null;
    const { data } = await sbCall("profiles.get", (sb) =>
      sb.from("profiles").select("*").eq("id", userId).maybeSingle()
    );
    return data || null;
  }

  async function listProfilesByRole(role, limit) {
    const q = (sb) => {
      let b = sb.from("profiles").select("id,roll_no,full_name,contact,role,current_semester,session,cgpa,profile_complete,created_at");
      if (role) b = b.eq("role", role);
      return b.order("created_at", { ascending: false }).limit(limit || 50);
    };
    const { data } = await sbCall("profiles.listRole", q);
    return data || [];
  }

  // Auto-flush queued writes when back online
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => { flushQueue().catch(() => {}); });
    setInterval(() => { flushQueue().catch(() => {}); }, 30000);
  }

  global.ULC_CLOUD = {
    ready, getClient, pingHealth, lastHealth, withRetry, sbCall,
    upsertProfile, listAwards, insertAwardsBatch, deleteAward, publishInstructor,
    saveWorkspace, loadWorkspace, fetchProfile, listProfilesByRole,
    enqueue, flushQueue, loadQueue,
  };
})(typeof window !== "undefined" ? window : globalThis);
