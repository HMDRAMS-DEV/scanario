/**
 * Proxies address lookups to Nominatim. Vite handles this with a dev proxy; in
 * production we need a function because Nominatim's usage policy requires an
 * identifying User-Agent, and a plain Vercel rewrite cannot set one.
 */
const UPSTREAM = "https://nominatim.openstreetmap.org";

export default async function handler(req, res) {
  const { path, ...rest } = req.query;
  const segments = (Array.isArray(path) ? path : [path]).filter(Boolean);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(rest)) {
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
  }

  const upstream = await fetch(`${UPSTREAM}/${segments.join("/")}?${params}`, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
      "User-Agent": "OntarioWait/1.0 (+https://ontariowait.ramihmd.com)",
    },
  });

  const body = await upstream.text();
  res.status(upstream.status);
  res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/json");
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
  res.send(body);
}
