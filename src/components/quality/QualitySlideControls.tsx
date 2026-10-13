import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QualityPlayerState, QualitySlidePlayer } from "@/lib/quality-slides";

export function QualitySlideControls({
  state,
  player,
}: {
  state: QualityPlayerState;
  player: QualitySlidePlayer;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!state.active || state.paused) return;
    const timer = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(timer);
  }, [state.active, state.paused, state.deadline]);
  const slide = state.deck[state.index];
  if (!state.active || !slide) return null;
  const remaining = state.paused ? state.remaining : Math.max(0, state.deadline - Date.now());
  const label =
    slide.panel === "qq"
      ? "PAINEL DE QUEBRAS"
      : slide.panel === "general"
        ? "QQ — VISÃO GERAL"
        : "TÉCNICO CERTIFICADO";
  return (
    <section
      className="quality-slide-controls"
      aria-label="Controles de slides"
      data-slides-controls
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-primary">
          {label} · {state.index + 1} / {state.deck.length}
        </p>
        <p className="truncate text-sm font-semibold" title={`${slide.city} · ${slide.label}`}>
          {slide.city ? `${slide.city} · ` : ""}
          {slide.label}
        </p>
        <div
          className="mt-2 h-1 overflow-hidden rounded bg-muted"
          role="progressbar"
          aria-label="Progresso do slide"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(100 * (1 - remaining / slide.duration))}
        >
          <div
            className="h-full bg-primary"
            style={{
              width: `${Math.max(0, Math.min(100, 100 * (1 - remaining / slide.duration)))}%`,
            }}
          />
        </div>
      </div>
      <span className="text-xs text-muted-foreground">
        {state.paused ? "Pausado" : "Automático"}
      </span>
      <span className="w-12 text-right text-sm font-bold tabular-nums" aria-label="Tempo restante">
        {Math.ceil(remaining / 1000)} s
      </span>
      <div className="flex gap-1">
        <Button
          size="icon"
          variant="outline"
          aria-label="Slide anterior"
          onClick={() => player.previous()}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          aria-label={state.paused ? "Continuar slides" : "Pausar slides"}
          onClick={() => (state.paused ? player.resume() : player.pause())}
        >
          {state.paused ? <Play className="size-4" /> : <Pause className="size-4" />}
        </Button>
        <Button
          size="icon"
          variant="outline"
          aria-label="Próximo slide"
          onClick={() => player.next()}
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => player.stop()}>
          <Square className="size-3" />
          Encerrar slides
        </Button>
      </div>
    </section>
  );
}
