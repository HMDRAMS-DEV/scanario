/**
 * Both proxies exist only to serve this site's own front end. Without a check
 * they are open relays: anyone can route traffic through them, which burns the
 * function quota and puts Scanario's identifying User-Agent on abusive
 * Nominatim traffic.
 *
 * Sec-Fetch-Site is set by the browser and cannot be forged from script, so it
 * separates our own fetches from cross-site ones and from direct tooling.
 * Referer is not usable here: the site sends Referrer-Policy: no-referrer.
 */
const SAME_SITE = new Set(["same-origin", "same-site"]);
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;

const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  for (const [key, entry] of hits) {
    if (now - entry.start > WINDOW_MS) hits.delete(key);
  }
  const entry = hits.get(ip);
  if (!entry || now - entry.start > WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

export function allow(req, res) {
  // The proxied responses are cached at the edge, so the cache key has to
  // include the header the check reads. Without this a single allowed request
  // warms the cache and the CDN then serves that response to everyone.
  res.setHeader("Vary", "Sec-Fetch-Site");

  if (!SAME_SITE.has(req.headers["sec-fetch-site"])) {
    res.setHeader("Cache-Control", "no-store");
    res.status(403).json({ error: "This endpoint only serves the Scanario front end." });
    return false;
  }

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Retry-After", "60");
    res.status(429).json({ error: "Too many lookups. Try again in a minute." });
    return false;
  }

  return true;
}
