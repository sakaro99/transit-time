# bus

KMB (九巴) real-time bus arrival app — bilingual (繁體 / EN), saved favourites, auto-refresh.

## Snapshot
- Captured: 2026-06-03 13:05 HKT
- Live version: https://sakaro.zo.space/bus
- Source: current `/bus` route on zo.space (version 1)

## Layout
- `bus.tsx` — full page source, identical to the live `/bus` route
- This is a zo.space page (Bun + React + Hono). It runs on the Space tab, not as a standalone Zo Site.

## What it does
- Search any KMB route (e.g. `1`, `1A`, `74B`)
- Toggle inbound / outbound
- Auto-refresh ETAs every 15s / 30s / 60s
- ⭐ star stops into a Favourites tab (persisted in `localStorage`)

## Data source
- KMB/LWB ETA from https://data.etabus.gov.hk/v1/transport/kmb
- Attribution: data.gov.hk

## To keep iterating
Just tell me what you want to change. I'll edit the `/bus` route via `edit_space_route` (the live page) and update `bus.tsx` here to match.

## Changelog
- 2026-06-03 — Fix favourites: the Favourites tab previously rendered blank (the `view === "grid"` JSX block was missing) and the toast confirmation never showed. Now both render correctly; the grid shows each saved stop with its live ETAs, a refresh button, and per-card remove / jump-to-search actions.
