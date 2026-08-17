# Scanario

Find the closest MRI or CT scan in Ontario with the shortest wait.

Enter a postal code, pick MRI or CT and adult or child, say how far you'll drive, and see
which hospitals near you are faster. Every number comes live from Ontario Health.

Ontario Health publishes this data, but its site is built for performance reporting: long
tables by region and measure. This one answers a patient's question instead: where can I get
this scan sooner, and how far is it?

## Ranking

"Recommended" is not the shortest wait. It trades driving against waiting: every
`MINUTES_PER_DAY` (2) minutes of extra drive counts as one more day of wait, so somewhere
half an hour further has to save about 15 days to win. `Shortest wait` and `Nearest` give
the plain orders.

The wait shown is the mean days for Priority 4 (non-urgent) scans.

## Run

```
npm install
npm run dev      # proxies /oh to or.hqontario.ca and /nominatim to OSM
npm run build
```

## Notes

- Distances are straight-line from the postal code, converted to a drive time at 80 km/h.
- Ontario Health returns no phone numbers, so each hospital links out to Google Maps.
- `src/components/canvasui/ParticleScroll.tsx` is vendored from canvasui.dev. It needs the
  experimental HTML-in-Canvas API and falls back to plain scrolling everywhere else.

Data from Ontario Health. Not medical advice.
https://www.ontariohealth.ca/system/reporting/wait-times

A project by Rami Alhamad. https://www.ramihmd.com
