// Parcel Portfolio — UI shell. Data logic lives in finance.js, areas.js, store.js and geo.js.
import { analyze, DEAL_DEFAULTS, BUY_BOX_DEFAULTS, maintByAge } from './finance.js';
import { scoreAreas, GRADE_POINTS, WEIGHTS } from './areas.js';
import * as store from './store.js';
import { zipAt, searchAddress, reverseAddress, appleMapsUrl } from './geo.js';

const maplibregl = window.maplibregl;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v, d = 0) => (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v, d = 1) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + '%';
const MARK = { pass: '✓', warn: '~', fail: '✕' };
const SHORT = { pass: 'Fits', warn: 'Close', fail: 'Pass on it' };
const STYLES = { liberty: 'https://tiles.openfreemap.org/styles/liberty', positron: 'https://tiles.openfreemap.org/styles/positron' };
const GRADE_FILL = { A: '#2f8f55', B: '#8cc05a', C: '#e8b33b', D: '#d9573e' };
const FACT_LABELS = { school: 'School district', income: 'Median household income', ownerPct: 'Owner-occupied homes',
  rentVacPct: 'Rental vacancy', bachPct: "Bachelor's degree or higher", homeValue: 'Typical home value', medYearBuilt: 'Median year built' };

/* ---------------- state ---------------- */
let state;
try { state = store.load(); }
catch (e) { document.body.innerHTML = `<p style="padding:24px;font:16px system-ui">Parcel Portfolio couldn't read its saved data (${esc(e.message)}). Nothing was changed. Export from another device or contact support before clearing this browser's data.</p>`; throw e; }
const [AREA_DATA, BOUNDS, SEED] = await Promise.all(['data/areas.json', 'data/boundaries.geojson', 'data/seed-properties.json']
  .map(u => fetch(u).then(r => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); })));
if (!state.seeded) { Object.assign(state.properties, SEED.properties); state.seeded = true; store.save(state); }
const buyBox = () => ({ ...BUY_BOX_DEFAULTS, ...(state.buyBox || {}) });
let SCORES = scoreAreas(AREA_DATA, state.areaOverrides);
const rescore = () => { SCORES = scoreAreas(AREA_DATA, state.areaOverrides); };
const areaFor = zip => SCORES[zip] || null;
const run = d => analyze(d, areaFor(d.zip), buyBox());

let view = { name: 'home' };       // home | property | area
let draft = null;                  // unsaved property being added
let selectedId = null;

/* ---------------- map ---------------- */
let styleKey = (() => { try { return localStorage.getItem('parcel.style') || 'liberty'; } catch { return 'liberty'; } })();
const map = new maplibregl.Map({ container: 'map', style: STYLES[styleKey], center: [-94.49, 37.10], zoom: 11.3, attributionControl: { compact: true } });
map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: false }), 'bottom-right');
const geolocate = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showUserLocation: true, showAccuracyCircle: true });
map.addControl(geolocate, 'bottom-right');
document.querySelector('.maplibregl-ctrl-geolocate')?.closest('.maplibregl-ctrl-group')?.setAttribute('hidden', '');
geolocate.on('trackuserlocationstart', () => $('btnLocate').classList.add('on'));
geolocate.on('trackuserlocationend', () => $('btnLocate').classList.remove('on'));
geolocate.on('error', e => toast(e.code === 1 ? 'Location is off for this site. Turn it on in your browser settings.' : 'Couldn’t get your location.'));

function areaGeo() {
  return { type: 'FeatureCollection', features: BOUNDS.features.map(f => {
    const s = f.properties.zip ? SCORES[f.properties.zip] : null;
    return { ...f, properties: { ...f.properties, grade: s?.grade || '', label: s ? `${f.properties.name}\n${s.grade} · ${Math.round(s.score)}` : `Tract ${f.properties.tract}` } };
  }) };
}
function addAreaLayers() {
  if (map.getSource('areas')) return;
  map.addSource('areas', { type: 'geojson', data: areaGeo() });
  const firstSymbol = map.getStyle().layers.find(l => l.type === 'symbol')?.id;
  map.addLayer({ id: 'area-fill', type: 'fill', source: 'areas', filter: ['==', ['get', 'kind'], 'zip'],
    paint: { 'fill-color': ['match', ['get', 'grade'], 'A', GRADE_FILL.A, 'B', GRADE_FILL.B, 'C', GRADE_FILL.C, 'D', GRADE_FILL.D, '#999'],
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.38, 14, 0.14] } }, firstSymbol);
  map.addLayer({ id: 'area-line', type: 'line', source: 'areas', filter: ['==', ['get', 'kind'], 'zip'],
    paint: { 'line-color': '#ffffff', 'line-width': 1.6, 'line-opacity': 0.9 } }, firstSymbol);
  map.addLayer({ id: 'area-sel', type: 'line', source: 'areas', filter: ['==', ['get', 'zip'], '__none'],
    paint: { 'line-color': '#0a84ff', 'line-width': 3 } });
  map.addLayer({ id: 'tract-line', type: 'line', source: 'areas', filter: ['==', ['get', 'kind'], 'tract'],
    paint: { 'line-color': '#3c3c43', 'line-width': 1, 'line-dasharray': [3, 2], 'line-opacity': 0.6 } });
  const font = map.getStyle().layers.find(l => l.layout?.['text-font'])?.layout['text-font'] || ['Noto Sans Regular'];
  map.addLayer({ id: 'area-label', type: 'symbol', source: 'areas', filter: ['==', ['get', 'kind'], 'label'], maxzoom: 14,
    layout: { 'text-field': ['get', 'label'], 'text-font': font, 'text-size': ['interpolate', ['linear'], ['zoom'], 9, 11, 13, 14], 'text-line-height': 1.25 },
    paint: { 'text-color': '#1c1c1e', 'text-halo-color': 'rgba(255,255,255,.95)', 'text-halo-width': 1.6 } });
  applyLayerVisibility();
}
map.on('style.load', addAreaLayers);
map.on('click', 'area-fill', e => { if (longPressed) return; const z = e.features?.[0]?.properties?.zip; if (z && !e.originalEvent.defaultPrevented) openArea(z); });
map.on('mouseenter', 'area-fill', () => map.getCanvas().style.cursor = 'pointer');
map.on('mouseleave', 'area-fill', () => map.getCanvas().style.cursor = '');
function refreshAreaSource() { map.getSource('areas')?.setData(areaGeo()); }
function applyLayerVisibility() {
  const vis = (id, on) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  const g = $('optGrades').checked, t = $('optTracts').checked;
  ['area-fill', 'area-line', 'area-label'].forEach(id => vis(id, g)); vis('tract-line', t);
  document.querySelectorAll('.pin:not(.draft)').forEach(el => el.hidden = !$('optPins').checked);
}

/* Pins */
const markers = new Map();
function pinEl(verdict, extra = '') { const el = document.createElement('div'); el.className = `pin ${verdict} ${extra}`; el.innerHTML = `<div class="b"><span>${MARK[verdict] || '+'}</span></div>`; return el; }
function refreshPins() {
  for (const m of markers.values()) m.remove(); markers.clear();
  for (const p of Object.values(state.properties)) {
    if (p.lat == null) continue;
    const a = run(p); const el = pinEl(a.verdict, p.id === selectedId ? 'sel' : '');
    el.title = `${p.name} · ${SHORT[a.verdict]}`; el.hidden = !$('optPins').checked;
    el.addEventListener('click', ev => { ev.stopPropagation(); openProperty(p.id); });
    markers.set(p.id, new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(map));
  }
  if (draft?.lat != null) {
    const el = pinEl('draft', 'draft'); el.querySelector('span').textContent = '+';
    const m = new maplibregl.Marker({ element: el, anchor: 'bottom', draggable: true }).setLngLat([draft.lng, draft.lat]).addTo(map);
    m.on('dragend', () => { const { lng, lat } = m.getLngLat(); placeDraft(lat, lng, false); });
    markers.set('__draft', m);
  }
}

/* Long-press (touch) or right-click (mouse) to add a property there */
let pressTimer = null, longPressed = false;
map.on('touchstart', e => { if (e.originalEvent.touches.length !== 1) return; longPressed = false;
  pressTimer = setTimeout(() => { longPressed = true; startDraftAt(e.lngLat.lat, e.lngLat.lng); }, 550); });
['touchend', 'touchmove', 'movestart', 'zoomstart'].forEach(ev => map.on(ev, () => clearTimeout(pressTimer)));
map.on('contextmenu', e => startDraftAt(e.lngLat.lat, e.lngLat.lng));
map.on('click', () => { setTimeout(() => { longPressed = false; }, 0); $('layers').hidden = true; });

/* ---------------- drafts & saving ---------------- */
function newDeal(extra = {}) { return structuredClone({ ...DEAL_DEFAULTS, ...extra, rents: [...DEAL_DEFAULTS.rents] }); }
async function placeDraft(lat, lng, fly = true) {
  draft.lat = +lat.toFixed(6); draft.lng = +lng.toFixed(6);
  const z = zipAt(BOUNDS, lng, lat); if (z) draft.zip = z;
  refreshPins(); if (fly) map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15.5) });
  openDraft();
  const addr = await reverseAddress(lat, lng).catch(() => null);
  if (addr && draft) { draft.address = addr; if (!draft.name) draft.name = addr.split(',')[0]; openDraft(); }
}
function startDraftAt(lat, lng) { draft = newDeal(); selectedId = null; placeDraft(lat, lng); toast('Drag the pin to adjust'); }
function saveDraft() {
  const id = store.newId(); const p = { ...draft, id, status: 'watching', updatedAt: new Date().toISOString() };
  if (!p.name) p.name = p.address || 'Untitled property';
  state.properties[id] = p; store.save(state); draft = null; refreshPins(); openProperty(id); toast('Saved');
}
let saveT;
function autosave(p) { p.updatedAt = new Date().toISOString(); clearTimeout(saveT); saveT = setTimeout(() => { store.save(state); refreshPins(); }, 500); }

/* ---------------- sheet ---------------- */
const sheet = $('sheet'), body = $('sheetBody');
const setDetent = d => sheet.dataset.detent = d;
function render() { if (view.name === 'home') renderHome(); else if (view.name === 'property') renderProperty(); else if (view.name === 'area') renderArea(); }
function openHome() { view = { name: 'home' }; selectedId = null; draft = null; refreshPins(); setAreaSel(null); renderHome(); body.scrollTop = 0; }
function openProperty(id) { draft = null; selectedId = id; view = { name: 'property', id }; refreshPins(); setAreaSel(null); renderProperty(true); body.scrollTop = 0; if (sheet.dataset.detent === 'peek') setDetent('half'); }
function openDraft() { view = { name: 'property', id: null }; renderProperty(true); if (sheet.dataset.detent === 'peek') setDetent('half'); }
function openArea(zip) { view = { name: 'area', zip }; setAreaSel(zip); renderArea(); body.scrollTop = 0; if (sheet.dataset.detent === 'peek') setDetent('half'); }
function setAreaSel(zip) { map.getLayer('area-sel') && map.setFilter('area-sel', ['all', ['==', ['get', 'kind'], 'zip'], ['==', ['get', 'zip'], zip || '__none']]); }
const closeBtn = `<button class="close" data-act="home" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;

function renderHome() {
  const props = Object.values(state.properties).map(p => ({ p, a: run(p) }))
    .sort((x, y) => ({ pass: 0, warn: 1, fail: 2 }[x.a.verdict] - { pass: 0, warn: 1, fail: 2 }[y.a.verdict]) || y.a.cfMgd - x.a.cfMgd);
  const count = v => props.filter(x => x.a.verdict === v).length;
  const bb = buyBox();
  const areas = Object.values(SCORES).sort((a, b) => b.score - a.score);
  body.innerHTML = `
  <div class="hdr"><div><h2>Parcel Portfolio</h2><div class="sub">${props.length} saved · ${count('pass')} fit · ${count('warn')} close · ${count('fail')} pass on</div></div></div>
  <div class="actions">
    <button class="act primary" data-act="pinhere"><svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>Pin here</button>
    <button class="act" data-act="search"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>Address</button>
    <button class="act" data-act="blank"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>No location</button>
  </div>
  <div class="group-title">Properties</div>
  <div class="group">${props.length ? props.map(({ p, a }) => `
    <button class="listitem" data-open="${esc(p.id)}"><span class="dot ${a.verdict}">${MARK[a.verdict]}</span>
      <span class="t"><b>${esc(p.name)}</b><span>${esc(SCORES[p.zip]?.name || p.zip)} · ${money(+p.price || 0)}</span></span>
      <span class="r ${a.cfMgd >= 0 ? 'pos' : 'neg'}">${money(a.cfMgd)}<br><span class="muted" style="font-size:12px">${pct(a.rtp, 2)}</span></span></button>`).join('')
    : `<div class="empty">No properties yet. Tap <b>Pin here</b> while you're standing at one, search an address, or press and hold on the map.</div>`}</div>
  <div class="group-title">Areas</div>
  <div class="group">${areas.map(s => `<button class="listitem" data-area="${s.zip}"><span class="grade g${s.grade}">${s.grade}</span>
     <span class="t"><b>${esc(s.name)}</b><span>${s.zip}${s.adjust ? ` · your adjustment ${s.adjust > 0 ? '+' : ''}${s.adjust}` : ''}</span></span><span class="r">${Math.round(s.score)}</span></button>`).join('')}</div>
  <div class="group-title">Buy box</div>
  <div class="group form">
    ${numField('bb:minRtp', 'Minimum rent-to-price', bb.minRtp, '%', 0.05)}
    ${numField('bb:strongRtp', 'Strong rent-to-price', bb.strongRtp, '%', 0.05)}
    ${numField('bb:targetDoor', 'Target cash flow per door', bb.targetDoor, '$/mo', 25)}
  </div>
  <div class="group-title">Backup</div>
  <button class="btn" data-act="export">Export all data</button>
  <button class="btn" data-act="import">Import a backup</button>
  <p class="note">Your properties and notes live only on this device. Export after changes you care about, and import the file on your other devices. Map © OpenStreetMap contributors, tiles by OpenFreeMap. Area data sources are listed on each area.</p>`;
}

function numField(key, label, value, unit, step = 1, hint = '') {
  return `<div class="field"><label for="f-${key}">${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</label>
    <input id="f-${key}" type="number" inputmode="decimal" step="${step}" data-f="${key}" value="${value ?? ''}" placeholder="${unit === '%' || unit === '$/mo' ? '' : ''}" aria-label="${esc(label)} (${unit})"></div>`;
}
function textField(key, label, value, type = 'text') {
  return `<div class="field"><label for="f-${key}">${esc(label)}</label><input id="f-${key}" type="${type}" data-f="${key}" value="${esc(value)}"></div>`;
}
function switchField(key, label, value, hint = '') {
  return `<div class="field"><label for="f-${key}">${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</label><input id="f-${key}" type="checkbox" class="switch" data-f="${key}" ${value ? 'checked' : ''}></div>`;
}

function currentDeal() { return view.id ? state.properties[view.id] : draft; }

function renderProperty(full = false) {
  const p = currentDeal(); if (!p) return openHome();
  if (full) {
    const area = SCORES[p.zip];
    body.innerHTML = `
    <div class="hdr"><div><h2>${esc(p.name || 'New property')}</h2><div class="sub">${esc(p.address || (area ? area.name : 'Not on the map yet'))}</div></div>${closeBtn}</div>
    <div class="actions">
      ${view.id ? '' : `<button class="act primary" data-act="savedraft"><svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>Save</button>`}
      ${p.lat != null ? `<a class="act" href="${appleMapsUrl(p.lat, p.lng, p.name)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><path d="M3 11 21 3l-8 18-2-8z"/></svg>Directions</a>` : ''}
      ${p.url ? `<a class="act" href="${esc(p.url)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9H3z"/><path d="M9 20v-6h6v6"/></svg>Listing</a>` : ''}
      <button class="act" data-act="edit"><svg viewBox="0 0 24 24"><path d="M4 20h4L20 8l-4-4L4 16z"/></svg>Edit</button>
    </div>
    <div id="pResults"></div>
    <div id="pForm"></div>`;
    if (!view.id) renderForm(true);
  }
  const a = run(p);
  const cf = v => `<span class="${v >= 0 ? 'pos' : 'neg'}">${money(v)}</span>`;
  const row = (k, v, cls = '') => `<div class="row ${cls}"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  $('pResults').innerHTML = `
    <div class="verdict ${a.verdict}"><span class="dot ${a.verdict}" style="width:28px;height:28px;font-size:15px">${MARK[a.verdict]}</span><div>${esc(a.headline)}<small>${a.tests.filter(t => t.status === 'pass').length} of 5 tests pass</small></div></div>
    <div class="kpis">
      <div class="kpi"><div class="l">Cash flow, managed</div><div class="n">${cf(a.cfMgd)}</div><div class="l">${money(a.cfMgd / a.units)}/door · ${money(a.cfSelf)} self-managed</div></div>
      <div class="kpi"><div class="l">Rent-to-price</div><div class="n">${pct(a.rtp, 2)}</div><div class="l">target ${buyBox().minRtp}–${buyBox().strongRtp}%</div></div>
      <div class="kpi"><div class="l">Cash needed</div><div class="n">${money(a.cash)}</div><div class="l">down, closing, repairs</div></div>
      <div class="kpi"><div class="l">Cash-on-cash</div><div class="n">${pct(a.coc)}</div><div class="l">cap rate ${pct(a.capRate)}</div></div>
    </div>
    ${a.ownerHousingCost != null ? `<p class="note">Living in unit 1 the first year, your net housing cost is <b class="num">${money(a.ownerHousingCost)}/mo</b> after the other rent.</p>` : ''}
    <div class="group-title">Five tests</div>
    <div class="group">${a.tests.map(t => `<div class="test"><span class="dot ${t.status}">${MARK[t.status]}</span><p><b>${t.label}:</b> ${esc(t.detail)}<small>${esc(t.why)}</small></p></div>`).join('')}</div>
    <div class="group-title">Monthly ledger</div>
    <div class="group">
      ${row('Gross rent', money(a.gross))}${row(`Vacancy (${a.vacPct}%)`, money(-a.vac))}${row(`Maintenance + capex (${a.maintPct}%)`, money(-a.maint))}
      ${row('Property tax', money(-a.t))}${row('Insurance', money(-a.i))}${+p.hoa ? row('HOA', money(-p.hoa)) : ''}${+p.utilities ? row('Owner-paid utilities', money(-p.utilities)) : ''}
      ${row('Net operating income', money(a.noiSelf), 'total')}${row('Mortgage P&I', money(-a.pi))}
      ${row('Cash flow, self-managed', cf(a.cfSelf), 'total')}${row(`Management (${a.mgmtPct}%)`, money(-a.mgmt))}${row('Leasing fees', money(-a.lease))}
      ${row('Cash flow, managed', cf(a.cfMgd), 'total')}
    </div>
    <div class="group-title">Break-even</div>
    <div class="group">
      ${row('Rent needed ($0 managed cash flow)', isFinite(a.breakEvenRent) ? money(a.breakEvenRent) : '—')}${row('Max price at this rent', money(a.maxPrice))}
      ${row(`Price for ${buyBox().minRtp}% rent-to-price`, money(a.rtpPrice))}${row('Offer to pass both', money(a.offerToPass) + (p.price ? ` <span class="muted">(${pct((a.offerToPass / p.price - 1) * 100, 0)})</span>` : ''), 'total')}
    </div>
    <div class="group-title">Year 1 wealth</div>
    <div class="group">
      ${row('Cash flow, managed', money(a.cfMgd * 12))}${row('Principal paid down', money(a.principalYr1))}${row(`Appreciation (${a.apprPct}%)`, money(a.appreciationYr1))}
      ${row('Total', `${money(a.totalYr1)} <span class="muted">(${pct(a.cash ? a.totalYr1 / a.cash * 100 : 0)})</span>`, 'total')}${row('Depreciation deduction', money(a.depreciation) + '/yr')}
    </div>`;
}

function renderForm(open) {
  const p = currentDeal(); const el = $('pForm'); if (!el) return;
  if (!open) { el.innerHTML = ''; return; }
  const n = +p.units || 1;
  const areaOpts = Object.values(SCORES).sort((a, b) => a.name.localeCompare(b.name)).map(s => `<option value="${s.zip}" ${s.zip === p.zip ? 'selected' : ''}>${esc(s.name)} · ${s.zip}</option>`).join('');
  el.innerHTML = `
  <div class="group-title">Property</div>
  <div class="group form">
    ${textField('name', 'Name', p.name)}${textField('address', 'Address', p.address)}${textField('url', 'Listing link', p.url, 'url')}
    <div class="field"><label for="f-zip">Area</label><select id="f-zip" data-f="zip">${areaOpts}</select></div>
    ${numField('yearBuilt', 'Year built', p.yearBuilt, 'year')}
    <div class="field"><label for="f-units">Units</label><select id="f-units" data-f="units">${[1, 2, 3, 4].map(u => `<option ${u === n ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
    ${numField('beds', 'Beds (typical unit)', p.beds, 'beds')}${numField('baths', 'Baths (typical unit)', p.baths, 'baths', 0.5)}
    ${switchField('parking', 'Garage or off-street parking', p.parking)}${switchField('ownerOcc', 'I’ll live in unit 1 the first year', p.ownerOcc)}
  </div>
  <div class="group-title">Price & financing</div>
  <div class="group form">
    ${numField('price', 'Price', p.price, '$', 1000)}${numField('downPct', 'Down payment', p.downPct, '%', 0.5, '%')}${numField('rate', 'Interest rate', p.rate, '%', 0.125, '%')}
    ${numField('term', 'Term', p.term, 'years', 1, 'years')}${numField('closingPct', 'Closing costs', p.closingPct, '%', 0.5, '% of price')}${numField('rehab', 'Repairs at purchase', p.rehab, '$', 500)}
  </div>
  <div class="group-title">Rent & expenses</div>
  <div class="group form">
    ${Array.from({ length: n }, (_, i) => numField(`rent:${i}`, `Rent · unit ${i + 1}`, p.rents?.[i] ?? 0, '$/mo', 25, 'per month')).join('')}
    ${numField('taxes', 'Property tax', p.taxes, '$/yr', 50, 'per year')}${numField('insurance', 'Insurance', p.insurance, '$/yr', 50, 'per year')}
    ${numField('hoa', 'HOA', p.hoa, '$/mo', 5, 'per month')}${numField('utilities', 'Owner-paid utilities', p.utilities, '$/mo', 5, 'per month')}
  </div>
  <div class="group-title">The big four · newer or inspected?</div>
  <div class="group form">
    ${switchField('roofOk', 'Roof', p.roofOk, 'under ~15 years')}${switchField('hvacOk', 'HVAC', p.hvacOk, 'under ~12 years')}
    ${switchField('whOk', 'Water heater', p.whOk, 'under ~10 years')}${switchField('sewerOk', 'Sewer line', p.sewerOk, 'scoped or replaced')}
  </div>
  <div class="group-title">Assumptions</div>
  <div class="group form">
    ${numField('vacPct', 'Vacancy', p.vacPct, '%', 0.5, `blank = area default (${areaFor(p.zip)?.vacPct ?? 8}%)`)}
    ${numField('maintPct', 'Maintenance + capex', p.maintPct, '%', 0.5, `blank = by age (${maintByAge(p.yearBuilt)}%)`)}
    ${numField('apprPct', 'Appreciation', p.apprPct, '%', 0.5, `blank = area default (${areaFor(p.zip)?.apprPct ?? 2}%)`)}
    ${numField('mgmtPct', 'Management', p.mgmtPct, '%', 0.5, '% of collected rent')}${numField('leasePct', 'Leasing fee', p.leasePct, '%', 5, "% of one month's rent")}
    ${numField('stayYrs', 'Average tenant stay', p.stayYrs, 'years', 0.5, 'years')}
  </div>
  <div class="group-title">Notes</div>
  <div class="group form" style="padding:10px"><textarea id="f-notes" data-f="notes" rows="3" aria-label="Notes">${esc(p.notes)}</textarea></div>
  ${view.id ? (view.confirmDelete ? `<button class="btn danger" data-act="delete-yes">Tap again to delete for good</button>` : `<button class="btn danger" data-act="delete">Delete property</button>`) : `<button class="btn primary" data-act="savedraft">Save property</button>`}`;
}

/* Area view */
function renderArea() {
  const s = SCORES[view.zip], a = AREA_DATA.areas.find(x => x.zip === view.zip), o = state.areaOverrides[view.zip] || {};
  const tracts = AREA_DATA.tracts.filter(t => t.zip === view.zip);
  const f = a.facts;
  const src = fact => fact.state === 'PRESENT' ? `${fact.source}${fact.asOf ? ', ' + fact.asOf : ''}` : 'Unknown';
  const factVal = {
    school: s.schoolGrade ? `${esc(s.district || '')} · ${s.schoolGrade}${s.schoolIsYours ? ' (yours)' : ''}` : `<span class="muted">Unknown${s.district ? ' · ' + esc(s.district) : ''}</span>`,
    income: money(f.income.value), ownerPct: pct(f.ownerPct.value, 0), rentVacPct: pct(f.rentVacPct.value), bachPct: pct(f.bachPct.value, 0),
    homeValue: money(s.homeValue.value) + (s.homeValue.estimated ? ' <span class="muted">est.</span>' : ''), medYearBuilt: `${f.medYearBuilt.value} <span class="muted">(${pct(f.pre1950Pct.value, 0)} pre-1950)</span>`
  };
  const factSrc = { school: s.schoolIsYours ? 'Your rating' : src(f.schoolGrade), homeValue: s.homeValue.source, income: src(f.income), ownerPct: src(f.ownerPct), rentVacPct: src(f.rentVacPct), bachPct: src(f.bachPct), medYearBuilt: src(f.medYearBuilt) };
  body.innerHTML = `
  <div class="hdr"><div style="display:flex;gap:12px;align-items:center"><span class="grade g${s.grade}" style="width:44px;height:44px;font-size:22px;border-radius:10px">${s.grade}</span>
    <div><h2>${esc(s.name)}</h2><div class="sub">${s.zip} · score ${Math.round(s.score)}${s.adjust ? ` (data ${Math.round(s.rawScore)}, yours ${s.adjust > 0 ? '+' : ''}${s.adjust})` : ''}</div></div></div>${closeBtn}</div>
  <p class="note">Grade ${s.grade} sets new deals here to ${s.vacPct}% vacancy and ${s.apprPct}% appreciation unless you override them.</p>
  <div class="group-title">Facts · weight · rank in region</div>
  <div class="group">${Object.keys(WEIGHTS).map(k => `<div class="row" style="align-items:flex-start"><span class="k">${FACT_LABELS[k]}<br><small class="muted">${esc(factSrc[k])} · ${WEIGHTS[k]}%</small></span>
    <span style="display:flex;flex-direction:column;align-items:flex-end;gap:6px"><span class="v">${factVal[k]}</span><span class="bar" title="${Math.round(s.parts[k])} of 100"><i style="width:${Math.round(s.parts[k])}%"></i></span></span></div>`).join('')}
    ${f.avgRent.state === 'PRESENT' ? `<div class="row"><span class="k">Average rent<br><small class="muted">${esc(src(f.avgRent))}</small></span><span class="v">${money(f.avgRent.value)}</span></div>` : ''}
  </div>
  ${s.unknown.length ? `<p class="note">Unknown, scored as regional average: ${s.unknown.map(k => FACT_LABELS[k].toLowerCase()).join(', ')}.</p>` : ''}
  ${tracts.length ? `<div class="group-title">Neighborhood tracts · ${esc(AREA_DATA.tractSource.asOf)}</div><div class="group">${tracts.map(t => `<div class="row"><span class="k">Tract ${t.tract}<br><small class="muted">${pct(t.povertyPct)} poverty · ${pct(t.movedPct)} moved last year</small></span><span class="v">${money(t.income)}<br><small class="muted">${money(t.homeValue)} home</small></span></div>`).join('')}</div>` : ''}
  <div class="group-title">Your local knowledge</div>
  <div class="group form">
    <div class="field"><label for="f-a-school">School grade</label><select id="f-a-school" data-a="schoolGrade"><option value="">Use data (${f.schoolGrade.value || 'unknown'})</option>${Object.keys(GRADE_POINTS).map(g => `<option ${o.schoolGrade === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
    <div class="field" style="flex-direction:column;align-items:stretch"><label for="f-a-adjust">Adjustment <b class="num" id="adjOut">${(o.adjust || 0) > 0 ? '+' : ''}${o.adjust || 0}</b><small>±15 points for what the data can't see</small></label><input id="f-a-adjust" type="range" min="-15" max="15" step="1" value="${o.adjust || 0}" data-a="adjust"></div>
    <div style="padding:10px"><textarea rows="3" data-a="note" placeholder="What you know about this part of town" aria-label="Area notes">${esc(o.note || '')}</textarea></div>
  </div>`;
}

/* ---------------- events ---------------- */
body.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-open],[data-area]'); if (!t) return;
  if (t.dataset.open) return openProperty(t.dataset.open);
  if (t.dataset.area) { const z = t.dataset.area; openArea(z); const f = BOUNDS.features.find(x => x.properties.kind === 'label' && x.properties.zip === z); if (f) map.flyTo({ center: f.geometry.coordinates, zoom: 12 }); return; }
  const act = t.dataset.act;
  if (act === 'home') openHome();
  else if (act === 'pinhere') pinHere();
  else if (act === 'search') { $('q').focus(); setDetent('peek'); }
  else if (act === 'blank') { draft = newDeal(); selectedId = null; openDraft(); setDetent('full'); }
  else if (act === 'savedraft') saveDraft();
  else if (act === 'edit') { const open = !$('pForm').innerHTML; renderForm(open); if (open) { setDetent('full'); $('pForm').scrollIntoView({ behavior: 'smooth' }); } }
  else if (act === 'delete') { view.confirmDelete = true; renderForm(true); }
  else if (act === 'delete-yes') { delete state.properties[view.id]; store.save(state); toast('Deleted'); openHome(); }
  else if (act === 'export') exportData();
  else if (act === 'import') $('importFile').click();
});
body.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.a) {   // area override
    const z = view.zip; const o = { ...(state.areaOverrides[z] || {}) };
    const k = el.dataset.a; o[k] = k === 'adjust' ? +el.value : (el.value || (k === 'note' ? '' : null));
    o.updatedAt = new Date().toISOString(); state.areaOverrides[z] = o;
    if (k === 'adjust') $('adjOut').textContent = (+el.value > 0 ? '+' : '') + el.value;
    clearTimeout(saveT); saveT = setTimeout(() => { store.save(state); rescore(); refreshAreaSource(); refreshPins(); if (k !== 'note') renderArea(); }, 400);
    return;
  }
  const key = el.dataset.f; if (!key) return;
  const val = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? null : +el.value) : el.value;
  if (key.startsWith('bb:')) { state.buyBox = { ...buyBox(), [key.slice(3)]: val ?? BUY_BOX_DEFAULTS[key.slice(3)] }; store.save(state); refreshPins(); return; }
  const p = currentDeal(); if (!p) return;
  if (key.startsWith('rent:')) { const i = +key.slice(5); p.rents = [...(p.rents || [])]; p.rents[i] = val ?? 0; }
  else if (key === 'units') { p.units = +val; renderForm(true); }
  else if (['price', 'downPct', 'rate', 'term', 'closingPct', 'rehab', 'taxes', 'insurance', 'hoa', 'utilities', 'yearBuilt', 'beds', 'baths', 'mgmtPct', 'leasePct', 'stayYrs'].includes(key)) p[key] = val ?? 0;
  else p[key] = val;
  renderProperty(false);
  if (view.id) autosave(p);
});
body.addEventListener('change', e => { if (e.target.dataset.f === 'zip' || e.target.dataset.f === 'units') { renderProperty(false); renderForm(true); } });

async function pinHere() {
  if (!('geolocation' in navigator)) return toast('This browser can’t share your location.');
  toast('Finding you…');
  navigator.geolocation.getCurrentPosition(pos => {
    draft = newDeal(); selectedId = null; placeDraft(pos.coords.latitude, pos.coords.longitude);
    if (pos.coords.accuracy > 60) toast(`Accurate to about ${Math.round(pos.coords.accuracy)} m. Drag the pin onto the house.`);
    else toast('Pinned. Drag to adjust.');
  }, err => toast(err.code === 1 ? 'Location is off for this site. Turn it on in your browser settings.' : 'Couldn’t get your location. Try again outside or near a window.'),
  { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
}
$('btnPinHere').onclick = pinHere;
$('btnLocate').onclick = () => geolocate.trigger();
$('btnLayers').onclick = e => { e.stopPropagation(); $('layers').hidden = !$('layers').hidden; };
document.querySelectorAll('[data-style]').forEach(b => {
  b.setAttribute('aria-checked', b.dataset.style === styleKey);
  b.onclick = () => { styleKey = b.dataset.style; try { localStorage.setItem('parcel.style', styleKey); } catch {}
    document.querySelectorAll('[data-style]').forEach(x => x.setAttribute('aria-checked', x === b)); map.setStyle(STYLES[styleKey]); };
});
['optGrades', 'optTracts', 'optPins'].forEach(id => $(id).onchange = applyLayerVisibility);

/* Search */
let searchT;
$('q').addEventListener('input', () => { clearTimeout(searchT); const q = $('q').value.trim(); if (q.length < 4) { $('results').hidden = true; return; } searchT = setTimeout(() => doSearch(q), 450); });
$('search').addEventListener('submit', e => { e.preventDefault(); const q = $('q').value.trim(); if (q) doSearch(q); });
async function doSearch(q) {
  try {
    const rs = await searchAddress(/joplin|webb|carl|carthage|neosho|mo\b|missouri/i.test(q) ? q : `${q}, Jasper County, Missouri`);
    const ul = $('results');
    ul.innerHTML = rs.length ? rs.map((r, i) => `<li><button type="button" data-i="${i}">${esc(r.label)}</button></li>`).join('') : '<li><button type="button" disabled>No matches</button></li>';
    ul.hidden = false;
    ul.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const r = rs[+b.dataset.i]; ul.hidden = true; $('q').value = '';
      draft = newDeal({ address: r.label.split(',').slice(0, 3).join(',').trim(), name: r.label.split(',').slice(0, 2).join(' ').trim() });
      selectedId = null; placeDraft(r.lat, r.lng); });
  } catch (err) { toast(err.message); }
}

/* Sheet drag between detents */
(() => {
  let startY = 0, startT = 0, dragging = false;
  const detentY = () => { const h = sheet.getBoundingClientRect().height; const d = sheet.dataset.detent; return d === 'full' ? 0 : d === 'half' ? h * 0.48 : h - parseFloat(getComputedStyle(sheet).getPropertyValue('--peek')) ; };
  const g = $('grabber');
  g.addEventListener('pointerdown', e => { dragging = true; startY = e.clientY; startT = detentY(); sheet.classList.add('dragging'); g.setPointerCapture(e.pointerId); });
  g.addEventListener('pointermove', e => { if (!dragging) return; const y = Math.max(0, startT + e.clientY - startY); sheet.style.transform = `translateY(${y}px)`; });
  const end = e => { if (!dragging) return; dragging = false; sheet.classList.remove('dragging'); sheet.style.transform = '';
    const dy = e.clientY - startY, h = sheet.getBoundingClientRect().height, y = startT + dy;
    if (Math.abs(dy) < 6) { setDetent({ peek: 'half', half: 'full', full: 'peek' }[sheet.dataset.detent]); return; }
    setDetent(y < h * 0.25 ? 'full' : y < h * 0.7 ? 'half' : 'peek'); };
  g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
})();

/* Export / import */
function exportData() {
  const blob = new Blob([store.exportJson(state)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `parcel-portfolio-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast('Exported');
}
$('importFile').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try { const r = store.mergeImport(state, await file.text()); store.save(state); rescore(); refreshAreaSource(); refreshPins(); renderHome();
    toast(`Imported: ${r.added} new, ${r.updated} updated, ${r.kept} unchanged`); }
  catch (err) { toast(err.message); }
  e.target.value = '';
};

let toastT; function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }

/* boot */
refreshPins(); renderHome();
if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) navigator.serviceWorker.register('sw.js').catch(() => {});
window.parcel = { state, SCORES: () => SCORES, run };   // for debugging in the console
