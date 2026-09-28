import { useEffect, useMemo, useRef, useState } from "react";
import { Home, LocateFixed, Minus, Plus } from "lucide-react";
import { distanceMeters, type QuarkPersonView, type QuarkPunch } from "@/lib/quark";
import { cn } from "@/lib/utils";

const TILE_SIZE = 256;
const MIN_ZOOM = 3;
const MAX_ZOOM = 19;

interface Point {
  latitude: number;
  longitude: number;
}

interface Size {
  width: number;
  height: number;
}

function clampLatitude(latitude: number): number {
  return Math.max(-85.05112878, Math.min(85.05112878, latitude));
}

function worldPoint(point: Point, zoom: number): Point {
  const scale = TILE_SIZE * 2 ** zoom;
  const latitude = clampLatitude(point.latitude);
  const sin = Math.sin((latitude * Math.PI) / 180);
  return {
    longitude: ((point.longitude + 180) / 360) * scale,
    latitude: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

function geoPoint(world: Point, zoom: number): Point {
  const scale = TILE_SIZE * 2 ** zoom;
  const longitude = (world.longitude / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * world.latitude) / scale;
  const latitude = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { latitude, longitude };
}

function metersPerPixel(latitude: number, zoom: number): number {
  return (156543.03392 * Math.cos((clampLatitude(latitude) * Math.PI) / 180)) / 2 ** zoom;
}

function fitView(points: Point[], size: Size): { center: Point; zoom: number } {
  const fallback = points[0] ?? { latitude: -5.7945, longitude: -35.211 };
  if (points.length <= 1 || size.width < 100 || size.height < 100) {
    return { center: fallback, zoom: 16 };
  }

  const center = {
    latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
    longitude: points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
  };

  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom -= 1) {
    const projected = points.map((point) => worldPoint(point, zoom));
    const xs = projected.map((point) => point.longitude);
    const ys = projected.map((point) => point.latitude);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    if (spanX <= Math.max(80, size.width - 100) && spanY <= Math.max(80, size.height - 100)) {
      return { center, zoom };
    }
  }
  return { center, zoom: MIN_ZOOM };
}

export function QuarkLocationMap({
  person,
  punches,
  radiusMeters,
  className,
}: {
  person: QuarkPersonView;
  punches: QuarkPunch[];
  radiusMeters: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    x: number;
    y: number;
    centerWorld: Point;
    pointerId: number;
  } | null>(null);
  const [size, setSize] = useState<Size>({ width: 900, height: 440 });
  const [center, setCenter] = useState<Point>(
    person.home
      ? { latitude: person.home.latitude, longitude: person.home.longitude }
      : { latitude: -5.7945, longitude: -35.211 },
  );
  const [zoom, setZoom] = useState(15);

  const mappedPunches = useMemo(
    () =>
      punches
        .filter(
          (punch): punch is QuarkPunch & { latitude: number; longitude: number } =>
            punch.latitude !== null && punch.longitude !== null,
        )
        .sort((a, b) =>
          `${a.work_date} ${a.punch_time ?? ""}`.localeCompare(
            `${b.work_date} ${b.punch_time ?? ""}`,
          ),
        ),
    [punches],
  );

  const fitPoints = useMemo(() => {
    const points: Point[] = mappedPunches.map((punch) => ({
      latitude: punch.latitude,
      longitude: punch.longitude,
    }));
    if (person.home) {
      points.push({
        latitude: person.home.latitude,
        longitude: person.home.longitude,
      });
    }
    return points;
  }, [mappedPunches, person.home]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () =>
      setSize({
        width: Math.max(320, element.clientWidth),
        height: Math.max(330, element.clientHeight),
      });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const fitted = fitView(fitPoints, size);
    setCenter(fitted.center);
    setZoom(fitted.zoom);
  }, [fitPoints, size]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setZoom((current) =>
        Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current + (event.deltaY > 0 ? -1 : 1))),
      );
    };

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, []);

  const centerWorld = worldPoint(center, zoom);
  const tiles = useMemo(() => {
    const minX = Math.floor((centerWorld.longitude - size.width / 2) / TILE_SIZE) - 1;
    const maxX = Math.floor((centerWorld.longitude + size.width / 2) / TILE_SIZE) + 1;
    const minY = Math.floor((centerWorld.latitude - size.height / 2) / TILE_SIZE) - 1;
    const maxY = Math.floor((centerWorld.latitude + size.height / 2) / TILE_SIZE) + 1;
    const count = 2 ** zoom;
    const rows: { x: number; y: number; tileX: number; left: number; top: number }[] = [];

    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        if (y < 0 || y >= count) continue;
        const tileX = ((x % count) + count) % count;
        rows.push({
          x,
          y,
          tileX,
          left: x * TILE_SIZE - centerWorld.longitude + size.width / 2,
          top: y * TILE_SIZE - centerWorld.latitude + size.height / 2,
        });
      }
    }
    return rows;
  }, [centerWorld.latitude, centerWorld.longitude, size.height, size.width, zoom]);

  function screenPoint(point: Point) {
    const projected = worldPoint(point, zoom);
    return {
      left: projected.longitude - centerWorld.longitude + size.width / 2,
      top: projected.latitude - centerWorld.latitude + size.height / 2,
    };
  }

  function changeZoom(delta: number) {
    setZoom((current) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current + delta)));
  }

  function fit() {
    const fitted = fitView(fitPoints, size);
    setCenter(fitted.center);
    setZoom(fitted.zoom);
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative h-[440px] min-h-[330px] w-full overflow-hidden rounded-2xl border border-border bg-muted touch-none select-none",
        className,
      )}
      onPointerDown={(event) => {
        const target = event.currentTarget;
        target.setPointerCapture(event.pointerId);
        dragRef.current = {
          x: event.clientX,
          y: event.clientY,
          centerWorld: worldPoint(center, zoom),
          pointerId: event.pointerId,
        };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const nextWorld = {
          longitude: drag.centerWorld.longitude - (event.clientX - drag.x),
          latitude: drag.centerWorld.latitude - (event.clientY - drag.y),
        };
        setCenter(geoPoint(nextWorld, zoom));
      }}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
    >
      {tiles.map((tile) => (
        <img
          key={`${zoom}:${tile.x}:${tile.y}`}
          src={`https://tile.openstreetmap.org/${zoom}/${tile.tileX}/${tile.y}.png`}
          alt=""
          draggable={false}
          className="pointer-events-none absolute size-64 max-w-none"
          style={{ left: tile.left, top: tile.top }}
        />
      ))}

      {person.home &&
        (() => {
          const point = screenPoint({
            latitude: person.home.latitude,
            longitude: person.home.longitude,
          });
          const diameter = Math.max(
            10,
            (radiusMeters * 2) / metersPerPixel(person.home.latitude, zoom),
          );
          return (
            <>
              <div
                className="pointer-events-none absolute rounded-full border-2 border-emerald-600/80 bg-emerald-500/15"
                style={{
                  left: point.left,
                  top: point.top,
                  width: diameter,
                  height: diameter,
                  transform: "translate(-50%, -50%)",
                }}
              />
              <div
                className="pointer-events-none absolute z-20 grid size-9 place-items-center rounded-full border-[3px] border-white bg-slate-950 text-white shadow-lg"
                style={{ left: point.left, top: point.top, transform: "translate(-50%, -50%)" }}
                title="Moradia"
              >
                <Home className="size-4" />
              </div>
            </>
          );
        })()}

      {mappedPunches.map((punch, index) => {
        const point = screenPoint({ latitude: punch.latitude, longitude: punch.longitude });
        const meters = person.home
          ? distanceMeters(
              punch.latitude,
              punch.longitude,
              person.home.latitude,
              person.home.longitude,
            )
          : null;
        const near = meters !== null && meters <= radiusMeters;
        return (
          <div
            key={punch.point_id}
            className={cn(
              "pointer-events-none absolute z-10 grid size-8 place-items-center rounded-full border-[3px] border-white text-[10px] font-black text-white shadow-lg",
              near ? "bg-emerald-600" : "bg-primary",
            )}
            style={{ left: point.left, top: point.top, transform: "translate(-50%, -50%)" }}
            title={punch.location ?? "Batida"}
          >
            {index + 1}
          </div>
        );
      })}

      {!fitPoints.length && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-card/85 p-8 text-center text-xs text-muted-foreground">
          Nenhuma coordenada disponível para montar o mapa.
        </div>
      )}

      <div className="absolute left-3 top-3 z-40 grid gap-1 rounded-xl border border-border bg-card/95 p-1.5 shadow-card">
        <button
          type="button"
          className="grid size-9 place-items-center rounded-lg hover:bg-secondary"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => changeZoom(1)}
          aria-label="Aumentar zoom"
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          className="grid size-9 place-items-center rounded-lg hover:bg-secondary"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => changeZoom(-1)}
          aria-label="Diminuir zoom"
        >
          <Minus className="size-4" />
        </button>
        <button
          type="button"
          className="grid size-9 place-items-center rounded-lg hover:bg-secondary"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={fit}
          aria-label="Enquadrar pontos"
          title="Enquadrar pontos"
        >
          <LocateFixed className="size-4" />
        </button>
      </div>

      <div className="absolute bottom-1.5 right-1.5 z-40 rounded bg-white/90 px-1.5 py-0.5 text-[9px] text-slate-700">
        ©{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="underline"
          onPointerDown={(event) => event.stopPropagation()}
        >
          OpenStreetMap
        </a>
      </div>
    </div>
  );
}
