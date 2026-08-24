/* Shared ULC award-list / aggregate / GPA math — browser + Node */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ULC_MATH = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function clamp(n, lo, hi) {
    n = +n;
    if (!Number.isFinite(n)) n = 0;
    return Math.min(hi, Math.max(lo, n));
  }
  function best3Avg(qs) {
    const top = [...qs]
      .map((n) => clamp(n, 0, 15))
      .sort((a, b) => b - a)
      .slice(0, 3);
    while (top.length < 3) top.push(0);
    return top.reduce((a, b) => a + b, 0) / 3;
  }
  /** Official ULC grade-point from rounded /100 marks. */
  function gpFromRounded(m) {
    m = Math.round(clamp(m, 0, 100));
    if (m >= 80) return 4.0;
    if (m < 50) return 0.0;
    return Math.round((m - 40) * 10) / 100;
  }
  function letterFromRounded(m) {
    m = Math.round(clamp(m, 0, 100));
    if (m >= 90) return "A";
    if (m >= 80) return "A-";
    if (m >= 75) return "B+";
    if (m >= 70) return "B";
    if (m >= 65) return "B-";
    if (m >= 60) return "C+";
    if (m >= 55) return "C";
    if (m >= 50) return "D";
    return "F";
  }
  function calcAwardFrom(data) {
    const qs = [data.q1, data.q2, data.q3, data.q4, data.q5].map((n) => clamp(n, 0, 15));
    const quiz = best3Avg(qs);
    const a1 = clamp(data.a1, 0, 15);
    const a2 = clamp(data.a2, 0, 15);
    const assn = (a1 + a2) / 2;
    const midObt = clamp(data.mid, 0, 100);
    const finObt = clamp(data.final, 0, 100);
    const mid30 = midObt * 0.3;
    const fin40 = finObt * 0.4;
    const grandRaw = quiz + assn + mid30 + fin40;
    const grand = Math.min(100, grandRaw);
    const rounded = Math.round(grand);
    return {
      quiz,
      assn,
      midObt,
      finObt,
      mid30,
      fin40,
      grand,
      rounded,
      grade: letterFromRounded(rounded),
      gp: gpFromRounded(rounded),
      bestThree: [...qs].sort((a, b) => b - a).slice(0, 3),
      maximum: 100,
      obtained: grand,
      pct: grand,
      capped: grandRaw > 100,
    };
  }
  function calcAggregate({ mObt, mTot, iObt, iTot, latObt, latTot, wM = 20, wI = 50, wL = 30 }) {
    const mTotN = +mTot || 0;
    const iTotN = +iTot || 0;
    const latTotN = +latTot || 0;
    if (mTotN <= 0 || iTotN <= 0 || latTotN <= 0) {
      return { matricPct: 0, interPct: 0, latPct: 0, aggregate: 0 };
    }
    const m = (clamp(mObt, 0, mTotN) / mTotN) * 100;
    const i = (clamp(iObt, 0, iTotN) / iTotN) * 100;
    const l = (clamp(latObt, 0, latTotN) / latTotN) * 100;
    const wSum = (+wM || 0) + (+wI || 0) + (+wL || 0) || 100;
    const agg = (m * (+wM || 0) + i * (+wI || 0) + l * (+wL || 0)) / wSum;
    return { matricPct: m, interPct: i, latPct: l, aggregate: agg };
  }
  /** Normalize a semester course row: recompute GP/grade from marks; drop invalid rows. */
  function normalizeCourse(c) {
    if (!c) return null;
    const ch = +c.ch || 0;
    if (ch <= 0) return null;
    if (c.marks === "" || c.marks == null || !Number.isFinite(+c.marks)) return null;
    const marks = Math.round(clamp(c.marks, 0, 100));
    return {
      code: c.code || "",
      title: c.title || "",
      ch,
      marks,
      gp: gpFromRounded(marks),
      grade: letterFromRounded(marks),
    };
  }
  function calcGpa(courses) {
    let points = 0,
      ch = 0;
    for (const raw of courses || []) {
      const c = normalizeCourse(raw) || (raw && +raw.ch > 0 && Number.isFinite(+raw.gp) ? raw : null);
      if (!c) continue;
      const credits = +c.ch || 0;
      const gp = Number.isFinite(+c.gp) ? +c.gp : gpFromRounded(c.marks);
      if (credits <= 0) continue;
      points += gp * credits;
      ch += credits;
    }
    return ch ? points / ch : 0;
  }
  /** Credit-weighted semester GPA; always recomputes GP from marks when marks exist. */
  function calcSemesterGpa(courses) {
    const list = Array.isArray(courses) ? courses : [];
    let points = 0,
      ch = 0,
      obtained = 0,
      counted = 0;
    for (const raw of list) {
      const c = normalizeCourse(raw);
      if (!c) continue;
      points += c.gp * c.ch;
      ch += c.ch;
      obtained += c.marks;
      counted += 1;
    }
    const gpa = ch ? points / ch : 0;
    const max = counted * 100;
    const pct = max ? (obtained / max) * 100 : 0;
    return { gpa, pct, obtained, ch, max, counted };
  }
  /** CGPA through semester `throughSem` (inclusive). Recomputes each course from marks. */
  function calcCgpaThrough(records, throughSem) {
    let points = 0,
      ch = 0;
    const limit = throughSem == null ? Infinity : +throughSem;
    Object.keys(records || {})
      .map(Number)
      .filter((n) => Number.isFinite(n) && n <= limit && records[n]?.courses)
      .sort((a, b) => a - b)
      .forEach((n) => {
        (records[n].courses || []).forEach((raw) => {
          const c = normalizeCourse(raw);
          if (!c) return;
          points += c.gp * c.ch;
          ch += c.ch;
        });
      });
    return ch ? points / ch : 0;
  }
  function sampleFullAward(seed) {
    const s = (seed * 9301 + 49297) % 233280;
    const r = (n, max) => (s * (n + 1)) % (max + 1);
    return {
      q1: 8 + r(1, 7),
      q2: 8 + r(2, 7),
      q3: 8 + r(3, 7),
      q4: 8 + r(4, 7),
      q5: 8 + r(5, 7),
      a1: 9 + r(6, 6),
      a2: 9 + r(7, 6),
      mid: 45 + r(8, 40),
      final: 50 + r(9, 40),
      mid_obj: 0,
      mid_sub: 0,
      fin_obj: 0,
      fin_sub: 0,
    };
  }
  return {
    best3Avg,
    gpFromRounded,
    letterFromRounded,
    calcAwardFrom,
    calcAggregate,
    calcGpa,
    calcSemesterGpa,
    calcCgpaThrough,
    normalizeCourse,
    clamp,
    sampleFullAward,
  };
});
