# Parcel Portfolio

Screen rental properties in the Joplin, MO market from your phone. Pin a house where you're
standing, see whether it pays for itself with a property manager, and compare it against
area grades built from school, Census and Zillow data.

## Run it on your PC
1. Open this folder in VS Code.
2. Right-click `index.html` → **Open with Live Server**.
3. Allow location when the browser asks (it works on `localhost`).

Tests: `npm test` (needs Node 20 or newer).

## Put it on your phone (free, about 10 minutes)
GPS only works over HTTPS, so the phone version runs from GitHub Pages.

1. Create a new **private or public** GitHub repository named `parcel-portfolio` and push this folder:
   ```
   git init
   git add .
   git commit -m "Parcel Portfolio v0.1"
   git branch -M main
   git remote add origin https://github.com/<you>/parcel-portfolio.git
   git push -u origin main
   ```
2. On GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → main / (root) → Save.**
   (Pages on a private repo needs a paid GitHub plan; a public repo is free. Your saved properties
   are never in the repo; they stay on your phone.)
3. After a minute, open `https://<you>.github.io/parcel-portfolio/` in Safari on your iPhone.
4. Tap **Share → Add to Home Screen**. It opens full-screen like an app.
5. The first time you tap the location arrow or **Pin here**, allow location access.

To update the phone after changes: push to `main`, then close and reopen the app. Bump `VERSION`
in `sw.js` with each release so the offline copy refreshes.

## Using it
- **Pin here**: drops a pin at your GPS location, looks up the street address, and opens the
  analyzer. Drag the pin onto the exact house if needed.
- **Press and hold** anywhere on the map (right-click on a PC) to add a property there.
- **Search** an address in the top bar.
- Tap an **area** to see its facts, sources and grade, and to add your own adjustment and notes.
- **Directions** opens the property in Apple Maps.
- **Export all data** regularly. Everything is stored on the device you're using; import the
  export file to move it to another device.

## Data sources
- Area facts: U.S. Census ACS (mid-2010s ZIP estimates, used for ranking), Zillow Home Value
  Index (2026), Niche school district grades (Sept 2026), Census Reporter tract profiles
  (ACS 2024 5-year). Details and dates are on each area screen and in `tools/manual_inputs.json`.
- Map © OpenStreetMap contributors; tiles by OpenFreeMap; rendering by MapLibre GL JS.
- Address lookup by OpenStreetMap Nominatim.

This is a screening tool, not an appraisal. Confirm rents with local comps or a property
manager, taxes with the Jasper or Newton County assessor, and insurance with a quote.
