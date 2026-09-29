// Local storage for properties, area overrides and buy-box settings.
// Everything lives on this device. Export/import moves it between devices and is the backup.

const KEY = 'parcel-portfolio.v1';
export const SCHEMA = 'parcel.portfolio.v1';

function blank() { return { schema: SCHEMA, properties: {}, areaOverrides: {}, buyBox: null, seeded: false, updatedAt: null }; }

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const s = JSON.parse(raw);
    if (s.schema !== SCHEMA) throw new Error(`Unknown saved-data schema "${s.schema}"`);
    return { ...blank(), ...s };
  } catch (e) {
    // Fail loudly: never silently replace someone's data with an empty store.
    console.error('Parcel Portfolio: could not read saved data', e);
    throw e;
  }
}

export function save(state) {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function newId() {
  return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Build an export file body. */
export function exportJson(state) {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
}

/**
 * Merge an imported file into the current state. Properties are matched by id;
 * the newer updatedAt wins. Returns counts so the UI can say what happened.
 */
export function mergeImport(state, text) {
  const inc = JSON.parse(text);
  if (inc.schema !== SCHEMA) throw new Error(`This file isn't a Parcel Portfolio export (schema "${inc.schema ?? 'none'}").`);
  let added = 0, updated = 0, kept = 0;
  for (const [id, p] of Object.entries(inc.properties || {})) {
    const cur = state.properties[id];
    if (!cur) { state.properties[id] = p; added++; }
    else if ((p.updatedAt || '') > (cur.updatedAt || '')) { state.properties[id] = p; updated++; }
    else kept++;
  }
  for (const [zip, o] of Object.entries(inc.areaOverrides || {})) {
    const cur = state.areaOverrides[zip];
    if (!cur || (o.updatedAt || '') > (cur.updatedAt || '')) state.areaOverrides[zip] = o;
  }
  if (inc.buyBox && !state.buyBox) state.buyBox = inc.buyBox;
  return { added, updated, kept };
}
