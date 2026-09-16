/**
 * Proxies wait-time lookups to Health Quality Ontario. This was a plain Vercel
 * rewrite; it is a function now so the same-site and rate-limit checks in
 * _guard.js apply to it too.
 */
import { allow } from "../_guard.js";

const UPSTREAM = "https://or.hqontario.ca";

export default async function handler(req, res) {
  if (!allow(req, res)) return;

  const { path, ...rest } = req.query;
  const segments = (Array.isArray(path) ? path : [path]).filter(Boolean);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(rest)) {
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
  }

  const upstream = await fetch(`${UPSTREAM}/${segments.join("/")}?${params}`, {
    headers: { Accept: "application/json", "Accept-Language": "en" },
  });

  const body = await upstream.text();
  res.status(upstream.status);
  res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/json");
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
  res.send(body);
}
