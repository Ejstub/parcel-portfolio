import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreAreas, gradeOf, WEIGHTS } from '../src/areas.js';
import { zipAt } from '../src/geo.js';

const data = JSON.parse(readFileSync(new URL('../data/areas.json', import.meta.url)));
const bounds = JSON.parse(readFileSync(new URL('../data/boundaries.geojson', import.meta.url)));

test('weights sum to 100', () => assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b), 100));

test('every area has the facts the score needs, with a source', () => {
  for (const a of data.areas) for (const k of ['income', 'ownerPct', 'rentVacPct', 'bachPct', 'medYearBuilt', 'homeValue', 'schoolGrade'])
    assert.ok(a.facts[k] && a.facts[k].state && 'source' in a.facts[k], `${a.zip} ${k}`);
});

test('scores match the published grades', () => {
  const s = scoreAreas(data);
  assert.equal(s['64834'].grade, 'A');
  assert.equal(s['64870'].grade, 'B');
  assert.equal(s['64801'].grade, 'C');
  assert.ok(s['64855'].unknown.includes('school'), 'Oronogo school grade is UNKNOWN, not guessed');
});

test('your adjustment and school override change the score, clamped to ±15', () => {
  const base = scoreAreas(data)['64801'];
  const adj = scoreAreas(data, { '64801': { adjust: 40 } })['64801'];
  assert.equal(Math.round((adj.score - base.score) * 10) / 10, 15);
  const school = scoreAreas(data, { '64855': { schoolGrade: 'A-' } })['64855'];
  assert.ok(!school.unknown.includes('school'));
});

test('grade cutoffs', () => { assert.equal(gradeOf(70), 'A'); assert.equal(gradeOf(69.9), 'B'); assert.equal(gradeOf(37), 'C'); assert.equal(gradeOf(36.9), 'D'); });

test('points land in the right ZIP', () => {
  assert.equal(zipAt(bounds, -94.47681, 37.13863), '64870'); // 614 S Oakland, Webb City
  assert.equal(zipAt(bounds, -94.50665, 37.07331), '64804'); // 1608 S Minnesota, Joplin
  assert.equal(zipAt(bounds, -90.0, 38.6), null);
});
