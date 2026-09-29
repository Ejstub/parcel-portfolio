"""Rebuild data/areas.json and data/boundaries.geojson.

Inputs (download into tools/cache/ first, see docs/UPDATE-PROCESS.md):
  comprehensive_db.sqlite  - uszipcode dataset (Census ACS by ZIP)
  mo_zips.json             - OpenDataDE Missouri ZCTA boundaries (Census 2010)
  mo_tracts.geojson        - arcee123 Missouri tract boundaries (Census 2010)
Hand-maintained inputs live in tools/manual_inputs.json (Zillow values,
school grades, tract figures), each with its source and as-of date.
The build stores FACTS only. Scores are computed live in src/areas.js.
"""
import sqlite3, json, zlib, os, sys
from shapely.geometry import shape, mapping
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'cache'); OUT = os.path.join(HERE, '..', 'data')
M = json.load(open(os.path.join(HERE, 'manual_inputs.json')))

c = sqlite3.connect(os.path.join(CACHE, 'comprehensive_db.sqlite')); c.row_factory = sqlite3.Row
def vals(b):
    x = json.loads(zlib.decompress(b)) if b else None
    return {v['x']: v['y'] for v in x[0]['values']} if x else {}
MID = {'1939 Or Earlier': 1930, '1940s': 1945, '1950s': 1955, '1960s': 1965, '1970s': 1975,
       '1980s': 1985, '1990s': 1995, '2000s': 2005, '2010 Or Later': 2012}
ACS = {'source': 'U.S. Census ACS 5-year via uszipcode dataset', 'asOf': 'mid-2010s', 'decay': 'stale-relative-only'}

def fact(value, src, known=True):
    return {'state': 'PRESENT' if known and value is not None else 'UNKNOWN', 'value': value, **src}

areas = []
for z, name in M['zips'].items():
    r = c.execute('select * from comprehensive_zipcode where zipcode=?', (z,)).fetchone()
    if r is None: sys.exit(f'ZIP {z} missing from uszipcode db')  # fail loudly
    occ = vals(r['housing_occupancy']); vac = vals(r['vacancy_reason']); yb = vals(r['year_housing_was_built'])
    ed = vals(r['educational_attainment_for_population_25_and_over'])
    owned = occ.get('Owned Households With A Mortgage', 0) + occ.get('Owned Households Free & Clear', 0)
    rent = occ.get('Renter Occupied Households', 0); fr = vac.get('For Rent', 0)
    tot = sum(yb.values()); acc = 0; med = None
    for k in MID:
        acc += yb.get(k, 0)
        if acc >= tot / 2: med = MID[k]; break
    bach = sum(ed.get(k, 0) for k in ["Bachelor's Degree", "Master's Degree", 'Professional School Degree', 'Doctorate Degree']) / max(sum(ed.values()), 1)
    zv = M['zillowValue'].get(z); sc = M['schools'].get(z); zr = M['zillowRent'].get(z)
    areas.append({
        'zip': z, 'name': name, 'population': r['population'],
        'facts': {
            'income': fact(r['median_household_income'], ACS),
            'ownerPct': fact(round(owned / (owned + rent) * 100, 1), ACS),
            'rentVacPct': fact(round(fr / (rent + fr) * 100, 1) if rent + fr else None, ACS),
            'bachPct': fact(round(bach * 100, 1), ACS),
            'medYearBuilt': fact(med, ACS),
            'pre1950Pct': fact(round((yb.get('1939 Or Earlier', 0) + yb.get('1940s', 0)) / tot * 100, 1), ACS),
            'censusHomeValue': fact(r['median_home_value'], ACS),
            'homeValue': fact(zv['value'], {'source': zv['source'], 'asOf': zv['asOf'], 'decay': 'annual'}) if zv else
                         {'state': 'UNKNOWN', 'value': None, 'source': 'Zillow ZHVI not looked up', 'asOf': None, 'decay': 'annual'},
            'schoolGrade': fact(sc['grade'], {'source': sc['source'], 'asOf': sc['asOf'], 'district': sc['district'], 'decay': 'annual'}) if sc and sc.get('grade') else
                           {'state': 'UNKNOWN', 'value': None, 'district': sc['district'] if sc else None, 'source': 'Not looked up', 'asOf': None, 'decay': 'annual'},
            'avgRent': fact(zr['value'], {'source': zr['source'], 'asOf': zr['asOf'], 'decay': 'annual'}) if zr else
                       {'state': 'UNKNOWN', 'value': None, 'source': 'Not looked up', 'asOf': None, 'decay': 'annual'},
        }})

zg = {f['properties']['ZCTA5CE10']: f for f in json.load(open(os.path.join(CACHE, 'mo_zips.json')))['features']}
feats = []
for a in areas:
    g0 = shape(zg[a['zip']]['geometry']).buffer(0)
    main = g0 if g0.geom_type == 'Polygon' else max(g0.geoms, key=lambda x: x.area)
    lp = M.get('labelAt', {}).get(a['zip']) or [round(main.representative_point().x, 5), round(main.representative_point().y, 5)]
    feats.append({'type': 'Feature', 'properties': {'zip': a['zip'], 'name': a['name'], 'kind': 'label'},
                  'geometry': {'type': 'Point', 'coordinates': lp}})
    g = g0.simplify(0.0005)
    feats.append({'type': 'Feature', 'properties': {'zip': a['zip'], 'name': a['name'], 'kind': 'zip'},
                  'geometry': json.loads(json.dumps(mapping(g), default=lambda o: None), parse_float=lambda s: round(float(s), 5))})
tr = json.load(open(os.path.join(CACHE, 'mo_tracts.geojson')))
tracts = []
for f in tr['features']:
    p = f['properties']; t = M['tracts'].get(p['NAME'])
    if p['COUNTYFP'] == '097' and t:
        g = shape(f['geometry']).buffer(0).simplify(0.0003)
        feats.append({'type': 'Feature', 'properties': {'tract': p['NAME'], 'kind': 'tract'},
                      'geometry': json.loads(json.dumps(mapping(g)), parse_float=lambda s: round(float(s), 5))})
        tracts.append({'tract': p['NAME'], **t})
json.dump({'schema': 'parcel.areas.v1', 'built': M['built'], 'areas': areas, 'tracts': tracts,
           'tractSource': M['tractSource']}, open(os.path.join(OUT, 'areas.json'), 'w'), indent=1)
json.dump({'type': 'FeatureCollection', 'features': feats}, open(os.path.join(OUT, 'boundaries.geojson'), 'w'), separators=(',', ':'))
print('areas', len(areas), 'features', len(feats))
