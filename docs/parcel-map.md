# Parcel Portfolio — living map

Update in the same PR whenever what's built, decided, or owed changes.

## Built (v0.1.0, 2026-09-29)
- Full-screen map (MapLibre + OpenFreeMap), Standard and Muted styles.
- Blue-dot GPS tracking; **Pin here** at current location with street-address lookup.
- Press-and-hold / right-click to add a property; draggable draft pin; address search.
- ZIP area grades (17 ZIPs) as a map layer with labels; six Census tracts as dashed outlines.
- Area screen: facts with source and date, rank bars, unknowns listed, school-grade override,
  ±15 local-knowledge adjustment, notes.
- Deal analyzer: five tests, verdict, KPIs, monthly ledger, break-even rent, max price,
  offer to pass, year-1 wealth, owner-occupied first-year housing cost.
- Local storage, export/import with merge-by-id, first-run seed of 614 S Oakland and
  1608 S Minnesota.
- Installable PWA with offline app shell. 13 unit tests (finance, scoring, ZIP lookup).

## Decided, not built
- No cloud sync (chose on-device + export). Revisit if using two devices daily gets painful.
- No Apple MapKit (needs $99/yr developer account). OpenFreeMap chosen.
- No satellite layer yet: free imagery sources have terms that need checking first.

## Debts
- Census facts are mid-2010s ZIP estimates; fine for ranking, dated as absolute numbers.
  Replace with ACS 2024 5-year by ZIP (needs a free Census API key) — see UPDATE-PROCESS.md.
- Only 6 of ~30 area tracts have data; boundaries are 2010 vintage (2020 renumbered 103, 106, 109).
- Oronogo school district unverified (split Webb City / Carl Junction); scored as average.
- Home values for 10 ZIPs are estimates (Census × regional ratio).
- Area grades are ZIP-level; neighborhoods inside 64801 vary a lot.
- No undo for delete (two-step confirm only).

## Next
1. Census API key → refresh all ZIP facts to ACS 2024 and add all Jasper/Newton tracts (2020).
2. Tract-level grading inside Joplin, blended with the ZIP grade.
3. Rent comps: log rents you see (address, beds, rent, date) and show area medians.
4. Photo per property (camera input) stored on device.
5. Status pipeline: watching → toured → offered → owned, with filters.
6. Portfolio view for owned properties: actual rent, expenses, reserves vs. plan.

## Horizon
- Offer letter / numbers sheet export for a lender or agent.
- Share a single property (read-only link or file) with a partner.
