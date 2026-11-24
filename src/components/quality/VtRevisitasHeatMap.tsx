import { useEffect, useId, useMemo, useRef, useState } from "react";
import { LocateFixed, Maximize, Minus, Plus } from "lucide-react";
import {
  VT_GEOGRAPHY_SOURCE,
  vtGeography,
  type VtGeoPoint,
  type VtHeatArea,
  type VtHeatData,
} from "@/lib/vt-revisitas-geography";
import type { VtCity } from "@/lib/vt-revisitas";

const TILE = 256;
const MIN_ZOOM = 9;
const MAX_ZOOM = 16;
type Size = { width: number; height: number };
type Viewport = { center: VtGeoPoint; zoom: number };
type XY = [number, number];
const sizeFallback = { width: 680, height: 380 };
const mapButton =
  "grid h-8 min-w-8 place-items-center bg-white px-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-red-600 disabled:text-slate-300 aria-pressed:bg-slate-200";
const mapControls = "flex overflow-hidden rounded-md border border-slate-300 bg-white shadow-md";

function world([lng, lat]: VtGeoPoint, zoom: number): XY {
  const scale = TILE * 2 ** zoom;
  const sin = Math.sin((lat * Math.PI) / 180);
  return [
    ((lng + 180) / 360) * scale,
    (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  ];
}

function unproject([x, y]: XY, zoom: number): VtGeoPoint {
  const scale = TILE * 2 ** zoom;
  return [
    (x / scale) * 360 - 180,
    Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / scale))) * (180 / Math.PI),
  ];
}

function regionView(city: VtCity, { width, height }: Size, focus?: VtGeoPoint[]): Viewport {
  const points = focus?.length
    ? focus.map((point) => world(point, 0))
    : vtGeography[city].cities.flatMap((area) =>
        area.neighborhoods.map(([, x, y]) => world([x, y], 0)),
      );
  const xs = points.map(([x]) => x),
    ys = points.map(([, y]) => y);
  const west = Math.min(...xs),
    east = Math.max(...xs),
    north = Math.min(...ys),
    south = Math.max(...ys);
  const scale = Math.min((width - 76) / (east - west), (height - 84) / (south - north));
  // A vector report can zoom in on its hotspots without requesting map tiles.
  const zoom = Math.min(
    focus?.length ? 12 : 13,
    Math.max(MIN_ZOOM, focus?.length ? Math.log2(scale) : Math.floor(Math.log2(scale))),
  );
  return { zoom, center: unproject([(west + east) / 2, (north + south) / 2], 0) };
}

function frame(view: Viewport, size: Size) {
  const [x, y] = world(view.center, view.zoom);
  return { x: x - size.width / 2, y: y - size.height / 2, zoom: view.zoom };
}

function project(point: VtGeoPoint, map: ReturnType<typeof frame>): XY {
  const [x, y] = world(point, map.zoom);
  return [x - map.x, y - map.y];
}

function svgGeometry(rings: VtGeoPoint[][], map: ReturnType<typeof frame>) {
  return rings
    .map(
      (ring) =>
        ring
          .map(
            (point, i) =>
              `${i === 0 ? "M" : "L"}${project(point, map)
                .map((n) => n.toFixed(1))
                .join(",")}`,
          )
          .join("") + "Z",
    )
    .join("");
}

function MapScale({ view }: { view: Viewport }) {
  const metersPerPixel = (156543.03 * Math.cos((view.center[1] * Math.PI) / 180)) / 2 ** view.zoom;
  const limit = metersPerPixel * 88;
  const unit = 10 ** Math.floor(Math.log10(limit));
  const distance = (limit >= 5 * unit ? 5 : limit >= 2 * unit ? 2 : 1) * unit;
  const label = distance >= 1000 ? `${distance / 1000} km` : `${distance} m`;
  return (
    <div className="absolute bottom-1 left-2 rounded bg-white/95 px-1.5 pb-1 text-center text-[10px] text-slate-800">
      {label}
      <span
        className="block h-1 border-x border-b border-slate-800"
        style={{ width: distance / metersPerPixel }}
      />
    </div>
  );
}

function MapVectors({
  city,
  map,
  size,
}: {
  city: VtCity;
  map: ReturnType<typeof frame>;
  size: Size;
}) {
  const region = vtGeography[city];
  const labels: {
    name: string;
    x: number;
    y: number;
    font: number;
    half: number;
    main: boolean;
  }[] = [];
  for (const geo of region.cities) {
    const [x, y] = project(geo.point, map);
    const font = geo.main ? 13 : 10;
    const half = geo.name.length * font * 0.29;
    if (x - half < 5 || x + half > size.width - 5 || y < 13 || y > size.height - 7) continue;
    if (
      labels.some(
        (item) => Math.abs(item.y - y) < 15 && Math.abs(item.x - x) < item.half + half + 7,
      )
    )
      continue;
    labels.push({ name: geo.name, x, y, font, half, main: geo.main });
  }
  return (
    <svg width={size.width} height={size.height} className="block" aria-hidden="true">
      <rect width={size.width} height={size.height} fill="#a8dbe9" />
      <path fill="#f1f2e6" fillRule="evenodd" d={svgGeometry(region.land, map)} />
      {region.cities.map((geo) => (
        <path
          key={geo.name}
          fill={geo.main ? "#e5eedb" : "#f1f2e6"}
          stroke="#9baeb5"
          strokeWidth="1"
          fillRule="evenodd"
          d={svgGeometry(geo.rings, map)}
        />
      ))}
      {labels.map(({ name, x, y, font, main }) => (
        <text
          key={name}
          x={x}
          y={y}
          textAnchor="middle"
          fontSize={font}
          fontWeight={main ? "700" : "400"}
          fill="#354554"
          stroke="#fff"
          strokeWidth={3}
          paintOrder="stroke"
        >
          {name}
        </text>
      ))}
    </svg>
  );
}

const spectrum = [
  ["#18a887", "#009f82", "#16ba8c"],
  ["#ffe963", "#ffcc33", "#16ba8c"],
  ["#e5233a", "#ffa728", "#16ba8c"],
];

function HeatLayer({
  heat,
  map,
  size,
  annotate = false,
}: {
  heat: VtHeatData;
  map: ReturnType<typeof frame>;
  size: Size;
  annotate?: boolean;
}) {
  const id = useId();
  const top = Math.max(3, heat.located[0]?.count ?? 0);
  const radius = (count: number) => 14 + Math.sqrt(count / top) * 18;
  const labels: { key: string; x: number; y: number; half: number; text: string }[] = [];
  if (annotate) {
    for (const area of heat.located.slice(0, 10)) {
      const [x, y] = project(area.point, map);
      const text = `${area.label.split(" · ")[0]} (${area.count.toLocaleString("pt-BR")})`;
      const half = text.length * 3;
      const labelX = Math.max(half + 6, Math.min(x, size.width - half - 6));
      const r = radius(area.count);
      const line = [y - r - 3, y + r + 12].find(
        (candidate) =>
          candidate > 11 &&
          candidate < size.height - 23 &&
          !labels.some(
            (label) =>
              Math.abs(label.y - candidate) < 15 &&
              Math.abs(label.x - labelX) < label.half + half + 6,
          ),
      );
      if (line !== undefined) labels.push({ key: area.key, x: labelX, y: line, half, text });
    }
  }
  return (
    <svg
      width={size.width}
      height={size.height}
      className="pointer-events-none block"
      aria-hidden="true"
    >
      <defs>
        {spectrum.map(([core, mid, edge], index) => (
          <radialGradient id={`${id}-${index}`} key={core}>
            <stop offset="0" stopColor={core} stopOpacity=".98" />
            <stop offset=".32" stopColor={mid} stopOpacity=".9" />
            <stop offset=".63" stopColor={edge} stopOpacity=".55" />
            <stop offset="1" stopColor={edge} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
      {[...heat.located].reverse().map((area) => {
        const [x, y] = project(area.point, map);
        const strength = area.count / top;
        const gradient = strength <= 0.34 ? 0 : strength <= 0.68 ? 1 : 2;
        return (
          <circle
            key={area.key}
            data-vt-hotspot={area.key}
            cx={x}
            cy={y}
            r={radius(area.count)}
            fill={`url(#${id}-${gradient})`}
          />
        );
      })}
      {labels.map(({ key, x, y, text }) => (
        <text
          key={key}
          x={x}
          y={y}
          textAnchor="middle"
          fontSize={11}
          fontWeight="700"
          fill="#203349"
          stroke="#fff"
          strokeWidth={3}
          paintOrder="stroke"
        >
          {text}
        </text>
      ))}
    </svg>
  );
}

function visibleTiles(map: ReturnType<typeof frame>, size: Size) {
  const tiles = [];
  const maximum = 2 ** map.zoom;
  for (let x = Math.floor(map.x / TILE); x <= Math.floor((map.x + size.width) / TILE); x++) {
    for (let y = Math.floor(map.y / TILE); y <= Math.floor((map.y + size.height) / TILE); y++) {
      if (y < 0 || y >= maximum) continue;
      tiles.push({
        key: `${map.zoom}/${x}/${y}`,
        url: `https://tile.openstreetmap.org/${map.zoom}/${((x % maximum) + maximum) % maximum}/${y}.png`,
        left: x * TILE - map.x,
        top: y * TILE - map.y,
      });
    }
  }
  return tiles;
}

export function VtRevisitasHeatMap({
  city,
  heat,
  onArea,
}: {
  city: VtCity;
  heat: VtHeatData;
  onArea: (area: VtHeatArea) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; x: number; y: number; start: XY; zoom: number } | null>(
    null,
  );
  const [size, setSize] = useState(sizeFallback);
  const [custom, setCustom] = useState<Viewport | null>(null);
  const [useStreets, setUseStreets] = useState(true);
  const [tileError, setTileError] = useState(false);
  const [mapError, setMapError] = useState("");
  const view = useMemo(() => custom ?? regionView(city, size), [city, custom, size]);
  const map = frame(view, size);
  const tiles = useStreets && !tileError ? visibleTiles(map, size) : [];

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      if (element.clientWidth > 0 && element.clientHeight > 0)
        setSize({ width: element.clientWidth, height: element.clientHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const zoom = (by: number) =>
    setCustom((old) => {
      const viewport = old ?? view;
      return { ...viewport, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom + by)) };
    });
  const pan = (start: XY, dx: number, dy: number, zoomLevel: number) => {
    const y = Math.min(TILE * 2 ** zoomLevel, Math.max(0, start[1] - dy));
    setCustom({ zoom: zoomLevel, center: unproject([start[0] - dx, y], zoomLevel) });
  };
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await ref.current?.requestFullscreen();
      setMapError("");
    } catch {
      setMapError("A tela cheia não está disponível neste navegador.");
    }
  };

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="region"
      aria-label="Mapa interativo de revisitas"
      className="relative h-[360px] min-w-0 touch-none select-none overflow-hidden rounded-lg bg-[#a8dbe9] outline-offset-2 sm:h-[410px] [&:fullscreen]:h-screen [&:fullscreen]:rounded-none"
      onPointerDown={(e) => {
        if (e.button !== 0 || (e.target as Element).closest("button, a")) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = {
          pointer: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          start: world(view.center, view.zoom),
          zoom: view.zoom,
        };
      }}
      onPointerMove={(e) => {
        const active = drag.current;
        if (active?.pointer === e.pointerId)
          pan(active.start, e.clientX - active.x, e.clientY - active.y, active.zoom);
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "+" || e.key === "-") {
          e.preventDefault();
          zoom(e.key === "+" ? 1 : -1);
          return;
        }
        const shift = {
          ArrowLeft: [80, 0],
          ArrowRight: [-80, 0],
          ArrowUp: [0, 80],
          ArrowDown: [0, -80],
        }[e.key];
        if (shift) {
          e.preventDefault();
          pan(world(view.center, view.zoom), shift[0]!, shift[1]!, view.zoom);
        }
      }}
    >
      <div className="pointer-events-none absolute inset-0">
        <MapVectors city={city} map={map} size={size} />
      </div>
      {tiles.map((tile) => (
        <img
          key={tile.key}
          src={tile.url}
          alt=""
          width={256}
          height={256}
          draggable={false}
          className="pointer-events-none absolute max-w-none"
          onError={() => setTileError(true)}
          style={{ left: tile.left, top: tile.top }}
        />
      ))}
      <div className="pointer-events-none absolute inset-0">
        <HeatLayer heat={heat} map={map} size={size} />
      </div>
      {[...heat.located].reverse().map((area) => {
        const [x, y] = project(area.point, map);
        if (x < 0 || y < 0 || x > size.width || y > size.height) return null;
        const label = `${area.label}: ${area.count} ${area.count === 1 ? "revisita" : "revisitas"}`;
        return (
          <button
            key={area.key}
            type="button"
            aria-label={label}
            title={label}
            className="absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-transparent text-[10px] font-bold text-white hover:border-white hover:bg-slate-950/70 focus-visible:bg-slate-950/85"
            style={{ left: x, top: y }}
            onClick={() => onArea(area)}
          >
            <span className="opacity-0 [button:hover_&]:opacity-100 [button:focus-visible_&]:opacity-100">
              {area.count}
            </span>
          </button>
        );
      })}
      <div className={`absolute left-2 top-2 ${mapControls}`} aria-label="Camada do mapa">
        <button
          type="button"
          className={mapButton}
          aria-pressed={useStreets && !tileError}
          onClick={() => {
            setTileError(false);
            setUseStreets(true);
          }}
        >
          Mapa de ruas
        </button>
        <button
          type="button"
          className={`${mapButton} border-l border-slate-200`}
          aria-pressed={!useStreets || tileError}
          onClick={() => setUseStreets(false)}
        >
          Limites IBGE
        </button>
      </div>
      <button
        type="button"
        aria-label="Tela cheia do mapa"
        title="Tela cheia"
        className={`absolute right-2 top-2 ${mapControls} ${mapButton}`}
        onClick={() => void fullscreen()}
      >
        <Maximize size={15} />
      </button>
      <div
        className={`absolute bottom-8 right-2 flex-col divide-y divide-slate-200 ${mapControls}`}
      >
        <button
          type="button"
          aria-label="Aumentar zoom"
          className={mapButton}
          disabled={view.zoom >= MAX_ZOOM}
          onClick={() => zoom(1)}
        >
          <Plus size={17} />
        </button>
        <button
          type="button"
          aria-label="Diminuir zoom"
          className={mapButton}
          disabled={view.zoom <= MIN_ZOOM}
          onClick={() => zoom(-1)}
        >
          <Minus size={17} />
        </button>
        <button
          type="button"
          aria-label="Reenquadrar cidade"
          className={mapButton}
          onClick={() => setCustom(null)}
        >
          <LocateFixed size={15} />
        </button>
      </div>
      {((tileError && useStreets) || mapError) && (
        <p
          role="status"
          className="absolute bottom-8 left-2 max-w-[68%] rounded bg-white/95 px-2 py-1 text-xs text-slate-800"
        >
          {mapError || "Mapa de ruas indisponível. Exibindo a base do IBGE."}
        </p>
      )}
      <MapScale view={view} />
      <p className="absolute bottom-0 right-0 bg-white/95 px-2 py-1 text-[10px] text-slate-700">
        <a className="underline" href={VT_GEOGRAPHY_SOURCE} target="_blank" rel="noreferrer">
          IBGE
        </a>
        {!!tiles.length && (
          <>
            {" "}
            · ©{" "}
            <a
              className="underline"
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              OpenStreetMap
            </a>
          </>
        )}
      </p>
    </div>
  );
}

// The shared report uses the official vector base and never reads or rasterizes external tiles.
export function VtStaticHeatMap({
  city,
  heat,
  width,
  height,
}: { city: VtCity; heat: VtHeatData } & Size) {
  const size = { width, height };
  const view = regionView(
    city,
    size,
    heat.located.map(({ point }) => point),
  );
  const map = frame(view, size);
  return (
    <div className="relative overflow-hidden rounded-md" style={{ width, height }}>
      <MapVectors city={city} map={map} size={size} />
      <div className="absolute inset-0">
        <HeatLayer heat={heat} map={map} size={size} annotate />
      </div>
      <MapScale view={view} />
      <span className="absolute bottom-0 right-0 bg-white/95 px-2 py-1 text-[10px] text-slate-700">
        Base cartográfica: IBGE
      </span>
    </div>
  );
}
