// Geography helpers: which area a point falls in, and address lookup.

function inRing(x, y, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function inPolygon(x, y, poly) { // poly = [outer, ...holes]
  if (!inRing(x, y, poly[0])) return false;
  for (let h = 1; h < poly.length; h++) if (inRing(x, y, poly[h])) return false;
  return true;
}

/** ZIP area containing [lng, lat], or null. */
export function zipAt(boundaries, lng, lat) {
  for (const f of boundaries.features) {
    if (f.properties.kind !== 'zip') continue;
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    if (polys.some(p => inPolygon(lng, lat, p))) return f.properties.zip;
  }
  return null;
}

// Address lookup uses OpenStreetMap's Nominatim. Its usage policy allows light,
// interactive use: at most one request per second, no bulk geocoding.
const NOMINATIM = 'https://nominatim.openstreetmap.org';
let last = 0;
async function politely() {
  const wait = 1100 - (Date.now() - last);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  last = Date.now();
}

/** Search for an address near Joplin. Returns [{label, lat, lng}]. */
export async function searchAddress(q) {
  await politely();
  const url = `${NOMINATIM}/search?format=jsonv2&limit=5&countrycodes=us&viewbox=-94.75,37.35,-94.05,36.75&bounded=0&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`Address search failed (${res.status})`);
  return (await res.json()).map(r => ({ label: r.display_name, lat: +r.lat, lng: +r.lon }));
}

/** Street address for a point, or null. */
export async function reverseAddress(lat, lng) {
  await politely();
  const res = await fetch(`${NOMINATIM}/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lng}`, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) return null;
  const r = await res.json(); const a = r.address || {};
  const street = [a.house_number, a.road].filter(Boolean).join(' ');
  const town = a.city || a.town || a.village || a.hamlet || '';
  return street ? `${street}${town ? ', ' + town : ''}` : (r.display_name || null);
}

export const appleMapsUrl = (lat, lng, name = '') => `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(name || 'Property')}`;
export const googleMapsUrl = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
