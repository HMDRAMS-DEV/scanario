import type {
  Age,
  DataCode,
  GeoResult,
  Modality,
  PostalResponse,
  PriorityWait,
  Site,
  SiteRaw,
  WaitTimeRaw,
} from "./types";

const OH = "/oh";
const NOM = "/nominatim";

const ONTARIO_BOX = {
  west: -95.2,
  south: 41.67,
  east: -74.32,
  north: 56.93,
};

export const RANGES = [
  { id: "30m" as const, label: "30 min", km: 40 },
  { id: "1h" as const, label: "1 hr", km: 80 },
  { id: "2h" as const, label: "2 hr", km: 160 },
  { id: "4h" as const, label: "4 hr", km: 320 },
  { id: "anywhere" as const, label: "Anywhere in Ontario", km: Infinity },
];

const POSTAL_RE =
  /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/;

export function compactPostal(input: string): string {
  return input.replace(/[\s-]+/g, "").toUpperCase();
}

export function looksLikePostal(input: string): boolean {
  return POSTAL_RE.test(compactPostal(input));
}

function isCode(value: string): value is Exclude<DataCode, null> {
  return value === "LV" || value === "RI" || value === "NV";
}

function numOrCode(raw: string | null | undefined): {
  n: number | null;
  code: DataCode;
} {
  if (raw == null) return { n: null, code: null };
  const v = String(raw).trim();
  if (!v) return { n: null, code: null };
  if (isCode(v)) return { n: null, code: v };
  const n = Number(v);
  if (!Number.isFinite(n)) return { n: null, code: null };
  return { n, code: null };
}

function parsePriority(w: WaitTimeRaw): PriorityWait {
  const mean = numOrCode(w.WaitTimeMean);
  const p90 = numOrCode(w.WaitTime90percentile);
  const pct = numOrCode(w.WaitTimePercentWithinTarget);
  const cases = numOrCode(w.NumberOfCases);
  const target = numOrCode(w.Target);
  return {
    id: w.PriorityId,
    mean: mean.n,
    p90: p90.n,
    pctTarget: pct.n,
    cases: cases.n,
    target: target.n,
    code: mean.code ?? p90.code ?? null,
  };
}

export function normalizeSite(raw: SiteRaw): Site {
  const priorities: Site["priorities"] = {};
  for (const w of raw.WaitTimes ?? []) {
    priorities[w.PriorityId] = parsePriority(w);
  }
  const km = Number(raw.Distance);
  return {
    id: raw.Id,
    name: raw.Name,
    address: raw.Address1,
    city: raw.City,
    province: raw.Province,
    postal: raw.PostalCode,
    km: Number.isFinite(km) ? km : 0,
    lat: raw.Latitude,
    lng: raw.Longitude,
    period: (raw.Key ?? "").trim(),
    periodKey: raw.Key2,
    isProvince: raw.Id < 0 || raw.Name === "Ontario",
    priorities,
  };
}

export async function geocodePostal(input: string): Promise<GeoResult> {
  const compact = compactPostal(input);
  const res = await fetch(`${OH}/city/postalcode/${compact}`);
  if (!res.ok) {
    throw new Error("We couldn’t read that postal code.");
  }
  const text = await res.text();
  if (!text.trim()) {
    throw new Error("We couldn’t find that postal code.");
  }
  let data: PostalResponse;
  try {
    data = JSON.parse(text) as PostalResponse;
  } catch {
    throw new Error("We couldn’t find that postal code.");
  }
  if (data.Latitude == null || data.Longitude == null) {
    throw new Error("We couldn’t find that postal code.");
  }
  const inOntario =
    data.InOntario === true || (data.Province || "").toUpperCase() === "ON";
  if (!inOntario) {
    throw new Error("That postal code isn’t in Ontario.");
  }
  return {
    label: data.PostalCode || `${compact.slice(0, 3)} ${compact.slice(3)}`,
    lat: data.Latitude,
    lng: data.Longitude,
    postal: data.PostalCode,
    inOntario: true,
    source: "postal",
  };
}

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    state?: string;
    province?: string;
    country_code?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
  };
}

function inOntarioBox(lat: number, lng: number): boolean {
  return (
    lat >= ONTARIO_BOX.south &&
    lat <= ONTARIO_BOX.north &&
    lng >= ONTARIO_BOX.west &&
    lng <= ONTARIO_BOX.east
  );
}

export async function geocodeAddress(query: string): Promise<GeoResult> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    countrycodes: "ca",
    viewbox: `${ONTARIO_BOX.west},${ONTARIO_BOX.north},${ONTARIO_BOX.east},${ONTARIO_BOX.south}`,
    bounded: "0",
    limit: "6",
  });
  const res = await fetch(`${NOM}/search?${params.toString()}`);
  if (!res.ok) {
    throw new Error("Address lookup is unavailable right now.");
  }
  const hits = (await res.json()) as NominatimHit[];
  const ontario = hits
    .map((h) => {
      const lat = Number(h.lat);
      const lng = Number(h.lon);
      const state = (h.address?.state || h.address?.province || "").toLowerCase();
      const okState = state.includes("ontario") || state === "on";
      return { h, lat, lng, okState };
    })
    .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng))
    .filter((x) => x.okState || inOntarioBox(x.lat, x.lng));

  const best = ontario.find((x) => x.okState) ?? ontario[0];
  if (!best) {
    throw new Error("We couldn’t find that place in Ontario.");
  }
  const city =
    best.h.address?.city ||
    best.h.address?.town ||
    best.h.address?.village ||
    "";
  const label = city
    ? `${city}, Ontario`
    : best.h.display_name.split(",").slice(0, 2).join(",").trim();
  return {
    label,
    lat: best.lat,
    lng: best.lng,
    postal: best.h.address?.postcode,
    inOntario: true,
    source: "address",
  };
}

export async function geocode(input: string): Promise<GeoResult> {
  const q = input.trim();
  if (!q) throw new Error("Enter a postal code or address.");
  if (looksLikePostal(q)) return geocodePostal(q);
  return geocodeAddress(q);
}

export async function fetchImagingPage(
  age: Age,
  lat: number,
  lng: number,
  s: number,
  modality: Modality,
): Promise<SiteRaw[]> {
  const url = `${OH}/DiagnosticImaging/wtdata/EN/${age}/${lat}/${lng}/${s}/${modality}/1`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Ontario Health didn’t return wait times.");
  }
  const data = (await res.json()) as SiteRaw[];
  return Array.isArray(data) ? data : [];
}

export async function fetchAllSites(
  age: Age,
  lat: number,
  lng: number,
  modality: Modality,
  onUpdate?: (sites: Site[], done: boolean) => void,
): Promise<Site[]> {
  const seen = new Map<string, Site>();
  for (let s = 1; s <= 20; s++) {
    const page = await fetchImagingPage(age, lat, lng, s, modality);
    let added = 0;
    for (const raw of page) {
      if (!raw?.Name) continue;
      if (!seen.has(raw.Name)) {
        seen.set(raw.Name, normalizeSite(raw));
        added += 1;
      }
    }
    onUpdate?.([...seen.values()], false);
    if (added === 0) break;
  }
  const all = [...seen.values()];
  onUpdate?.(all, true);
  return all;
}
