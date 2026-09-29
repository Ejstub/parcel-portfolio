# Updating area data

Area facts change slowly. Refresh once a year, or when you notice something stale.

## Hand-maintained facts (`tools/manual_inputs.json`)
Every entry needs `value`, `source` and `asOf` (YYYY-MM).
- **Zillow home values / rents:** zillow.com/home-values → search the ZIP → "Typical home value".
- **School grades:** niche.com district pages (overall grade). A district you haven't checked
  stays out of the file so it reads as UNKNOWN; don't guess.
- **Tracts:** censusreporter.org profile for the tract (ACS 5-year).

## Rebuild the generated files
Needs Python 3 with `shapely` (`pip install shapely`).

1. Download into `tools/cache/` (ignored by git):
   - `comprehensive_db.sqlite` from github.com/MacHu-GWU/uszipcode-project/releases (tag `1.0.1.db`)
   - `mo_zips.json` from raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/mo_missouri_zip_codes_geo.min.json
   - `mo_tracts.geojson` from raw.githubusercontent.com/arcee123/GIS_GEOJSON_CENSUS_TRACTS/master/29.geojson
2. `python tools/build_areas.py`
3. `npm test` — the grade tests will tell you if a refresh moved a grade; update the test
   deliberately if the move is real, and note it in `docs/parcel-map.md`.
4. Bump `VERSION` in `sw.js`.

## Planned upgrade
Get a free Census API key (api.census.gov/data/key_signup.html) and replace the uszipcode
source with ACS 2024 5-year tables by ZCTA and by 2020 tract: B19013 (income), B25003 (tenure),
B25004 (vacancy), B25035 (median year built), B15003 (education), B25077 (home value).
Keep the same fact shape so `src/areas.js` needs no change.
