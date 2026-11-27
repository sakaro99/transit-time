# transit-time

Real-time Hong Kong transit arrival times. KMB (九巴) and Citybus (城巴), with more modes coming (MTR, minibus, light rail, ferry, ...).

Bilingual (繁體中文 / English), saved favourites, auto-refresh ETAs.

- Repo: https://github.com/sakaro99/transit-time

## Current features (KMB + Citybus + Green minibus)

- Search a KMB, Citybus or green minibus route (e.g. `1`, `1A`, `5B`, `44A`); switch with the 九巴 / 城巴 / 綠van toggle
- Toggle inbound / outbound
- Auto-refresh ETAs every 15s / 30s / 60s
- ⭐ star stops into a Favourites tab (persisted in `localStorage`; favourites remember their company)

## Roadmap

- [ ] MTR next-train arrivals
- [ ] Minibus (專線小巴) ETA
- [ ] Light rail (輕鐵) ETA
- [ ] Ferry (渡輪) ETA
- [ ] Unified favourites across modes
- [ ] Route-planning between stops

## Data sources

- KMB / LWB ETA: https://data.etabus.gov.hk/v1/transport/kmb — attribution: data.gov.hk
- Citybus ETA: https://rt.data.gov.hk/v2/transport/citybus — attribution: data.gov.hk
- Green minibus (GMB) ETA: https://data.etagmb.gov.hk — attribution: data.gov.hk

Citybus has no per-route ETA feed, so its ETAs are fetched per stop (`/eta/CTB/{stopId}/{route}`) and merged.
Green minibus is similar but keyed by operator route id: `/route/{region}/{code}` → `route_id`, then
`/route-stop/{route_id}/{direction}` for stops and `/eta/route-stop/{route_id}/{direction}/{stop_seq}` per stop.
Coverage is the routes enrolled in the TD scheme — not every green minibus, and no red minibuses.

## Layout

- `bus.tsx` — the whole page component (single file, default export)
- Vite + React + Tailwind scaffold around it, so the repo runs standalone now that zo.space is gone

## Local dev

```bash
npm install
npm run dev     # http://127.0.0.1:5173
npm run build   # static output in dist/
```

Both APIs send `Access-Control-Allow-Origin: *`, so the browser can call them directly — no proxy needed.

## To keep iterating

Edit `bus.tsx`; the dev server hot-reloads.

## Changelog

- 2026-11-27 — Citybus (CTB) support. Company toggle, Citybus routes/stops/ETAs from `rt.data.gov.hk`, per-stop ETA merge, favourites remember their company. Also fixed a crash: `headerOutOfView` state was referenced but never declared, so the page failed to mount. Added a Vite/Tailwind scaffold for local testing.
- 2026-06-06 — Repo created, renamed to `transit-time` to reflect the broader scope beyond KMB.
- 2026-06-03 — Fix favourites: the Favourites tab previously rendered blank (the `view === "grid"` JSX block was missing) and the toast confirmation never showed. Now both render correctly; the grid shows each saved stop with its live ETAs, a refresh button, and per-card remove / jump-to-search actions.
