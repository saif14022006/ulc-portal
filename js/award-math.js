/* Shared ULC award-list / aggregate / GPA math — browser + Node */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ULC_MATH = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function best3Avg(qs) {
    const top = [...qs].map((n) => +n || 0).sort((a, b) => b - a).slice(0, 3);
    return top.reduce((a, b) => a + b, 0) / 3;
  }
  function gpFromRounded(m) {
    m = Math.round(+m || 0);
    if (m >= 80) return 4.0;
    if (m < 50) return 0.0;
    return Math.round((m - 40) * 10) / 100;
  }
  function letterFromRounded(m) {
    m = Math.round(+m || 0);
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
    const qs = [data.q1, data.q2, data.q3, data.q4, data.q5].map((n) => +n || 0);
    const quiz = best3Avg(qs);
    const assn = ((+data.a1 || 0) + (+data.a2 || 0)) / 2;
    const midObt = Math.min(100, +data.mid || 0);
    const finObt = Math.min(100, +data.final || 0);
    const mid30 = midObt * 0.3;
    const fin40 = finObt * 0.4;
    const grand = quiz + assn + mid30 + fin40;
    const rounded = Math.round(grand);
    return {
      quiz, assn, midObt, finObt, mid30, fin40, grand, rounded,
      grade: letterFromRounded(rounded),
      gp: gpFromRounded(rounded),
      bestThree: [...qs].sort((a, b) => b - a).slice(0, 3),
      maximum: 100, obtained: grand, pct: grand,
    };
  }
  function calcAggregate({ mObt, mTot, iObt, iTot, latObt, latTot, wM = 20, wI = 50, wL = 30 }) {
    const m = (mObt / mTot) * 100;
    const i = (iObt / iTot) * 100;
    const l = (latObt / latTot) * 100;
    const agg = (m * wM + i * wI + l * wL) / 100;
    return { matricPct: m, interPct: i, latPct: l, aggregate: agg };
  }
  function calcGpa(courses) {
    let points = 0, ch = 0;
    for (const c of courses) {
      const credits = +c.ch || 0;
      const gp = +c.gp || 0;
      points += gp * credits;
      ch += credits;
    }
    return ch ? points / ch : 0;
  }
  function sampleFullAward(seed) {
    const s = (seed * 9301 + 49297) % 233280;
    const r = (n, max) => ((s * (n + 1)) % (max + 1));
    return {
      q1: 8 + r(1, 7), q2: 8 + r(2, 7), q3: 8 + r(3, 7), q4: 8 + r(4, 7), q5: 8 + r(5, 7),
      a1: 9 + r(6, 6), a2: 9 + r(7, 6),
      mid: 45 + r(8, 40), final: 50 + r(9, 40),
      mid_obj: 0, mid_sub: 0, fin_obj: 0, fin_sub: 0,
    };
  }
  return { best3Avg, gpFromRounded, letterFromRounded, calcAwardFrom, calcAggregate, calcGpa, sampleFullAward };
});
