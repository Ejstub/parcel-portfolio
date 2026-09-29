// Deal math. Pure functions only: no DOM, no storage, no network.
// Every figure is derived at call time from the deal's inputs and the area context;
// nothing computed here is ever stored as a source of truth.

export const THIS_YEAR = new Date().getFullYear();

export const DEAL_DEFAULTS = Object.freeze({
  name: '', url: '', address: '', zip: '64801', yearBuilt: 1975, units: 1, beds: 3, baths: 2,
  parking: true, ownerOcc: false,
  price: 200000, downPct: 25, rate: 7, term: 30, closingPct: 3, rehab: 0,
  rents: [1400, 0, 0, 0],
  taxes: 1800, insurance: 1400, hoa: 0, utilities: 0,
  roofOk: false, hvacOk: false, whOk: false, sewerOk: false,
  // null = use the default from the area grade or the home's age
  vacPct: null, maintPct: null, apprPct: null,
  mgmtPct: 9, leasePct: 50, stayYrs: 2,
  lat: null, lng: null, notes: ''
});

export const BUY_BOX_DEFAULTS = Object.freeze({ minRtp: 0.8, strongRtp: 1.0, targetDoor: 100, maxDoorLossWarn: 50 });

/** Monthly principal + interest. */
export function pmt(loan, ratePct, years) {
  const r = ratePct / 1200, n = years * 12;
  if (!loan) return 0;
  return r ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n;
}

/** Maintenance + capital reserve as % of gross rent, by age of the home. */
export function maintByAge(yearBuilt, year = THIS_YEAR) {
  const age = year - (Number(yearBuilt) || year);
  return age <= 10 ? 5 : age <= 30 ? 7 : age <= 60 ? 9 : 11;
}

const num = (v, d = 0) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) ? d : Number(v);
const pick = (v, fallback) => (v === null || v === undefined || v === '') ? fallback : Number(v);

/**
 * Analyze a deal.
 * @param deal  a deal object (see DEAL_DEFAULTS)
 * @param area  {grade, vacPct, apprPct, name, score} from areas.js, or null if unknown
 * @param box   buy-box thresholds (see BUY_BOX_DEFAULTS)
 */
export function analyze(deal, area, box = BUY_BOX_DEFAULTS) {
  const d = { ...DEAL_DEFAULTS, ...deal };
  const n = Math.min(Math.max(num(d.units, 1), 1), 4);
  const rents = Array.from({ length: n }, (_, i) => num(d.rents?.[i]));
  const gross = rents.reduce((a, b) => a + b, 0);
  const grade = area?.grade ?? null;

  const vacPct = pick(d.vacPct, area?.vacPct ?? 8);
  const maintPct = pick(d.maintPct, maintByAge(d.yearBuilt));
  const apprPct = pick(d.apprPct, area?.apprPct ?? 2);
  const price = num(d.price), down = num(d.downPct) / 100, closing = num(d.closingPct) / 100, rehab = num(d.rehab);
  const mgmtPct = num(d.mgmtPct);
  const leaseFrac = num(d.leasePct) / 100 / (12 * Math.max(num(d.stayYrs, 1), 0.25));
  const tax = num(d.taxes) / 12, ins = num(d.insurance) / 12, hoa = num(d.hoa), util = num(d.utilities);
  const rate = num(d.rate), term = num(d.term, 30) || 30;

  // Taxes, insurance and closing costs scale with price when solving for max price.
  function run(P, R) {
    const scale = price ? P / price : 1;
    const loan = P * (1 - down), pi = pmt(loan, rate, term);
    const t = tax * scale, i = ins * scale;
    const vac = R * vacPct / 100, maint = R * maintPct / 100;
    const noiSelf = R - vac - maint - t - i - hoa - util;
    const mgmt = (R - vac) * mgmtPct / 100, lease = R * leaseFrac;
    const cfSelf = noiSelf - pi, cfMgd = cfSelf - mgmt - lease;
    return { loan, pi, t, i, vac, maint, noiSelf, noiMgd: noiSelf - mgmt - lease, mgmt, lease, cfSelf, cfMgd,
      cash: P * down + P * closing + rehab };
  }
  const r = run(price, gross);

  const variable = vacPct / 100 + maintPct / 100 + mgmtPct / 100 * (1 - vacPct / 100) + leaseFrac;
  const fixed = r.pi + r.t + r.i + hoa + util;
  const breakEvenRent = variable < 1 ? fixed / (1 - variable) : Infinity;

  let lo = 0, hi = Math.max(price * 4, 100000);
  if (run(hi, gross).cfMgd > 0) lo = hi;
  else for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; run(m, gross).cfMgd > 0 ? lo = m : hi = m; }
  const maxPrice = lo;
  const rtpPrice = gross / (box.minRtp / 100);
  const offerToPass = Math.min(maxPrice, rtpPrice);

  let bal = r.loan, principalYr1 = 0; const mr = rate / 1200;
  for (let m = 0; m < 12; m++) { const p = r.pi - bal * mr; principalYr1 += p; bal -= p; }
  const appreciationYr1 = price * apprPct / 100;
  const depreciation = price * 0.8 / 27.5;
  const totalYr1 = r.cfMgd * 12 + principalYr1 + appreciationYr1;

  const rtp = price ? gross / price * 100 : 0;
  const capRate = price ? r.noiMgd * 12 / (price + rehab) * 100 : 0;
  const coc = r.cash ? r.cfMgd * 12 / r.cash * 100 : 0;
  const cocSelf = r.cash ? r.cfSelf * 12 / r.cash * 100 : 0;
  const dscr = r.pi ? r.noiMgd / r.pi : Infinity;

  let ownerHousingCost = null;
  if (d.ownerOcc && n >= 1) {
    const other = gross - rents[0];
    ownerHousingCost = r.pi + r.t + r.i + hoa + util + gross * maintPct / 100 - (other - other * vacPct / 100);
  }

  const tests = buyBoxTests({ d, n, rtp, r, box, breakEvenRent, maintPct, vacPct, apprPct, grade, area });
  const fails = tests.filter(t => t.status === 'fail').length;
  const warns = tests.filter(t => t.status === 'warn').length;
  const verdict = fails ? 'fail' : warns >= 2 ? 'warn' : 'pass';
  const moneyFail = tests.slice(0, 2).some(t => t.status === 'fail');
  const headline = verdict === 'pass' ? (warns ? 'Fits the buy box · inspect first' : 'Fits the buy box')
    : verdict === 'warn' ? 'Close · needs a better price or more homework'
    : moneyFail ? "Doesn't work at this price" : 'Numbers work, but the area is a red flag';

  return { units: n, rents, gross, grade, vacPct, maintPct, apprPct, mgmtPct, ...r,
    breakEvenRent, maxPrice, rtpPrice, offerToPass, principalYr1, appreciationYr1, depreciation, totalYr1,
    rtp, capRate, coc, cocSelf, dscr, ownerHousingCost, tests, verdict, headline };
}

function buyBoxTests({ d, n, rtp, r, box, breakEvenRent, maintPct, vacPct, apprPct, grade, area }) {
  const $ = v => (v < 0 ? '−$' : '$') + Math.round(Math.abs(v)).toLocaleString('en-US');
  const tests = [];
  tests.push({ key: 'rtp', label: 'Rent-to-price',
    status: rtp >= box.minRtp ? 'pass' : rtp >= box.minRtp - 0.1 ? 'warn' : 'fail',
    detail: `${rtp.toFixed(2)}% of price per month${rtp >= box.strongRtp ? ' (strong)' : ''}`,
    why: `Minimum ${box.minRtp}%, strong ${box.strongRtp}%.` });
  const door = r.cfMgd / n;
  tests.push({ key: 'manager', label: 'Manager test',
    status: door >= 0 ? 'pass' : door >= -box.maxDoorLossWarn ? 'warn' : 'fail',
    detail: `${$(r.cfMgd)}/mo with a manager (${$(door)}/door)`,
    why: door >= box.targetDoor ? `Meets your ${$(box.targetDoor)}/door target.` : `Target is ${$(box.targetDoor)}/door; break-even rent is ${$(breakEvenRent)}.` });
  const unknown = ['roofOk', 'hvacOk', 'whOk', 'sewerOk'].filter(k => !d[k]).length;
  const old = Number(d.yearBuilt) < 1950;
  tests.push({ key: 'condition', label: 'Condition', status: unknown === 0 ? 'pass' : 'warn',
    detail: unknown === 0 ? 'Big four all newer or inspected' : `${unknown} of the big four unknown or aging${old && unknown > 1 ? ' on a pre-1950 house' : ''}`,
    why: `Built ${d.yearBuilt || '?'}; maintenance reserve ${maintPct}% of rent.${old ? ' Pre-1950: check plumbing and electrical.' : ''}` });
  tests.push({ key: 'area', label: 'Area',
    status: grade === 'A' || grade === 'B' ? 'pass' : grade === 'C' || grade === null ? 'warn' : 'fail',
    detail: area ? `${area.name} · grade ${grade} (${Math.round(area.score)})` : 'Outside the graded areas',
    why: `Vacancy ${vacPct}%, appreciation ${apprPct}%/yr.` });
  const good = n >= 2 || (Number(d.beds) >= 3 && Number(d.baths) >= 2 && d.parking);
  tests.push({ key: 'layout', label: 'Layout', status: good ? 'pass' : 'warn',
    detail: n >= 2 ? `${n} units under one roof` : `${d.beds || 0} bed / ${d.baths || 0} bath${d.parking ? ', parking' : ', no parking'}`,
    why: n >= 2 ? 'A vacancy never zeroes out income.' : '3 bed / 2 bath with parking rents fastest.' });
  return tests;
}
