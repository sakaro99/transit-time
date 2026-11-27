import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Bus, Cloud, Clock, Globe, Grid3x3, Plus, RefreshCw, Search, Star, Sun, X } from "lucide-react";

const KMB_BASE = "https://data.etabus.gov.hk/v1/transport/kmb";
const CTB_BASE = "https://rt.data.gov.hk/v2/transport/citybus";
const GMB_BASE = "https://data.etagmb.gov.hk";
const HKO_BASE = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php";
const LANG_KEY = "kmb_lang";
const RATE_KEY = "kmb_refresh_rate";
const ROUTE_KEY = "kmb_last_route";
const CO_KEY = "transit_co";
type Company = "KMB" | "CTB" | "GMB";
const GMB_REGIONS = ["HKI", "KLN", "NT"] as const;
const HKO_REFRESH_MS = 10 * 60 * 1000;

// Minimal HKO icon → lucide icon + label mapping.
// Source: https://www.hko.gov.hk/textonly/v2/explain/wxicon_e.htm (subset only)
const HKO_ICON_MAP: Record<number, { Icon: typeof Sun; label: { tc: string; en: string }; tone: string }> = {
  50: { Icon: Sun,   label: { tc: "陽光充沛",     en: "Sunny" },              tone: "text-amber-500" },
  51: { Icon: Sun,   label: { tc: "間有陽光",     en: "Sunny periods" },     tone: "text-amber-500" },
  52: { Icon: Sun,   label: { tc: "間有陽光",     en: "Sunny intervals" },   tone: "text-amber-500" },
  53: { Icon: Cloud, label: { tc: "多雲",         en: "Cloudy" },            tone: "text-zinc-500" },
  54: { Icon: Cloud, label: { tc: "天色較暗",     en: "Overcast" },          tone: "text-zinc-500" },
  60: { Icon: Cloud, label: { tc: "多雲",         en: "Cloudy" },            tone: "text-zinc-500" },
  61: { Icon: Cloud, label: { tc: "密雲",         en: "Overcast" },          tone: "text-zinc-500" },
  62: { Icon: Cloud, label: { tc: "微雨",         en: "Light rain" },        tone: "text-sky-500" },
  63: { Icon: Cloud, label: { tc: "雨",           en: "Rain" },              tone: "text-sky-600" },
  64: { Icon: Cloud, label: { tc: "大雨",         en: "Heavy rain" },        tone: "text-sky-700" },
  65: { Icon: Cloud, label: { tc: "雷暴",         en: "Thunderstorms" },     tone: "text-indigo-600" },
  70: { Icon: Cloud, label: { tc: "微雨",         en: "Light rain" },        tone: "text-sky-500" },
  71: { Icon: Cloud, label: { tc: "雨",           en: "Rain" },              tone: "text-sky-600" },
  72: { Icon: Cloud, label: { tc: "大雨",         en: "Heavy rain" },        tone: "text-sky-700" },
  73: { Icon: Cloud, label: { tc: "雷暴",         en: "Thunderstorms" },     tone: "text-indigo-600" },
  75: { Icon: Cloud, label: { tc: "驟雨",         en: "Showers" },           tone: "text-sky-600" },
  76: { Icon: Cloud, label: { tc: "雷暴驟雨",     en: "Squally thunderstorms" }, tone: "text-indigo-600" },
  77: { Icon: Cloud, label: { tc: "驟雨",         en: "Showers" },           tone: "text-sky-600" },
};

type WeatherSnapshot = {
  tempC: number | null;
  iconCode: number | null;
  updateTime: string | null;
};

function pickIconCode(icons: unknown): number | null {
  if (Array.isArray(icons) && icons.length > 0 && typeof icons[0] === "number") return icons[0];
  if (typeof icons === "number") return icons;
  return null;
}

function findHkoStation(list: { place?: string; value?: number | string }[] | undefined): number | null {
  if (!list) return null;
  const m = list.find((s) => s.place === "Hong Kong Observatory" && typeof s.value === "number");
  return m ? (m.value as number) : null;
}

function findStationByName(list: { place?: string; value?: number | string }[] | undefined, name: string): number | null {
  if (!list) return null;
  const m = list.find((s) => s.place === name && typeof s.value === "number");
  return m ? (m.value as number) : null;
}

function pickHkoTemp(temperatureData: { place: string; value: number; unit: string }[] | undefined): number | null {
  if (!temperatureData || temperatureData.length === 0) return null;
  const hko = temperatureData.find((s) => s.place === "Hong Kong Observatory");
  return hko ? hko.value : temperatureData[0].value;
}

async function fetchWeather(lang: Lang): Promise<WeatherSnapshot> {
  const rhr = await fetch(`${HKO_BASE}?dataType=rhrread&lang=${lang}`).then((r) => r.json()).catch(() => null);
  return {
    tempC: pickHkoTemp(rhr?.temperature?.data),
    iconCode: pickIconCode(rhr?.icon),
    updateTime: rhr?.updateTime ?? null,
  };
}

type Lang = "tc" | "en";
type Rate = 15 | 30 | 60;
type Bound = "O" | "I";

type RouteVariant = {
  route: string;
  bound: Bound;
  service_type: string;
  orig_tc: string;
  orig_en: string;
  dest_tc: string;
  dest_en: string;
};

type RouteStop = {
  route: string;
  bound: Bound;
  service_type: string;
  seq: string;
  stop: string;
};

type StopInfo = {
  stop: string;
  name_tc: string;
  name_en: string;
};

type EtaEntry = {
  route: string;
  dir: Bound;
  service_type: number;
  seq: number;
  stop: string;
  dest_tc: string;
  dest_en: string;
  eta_seq: number;
  eta: string | null;
  rmk_tc: string;
  rmk_en: string;
  data_timestamp: string;
};

const t = {
  tc: {
    title: "到站時間",
    subtitle: "輸入路線查詢即時到站時間",
    routePlaceholder: "輸入路線號碼 (例: 1, 1A, 5B)",
    kmb: "九巴",
    ctb: "城巴",
    gmb: "綠van",
    search: "搜尋",
    refresh: "立即更新",
    seconds: "秒",
    inbound: "入站",
    outbound: "出站",
    noService: "暫時沒有提供服務",
    noRoute: "找不到此路線",
    minutes: "分鐘",
    arriving: "即將到達",
    updated: "更新於",
    stops: "站",
    stopNameFallback: "未命名車站",
    language: "語言",
    noUpcoming: "暫無班次",
    origin: "起點",
    destination: "終點",
    lastUpdate: "最後更新",
    minuteShort: "分",
    viewSearch: "搜尋",
    viewGrid: "我的最愛",
    addFav: "加入最愛",
    alreadyFav: "已在最愛中",
    removeFav: "移除",
    noFavs: "尚未加入任何最愛。在「搜尋」分頁選擇一個站，按旁邊的 ⭐ 加入。",
    gridSubtitle: "你加入的巴士站，自動更新到站時間",
    addedToFav: "已加入最愛",
    prevStop: "上一站",
    weatherErr: "暫時無法取得天氣資料",
  },
  en: {
    title: "Transit Arrival",
    subtitle: "Enter a route to check real-time arrival times",
    routePlaceholder: "Enter route number (e.g. 1, 1A, 5B)",
    kmb: "KMB",
    ctb: "Citybus",
    gmb: "Van",
    search: "Search",
    refresh: "Refresh",
    seconds: "s",
    inbound: "Inbound",
    outbound: "Outbound",
    noService: "No service at the moment",
    noRoute: "Route not found",
    minutes: "min",
    arriving: "Arriving",
    updated: "Updated",
    stops: "stops",
    stopNameFallback: "Unnamed stop",
    language: "Language",
    noUpcoming: "No upcoming trips",
    origin: "From",
    destination: "To",
    lastUpdate: "Last update",
    minuteShort: "m",
    viewSearch: "Search",
    viewGrid: "Favourites",
    addFav: "Add to favourites",
    alreadyFav: "Already in favourites",
    removeFav: "Remove",
    noFavs: "No favourites yet. Open the Search tab, pick a stop, and tap the star next to it.",
    gridSubtitle: "Your saved bus stops with auto-updating ETAs",
    addedToFav: "Added to favourites",
    prevStop: "Prev stop",
    weatherErr: "Weather data unavailable",
  },
};

interface Favourite {
  id: string;
  co?: Company;
  route: string;
  bound: Bound;
  stopId: string;
  /** Green minibus only: the operator route id and the stop_seq used by its ETA endpoint. */
  gmbRouteId?: number;
  seq?: number;
  stopNameTc?: string;
  stopNameEn?: string;
}

const FAVS_KEY = "kmb_favs";
const VIEW_KEY = "kmb_view";

function loadFavs(): Favourite[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(FAVS_KEY) || "[]"); } catch { return []; }
}

function formatEtaMinutes(etaIso: string | null, nowMs: number): number {
  if (!etaIso) return -1;
  const etaMs = new Date(etaIso).getTime();
  if (Number.isNaN(etaMs)) return -1;
  return Math.max(0, Math.round((etaMs - nowMs) / 60000));
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Hong_Kong",
  });
}

// Renders the simplified weather row: icon + temperature + sky-condition
// label only. Replaces the previous full H/L + rain pill.
// Layout: [icon] [temp °C] [condition label]
// On small screens: wrapped in a single inline span.
function WeatherStrip(props: {
  lang: Lang;
  dict: typeof t["tc"] | typeof t["en"];
  weather: WeatherSnapshot | null;
  weatherErr: boolean;
}) {
  const { lang, dict, weather, weatherErr } = props;
  if (weatherErr && !weather) {
    return <p className="mt-1 text-sm text-zinc-400">{dict.weatherErr}</p>;
  }
  if (!weather) {
    return (
      <p className="mt-1 flex items-center gap-2 text-sm text-zinc-400">
        <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-zinc-300" />
        <span>{dict.weatherErr}</span>
      </p>
    );
  }
  const iconEntry = weather.iconCode != null ? HKO_ICON_MAP[weather.iconCode] : null;
  const FallbackIcon = iconEntry?.Icon ?? Cloud;
  const iconTone = iconEntry?.tone ?? "text-zinc-400";
  const iconLabel = iconEntry ? iconEntry.label[lang] : "";
  return (
    <div
      className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-600"
      aria-label={lang === "tc" ? "天氣資訊" : "Weather info"}
    >
      <span className="inline-flex items-center gap-1.5">
        <FallbackIcon className={`h-4 w-4 ${iconTone}`} aria-hidden="true" />
        {weather.tempC != null && (
          <span className="font-semibold text-zinc-900 tabular-nums">
            {Math.round(weather.tempC)}°C
          </span>
        )}
        {iconLabel && <span className="text-zinc-500">{iconLabel}</span>}
      </span>
    </div>
  );
}

export default function KmbBusPage() {
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window === "undefined") return "tc";
    const saved = window.localStorage.getItem(LANG_KEY);
    return saved === "en" || saved === "tc" ? (saved as Lang) : "tc";
  });
  const [rate, setRate] = useState<Rate>(() => {
    if (typeof window === "undefined") return 30;
    const saved = window.localStorage.getItem(RATE_KEY);
    const n = saved ? parseInt(saved, 10) : 30;
    return n === 15 || n === 30 || n === 60 ? (n as Rate) : 30;
  });
  const [routeInput, setRouteInput] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(ROUTE_KEY) || "";
  });
  const [searchedRoute, setSearchedRoute] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(ROUTE_KEY) || "";
  });
  const [company, setCompany] = useState<Company>(() => {
    if (typeof window === "undefined") return "KMB";
    const saved = window.localStorage.getItem(CO_KEY);
    return saved === "CTB" || saved === "GMB" || saved === "KMB" ? saved : "KMB";
  });
  const [gmbRouteId, setGmbRouteId] = useState<number | null>(null);

  const [variants, setVariants] = useState<RouteVariant[]>([]);
  const [activeBound, setActiveBound] = useState<Bound>("O");
  const [allStopsByBound, setAllStopsByBound] = useState<Record<Bound, RouteStop[]>>({ O: [], I: [] });
  const [stopNames, setStopNames] = useState<Record<string, StopInfo>>({});
  const [etas, setEtas] = useState<EtaEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [tickNow, setTickNow] = useState<number>(Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  type View = "search" | "grid";
  const [view, setView] = useState<View>(() => {
    if (typeof window === "undefined") return "search";
    const s = window.localStorage.getItem(VIEW_KEY);
    return s === "grid" ? "grid" : "search";
  });

  const [favs, setFavs] = useState<Favourite[]>(loadFavs);
  const [favEtas, setFavEtas] = useState<Record<string, EtaEntry[]>>({});
  const [favRouteMeta, setFavRouteMeta] = useState<Record<string, { orig: { tc: string; en: string }; dest: { tc: string; en: string } }>>({});
  const [favPrev, setFavPrev] = useState<Record<string, { stopId: string; nameTc: string; nameEn: string; eta: EtaEntry | null }>>({});
  const [favLast, setFavLast] = useState<number | null>(null);
  const [focusStopId, setFocusStopId] = useState<string | null>(null);
  const [headerOutOfView, setHeaderOutOfView] = useState(false);

  // Weather (HKO open data)
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [weatherErr, setWeatherErr] = useState<boolean>(false);

  const dict = t[lang];

  useEffect(() => { window.localStorage.setItem(LANG_KEY, lang); }, [lang]);
  useEffect(() => { window.localStorage.setItem(RATE_KEY, String(rate)); }, [rate]);
  useEffect(() => { window.localStorage.setItem(ROUTE_KEY, searchedRoute); }, [searchedRoute]);
  useEffect(() => { window.localStorage.setItem(CO_KEY, company); }, [company]);
  useEffect(() => { window.localStorage.setItem(VIEW_KEY, view); }, [view]);
  useEffect(() => { window.localStorage.setItem(FAVS_KEY, JSON.stringify(favs)); }, [favs]);
  useEffect(() => { if (toast) { const id = setTimeout(() => setToast(null), 1800); return () => clearTimeout(id); } }, [toast]);

  useEffect(() => {
    const id = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Weather (HKO): initial load + 10-min refresh, re-fetch on lang change
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const snap = await fetchWeather(lang);
        if (cancelled) return;
        setWeather(snap);
        setWeatherErr(snap.tempC === null && snap.iconCode === null);
      } catch {
        if (!cancelled) setWeatherErr(true);
      }
    }
    load();
    const id = setInterval(load, HKO_REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [lang]);

  const headerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const el = headerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setHeaderOutOfView(!entry.isIntersecting),
      { rootMargin: "-8px 0px 0px 0px", threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const activeBoundRef = useRef<Bound>(activeBound);
  activeBoundRef.current = activeBound;
  const stopNamesRef = useRef(stopNames);
  stopNamesRef.current = stopNames;

  const activeVariant = useMemo(
    () => variants.find((v) => v.bound === activeBound) ?? null,
    [variants, activeBound]
  );

  const routeStops = allStopsByBound[activeBound] || [];

  async function fetchCtbEtas(route: string, stopIds: string[]): Promise<EtaEntry[]> {
    const r = encodeURIComponent(route);
    const chunks = await Promise.all(
      stopIds.map(async (id) => {
        const json = await fetch(`${CTB_BASE}/eta/CTB/${encodeURIComponent(id)}/${r}`)
          .then((res) => res.json())
          .catch(() => null);
        const rows = json && Array.isArray(json.data) ? json.data : [];
        return rows.map((e: Record<string, unknown>) => ({
          route: String(e.route || route),
          dir: (e.dir === "I" ? "I" : "O") as Bound,
          service_type: 1,
          seq: Number(e.seq) || 0,
          stop: String(e.stop || id),
          dest_tc: String(e.dest_tc || ""),
          dest_en: String(e.dest_en || ""),
          eta_seq: Number(e.eta_seq) || 0,
          eta: (e.eta as string | null) ?? null,
          rmk_tc: String(e.rmk_tc || ""),
          rmk_en: String(e.rmk_en || ""),
          data_timestamp: String(e.data_timestamp || ""),
        })) as EtaEntry[];
      }),
    );
    return chunks.flat();
  }

  async function fetchAllForRoute(route: string, boundOverride?: Bound) {
    if (!route) return;
    setLoading(true);
    setError(null);
    try {
      const bound: Bound = boundOverride || activeBoundRef.current;
      const r = encodeURIComponent(route);

      if (company === "CTB") {
        const [routeMeta, outStops, inStops] = await Promise.all([
          fetch(`${CTB_BASE}/route/CTB/${r}`).then((res) => res.json()).catch(() => null),
          fetch(`${CTB_BASE}/route-stop/CTB/${r}/outbound`).then((res) => res.json()).catch(() => null),
          fetch(`${CTB_BASE}/route-stop/CTB/${r}/inbound`).then((res) => res.json()).catch(() => null),
        ]);
        const meta = routeMeta?.data;
        const outList = Array.isArray(outStops?.data) ? outStops.data : [];
        const inList = Array.isArray(inStops?.data) ? inStops.data : [];
        if (!meta || (outList.length === 0 && inList.length === 0)) {
          setVariants([]);
          setAllStopsByBound({ O: [], I: [] });
          setEtas([]);
          setError(dict.noRoute);
          return;
        }
        const variantList: RouteVariant[] = [];
        if (outList.length) {
          variantList.push({
            route: meta.route || route,
            bound: "O",
            service_type: "1",
            orig_tc: meta.orig_tc,
            orig_en: meta.orig_en,
            dest_tc: meta.dest_tc,
            dest_en: meta.dest_en,
          });
        }
        if (inList.length) {
          variantList.push({
            route: meta.route || route,
            bound: "I",
            service_type: "1",
            orig_tc: meta.dest_tc,
            orig_en: meta.dest_en,
            dest_tc: meta.orig_tc,
            dest_en: meta.orig_en,
          });
        }
        setVariants(variantList);
        const nextBound: Bound = variantList.find((v) => v.bound === bound) ? bound : variantList[0].bound;
        if (nextBound !== bound) setActiveBound(nextBound);

        const toStops = (rows: { route: string; dir: Bound; seq: number; stop: string }[], b: Bound): RouteStop[] =>
          rows.map((s) => ({
            route: s.route,
            bound: (s.dir || b) as Bound,
            service_type: "1",
            seq: String(s.seq),
            stop: s.stop,
          }));
        const stopsByBound: Record<Bound, RouteStop[]> = {
          O: toStops(outList, "O"),
          I: toStops(inList, "I"),
        };
        setAllStopsByBound(stopsByBound);

        const ids = Array.from(new Set((stopsByBound[nextBound] || []).map((s) => s.stop)));
        const allEta = await fetchCtbEtas(route, ids);
        setEtas(allEta.filter((e) => e.dir === nextBound));

        const missing = ids.filter((id) => !stopNamesRef.current[id]);
        if (missing.length) {
          const fetched = await Promise.all(
            missing.map(async (id) => {
              const json = await fetch(`${CTB_BASE}/stop/${encodeURIComponent(id)}`).then((res) => res.json());
              return json.data as StopInfo;
            }),
          );
          setStopNames((prev) => {
            const next = { ...prev };
            for (const s of fetched) if (s && s.stop) next[s.stop] = s;
            return next;
          });
        }
        setLastUpdated(Date.now());
        return;
      }

      if (company === "GMB") {
        // Green minibus: /route/{region}/{code} may return several operators for the same number.
        const perRegion = await Promise.all(
          GMB_REGIONS.map((rg) =>
            fetch(`${GMB_BASE}/route/${rg}/${r}`)
              .then((res) => (res.ok ? res.json() : null))
              .catch(() => null),
          ),
        );
        const entries: {
          route_id: number;
          route_code: string;
          directions: {
            route_seq: number;
            orig_tc: string;
            orig_en: string;
            dest_tc: string;
            dest_en: string;
          }[];
        }[] = perRegion.flatMap((j) => (j && Array.isArray(j.data) ? j.data : []));
        const entry = entries.find((e) => e.directions && e.directions.length > 0);
        if (!entry || !Array.isArray(entry.directions) || entry.directions.length === 0) {
          setVariants([]);
          setAllStopsByBound({ O: [], I: [] });
          setEtas([]);
          setGmbRouteId(null);
          setError(dict.noRoute);
          return;
        }
        setGmbRouteId(entry.route_id);

        const variantList: RouteVariant[] = entry.directions.map((d) => ({
          route: entry.route_code,
          bound: (d.route_seq === 2 ? "I" : "O") as Bound,
          service_type: String(d.route_seq),
          orig_tc: d.orig_tc,
          orig_en: d.orig_en,
          dest_tc: d.dest_tc,
          dest_en: d.dest_en,
        }));
        setVariants(variantList);
        const nextBound: Bound = variantList.find((v) => v.bound === bound) ? bound : variantList[0].bound;
        if (nextBound !== bound) setActiveBound(nextBound);

        const dirSeq = nextBound === "I" ? 2 : 1;
        const stopJson = await fetch(`${GMB_BASE}/route-stop/${entry.route_id}/${dirSeq}`)
          .then((res) => res.json())
          .catch(() => null);
        const gmbStops = Array.isArray(stopJson?.data?.route_stops) ? stopJson.data.route_stops : [];
        if (gmbStops.length === 0) {
          setAllStopsByBound({ O: [], I: [] });
          setEtas([]);
          setError(dict.noService);
          return;
        }
        const rows: RouteStop[] = gmbStops.map((s: { stop_seq: number; stop_id: number }) => ({
          route: entry.route_code,
          bound: nextBound,
          service_type: String(dirSeq),
          seq: String(s.stop_seq),
          stop: String(s.stop_id),
        }));
        setAllStopsByBound((prev) => ({ ...prev, [nextBound]: rows }));

        // Names come straight from route-stop, so no extra /stop lookups.
        setStopNames((prev) => {
          const next = { ...prev };
          for (const s of gmbStops) {
            next[String(s.stop_id)] = {
              stop: String(s.stop_id),
              name_tc: s.name_tc,
              name_en: s.name_en,
            } as StopInfo;
          }
          return next;
        });

        const etaRows = await Promise.all(
          gmbStops.map(async (s: { stop_seq: number; stop_id: number }) => {
            const j = await fetch(`${GMB_BASE}/eta/route-stop/${entry.route_id}/${dirSeq}/${s.stop_seq}`)
              .then((res) => res.json())
              .catch(() => null);
            const list = Array.isArray(j?.data?.eta) ? j.data.eta : [];
            return list.map((e: Record<string, unknown>) => ({
              route: entry.route_code,
              dir: nextBound,
              service_type: dirSeq,
              seq: s.stop_seq,
              stop: String(s.stop_id),
              dest_tc: "",
              dest_en: "",
              eta_seq: Number(e.eta_seq) || 0,
              eta: (e.timestamp as string | null) ?? null,
              rmk_tc: String(e.remarks_tc || ""),
              rmk_en: String(e.remarks_en || ""),
              data_timestamp: "",
            })) as EtaEntry[];
          }),
        );
        setEtas(etaRows.flat());
        setLastUpdated(Date.now());
        return;
      }

      const [outRoute, inRoute, outStops, inStops, etaAll] = await Promise.all([
        fetch(`${KMB_BASE}/route/${r}/outbound/1`).then((res) => res.json()).catch(() => null),
        fetch(`${KMB_BASE}/route/${r}/inbound/1`).then((res) => res.json()).catch(() => null),
        fetch(`${KMB_BASE}/route-stop/${r}/outbound/1`).then((res) => res.json()).catch(() => null),
        fetch(`${KMB_BASE}/route-stop/${r}/inbound/1`).then((res) => res.json()).catch(() => null),
        fetch(`${KMB_BASE}/route-eta/${r}/1`).then((res) => res.json()).catch(() => null),
      ]);

      const variantList: RouteVariant[] = [];
      for (const j of [outRoute, inRoute]) {
        if (j && j.data && (j.data.route || j.data.bound)) variantList.push(j.data as RouteVariant);
      }
      if (variantList.length === 0) {
        setVariants([]);
        setAllStopsByBound({ O: [], I: [] });
        setEtas([]);
        setError(dict.noRoute);
        return;
      }
      setVariants(variantList);

      const nextBound: Bound = variantList.find((v) => v.bound === bound)
        ? bound
        : variantList[0].bound;
      if (nextBound !== bound) setActiveBound(nextBound);

      const stopsByBound: Record<Bound, RouteStop[]> = { O: [], I: [] };
      for (const j of [outStops, inStops]) {
        if (j && Array.isArray(j.data)) {
          for (const s of j.data as RouteStop[]) {
            stopsByBound[s.bound] = stopsByBound[s.bound] || [];
            stopsByBound[s.bound].push(s);
          }
        }
      }
      setAllStopsByBound(stopsByBound);

      const allEta: EtaEntry[] = etaAll && Array.isArray(etaAll.data) ? etaAll.data : [];
      setEtas(allEta.filter((e) => e.dir === nextBound));

      const ids = Array.from(new Set((stopsByBound[nextBound] || []).map((s) => s.stop)));
      const missing = ids.filter((id) => !stopNamesRef.current[id]);
      if (missing.length) {
        const fetched = await Promise.all(
          missing.map(async (id) => {
            const res = await fetch(`${KMB_BASE}/stop/${id}`);
            const json = await res.json();
            return json.data as StopInfo;
          })
        );
        setStopNames((prev) => {
          const next = { ...prev };
          for (const s of fetched) if (s && s.stop) next[s.stop] = s;
          return next;
        });
      }
      setLastUpdated(Date.now());
    } catch (e) {
      setError("Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!searchedRoute) return;
    fetchAllForRoute(searchedRoute);
  }, [searchedRoute, company]);

  useEffect(() => {
    if (!searchedRoute) return;
    fetchAllForRoute(searchedRoute, activeBound);
  }, [activeBound]);

  useEffect(() => {
    if (!searchedRoute) return;
    const id = setInterval(() => fetchAllForRoute(searchedRoute, activeBound), rate * 1000);
    return () => clearInterval(id);
  }, [searchedRoute, activeBound, rate]);

  function onSearch(e?: FormEvent) {
    e?.preventDefault();
    const v = routeInput.trim().toUpperCase();
    if (!v) return;
    setSearchedRoute(v);
  }

  function isFav(stopId: string): Favourite | undefined {
    if (!activeVariant) return undefined;
    return favs.find((f) => (f.co || "KMB") === company && f.route === activeVariant.route && f.bound === activeBound && f.stopId === stopId);
  }
  function addFav(stop: RouteStop) {
    if (!activeVariant) return;
    if (isFav(stop.stop)) { setToast(dict.alreadyFav); return; }
    const info = stopNames[stop.stop];
    setFavs((prev) => [{
      id: `${company}-${activeVariant.route}-${activeBound}-${stop.stop}-${Date.now()}`,
      co: company,
      route: activeVariant.route,
      bound: activeBound,
      stopId: stop.stop,
      gmbRouteId: company === "GMB" && gmbRouteId != null ? gmbRouteId : undefined,
      seq: company === "GMB" ? Number(stop.seq) : undefined,
      stopNameTc: info?.name_tc,
      stopNameEn: info?.name_en,
    }, ...prev]);
    setToast(dict.addedToFav);
  }
  function rmFav(id: string) { setFavs((prev) => prev.filter((f) => f.id !== id)); }
  function goSearchFromFav(f: Favourite) {
    setCompany(f.co || "KMB");
    setRouteInput(f.route);
    setSearchedRoute(f.route);
    setActiveBound(f.bound);
    setFocusStopId(f.stopId);
    setView("search");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function reorderFavs(fromId: string, toId: string) {
    if (fromId === toId) return;
    setFavs((prev) => {
      const fromIdx = prev.findIndex((f) => f.id === fromId);
      const toIdx = prev.findIndex((f) => f.id === toId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const next = prev.slice();
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }

  async function refreshFavs() {
    if (favs.length === 0) { setFavEtas({}); setFavRouteMeta({}); setFavPrev({}); return; }
    const byRouteBound: Record<string, Favourite[]> = {};
    for (const f of favs) (byRouteBound[`${f.co || "KMB"}:${f.route}:${f.bound}`] ||= []).push(f);
    const ne: Record<string, EtaEntry[]> = {};
    const nm: Record<string, { orig: { tc: string; en: string }; dest: { tc: string; en: string } }> = {};
    const np: Record<string, { stopId: string; nameTc: string; nameEn: string; eta: EtaEntry | null }> = {};
    const newNames: Record<string, StopInfo> = {};
    for (const [key, list] of Object.entries(byRouteBound)) {
      const parts = key.split(":");
      const co = (parts[0] === "CTB" ? "CTB" : parts[0] === "GMB" ? "GMB" : "KMB") as Company;
      const routeOnly = parts[1];
      const boundFromKey = parts[2] as Bound;
      const r = encodeURIComponent(routeOnly);
      const bb: Bound = boundFromKey || list[0].bound;
      const bp = bb === "O" ? "outbound" : "inbound";
      if (co === "GMB") {
        const dirSeq = bb === "I" ? 2 : 1;
        const routeId = list.find((f) => f.gmbRouteId != null)?.gmbRouteId;
        if (!routeId) continue;
        const rsj = await fetch(`${GMB_BASE}/route-stop/${routeId}/${dirSeq}`)
          .then((x) => x.json())
          .catch(() => null);
        const gmbStops: { stop_seq: number; stop_id: number; name_tc: string; name_en: string }[] =
          Array.isArray(rsj?.data?.route_stops) ? rsj.data.route_stops : [];
        if (gmbStops.length === 0) continue;
        for (const s of gmbStops) {
          newNames[String(s.stop_id)] = {
            stop: String(s.stop_id),
            name_tc: s.name_tc,
            name_en: s.name_en,
          } as StopInfo;
        }
        // Route meta from /route/{region}/{code}: directions[] carries orig/dest per route_seq.
        // Region isn't stored on the favourite, so probe the three regions and match route_id.
        let match: { directions?: { route_seq: number; orig_tc: string; orig_en: string; dest_tc: string; dest_en: string }[] } | undefined;
        for (const rg of GMB_REGIONS) {
          const metaRow = await fetch(`${GMB_BASE}/route/${rg}/${r}`)
            .then((x) => (x.ok ? x.json() : null))
            .catch(() => null);
          const hit = (Array.isArray(metaRow?.data) ? metaRow.data : []).find(
            (e: { route_id: number }) => e.route_id === routeId,
          );
          if (hit) { match = hit; break; }
        }
        const dirMeta = match?.directions?.find((d: { route_seq: number }) => d.route_seq === dirSeq);
        if (dirMeta) {
          nm[`${co}:${routeOnly}:${bb}`] = {
            orig: { tc: dirMeta.orig_tc, en: dirMeta.orig_en },
            dest: { tc: dirMeta.dest_tc, en: dirMeta.dest_en },
          };
        }
        const seqToStop: Record<string, string> = {};
        for (const s of gmbStops) seqToStop[String(s.stop_seq)] = String(s.stop_id);
        const etasForBound = (
          await Promise.all(
            gmbStops.map(async (s) => {
              const j = await fetch(`${GMB_BASE}/eta/route-stop/${routeId}/${dirSeq}/${s.stop_seq}`)
                .then((x) => x.json())
                .catch(() => null);
              const list2 = Array.isArray(j?.data?.eta) ? j.data.eta : [];
              return list2.map((e: Record<string, unknown>) => ({
                route: routeOnly,
                dir: bb,
                service_type: dirSeq,
                seq: s.stop_seq,
                stop: String(s.stop_id),
                dest_tc: "",
                dest_en: "",
                eta_seq: Number(e.eta_seq) || 0,
                eta: (e.timestamp as string | null) ?? null,
                rmk_tc: String(e.remarks_tc || ""),
                rmk_en: String(e.remarks_en || ""),
                data_timestamp: "",
              })) as EtaEntry[];
            }),
          )
        ).flat();
        for (const f of list) {
          ne[f.id] = etasForBound
            .filter((e) => e.stop === f.stopId && e.eta)
            .sort((a, b) => new Date(a.eta!).getTime() - new Date(b.eta!).getTime());
        }
        for (const f of list) {
          const mySeq = f.seq ?? Number(
            Object.entries(seqToStop).find(([, sid]) => sid === f.stopId)?.[0] ?? NaN,
          );
          if (!Number.isFinite(mySeq)) continue;
          const prevSeq = Object.keys(seqToStop)
            .map(Number)
            .filter((s) => s < mySeq)
            .sort((a, b) => b - a)[0];
          if (prevSeq == null) continue;
          const prevStopId = seqToStop[String(prevSeq)];
          const prevInfo = stopNamesRef.current[prevStopId] || newNames[prevStopId];
          const nextPrev = etasForBound
            .filter((e) => e.stop === prevStopId && e.eta)
            .sort((a, b) => new Date(a.eta!).getTime() - new Date(b.eta!).getTime())[0] || null;
          np[f.id] = {
            stopId: prevStopId,
            nameTc: prevInfo?.name_tc || "",
            nameEn: prevInfo?.name_en || "",
            eta: nextPrev,
          };
        }
        continue;
      }
      if (co === "CTB") {
        const [rm, rsj] = await Promise.all([
          fetch(`${CTB_BASE}/route/CTB/${r}`).then((x) => x.json()).catch(() => null),
          fetch(`${CTB_BASE}/route-stop/CTB/${r}/${bp}`).then((x) => x.json()).catch(() => null),
        ]);
        if (rm?.data) {
          const meta = rm.data;
          nm[`${co}:${routeOnly}:${bb}`] = bb === "O"
            ? { orig: { tc: meta.orig_tc, en: meta.orig_en }, dest: { tc: meta.dest_tc, en: meta.dest_en } }
            : { orig: { tc: meta.dest_tc, en: meta.dest_en }, dest: { tc: meta.orig_tc, en: meta.orig_en } };
        }
        const stopsArr: RouteStop[] = (rsj?.data || []).map((s: { route: string; dir: Bound; seq: number; stop: string }) => ({
          route: s.route, bound: s.dir, service_type: "1", seq: String(s.seq), stop: s.stop,
        }));
        const stopsForBound = stopsArr.filter((s) => s.bound === bb);
        const ids = Array.from(new Set(list.map((f) => f.stopId)));
        const etasForBound = (await fetchCtbEtas(routeOnly, ids)).filter((e) => e.dir === bb);
        for (const f of list) {
          ne[f.id] = etasForBound
            .filter((e) => e.stop === f.stopId && e.eta)
            .sort((a, b) => new Date(a.eta!).getTime() - new Date(b.eta!).getTime());
        }
        for (const f of list) {
          const myStops = stopsForBound.filter((s) => s.stop === f.stopId);
          const mySeq = Math.max(-Infinity, ...myStops.map((s) => Number(s.seq)));
          if (!Number.isFinite(mySeq)) continue;
          const candidates = stopsForBound
            .map((s) => ({ stop: s.stop, seq: Number(s.seq) }))
            .filter((s) => s.seq < mySeq)
            .sort((a, b) => b.seq - a.seq);
          const prevStopId = candidates[0]?.stop;
          if (!prevStopId) continue;
          const prevInfo = stopNamesRef.current[prevStopId] || newNames[prevStopId];
          const nextPrev = etasForBound
            .filter((e) => e.stop === prevStopId && e.eta)
            .sort((a, b) => new Date(a.eta!).getTime() - new Date(b.eta!).getTime())[0] || null;
          np[f.id] = {
            stopId: prevStopId,
            nameTc: prevInfo?.name_tc || "",
            nameEn: prevInfo?.name_en || "",
            eta: nextPrev,
          };
        }
        const neededIds = [...list.map((f) => f.stopId), ...Object.values(np).map((p) => p.stopId)]
          .filter((id) => id && !stopNamesRef.current[id] && !newNames[id]);
        if (neededIds.length) {
          const fetched = await Promise.all(neededIds.map(async (id) => {
            const res = await fetch(`${CTB_BASE}/stop/${encodeURIComponent(id)}`);
            return (await res.json()).data as StopInfo;
          }));
          for (const s of fetched) if (s && s.stop) newNames[s.stop] = s;
        }
        continue;
      }
      const [rm, rsj, ea] = await Promise.all([
        fetch(`${KMB_BASE}/route/${r}/${bp}/1`).then((x) => x.json()).catch(() => null),
        fetch(`${KMB_BASE}/route-stop/${r}/${bp}/1`).then((x) => x.json()).catch(() => null),
        fetch(`${KMB_BASE}/route-eta/${r}/1`).then((x) => x.json()).catch(() => null),
      ]);
      if (rm?.data) nm[`${routeOnly}:${bb}`] = {
        orig: { tc: rm.data.orig_tc, en: rm.data.orig_en },
        dest: { tc: rm.data.dest_tc, en: rm.data.dest_en },
      };
      const stopsArr: RouteStop[] = rsj?.data || [];
      const stopsForBound: RouteStop[] = stopsArr.filter((s) => s.bound === bb);
      const allEta: EtaEntry[] = ea?.data || [];
      const etasForBound = allEta.filter((e) => e.dir === bb);
      const seqToStop: Record<string, string> = {};
      for (const s of stopsForBound) seqToStop[String(s.seq)] = s.stop;
      for (const f of list) {
        const list2 = etasForBound
          .filter((e) => seqToStop[String(e.seq)] === f.stopId && e.eta)
          .sort((a, b) => new Date(a.eta!).getTime() - new Date(b.eta!).getTime());
        ne[f.id] = list2;
      }
      for (const f of list) {
        const myStops = stopsForBound.filter((s) => s.stop === f.stopId);
        const mySeq = Math.max(-Infinity, ...myStops.map((s) => Number(s.seq)));
        if (!Number.isFinite(mySeq)) continue;
        const candidates = stopsForBound
          .map((s) => ({ stop: s.stop, seq: Number(s.seq) }))
          .filter((s) => s.seq < mySeq)
          .sort((a, b) => b.seq - a.seq);
        const prevStopId = candidates[0]?.stop;
        if (!prevStopId) continue;
        const prevInfo = stopNamesRef.current[prevStopId] || newNames[prevStopId];
        const nextPrev = etasForBound
          .filter((e) => seqToStop[String(e.seq)] === prevStopId && e.eta)
          .sort((a, b) => new Date(a.eta!).getTime() - new Date(b.eta!).getTime())[0] || null;
        np[f.id] = {
          stopId: prevStopId,
          nameTc: prevInfo?.name_tc || "",
          nameEn: prevInfo?.name_en || "",
          eta: nextPrev,
        };
      }
      const neededIds = list.map((f) => f.stopId).filter((id) => !stopNamesRef.current[id] && !newNames[id]);
      if (neededIds.length) {
        const fetched = await Promise.all(neededIds.map(async (id) => {
          const res = await fetch(`${KMB_BASE}/stop/${id}`);
          return (await res.json()).data as StopInfo;
        }));
        for (const s of fetched) if (s && s.stop) newNames[s.stop] = s;
      }
    }
    if (Object.keys(newNames).length) setStopNames((p) => ({ ...p, ...newNames }));
    setFavEtas(ne);
    setFavRouteMeta(nm);
    setFavPrev(np);
    setFavLast(Date.now());
  }

  useEffect(() => { refreshFavs(); }, [favs.length]);
  useEffect(() => {
    if (favs.length === 0) return;
    const id = setInterval(refreshFavs, rate * 1000);
    return () => clearInterval(id);
  }, [favs, rate]);

  const etasByStop = useMemo(() => {
    const map: Record<string, EtaEntry[]> = {};
    const seqToStop: Record<string, string> = {};
    const knownStops = new Set<string>();
    for (const s of routeStops) {
      const key = String(s.seq);
      if (s.stop) {
        seqToStop[key] = s.stop;
        knownStops.add(s.stop);
      }
    }
    for (const e of etas) {
      if (!e.eta) continue;
      const stopId = e.stop && knownStops.has(e.stop) ? e.stop : seqToStop[String(e.seq)];
      if (!stopId) continue;
      (map[stopId] ||= []).push(e);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => new Date(a.eta!).getTime() - new Date(b.eta!).getTime());
    }
    return map;
  }, [etas, routeStops]);

  const sortedStops = useMemo(
    () => [...routeStops].sort((a, b) => Number(a.seq) - Number(b.seq)),
    [routeStops]
  );

  useEffect(() => {
    if (!focusStopId) return;
    if (view !== "search") return;
    if (sortedStops.length === 0) return;
    const tryScroll = () => {
      const el = document.querySelector<HTMLElement>(`[data-stop-id="${focusStopId}"]`);
      if (!el) return false;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-amber-400", "ring-offset-2");
      const tid = setTimeout(() => {
        el.classList.remove("ring-2", "ring-amber-400", "ring-offset-2");
      }, 2200);
      setTimeout(() => setFocusStopId(null), 2400);
      return () => clearTimeout(tid);
    };
    const cleanup = tryScroll();
    if (cleanup !== false) return cleanup;
    const id = setTimeout(tryScroll, 250);
    const id2 = setTimeout(tryScroll, 600);
    return () => { clearTimeout(id); clearTimeout(id2); };
  }, [focusStopId, view, sortedStops, activeBound]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-zinc-100 text-zinc-900">
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Floating Search/Favourites switcher — appears when the user has scrolled past the header */}
      <div
        aria-hidden={!headerOutOfView}
        className={`fixed right-3 top-1/2 z-40 -translate-y-1/2 transition-all duration-200 sm:right-4 ${
          headerOutOfView
            ? "translate-x-0 opacity-100 pointer-events-auto"
            : "translate-x-6 opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex flex-col gap-2 rounded-full border border-zinc-200 bg-white/95 p-1.5 shadow-lg backdrop-blur">
          <button
            onClick={() => {
              setView("search");
              if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
              view === "search"
                ? "bg-amber-600 text-white"
                : "text-zinc-700 hover:bg-zinc-100"
            }`}
            title={dict.viewSearch}
            aria-label={dict.viewSearch}
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              setView("grid");
              if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className={`relative flex h-10 w-10 items-center justify-center rounded-full transition ${
              view === "grid"
                ? "bg-amber-600 text-white"
                : "text-zinc-700 hover:bg-zinc-100"
            }`}
            title={dict.viewGrid}
            aria-label={dict.viewGrid}
          >
            <Grid3x3 className="h-4 w-4" />
            {favs.length > 0 && (
              <span className={`absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                view === "grid" ? "bg-white text-amber-700" : "bg-amber-500 text-white"
              }`}>
                {favs.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <div ref={headerRef} className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Bus className="h-7 w-7 text-amber-600" />
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {dict.title}
              </h1>
            </div>
            <WeatherStrip lang={lang} dict={dict} weather={weather} weatherErr={weatherErr} />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-full border border-zinc-200 bg-white p-1 shadow-sm">
              <button
                onClick={() => setView("search")}
                className={`flex h-9 w-9 items-center justify-center rounded-full transition ${view === "search" ? "bg-amber-600 text-white" : "text-zinc-600 hover:bg-zinc-50"}`}
                title={dict.viewSearch}
                aria-label={dict.viewSearch}
              >
                <Search className="h-4 w-4" />
              </button>
              <button
                onClick={() => setView("grid")}
                className={`relative flex h-9 w-9 items-center justify-center rounded-full transition ${view === "grid" ? "bg-amber-600 text-white" : "text-zinc-600 hover:bg-zinc-50"}`}
                title={dict.viewGrid}
                aria-label={dict.viewGrid}
              >
                <Grid3x3 className="h-4 w-4" />
                {favs.length > 0 && (
                  <span className={`absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${view === "grid" ? "bg-white text-amber-700" : "bg-amber-500 text-white"}`}>
                    {favs.length}
                  </span>
                )}
              </button>
            </div>
            <button
              onClick={() => setLang(lang === "tc" ? "en" : "tc")}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50"
              title={dict.language}
              aria-label={dict.language}
            >
              {lang === "tc" ? "中" : "EN"}
            </button>
          </div>
        </div>

        {view === "search" && (
          <div className="mb-4">
            <form onSubmit={onSearch} className="mb-4 flex gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">
              <div className="flex items-center gap-0.5 rounded-xl bg-zinc-100 p-0.5">
                {(["KMB", "CTB", "GMB"] as Company[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCompany(c)}
                    className={`rounded-lg px-2.5 py-1.5 text-sm font-semibold transition ${
                      company === c ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                    }`}
                    aria-pressed={company === c}
                  >
                    {c === "KMB" ? dict.kmb : c === "CTB" ? dict.ctb : dict.gmb}
                  </button>
                ))}
              </div>
              <div className="flex flex-1 items-center gap-2 px-2">
                <Search className="h-5 w-5 text-zinc-400" />
                <input
                  type="text"
                  value={routeInput}
                  onChange={(e) => setRouteInput(e.target.value)}
                  placeholder={dict.routePlaceholder}
                  className="w-full bg-transparent py-2 text-lg font-semibold outline-none placeholder:font-normal placeholder:text-zinc-400"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !routeInput.trim()}
                className="rounded-xl bg-amber-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {dict.search}
              </button>
            </form>

            {searchedRoute && (
              <div className="mb-4 flex flex-wrap items-center gap-3">
                {variants.length > 1 && (
                  <div className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
                    {variants.map((v) => (
                      <button
                        key={v.bound}
                        onClick={() => setActiveBound(v.bound)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${activeBound === v.bound ? "bg-amber-600 text-white" : "text-zinc-600 hover:bg-zinc-50"}`}
                      >
                        {v.bound === "O" ? dict.outbound : dict.inbound}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
                  <Clock className="ml-2 h-4 w-4 text-zinc-400" />
                  {[15, 30, 60].map((r) => (
                    <button
                      key={r}
                      onClick={() => setRate(r as Rate)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${rate === r ? "bg-amber-600 text-white" : "text-zinc-600 hover:bg-zinc-50"}`}
                    >
                      {r}{dict.seconds}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => fetchAllForRoute(searchedRoute, activeBound)}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  {dict.refresh}
                </button>
                {lastUpdated && (
                  <span className="text-xs text-zinc-500">
                    {dict.lastUpdate}: {formatClock(new Date(lastUpdated).toISOString())}
                  </span>
                )}
              </div>
            )}

            {activeVariant && (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-black text-amber-700">{activeVariant.route}</span>
                  <span className="text-sm font-medium text-amber-900">
                    {activeVariant.bound === "O" ? dict.outbound : dict.inbound}
                  </span>
                </div>
                <div className="mt-1 text-sm text-zinc-700">
                  <span className="font-semibold">{dict.origin}:</span>{" "}
                  {lang === "tc" ? activeVariant.orig_tc : activeVariant.orig_en}
                  <span className="mx-2 text-zinc-400">→</span>
                  <span className="font-semibold">{dict.destination}:</span>{" "}
                  {lang === "tc" ? activeVariant.dest_tc : activeVariant.dest_en}
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
            )}
            {!error && searchedRoute && variants.length === 0 && !loading && (
              <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center text-zinc-500">{dict.noService}</div>
            )}

            {sortedStops.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  {sortedStops.length} {dict.stops}
                </div>
                <ul className="divide-y divide-zinc-100">
                  {sortedStops.map((s) => {
                    const info = stopNames[s.stop];
                    const name = info
                      ? (lang === "tc" ? info.name_tc : info.name_en)
                      : `${dict.stopNameFallback} (${s.stop.slice(0, 6)}…)`;
                    const secondary = info
                      ? (lang === "tc" ? info.name_en : info.name_tc)
                      : s.stop;
                    const list = etasByStop[s.stop] || [];
                    return (
                      <li key={`${s.seq}-${s.stop}`} data-stop-id={s.stop} className="px-4 py-3 transition-shadow">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-600">
                              {s.seq}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-base font-semibold leading-snug text-zinc-900 sm:truncate sm:text-sm sm:font-medium">{name}</div>
                              {info && (
                                <div className="mt-0.5 text-xs leading-snug text-zinc-500 sm:truncate">{secondary}</div>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2 pl-10 sm:justify-end sm:pl-0">
                            {list.length === 0 ? (
                              <span className="text-xs text-zinc-400">{dict.noUpcoming}</span>
                            ) : (
                              list.slice(0, 3).map((e) => {
                                const mins = formatEtaMinutes(e.eta, tickNow);
                                const tone =
                                  mins === 0
                                    ? "bg-red-100 text-red-700 border-red-200"
                                    : mins <= 3
                                    ? "bg-amber-100 text-amber-800 border-amber-200"
                                    : "bg-emerald-100 text-emerald-800 border-emerald-200";
                                return (
                                  <div key={`${s.stop}-${e.eta_seq}-${e.eta}`} className={`flex min-w-[64px] flex-col items-center rounded-lg border px-2.5 py-1 ${tone}`} title={e.rmk_tc || e.rmk_en || ""}>
                                    <span className="text-lg font-black leading-none">{mins < 0 ? "—" : mins}</span>
                                    <span className="text-[10px] font-medium leading-tight">{mins === 0 ? dict.arriving : dict.minuteShort}</span>
                                  </div>
                                );
                              })
                            )}
                            <button
                              onClick={() => addFav(s)}
                              disabled={!!isFav(s.stop)}
                              className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${isFav(s.stop) ? "border-amber-200 bg-amber-50 text-amber-600" : "border-zinc-200 bg-white text-zinc-400 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-600"}`}
                              title={isFav(s.stop) ? dict.alreadyFav : dict.addFav}
                            >
                              {isFav(s.stop) ? <Star className="h-4 w-4 fill-amber-500 text-amber-500" /> : <Plus className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}

        {view === "grid" && (
          <div>
            {favs.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 shadow-sm">{dict.noFavs}</div>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-end gap-2 text-xs text-zinc-500">
                  {favLast && <span>{dict.lastUpdate}: {formatClock(new Date(favLast).toISOString())}</span>}
                  <button
                    onClick={() => refreshFavs()}
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    <RefreshCw className="h-3 w-3" /> {dict.refresh}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {favs.map((f) => {
                    const meta = favRouteMeta[`${f.co || "KMB"}:${f.route}:${f.bound}`];
                    const list = favEtas[f.id] || [];
                    const next = list[0];
                    const mins = next ? formatEtaMinutes(next.eta, tickNow) : null;
                    const tone =
                      mins === null
                        ? "bg-zinc-50 border-zinc-200 text-zinc-400"
                        : mins === 0
                        ? "bg-red-50 border-red-200 text-red-700"
                        : mins <= 3
                        ? "bg-amber-50 border-amber-200 text-amber-800"
                        : mins <= 10
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : "bg-zinc-50 border-zinc-200 text-zinc-700";
                    const stopName = (() => {
                      if (lang === "tc") return f.stopNameTc || f.stopNameEn;
                      return f.stopNameEn || f.stopNameTc;
                    })() || `${dict.stopNameFallback} (${f.stopId.slice(0, 6)}…)`;
                    return (
                      <div
                        key={f.id}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", f.id); } catch {} setDragId(f.id); }}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragId && dragId !== f.id) setDragOverId(f.id); }}
                        onDragLeave={() => { if (dragOverId === f.id) setDragOverId(null); }}
                        onDrop={(e) => { e.preventDefault(); const fromId = e.dataTransfer.getData("text/plain") || dragId; if (fromId) reorderFavs(fromId, f.id); setDragId(null); setDragOverId(null); }}
                        onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                        onClick={(e) => { const target = e.target as HTMLElement; if (target.closest("button")) return; goSearchFromFav(f); }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goSearchFromFav(f); } }}
                        title={`${dict.viewSearch} · ${f.route}`}
                        className={`group relative flex aspect-square cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border p-3 shadow-sm transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${tone} ${dragId === f.id ? "opacity-40" : ""} ${dragOverId === f.id ? "ring-2 ring-amber-500" : ""}`}
                      >
                        <div className="absolute right-1.5 top-1.5 flex items-center gap-1 z-10 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                          <button
                            onClick={() => goSearchFromFav(f)}
                            className="rounded-md bg-white p-1.5 text-zinc-700 shadow ring-1 ring-zinc-200 hover:bg-amber-50 hover:text-amber-700"
                            title={dict.viewSearch}
                            aria-label={dict.viewSearch}
                          >
                            <Search className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => rmFav(f.id)}
                            className="rounded-md bg-white p-1.5 text-zinc-700 shadow ring-1 ring-zinc-200 hover:bg-red-50 hover:text-red-600"
                            title={dict.removeFav}
                            aria-label={dict.removeFav}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span className="truncate text-2xl font-black leading-none text-zinc-900">{f.route}</span>
                            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                              {f.bound === "O" ? dict.outbound : dict.inbound}
                            </span>
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs font-medium leading-tight text-zinc-700">{stopName}</div>
                        </div>

                        {favPrev[f.id] && (() => {
                          const p = favPrev[f.id];
                          const pm = p.eta ? formatEtaMinutes(p.eta.eta, tickNow) : null;
                          const pName = (lang === "tc" ? p.nameTc : p.nameEn) || p.stopId;
                          return (
                            <div className="mb-0.5 flex items-center gap-1 text-[10px] font-medium text-zinc-500/80">
                              <span className="shrink-0 uppercase tracking-wider">{dict.prevStop}</span>
                              <span className="truncate">{pName}</span>
                              <span className="ml-auto shrink-0 tabular-nums text-zinc-500/70">
                                {pm === null ? "—" : pm === 0 ? dict.arriving : `${pm}${dict.minuteShort}`}
                              </span>
                            </div>
                          );
                        })()}

                        <div className="mt-auto">
                          {mins === null ? (
                            <div className="text-xs font-medium text-zinc-400">{dict.noUpcoming}</div>
                          ) : (
                            <div className="flex items-baseline gap-1">
                              <span className="text-3xl font-black leading-none tabular-nums">{mins < 0 ? "—" : mins}</span>
                              <span className="text-xs font-semibold">{mins === 0 ? dict.arriving : dict.minuteShort}</span>
                            </div>
                          )}
                          {meta && (
                            <div className="mt-0.5 truncate text-[10px] text-zinc-500">
                              {lang === "tc" ? meta.orig.tc : meta.orig.en}
                              <span className="mx-0.5 text-zinc-400">→</span>
                              {lang === "tc" ? meta.dest.tc : meta.dest.en}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-zinc-400">
          Data from{" "}
          <a href="https://data.gov.hk/en-data/dataset/hk-td-tis_21-etakmb" target="_blank" rel="noreferrer" className="underline hover:text-zinc-600">
            data.gov.hk
          </a>{" "}
          · KMB/LWB ETA{company === "CTB" ? " · Citybus ETA" : company === "GMB" ? " · GMB ETA" : ""}
        </p>
      </div>
    </div>
  );
}
