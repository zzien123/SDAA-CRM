// Address → coordinates. US Census geocoder first (free, no key, US addresses), OpenStreetMap Nominatim as fallback.
// Pure helpers are unit-tested; network calls are wrapped with short timeouts so a slow geocoder never blocks a page.

export type GeoResult = { lat: number; lng: number; status: "matched" | "approximate"; source: string; matched: string | null };

/** "1023-25 12th St" → "1023 12th St"; "4611-49 Governor Dr" → "4611 Governor Dr". Ranges confuse geocoders. */
export function firstHouseNumber(street: string): string {
  return street.replace(/^(\d+)[-–](\d+)\b/, "$1").replace(/\s+/g, " ").trim();
}

export function oneLine(street: string, city: string | null, zip: string | null, state = "CA") {
  return [firstHouseNumber(street), city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/** Rough sanity box for San Diego County so a bad match (e.g. same street name in another state) is rejected. */
export function inSanDiegoCounty(lat: number, lng: number) {
  return lat > 32.5 && lat < 33.55 && lng > -117.65 && lng < -116.05;
}

export function parseCensus(json: unknown): { lat: number; lng: number; matched: string } | null {
  const m = (json as { result?: { addressMatches?: { coordinates: { x: number; y: number }; matchedAddress: string }[] } })?.result?.addressMatches?.[0];
  if (!m || typeof m.coordinates?.x !== "number") return null;
  return { lat: m.coordinates.y, lng: m.coordinates.x, matched: m.matchedAddress };
}

export function parseNominatim(json: unknown): { lat: number; lng: number; matched: string; precise: boolean } | null {
  const r = Array.isArray(json) ? json[0] : null;
  if (!r?.lat) return null;
  return { lat: Number(r.lat), lng: Number(r.lon), matched: r.display_name, precise: ["house", "building", "residential", "apartments"].includes(r.type) || r.addresstype === "building" };
}

async function getJson(url: string, ms: number, headers: Record<string, string> = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers, cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

export async function geocode(street: string, city: string | null, zip: string | null): Promise<GeoResult | null> {
  const line = oneLine(street, city, zip);
  const census = parseCensus(await getJson(
    `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(line)}`, 6000));
  if (census && inSanDiegoCounty(census.lat, census.lng)) return { ...census, status: "matched", source: "US Census geocoder" };

  const nom = parseNominatim(await getJson(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(line)}`, 6000,
    { "User-Agent": "SDAA-CRM/1.0 (property geocoding; low volume)" }));
  if (nom && inSanDiegoCounty(nom.lat, nom.lng)) return { lat: nom.lat, lng: nom.lng, matched: nom.matched, status: nom.precise ? "matched" : "approximate", source: "OpenStreetMap Nominatim" };
  return null;
}
