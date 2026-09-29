import test from 'node:test';
import assert from 'node:assert/strict';
import { pmt, maintByAge, analyze, BUY_BOX_DEFAULTS } from '../src/finance.js';

const near = (a, b, tol = 0.5) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);
const areaB = { grade: 'B', vacPct: 6, apprPct: 2.5, name: 'Webb City', score: 56 };

test('pmt matches a standard amortization', () => {
  near(pmt(167200, 6.5, 30), 1056.82, 0.01);   // hand-checked on a 10bII+: 360 N, 6.5/12 I/Y, 167200 PV → PMT
  assert.equal(pmt(0, 7, 30), 0);
  near(pmt(120000, 0, 10), 1000, 0.001);
});

test('maintenance reserve steps by age', () => {
  assert.equal(maintByAge(2020, 2026), 5);
  assert.equal(maintByAge(2000, 2026), 7);
  assert.equal(maintByAge(1970, 2026), 9);
  assert.equal(maintByAge(1925, 2026), 11);
});

test('Oakland duplex: hand-checked ledger', () => {
  const a = analyze({ units: 2, rents: [1300, 900], price: 209000, downPct: 20, rate: 6.5, closingPct: 3,
    taxes: 1100, insurance: 1800, yearBuilt: 1925, maintPct: 11 }, areaB);
  // gross 2200; vacancy 6% = 132; maint 11% = 242; tax 91.67; ins 150 → NOI 1584.33
  near(a.noiSelf, 1584.33, 0.01);
  near(a.cfSelf, 1584.33 - 1056.82, 0.01);
  // mgmt 9% of 2068 = 186.12; leasing 2200*0.5/24 = 45.83
  near(a.cfMgd, 527.52 - 186.12 - 45.83, 0.02);
  near(a.cash, 41800 + 6270, 0.01);
  near(a.rtp, 1.0526, 0.001);
});

test('break-even rent really zeroes managed cash flow', () => {
  const deal = { units: 1, rents: [1500], price: 199900, downPct: 20, rate: 6.5, taxes: 1900, insurance: 1300, yearBuilt: 2026 };
  const a = analyze(deal, areaB);
  const b = analyze({ ...deal, rents: [a.breakEvenRent] }, areaB);
  near(b.cfMgd, 0, 0.01);
});

test('max price really zeroes managed cash flow (taxes/insurance/closing scale with price)', () => {
  const deal = { units: 1, rents: [1500], price: 199900, downPct: 20, rate: 6.5, taxes: 1900, insurance: 1300, yearBuilt: 2026 };
  const a = analyze(deal, areaB);
  const s = a.maxPrice / 199900;
  const b = analyze({ ...deal, price: a.maxPrice, taxes: 1900 * s, insurance: 1300 * s }, areaB);
  near(b.cfMgd, 0, 0.05);
});

test('verdicts', () => {
  const ok = analyze({ units: 2, rents: [1300, 900], price: 209000, downPct: 20, rate: 6.5, taxes: 1100, insurance: 1800, yearBuilt: 1925 }, areaB);
  assert.equal(ok.verdict, 'pass');
  assert.equal(ok.tests.find(t => t.key === 'condition').status, 'warn');
  const bad = analyze({ units: 1, rents: [1200], price: 250000, downPct: 20, rate: 7, taxes: 2500, insurance: 1500, yearBuilt: 1990 }, areaB);
  assert.equal(bad.verdict, 'fail');
  assert.equal(bad.headline, "Doesn't work at this price");
  const unknownArea = analyze({ units: 1, rents: [1500], price: 150000 }, null);
  assert.equal(unknownArea.tests.find(t => t.key === 'area').status, 'warn');
});

test('owner-occupied housing cost', () => {
  const a = analyze({ units: 2, rents: [1300, 900], price: 209000, downPct: 20, rate: 6.5, taxes: 1100, insurance: 1800, yearBuilt: 1925, ownerOcc: true }, areaB);
  // P&I 1056.82 + tax 91.67 + ins 150 + maint 242 − (900 − 54)
  near(a.ownerHousingCost, 1056.82 + 91.67 + 150 + 242 - 846, 0.02);
});
