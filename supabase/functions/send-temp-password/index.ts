/**
 * ULC Toolkit — forgot password (temporary password emailed + name greeting)
 *
 * Deploy (from repo root):
 *   npx supabase functions deploy send-temp-password --project-ref fkyrxsbhuzfxrlzzykpj
 *
 * Required for email delivery (Resend):
 *   npx supabase secrets set RESEND_API_KEY=re_xxxxxxxx
 *   npx supabase secrets set RESET_FROM_EMAIL="ULC Toolkit <onboarding@resend.dev>"
 *
 * Notes:
 * - Free Resend: use onboarding@resend.dev as FROM, or verify your domain in Resend.
 * - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by Supabase.
 * - The old password cannot be emailed (it is hashed). This generates a NEW
 *   temporary password, sets it on the account, emails it, and returns it so
 *   the app can still show it on-screen as a backup.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const recent = new Map(); // email -> timestamp (basic rate limit)

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function generateTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const pick = (n) => {
    const bytes = crypto.getRandomValues(new Uint8Array(n));
    let s = "";
    for (let i = 0; i < n; i++) s += alphabet[bytes[i] % alphabet.length];
    return s;
  };
  const nums = String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000));
  return `Ulc-${pick(4)}${nums}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function findAuthUserByEmail(admin, url, service, email) {
  // Prefer Auth Admin filter (avoids paging through all users)
  try {
    const endpoint = `${String(url).replace(/\/$/, "")}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
    const r = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${service}`,
        apikey: service,
      },
    });
    if (r.ok) {
      const payload = await r.json();
      const users = Array.isArray(payload?.users)
        ? payload.users
        : Array.isArray(payload)
          ? payload
          : payload?.id
            ? [payload]
            : [];
      const hit = users.find((u) => normalizeEmail(u.email) === email);
      if (hit?.id) return hit;
    }
  } catch (_) {
    /* fall through to listUsers */
  }

  for (let page = 1; page <= 5; page++) {
    const { data: listed, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) break;
    const hit = (listed?.users || []).find(
      (u) => normalizeEmail(u.email) === email
    );
    if (hit) return hit;
    if (!listed?.users?.length || listed.users.length < 200) break;
  }
  return null;
}

async function sendTempPasswordEmail({
  to,
  name,
  tempPassword,
  resendKey,
  fromEmail,
}) {
  const greetName = name === "there" ? "there" : name;
  const subject = "Your ULC Toolkit temporary password";
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.55;color:#1a1d23;max-width:560px">
  <p style="margin:0 0 12px">Hello <strong>${escapeHtml(greetName)}</strong>,</p>
  <p style="margin:0 0 12px">You requested a password reset for <strong>ULC Toolkit</strong> (University Law College, Quetta).</p>
  <p style="margin:0 0 8px">Your temporary password is:</p>
  <p style="font-size:22px;font-weight:700;letter-spacing:1px;background:#f5f2ea;padding:12px 16px;border-radius:10px;display:inline-block;margin:0 0 16px">${escapeHtml(tempPassword)}</p>
  <p style="margin:0 0 12px">Log in with your registered email and this temporary password. For safety, change it after you sign in.</p>
  <p style="margin:0;color:#5a6472">— ULC Toolkit</p>
</div>`;
  const text =
    `Hello ${greetName},\n\n` +
    `You requested a password reset for ULC Toolkit (University Law College, Quetta).\n\n` +
    `Your temporary password is: ${tempPassword}\n\n` +
    `Log in with your registered email and this temporary password. For safety, change it after you sign in.\n\n` +
    `— ULC Toolkit`;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      subject,
      html,
      text,
    }),
  });
  let detail = "";
  try {
    const body = await r.json();
    detail = body?.message || body?.error || body?.name || "";
    if (!r.ok && body?.id) detail = detail || JSON.stringify(body);
  } catch (_) {
    detail = "";
  }
  return { ok: r.ok, status: r.status, detail: String(detail || "") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    if (!email || !email.includes("@") || email.length > 200) {
      return json({ error: "Enter a valid email address." }, 400);
    }

    const last = recent.get(email) || 0;
    if (Date.now() - last < 60_000) {
      return json(
        { error: "Please wait a minute before requesting another password." },
        429
      );
    }

    const url = Deno.env.get("SUPABASE_URL");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !service) {
      return json({ error: "Server is not configured." }, 500);
    }

    const admin = createClient(url, service, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let userId = null;
    let name = "there";
    let registeredEmail = email;

    const { data: prof } = await admin
      .from("profiles")
      .select("id, full_name, contact")
      .eq("contact", email)
      .maybeSingle();

    if (prof?.id) {
      userId = prof.id;
      name = String(prof.full_name || "").trim() || "there";
      if (prof.contact) registeredEmail = normalizeEmail(prof.contact);
    }

    const authUser = await findAuthUserByEmail(admin, url, service, email);
    if (authUser?.id) {
      userId = authUser.id;
      registeredEmail = normalizeEmail(authUser.email) || registeredEmail;
      const metaName = String(
        authUser.user_metadata?.full_name ||
          authUser.user_metadata?.name ||
          ""
      ).trim();
      if (metaName) name = metaName;
      else if (!prof?.full_name) {
        const { data: byId } = await admin
          .from("profiles")
          .select("full_name")
          .eq("id", authUser.id)
          .maybeSingle();
        if (byId?.full_name) name = String(byId.full_name).trim() || name;
      }
    }

    if (!userId) {
      return json({ error: "No account found for this email." }, 404);
    }

    const tempPassword = generateTempPassword();
    const { error: upErr } = await admin.auth.admin.updateUserById(userId, {
      password: tempPassword,
      email_confirm: true,
    });
    if (upErr) {
      return json({ error: upErr.message || "Could not reset password." }, 500);
    }

    recent.set(email, Date.now());

    const greetName = String(name || "").trim() || "there";
    let emailed = false;
    let emailError = "";
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail =
      Deno.env.get("RESET_FROM_EMAIL") ||
      "ULC Toolkit <onboarding@resend.dev>";

    if (!resendKey) {
      emailError =
        "RESEND_API_KEY is not set. Temp password was still created — shown in the app.";
    } else {
      try {
        const sent = await sendTempPasswordEmail({
          to: registeredEmail,
          name: greetName,
          tempPassword,
          resendKey,
          fromEmail,
        });
        emailed = sent.ok;
        if (!sent.ok) {
          emailError =
            sent.detail ||
            `Resend failed (HTTP ${sent.status}). Check domain / API key.`;
        }
      } catch (err) {
        emailed = false;
        emailError = String(err?.message || err || "Email send failed");
      }
    }

    return json({
      ok: true,
      name: greetName,
      email: registeredEmail,
      tempPassword,
      emailed,
      emailError: emailed ? "" : emailError,
      message: emailed
        ? `We sent a temporary password to your email (${registeredEmail}).`
        : `Hello, ${greetName}! Your temporary password is ready.`,
    });
  } catch (err) {
    return json({ error: String(err?.message || err) }, 500);
  }
});
