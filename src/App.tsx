import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { fetchAllSites, geocode, looksLikePostal, RANGES } from "./api";
import ParticleScroll from "./components/canvasui/ParticleScroll";
import { Appear, Disclosure, FadeSwap, Segmented, SpinningNumber } from "./components/Motion";
import {
  awayLine,
  balanceScore,
  daysWord,
  driveMinutes,
  driveShort,
  kmLabel,
  mapsUrl,
  MINUTES_PER_DAY,
  P4_TARGET_DAYS,
  p,
  periodLabel,
  validMean,
  waitDays,
} from "./format";
import type { Age, GeoResult, Modality, RangeId, Site, SortKey } from "./types";

const MODALITIES: { id: Modality; label: string }[] = [
  { id: "MRI", label: "MRI" },
  { id: "CT", label: "CT scan" },
];

const AGES: { id: Age; label: string }[] = [
  { id: "Adult", label: "Adult" },
  { id: "Paediatric", label: "Child" },
];

const DRIVE: { id: RangeId; label: string }[] = [
  { id: "30m", label: "30 min" },
  { id: "1h", label: "1 hour" },
  { id: "2h", label: "2 hours" },
  { id: "anywhere", label: "Anywhere" },
];

const SORTS: { id: SortKey; label: string }[] = [
  { id: "best", label: "Recommended" },
  { id: "wait", label: "Shortest wait" },
  { id: "distance", label: "Nearest" },
];

const EXAMPLES = [
  { label: "Kitchener", value: "N2G 1G3" },
  { label: "Toronto", value: "M5G 2C4" },
  { label: "Ottawa", value: "K1H 8L6" },
];

const SOURCE_URL = "https://www.ontariohealth.ca/system/reporting/wait-times";
const DEFINITIONS_URL =
  "https://www.ontariohealth.ca/system/reporting/wait-times/understanding-wait-times";

function byWait(a: Site, b: Site) {
  const aw = waitDays(a);
  const bw = waitDays(b);
  if (aw == null && bw == null) return a.km - b.km;
  if (aw == null) return 1;
  if (bw == null) return -1;
  return aw !== bw ? aw - bw : a.km - b.km;
}

function byBalance(a: Site, b: Site) {
  const as = balanceScore(a);
  const bs = balanceScore(b);
  if (as == null && bs == null) return a.km - b.km;
  if (as == null) return 1;
  if (bs == null) return -1;
  return as - bs;
}

/** One plain sentence saying why this hospital is the pick. */
function recommendReason(pick: Site, inRange: Site[]): string {
  const scored = inRange.filter((s) => waitDays(s) != null);
  const fastest = [...scored].sort(byWait)[0];
  const nearest = [...scored].sort((a, b) => a.km - b.km)[0];
  const isFastest = fastest && waitDays(fastest) === waitDays(pick);
  const isNearest = nearest && nearest.id === pick.id;

  if (isFastest && isNearest) return "It’s the closest to you and the fastest. Easy call.";
  if (isFastest) return "Nothing in this range will get you in sooner.";
  if (isNearest) return "It’s the closest to you, and nothing nearby is much faster.";

  const saved = (waitDays(nearest) ?? 0) - (waitDays(pick) ?? 0);
  const extra = driveMinutes(pick.km) - driveMinutes(nearest.km);
  if (saved > 0 && extra > 0) {
    return `About ${saved} ${daysWord(saved)} sooner than ${nearest.city || nearest.name}, for roughly ${extra} more minutes in the car.`;
  }
  return "The best trade between the drive and the wait.";
}

export default function App() {
  const [query, setQuery] = useState("");
  const [geo, setGeo] = useState<GeoResult | null>(null);
  const [geoState, setGeoState] = useState<"idle" | "ok" | "bad">("idle");
  const [geoMsg, setGeoMsg] = useState("");
  const [shaking, setShaking] = useState(false);

  const [modality, setModality] = useState<Modality>("MRI");
  const [age, setAge] = useState<Age>("Adult");
  const [range, setRange] = useState<RangeId>("2h");
  const [sort, setSort] = useState<SortKey>("best");

  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState("");
  const req = useRef(0);
  const lastResolved = useRef("");

  const rangeKm = RANGES.find((r) => r.id === range)?.km ?? 160;

  async function resolveLocation(raw: string) {
    const value = raw.trim();
    if (!value) return;
    setGeoMsg("");
    setGeoState("idle");
    try {
      const found = await geocode(value);
      setGeo(found);
      setGeoState("ok");
      lastResolved.current = found.label;
      setQuery(found.label);
    } catch (err) {
      setGeo(null);
      setGeoState("bad");
      setGeoMsg(err instanceof Error ? err.message : "We couldn’t find that place.");
      setShaking(true);
      window.setTimeout(() => setShaking(false), 520);
    }
  }

  useEffect(() => {
    if (!geo) {
      setSites([]);
      setLoading(false);
      setPaging(false);
      return;
    }
    const id = ++req.current;
    setLoading(true);
    setPaging(true);
    setError("");
    setSites([]);
    fetchAllSites(age, geo.lat, geo.lng, modality, (next, done) => {
      if (req.current !== id) return;
      setSites(next);
      setLoading(false);
      setPaging(!done);
    }).catch((err) => {
      if (req.current !== id) return;
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
      setPaging(false);
    });
  }, [geo, age, modality]);

  useEffect(() => {
    if (!looksLikePostal(query)) return;
    if (query.trim() === lastResolved.current) return;
    const handle = window.setTimeout(() => {
      void resolveLocation(query);
    }, 450);
    return () => window.clearTimeout(handle);
  }, [query]);

  const province = useMemo(() => sites.find((s) => s.isProvince) ?? null, [sites]);
  const period = periodLabel(sites);

  const inRange = useMemo(
    () => sites.filter((s) => !s.isProvince && (rangeKm === Infinity || s.km <= rangeKm)),
    [sites, rangeKm],
  );

  const sorted = useMemo(() => {
    const copy = [...inRange];
    if (sort === "distance") copy.sort((a, b) => a.km - b.km);
    else if (sort === "wait") copy.sort(byWait);
    else copy.sort(byBalance);
    return copy;
  }, [inRange, sort]);

  const pick = useMemo(() => [...inRange].sort(byBalance).find((s) => waitDays(s) != null) ?? null, [inRange]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void resolveLocation(query);
  }

  const geoBad = geoState === "bad";

  return (
    <ParticleScroll className="stage" point={0.72} band={320} density={2.4} spread={140} swirl={40}>
      <div className="app">
        <div className="shell">
          <header className="topbar">
            <span className="brand">Scanario</span>
            <span className="topbar-note">Ontario MRI &amp; CT wait times</span>
          </header>

          <section className="intro">
            <Appear>
              <h1 className="headline">Find a shorter wait.</h1>
            </Appear>
            <Appear delay={0.05}>
              <p className="lede">
                Waiting for an MRI or CT scan in Ontario? The wait is not the same
                everywhere. Two hospitals an hour apart can be months apart. Tell us
                where you are, and we’ll show you the shorter ones.
              </p>
            </Appear>
            <Appear delay={0.1}>
              <p className="lede-note">
                Ontario Health’s own numbers, for {period ? period.trim() : "the latest month"},
                sorted around your question instead of the province’s.{" "}
                <a href="#sources">What that means, and where the data comes from.</a>
              </p>
            </Appear>
          </section>

          <Appear delay={0.14}>
            <figure className="art">
              <img src="/hero.webp" alt="" width={1280} height={853} loading="eager" />
            </figure>
          </Appear>

          <section className="panel">
            <label className="field-label" htmlFor="postal">
              Where are you?
            </label>
            <form className="search" onSubmit={onSubmit}>
              <motion.div
                className="loc-wrap"
                animate={shaking ? { x: [0, -8, 7, -5, 3, 0] } : { x: 0 }}
                transition={{ duration: 0.45, ease: [0.36, 0.07, 0.19, 0.97] }}
              >
                <input
                  id="postal"
                  className={`loc-input${geoState === "ok" ? " ok" : ""}${geoBad ? " bad" : ""}`}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (geoState !== "idle") setGeoState("idle");
                    if (geoMsg) setGeoMsg("");
                  }}
                  onBlur={() => {
                    if (looksLikePostal(query) && !geo) void resolveLocation(query);
                  }}
                  placeholder="N2G 1G3"
                  autoComplete="postal-code"
                  spellCheck={false}
                  aria-invalid={geoBad}
                  aria-describedby={geoMsg ? "geo-error" : undefined}
                />
                {geoState === "ok" && (
                  <span className="ok-check" aria-hidden="true">
                    <svg viewBox="0 0 20 20" width="20" height="20">
                      <path
                        d="M4.5 10.5L8.5 14.5L15.5 6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                )}
              </motion.div>
              <button className="go" type="submit" disabled={!query.trim()}>
                Search
              </button>
            </form>

            {geoMsg && (
              <p className="geo-msg" id="geo-error" role="alert">
                {geoMsg}
              </p>
            )}

            <div className="examples">
              <span className="examples-label">Try</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.value}
                  type="button"
                  className="example"
                  onClick={() => {
                    setQuery(ex.value);
                    void resolveLocation(ex.value);
                  }}
                >
                  {ex.label}
                </button>
              ))}
            </div>

            <div className="controls">
              <div className="control">
                <div className="field-label" id="need-label">
                  Which scan do you need?
                </div>
                <Segmented labelledBy="need-label" value={modality} onChange={setModality} options={MODALITIES} />
              </div>
              <div className="control">
                <div className="field-label" id="who-label">
                  Who is it for?
                </div>
                <Segmented labelledBy="who-label" value={age} onChange={setAge} options={AGES} />
              </div>
            </div>

            <div className="control control-wide">
              <div className="field-label" id="drive-label">
                How far are you willing to drive?
              </div>
              <Segmented
                labelledBy="drive-label"
                value={range}
                onChange={setRange}
                options={DRIVE}
                size="sm"
              />
            </div>
          </section>

          <div className="results" aria-live="polite">
            <FadeSwap
              id={
                loading
                  ? "load"
                  : error
                    ? "err"
                    : !geo
                      ? "empty"
                      : pick
                        ? `results-${modality}-${age}-${range}`
                        : `none-${modality}-${age}-${range}`
              }
            >
              {loading ? (
                <div>
                  <p className="visually-hidden">Looking up wait times.</p>
                  <div className="skel skel-hero" />
                  <div className="list" style={{ marginTop: 12 }}>
                    <div className="skel skel-row" />
                    <div className="skel skel-row" />
                    <div className="skel skel-row" />
                  </div>
                </div>
              ) : error ? (
                <p className="quiet" role="alert">
                  Ontario Health’s server didn’t answer. Give it a moment and try again.
                </p>
              ) : !geo ? null : !pick ? (
                <p className="quiet">
                  {paging
                    ? "Looking…"
                    : "No hospital that close reported a wait this month. Try widening the drive."}
                </p>
              ) : (
                <Results
                  pick={pick}
                  inRange={inRange}
                  rows={sorted}
                  sort={sort}
                  setSort={setSort}
                  modality={modality}
                  province={province}
                  period={period}
                />
              )}
            </FadeSwap>
          </div>

          <section className="sources" id="sources">
            <h2>Where this data comes from</h2>
            <p className="sources-lede">
              All of it comes from Ontario Health, the provincial agency that collects wait
              times. Hospitals report their own numbers every month. This page reads them
              live and changes nothing.
            </p>

            <div className="note">
              <h3>Why this site exists</h3>
              <p>
                Ontario Health does publish this data, but its site is built for performance
                reporting. You get long tables sorted by region and by measure. They answer
                “how is the system doing?” They do not answer the question a patient
                actually has:
                <em> where can I get this scan sooner, and how far is it?</em>
              </p>
              <p>
                This page is the same numbers, one question, sorted the way you’d want
                them. It’s free, there’s nothing to sign up for, and nothing is stored.
              </p>
            </div>

            <figure className="art art-inline">
              <img
                src="/bars.webp"
                alt="Nine bars of different heights. Most are tall and grey; one short bar is picked out in blue."
                width={1200}
                height={484}
                loading="lazy"
              />
              <figcaption>
                Same scan, same month, different hospitals. That short blue bar is what this
                site is looking for.
              </figcaption>
            </figure>

            <h3 className="defs-title">What the numbers mean</h3>
            <dl className="defs">
              <div>
                <dt>The wait</dt>
                <dd>
                  How many days people waited, on average, for a non-urgent scan at that
                  hospital{period ? ` in ${period.trim()}` : ""}. “Non-urgent” is Ontario’s
                  Priority 4, the routine scan your doctor orders. Urgent scans happen much
                  faster and aren’t shown here.
                </dd>
              </div>
              <div>
                <dt>The target</dt>
                <dd>
                  Ontario aims to do a non-urgent scan within {P4_TARGET_DAYS} days. Each
                  hospital also reports how many of its patients actually made that window.
                </dd>
              </div>
              <div>
                <dt>9 out of 10</dt>
                <dd>
                  Averages hide the bad weeks. This one says: nine of every ten people were
                  done within this many days. It tells you how long the long end really is.
                </dd>
              </div>
              <div>
                <dt>The drive</dt>
                <dd>
                  Distance is measured in a straight line from your postal code, then turned
                  into a rough drive time. Use it to compare, not to plan a route.
                </dd>
              </div>
              <div>
                <dt>“Recommended”</dt>
                <dd>
                  Not the shortest wait. It’s the best trade. Every {MINUTES_PER_DAY} minutes of
                  extra driving counts as one more day of waiting, so somewhere half an hour
                  further has to save you about 15 days to be worth the trip. Want the plain
                  order instead? Switch to <strong>Shortest wait</strong> or{" "}
                  <strong>Nearest</strong>.
                </dd>
              </div>
            </dl>
            <ul className="links">
              <li>
                <a href={SOURCE_URL} target="_blank" rel="noreferrer">
                  Ontario Health: wait times reporting
                </a>
              </li>
              <li>
                <a href={DEFINITIONS_URL} target="_blank" rel="noreferrer">
                  Ontario Health: how wait times are measured
                </a>
              </li>
            </ul>
          </section>

          <footer className="footer">
            <p className="footer-note">
              This isn’t medical advice, and it doesn’t book anything. Your doctor decides how
              urgent your scan is and where the requisition goes. You can still ask to be sent
              somewhere with a shorter wait. That’s the whole point of this page. Bring it
              with you.
            </p>
            <p className="footer-by">
              A project by{" "}
              <a href="https://www.ramihmd.com" target="_blank" rel="noreferrer">
                Rami Alhamad
              </a>
              .
            </p>
          </footer>
        </div>
      </div>
    </ParticleScroll>
  );
}

function Results({
  pick,
  inRange,
  rows,
  sort,
  setSort,
  modality,
  province,
  period,
}: {
  pick: Site;
  inRange: Site[];
  rows: Site[];
  sort: SortKey;
  setSort: (s: SortKey) => void;
  modality: Modality;
  province: Site | null;
  period: string;
}) {
  const days = waitDays(pick);
  const wait = p(pick, 4);
  const ontario = province ? validMean(province, 4) : null;
  const others = rows.filter((s) => s.id !== pick.id);
  const scanWord = modality === "MRI" ? "MRI" : "CT scan";

  return (
    <div>
      <Appear>
        <article className="hero">
          <p className="hero-tag">Our pick near you</p>

          {days != null && (
            <>
              <p className="hero-num">
                <SpinningNumber value={days} className="num" />
                <span className="num-unit">{daysWord(days)}</span>
                <span className="visually-hidden">
                  {days} {daysWord(days)} average wait
                </span>
              </p>
              <p className="num-caption">average wait for a non-urgent {scanWord}</p>
            </>
          )}

          <h2 className="place">{pick.name}</h2>
          <p className="place-meta">
            {[awayLine(pick.km), kmLabel(pick.km), [pick.address, pick.city].filter(Boolean).join(", ")]
              .filter(Boolean)
              .join(" · ")}
          </p>

          <p className="why">{recommendReason(pick, inRange)}</p>

          <p className="facts">
            {[
              wait?.p90 != null ? `9 in 10 waited under ${Math.round(wait.p90)} days` : null,
              wait?.pctTarget != null
                ? `${Math.round(wait.pctTarget)}% met the ${P4_TARGET_DAYS}-day target`
                : null,
              ontario != null ? `Ontario average ${Math.round(ontario)} days` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          <a className="maps" href={mapsUrl(pick)} target="_blank" rel="noreferrer">
            Phone number and directions
            <span aria-hidden="true"> ↗</span>
          </a>
        </article>
      </Appear>

      {others.length > 0 && (
        <>
          <div className="list-head">
            <h2 id="sort-label">Everywhere else in range</h2>
            <Segmented labelledBy="sort-label" value={sort} onChange={setSort} options={SORTS} size="sm" />
          </div>

          <p className="list-note">
            Average wait for a non-urgent {scanWord}
            {period ? `, ${period.trim()}` : ""}. Tap any one for the detail.
          </p>

          <ul className="list">
            {others.map((site, i) => {
              const n = waitDays(site);
              const w = p(site, 4);
              return (
                <Appear key={site.id} delay={Math.min(i, 8) * 0.03} as="li">
                  <Disclosure
                    className={n == null ? "row dim" : "row"}
                    label={`Details for ${site.name}`}
                    summary={
                      <span className="row-main">
                        <span className="row-text">
                          <span className="row-name">{site.name}</span>
                          <span className="row-meta">
                            {[site.city, driveShort(site.km)].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="row-wait">
                          {n != null ? (
                            <>
                              {n}
                              <small>{daysWord(n)}</small>
                            </>
                          ) : (
                            <small className="row-nodata">not reported</small>
                          )}
                        </span>
                      </span>
                    }
                  >
                    {site.address && <p className="detail-addr">{site.address}</p>}
                    <ul className="detail-facts">
                      <li>{kmLabel(site.km)} away · about {driveShort(site.km)} by car</li>
                      {w?.p90 != null && <li>9 in 10 waited under {Math.round(w.p90)} days</li>}
                      {w?.pctTarget != null && (
                        <li>
                          {Math.round(w.pctTarget)}% seen within the {P4_TARGET_DAYS}-day target
                        </li>
                      )}
                      {w?.cases != null && <li>{w.cases.toLocaleString()} scans in the period</li>}
                      {n == null && <li>This hospital did not report a usable number.</li>}
                    </ul>
                    <a className="maps maps-sm" href={mapsUrl(site)} target="_blank" rel="noreferrer">
                      Phone number and directions
                      <span aria-hidden="true"> ↗</span>
                    </a>
                  </Disclosure>
                </Appear>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
