// Area scoring. Computed live from the facts in data/areas.json plus your own
// adjustments; scores and grades are never stored.

export const WEIGHTS = Object.freeze({ school: 20, income: 20, ownerPct: 15, rentVacPct: 15, bachPct: 10, homeValue: 10, medYearBuilt: 10 });
export const GRADE_POINTS = Object.freeze({ 'A+': 100, 'A': 96, 'A-': 90, 'B+': 84, 'B': 78, 'B-': 72, 'C+': 64, 'C': 56, 'C-': 48, 'D': 35 });
export const GRADE_ASSUMPTIONS = Object.freeze({
  A: { vacPct: 5, apprPct: 3 }, B: { vacPct: 6, apprPct: 2.5 }, C: { vacPct: 8, apprPct: 2 }, D: { vacPct: 11, apprPct: 1 }
});
const LOWER_IS_BETTER = new Set(['rentVacPct']);
const UNKNOWN_PART = 50; // an UNKNOWN fact scores as regional average, and is flagged

export const gradeOf = s => s >= 70 ? 'A' : s >= 50 ? 'B' : s >= 37 ? 'C' : 'D';

const median = xs => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * Home value for scoring: Zillow when PRESENT, otherwise the Census value scaled
 * by the median Zillow/Census ratio across ZIPs that have both (marked estimated).
 */
export function resolveHomeValues(areas) {
  const ratios = areas.filter(a => a.facts.homeValue.state === 'PRESENT' && a.facts.censusHomeValue.value)
    .map(a => a.facts.homeValue.value / a.facts.censusHomeValue.value);
  const scale = ratios.length ? median(ratios) : null;
  const out = {};
  for (const a of areas) {
    const hv = a.facts.homeValue;
    if (hv.state === 'PRESENT') out[a.zip] = { value: hv.value, estimated: false, source: `${hv.source}, ${hv.asOf}` };
    else if (scale && a.facts.censusHomeValue.value) out[a.zip] = { value: Math.round(a.facts.censusHomeValue.value * scale / 1000) * 1000, estimated: true, source: `Census value × ${scale.toFixed(2)} regional change (estimate)` };
    else out[a.zip] = { value: null, estimated: true, source: 'Unknown' };
  }
  return { values: out, scale };
}

/**
 * Score every area.
 * @param data       parsed data/areas.json
 * @param overrides  { [zip]: { adjust?: number, schoolGrade?: string|null, note?: string } }
 * @returns { [zip]: { zip, name, score, rawScore, grade, parts, unknown:[], schoolGrade, schoolIsYours, homeValue, vacPct, apprPct, adjust } }
 */
export function scoreAreas(data, overrides = {}) {
  const areas = data.areas;
  const hv = resolveHomeValues(areas);
  const val = (a, k) => {
    if (k === 'homeValue') return hv.values[a.zip].value;
    const f = a.facts[k]; return f && f.state === 'PRESENT' ? f.value : null;
  };
  const ranges = {};
  for (const k of Object.keys(WEIGHTS)) {
    if (k === 'school') continue;
    const xs = areas.map(a => val(a, k)).filter(v => v !== null);
    ranges[k] = [Math.min(...xs), Math.max(...xs)];
  }
  const result = {};
  for (const a of areas) {
    const o = overrides[a.zip] || {};
    const parts = {}, unknown = [];
    for (const k of Object.keys(WEIGHTS)) {
      if (k === 'school') continue;
      const v = val(a, k);
      if (v === null) { parts[k] = UNKNOWN_PART; unknown.push(k); continue; }
      const [lo, hi] = ranges[k];
      let s = hi > lo ? (v - lo) / (hi - lo) * 100 : 50;
      if (LOWER_IS_BETTER.has(k)) s = 100 - s;
      parts[k] = s;
    }
    const schoolGrade = o.schoolGrade || (a.facts.schoolGrade.state === 'PRESENT' ? a.facts.schoolGrade.value : null);
    const sp = GRADE_POINTS[schoolGrade];
    parts.school = sp ? (sp - 35) / 65 * 100 : UNKNOWN_PART;
    if (!sp) unknown.push('school');
    let raw = 0; for (const [k, w] of Object.entries(WEIGHTS)) raw += parts[k] * w;
    raw /= Object.values(WEIGHTS).reduce((x, y) => x + y, 0);
    const adjust = Math.max(-15, Math.min(15, Number(o.adjust) || 0));
    const score = Math.max(0, Math.min(100, raw + adjust));
    const grade = gradeOf(score);
    result[a.zip] = { zip: a.zip, name: a.name, score, rawScore: raw, grade, parts, unknown, adjust,
      schoolGrade, schoolIsYours: !!o.schoolGrade, district: a.facts.schoolGrade.district,
      homeValue: hv.values[a.zip], note: o.note || '', ...GRADE_ASSUMPTIONS[grade] };
  }
  return result;
}
