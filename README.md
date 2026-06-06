# transit-time

Real-time Hong Kong transit arrival times. Starting with KMB (九巴) buses, with more modes coming (MTR, minibus, light rail, ferry, ...).

Bilingual (繁體中文 / English), saved favourites, auto-refresh ETAs.

- Live: https://sakaro.zo.space/bus (the KMB bus view; more transit modes coming)
- Repo: https://github.com/sakaro99/transit-time

## Current features (KMB)

- Search any KMB route (e.g. `1`, `1A`, `74B`)
- Toggle inbound / outbound
- Auto-refresh ETAs every 15s / 30s / 60s
- ⭐ star stops into a Favourites tab (persisted in `localStorage`)

## Roadmap

- [ ] MTR next-train arrivals
- [ ] Minibus (專線小巴) ETA
- [ ] Light rail (輕鐵) ETA
- [ ] Ferry (渡輪) ETA
- [ ] Unified favourites across modes
- [ ] Route-planning between stops

## Data sources

- KMB / LWB ETA: https://data.etabus.gov.hk/v1/transport/kmb — attribution: data.gov.hk
- More to come as modes are added.

## Layout

- `bus.tsx` — full page source for the KMB module, identical to the live `/bus` route on zo.space
- This is a zo.space page (Bun + React + Hono). It runs on the Space tab, not as a standalone Zo Site.

## To keep iterating

Tell me what you want to change. I'll edit the live `/bus` route via `edit_space_route` and update the matching file here to keep the repo in sync.

## Changelog

- 2026-06-06 — Repo created, renamed to `transit-time` to reflect the broader scope beyond KMB.
- 2026-06-03 — Fix favourites: the Favourites tab previously rendered blank (the `view === "grid"` JSX block was missing) and the toast confirmation never showed. Now both render correctly; the grid shows each saved stop with its live ETAs, a refresh button, and per-card remove / jump-to-search actions.
