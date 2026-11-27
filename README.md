# transit-time

Real-time Hong Kong transit arrival times. KMB (九巴) and Citybus (城巴), with more modes coming (MTR, minibus, light rail, ferry, ...).

Bilingual (繁體中文 / English), saved favourites, auto-refresh ETAs.

- Repo: https://github.com/sakaro99/transit-time

## Current features (KMB + Citybus)

- Search a KMB or Citybus route (e.g. `1`, `1A`, `5B`); switch company with the KMB / 城巴 toggle
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

Citybus has no per-route ETA feed, so its ETAs are fetched per stop (`/eta/CTB/{stopId}/{route}`) and merged.

## Layout

- `bus.tsx` — full page source for the KMB module, identical to the live `/bus` route on zo.space
- This is a zo.space page (Bun + React + Hono). It runs on the Space tab, not as a standalone Zo Site.

## To keep iterating

Tell me what you want to change. I'll edit the live `/bus` route via `edit_space_route` and update the matching file here to keep the repo in sync.

## Changelog

- 2026-06-06 — Repo created, renamed to `transit-time` to reflect the broader scope beyond KMB.
- 2026-06-03 — Fix favourites: the Favourites tab previously rendered blank (the `view === "grid"` JSX block was missing) and the toast confirmation never showed. Now both render correctly; the grid shows each saved stop with its live ETAs, a refresh button, and per-card remove / jump-to-search actions.
