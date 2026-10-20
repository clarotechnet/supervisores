import { useEffect, useRef, useState, type ReactNode } from "react";
import type { QQRecord, TCRecord } from "@/lib/quality-math";
import { emptyQualityFilters, isQQAdhesionUnit, type QualityMode } from "@/lib/quality-scope";
import { normalizeLogin, type QualityLogin } from "@/lib/quality-directory";
import {
  buildQualitySlides,
  QualitySlidePlayer,
  emptyQualityPlayer,
  type QualitySlideSnapshot,
} from "@/lib/quality-slides";
import type { QualityRegistry } from "@/lib/quality";
import { referenceScope } from "./reference-scope";
import { referenceFilters } from "./reference-filters";
import { presentationSupervisorPicker } from "./reference-presentation-toolbar";
import type { ReferenceEngine, ReferenceParent } from "./reference-types";
import { mountQQ } from "./reference/qq-engine";
import { mountTC } from "./reference/tc-engine";
import { referenceToolbar, qqMarkup, qqStyle, tcMarkup, tcStyle } from "./reference/templates";
import tcPresentationStyle from "./reference/tc-presentation.css?inline";
import qqInteractionStyle from "./reference/qq-interactions.css?inline";
import "./reference/toolbar.css";
import "./reference/reference.css";

interface Props {
  importing?: boolean;
  sla?: ((active: boolean, presenting: boolean) => ReactNode) | undefined;
  qq: QQRecord[];
  tc: TCRecord[];
  index: Map<string, QualityLogin>;
  registry: QualityRegistry;
  names: Record<string, string>;
  techMap: unknown;
  nameUpdates: unknown;
  technicalVisit: boolean;
  editable: boolean;
  directory: ReactNode;
  status: ReactNode;
  importFile: (kind: "qq" | "tc", file: File) => Promise<void>;
  importHistory: () => void;
  refresh: () => void;
  onPresentationChange: (on: boolean) => void;
  qqReady: boolean;
  tcReady: boolean;
  presentationReady: boolean;
  requestTC: () => void;
  qqError: string;
  tcError: string;
}
type Screen = "qq" | "general" | "tc" | "supervisors" | "sla";
interface EnginePeriod {
  months: string[];
  dates: { start: string; end: string };
}
interface Runtime {
  qq: ReferenceEngine;
  tc: ReferenceEngine;
  scopes: ReturnType<typeof referenceScope>[];
  screen: Screen;
  explicitQQUnits: boolean;
  sharedMonths: string[] | null;
  loadedTC?: readonly unknown[];
  update: () => void;
  show: (screen: Screen) => void;
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
export function ReferenceQualitySurface(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  const root = useRef<HTMLDivElement>(null),
    runtime = useRef<Runtime | null>(null);
  const [screen, setScreen] = useState<Screen>(props.technicalVisit ? "tc" : "qq");
  const [presenting, setPresenting] = useState(false),
    [playerState, setPlayerState] = useState(emptyQualityPlayer);
  const [pendingSlides, setPendingSlides] = useState(false);
  const [slaOpened, setSlaOpened] = useState(false);
  const session = useRef<{
    qq: unknown;
    tc: unknown;
    qqPeriod: EnginePeriod;
    tcPeriod: EnginePeriod;
  } | null>(null);
  const [player] = useState(
    () =>
      new QualitySlidePlayer({
        capture: () => {
          const r = runtime.current!,
            engine = r.screen === "tc" || latest.current.technicalVisit ? r.tc : r.qq,
            dates = engine.getUnifiedDates();
          const filters = {
            ...emptyQualityFilters(),
            units:
              !latest.current.technicalVisit && r.screen !== "tc" && !r.explicitQQUnits
                ? []
                : engine.getUnifiedUnits().selected,
            months: engine.getUnifiedMonths().selected,
            supervisors: engine.getUnifiedSupervisors().selected,
            start: dates.start,
            end: dates.end,
          };
          return {
            mode: (r.screen === "supervisors" ? "logins" : r.screen) as QualityMode,
            filters,
            front: "ND",
            tcView: "result",
            expanded: false,
          };
        },
        build: (snapshot) =>
          buildQualitySlides(
            latest.current.qq,
            latest.current.tc,
            latest.current.index,
            snapshot,
            latest.current.technicalVisit,
          ),
        show: (slide, snapshot) => {
          const r = runtime.current!;
          if (!session.current) {
            const period = (engine: ReferenceEngine): EnginePeriod => ({
              months: engine.getUnifiedMonths().selected,
              dates: engine.getUnifiedDates(),
            });
            session.current = {
              qqPeriod: period(r.qq),
              tcPeriod: period(r.tc),
              qq: r.qq.technetSlides.begin(),
              tc: r.tc.technetSlides.begin(),
            };
            for (const engine of [r.qq, r.tc]) {
              engine.setUnifiedMonths(snapshot.filters.months);
              engine.setUnifiedDates({ start: snapshot.filters.start, end: snapshot.filters.end });
            }
          }
          r.show(slide.panel);
          const engine = slide.panel === "tc" ? r.tc : r.qq;
          if (!engine.technetSlides.show(slide)) throw Error("Recorte indisponível");
          if (slide.panel !== "tc") {
            r.qq.setUnifiedUnits(
              snapshot.mode !== "tc" && snapshot.filters.units.length
                ? snapshot.filters.units
                : r.qq.getUnifiedUnits().units.filter(isQQAdhesionUnit),
            );
            r.qq.setUnifiedSupervisors(snapshot.filters.supervisors);
          } else if (snapshot.mode === "tc") r.tc.setUnifiedUnits(snapshot.filters.units);
          r.update();
          r.scopes[slide.panel === "tc" ? 1 : 0]!.environment.document.scrollingElement?.scrollTo(
            0,
            0,
          );
          root.current?.focus({ preventScroll: true });
        },
        restore: (snapshot: QualitySlideSnapshot) => {
          const r = runtime.current;
          if (r && session.current) {
            r.qq.technetSlides.restore(session.current.qq);
            r.tc.technetSlides.restore(session.current.tc);
            for (const [engine, period] of [
              [r.qq, session.current.qqPeriod],
              [r.tc, session.current.tcPeriod],
            ] as const) {
              engine.setUnifiedMonths(period.months);
              engine.setUnifiedDates(period.dates);
            }
          }
          session.current = null;
          if (r) {
            r.show(snapshot.mode === "logins" ? "supervisors" : snapshot.mode);
            r.update();
          }
        },
        change: setPlayerState,
        error: () => {
          const el = root.current?.querySelector<HTMLElement>("#slidesFeedback");
          if (el) {
            el.textContent = "Apresentação encerrada. Os filtros foram restaurados.";
            el.hidden = false;
          }
        },
      }),
  );
  useEffect(() => {
    const el = root.current!;
    const header = el.querySelector<HTMLElement>(".reference-header")!;
    header.innerHTML = referenceToolbar;
    header
      .querySelector("#goTC")!
      .insertAdjacentHTML("afterend", '<button id="goSLA" type="button">SLA Garantia</button>');
    header
      .querySelector("#goSlides")!
      .insertAdjacentHTML("beforebegin", presentationSupervisorPicker);
    const filters = referenceFilters(header);
    const $ = (id: string) => el.querySelector<HTMLElement>(`#${id}`)!;
    // Engine startup calls the parent to refresh the toolbar before both
    // engines exist; that first callback is deliberately ignored by update().
    // eslint-disable-next-line prefer-const
    let r: Runtime;
    const current = () => (r?.screen === "tc" || latest.current.technicalVisit ? r.tc : r.qq);
    const update = () => {
      if (!r) return;
      for (const id of ["unitPicker", "monthPicker", "datePicker", "supervisorPicker"])
        $(id).hidden =
          r.screen === "sla" || (id === "supervisorPicker" && r.screen === "supervisors");
      $("goSLA").classList.toggle("active", r.screen === "sla");
      if (r.screen === "sla") {
        for (const id of ["goQQ", "goGeneral", "goTC", "goSupervisors"])
          $(id).classList.remove("active");
        return;
      }
      const engine = current(),
        units = engine.getUnifiedUnits(),
        period = engine.getUnifiedMonths(),
        dates = engine.getUnifiedDates();
      $("supervisorPicker").hidden = r.screen === "supervisors";
      if (el.classList.contains("presenting") && r.screen !== "supervisors") {
        const supervisors = engine.getUnifiedSupervisors();
        $("supervisorPickerLabel").textContent = !supervisors.selected.length
          ? "Todos os supervisores"
          : supervisors.selected.length === 1
            ? supervisors.selected[0]!
            : `${supervisors.selected.length} supervisores`;
        $("supervisorPicker").querySelector("summary")!.title =
          supervisors.selected.join(" / ") || "Filtrar por supervisor";
        // Retain selected teams with no records in a new city/period, so the user
        // sees an empty result instead of silently broadening back to everyone.
        const supervisorOptions = new Map(supervisors.supervisors.map((s) => [s.name, s.count]));
        for (const name of supervisors.selected)
          if (!supervisorOptions.has(name)) supervisorOptions.set(name, 0);
        const supervisorMenu = $("supervisorOptions");
        const focusedSupervisor = supervisorMenu.contains(document.activeElement)
          ? (document.activeElement as HTMLInputElement).dataset["supervisor"] || "*"
          : null;
        const supervisorScroll = supervisorMenu.scrollTop;
        supervisorMenu.innerHTML =
          `<label><input type="checkbox" data-supervisor-all ${!supervisors.selected.length ? "checked" : ""}>Todos os supervisores</label>` +
          [...supervisorOptions]
            .sort(
              ([a], [b]) =>
                Number(a === "Sem supervisor") - Number(b === "Sem supervisor") ||
                a.localeCompare(b, "pt-BR"),
            )
            .map(
              ([name, count]) =>
                `<label><input type="checkbox" data-supervisor="${escape(name)}" ${supervisors.selected.includes(name) ? "checked" : ""}><span>${escape(name)}</span><small>${count}</small></label>`,
            )
            .join("") +
          (!supervisorOptions.size
            ? '<p class="unit-hint">Sem equipes no recorte selecionado.</p>'
            : "");
        supervisorMenu.scrollTop = supervisorScroll;
        if (focusedSupervisor !== null)
          [...supervisorMenu.querySelectorAll<HTMLInputElement>("input")]
            .find((input) => (input.dataset["supervisor"] || "*") === focusedSupervisor)
            ?.focus({ preventScroll: true });
      }
      const multipleTC = units.multiple && (r.screen === "tc" || latest.current.technicalVisit);
      const allUnits =
        !units.selected.length || units.units.every((unit) => units.selected.includes(unit));
      $("unitPickerLabel").textContent =
        !latest.current.technicalVisit && r.screen !== "tc" && !r.explicitQQUnits
          ? "Adesão"
          : multipleTC && units.selected.length && allUnits
            ? "Todas as unidades"
            : units.selected.length === 1
              ? units.selected[0]!
              : units.selected.length
                ? `${units.selected.length} unidades`
                : latest.current.technicalVisit
                  ? "Visita técnica"
                  : "Todas as unidades";
      $("unitOptions").innerHTML =
        `<label><input type="${units.multiple ? "checkbox" : "radio"}" name="reference-units" data-unit="*" ${allUnits ? "checked" : ""}>Todas as unidades</label>` +
        units.units
          .map(
            (u) =>
              `<label><input type="${units.multiple ? "checkbox" : "radio"}" name="reference-units" data-unit="${escape(u)}" ${(!multipleTC && units.multiple && !units.selected.length) || units.selected.includes(u) ? "checked" : ""}>${escape(u)}</label>`,
          )
          .join("") +
        (r.screen !== "tc" && !latest.current.technicalVisit
          ? '<button type="button" data-adhesion-default>Voltar à Adesão</button>'
          : "");
      $("monthPickerLabel").textContent = !period.months.length
        ? "Sem meses"
        : !period.selected.length || period.selected.length === period.months.length
          ? "Todos os meses"
          : period.selected.length === 1
            ? `${period.selected[0]!.slice(5)}/${period.selected[0]!.slice(0, 4)}`
            : `${period.selected.length} meses`;
      const allMonths =
        !period.selected.length || period.months.every((m) => period.selected.includes(m));
      $("monthOptions").innerHTML =
        `<label><input type="checkbox" data-month="*" ${allMonths ? "checked" : ""}>Todos os meses</label>` +
        period.months
          .map(
            (m) =>
              `<label><input type="checkbox" data-month="${m}" ${allMonths || period.selected.includes(m) ? "checked" : ""}>${m.slice(5)}/${m.slice(0, 4)}</label>`,
          )
          .join("");
      $("datePickerLabel").textContent =
        dates.start || dates.end ? "Datas · filtro ativo" : "Datas";
      (el.querySelector("#periodStart") as HTMLInputElement).value = dates.start;
      (el.querySelector("#periodEnd") as HTMLInputElement).value = dates.end;
      for (const [id, s] of [
        ["goQQ", "qq"],
        ["goGeneral", "general"],
        ["goTC", "tc"],
        ["goSupervisors", "supervisors"],
      ])
        $(id!).classList.toggle("active", r.screen === s);
      filters.reposition();
    };
    const show = (next: Screen) => {
      if (latest.current.technicalVisit && (next === "qq" || next === "general" || next === "sla"))
        return;
      filters.closeAll();
      r.screen = next;
      if (next === "sla") setSlaOpened(true);
      setScreen(next);
      if (next === "tc" || next === "supervisors") latest.current.requestTC();
      $("referenceQQ").hidden = next !== "qq" && next !== "general";
      $("referenceTC").hidden = next !== "tc";
      $("referenceDirectory").hidden = next !== "supervisors";
      $("referenceSLA").hidden = next !== "sla";
      $("goSlides").hidden =
        next === "sla" || !el.classList.contains("presenting") || player.state.active;
      r.qq.setUnifiedQQView?.(next === "general" ? "general" : "front");
      current().redraw();
      update();
    };
    const parent: ReferenceParent = {
      getSupervisorMap: () => latest.current.registry,
      refreshUnifiedMonth: update,
      setUnifiedMonths: (months) => {
        r.sharedMonths = months;
        r.qq.setUnifiedMonths(months);
        r.tc.setUnifiedMonths(months);
        update();
      },
      setUnifiedDates: (dates) => {
        r.qq.setUnifiedDates(dates);
        r.tc.setUnifiedDates(dates);
        update();
      },
      applyUnifiedDates: (dates) => parent.setUnifiedDates(dates),
      clearUnifiedDates: () => {
        r.qq.setUnifiedDates({ start: "", end: "" });
        r.tc.setUnifiedDates({ start: "", end: "" });
        update();
      },
      show: (next) => {
        setPendingSlides(false);
        player.stop();
        show(
          next === "supervisors"
            ? "supervisors"
            : next === "tc"
              ? "tc"
              : next === "general"
                ? "general"
                : "qq",
        );
      },
    };
    const loadFile: Props["importFile"] = (kind, file) => latest.current.importFile(kind, file);
    const scopes = [
      referenceScope(
        $("referenceQQ"),
        `${qqStyle}\n${qqInteractionStyle}`,
        qqMarkup,
        parent,
        props.editable,
        loadFile,
      ),
      referenceScope(
        $("referenceTC"),
        `${tcStyle}\n${tcPresentationStyle}`,
        tcMarkup,
        parent,
        props.editable,
        loadFile,
      ),
    ];
    r = {
      qq: mountQQ(scopes[0]!.environment),
      tc: mountTC({ ...scopes[1]!.environment, technicalVisit: props.technicalVisit }),
      scopes,
      screen: props.technicalVisit ? "tc" : "qq",
      explicitQQUnits: false,
      sharedMonths: null,
      update,
      show,
    };
    runtime.current = r;
    for (const [id, next] of [
      ["goQQ", "qq"],
      ["goGeneral", "general"],
      ["goTC", "tc"],
      ["goSLA", "sla"],
      ["goSupervisors", "supervisors"],
    ] as const)
      $(id).onclick = () => {
        setPendingSlides(false);
        player.stop();
        show(next);
      };
    if (props.technicalVisit) {
      $("goSLA").hidden = true;
      $("goQQ").hidden = true;
      $("goGeneral").hidden = true;
    }
    $("unitOptions").onchange = (event) => {
      const input = event.target as HTMLInputElement,
        engine = current(),
        u = engine.getUnifiedUnits();
      const value = input.dataset["unit"];
      if (!value) return;
      if (r.screen !== "tc") r.explicitQQUnits = true;
      const multipleTC = u.multiple && (r.screen === "tc" || latest.current.technicalVisit);
      const activeUnits = u.selected.length ? u.selected : multipleTC ? [] : u.units;
      const selected =
        value === "*"
          ? u.multiple && !multipleTC
            ? u.units
            : []
          : u.multiple
            ? input.checked
              ? [...activeUnits, value]
              : activeUnits.filter((x) => x !== value)
            : [value];
      engine.setUnifiedUnits(selected);
      update();
    };
    $("unitOptions").onclick = (event) => {
      if ((event.target as HTMLElement).closest("[data-adhesion-default]")) {
        r.explicitQQUnits = false;
        r.qq.setUnifiedUnits(r.qq.getUnifiedUnits().units.filter(isQQAdhesionUnit));
        update();
      }
    };
    $("monthOptions").onchange = (event) => {
      const input = event.target as HTMLInputElement,
        value = input.dataset["month"],
        months = current().getUnifiedMonths();
      if (!value) return;
      const selected =
        value === "*"
          ? months.months
          : input.checked
            ? [...months.selected, value]
            : (months.selected.length ? months.selected : months.months).filter((m) => m !== value);
      if (!selected.length) return;
      r.sharedMonths = selected;
      r.qq.setUnifiedMonths(selected);
      r.tc.setUnifiedMonths(selected);
      update();
    };
    $("supervisorOptions").onchange = (event) => {
      const input = event.target as HTMLInputElement;
      const engine = current();
      if (input.hasAttribute("data-supervisor-all")) engine.setUnifiedSupervisors([]);
      else if (input.dataset["supervisor"]) {
        const value = input.dataset["supervisor"]!;
        const selected = engine.getUnifiedSupervisors().selected;
        engine.setUnifiedSupervisors(
          input.checked ? [...selected, value] : selected.filter((name) => name !== value),
        );
      }
      update();
    };
    $("periodApply").onclick = () => {
      const dates = {
        start: (el.querySelector("#periodStart") as HTMLInputElement).value,
        end: (el.querySelector("#periodEnd") as HTMLInputElement).value,
      };
      if (dates.start && dates.end && dates.start > dates.end) {
        $("periodError").textContent = "A data inicial não pode ser maior que a final.";
        return;
      }
      $("periodError").textContent = "";
      parent.setUnifiedDates(dates);
      (el.querySelector("#datePicker") as HTMLDetailsElement).open = false;
    };
    $("periodClear").onclick = () => parent.clearUnifiedDates();
    $("goAudit").onclick = () => {
      player.stop();
      if (props.technicalVisit) return;
      show("general");
      r.qq.openDataAudit?.(latest.current.tc.length);
      (el.querySelector("#unitPicker") as HTMLDetailsElement).open = false;
    };
    if (props.technicalVisit) $("goAudit").hidden = true;
    const footer = el.querySelector(".unit-menu-footer")!;
    const refresh = realButton("Atualizar base", () => latest.current.refresh());
    footer.append(refresh);
    if (props.editable && !props.technicalVisit)
      footer.append(realButton("Importar histórico HTML", () => latest.current.importHistory()));
    const presentation = async () => {
      filters.closeAll();
      const on = !el.classList.contains("presenting");
      if (!on) {
        setPendingSlides(false);
        player.stop();
      }
      el.classList.toggle("presenting", on);
      setPresenting(on);
      latest.current.onPresentationChange(on);
      r.qq.setUnifiedPresentation(on);
      r.tc.setUnifiedPresentation(on);
      $("goFS").textContent = on ? "Sair da apresentação" : "Modo apresentação";
      $("goSlides").hidden = !on;
      update();
      try {
        if (on) await document.documentElement.requestFullscreen();
        else if (document.fullscreenElement) await document.exitFullscreen();
      } catch {
        /* Layout works even without browser fullscreen. */
      }
      requestAnimationFrame(() => current().redraw());
    };
    $("goFS").onclick = () => void presentation();
    $("goSlides").onclick = () => {
      if (r.screen === "sla") return;
      latest.current.requestTC();
      setPendingSlides(true);
    };
    $("slidesPause").onclick = () => (player.state.paused ? player.resume() : player.pause());
    $("slidesNext").onclick = () => player.next();
    $("slidesPrevious").onclick = () => player.previous();
    $("slidesStop").onclick = () => {
      setPendingSlides(false);
      player.stop();
    };
    const key = (event: KeyboardEvent) => {
      const target = event.composedPath()[0] as HTMLElement;
      if (
        event.key === "Escape" &&
        !r.qq.isModalOpen() &&
        !r.tc.isModalOpen() &&
        !el.querySelector(".sla-surface")?.shadowRoot?.querySelector("dialog[open]") &&
        el.classList.contains("presenting") &&
        !document.fullscreenElement
      )
        void presentation();
      if (!player.state.active) return;
      if (target.closest?.("input,textarea,select,summary,[contenteditable='true']")) return;
      if (target.closest?.("button,[role='button']")) {
        if (
          ["Enter", " "].includes(event.key) &&
          !target.closest(".top") &&
          !r.qq.isModalOpen() &&
          !r.tc.isModalOpen()
        )
          player.pause();
        return;
      }
      if (r.qq.isModalOpen() || r.tc.isModalOpen()) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        player.next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        player.previous();
      } else if (event.key === " ") {
        event.preventDefault();
        if (player.state.paused) player.resume();
        else player.pause();
      }
    };
    const interact = (event: Event) => {
      const target = event.composedPath()[0] as HTMLElement;
      if (player.state.active && !target.closest?.(".top,[inert]")) player.pause();
    };
    const visibility = () => player.visibility(document.hidden);
    const fullscreen = () => {
      if (!document.fullscreenElement) {
        setPendingSlides(false);
        player.stop();
        el.classList.remove("presenting");
        setPresenting(false);
        latest.current.onPresentationChange(false);
        r.qq.setUnifiedPresentation(false);
        r.tc.setUnifiedPresentation(false);
        $("goFS").textContent = "Modo apresentação";
        filters.closeAll();
        update();
      }
    };
    el.addEventListener("pointerdown", interact, true);
    document.addEventListener("keydown", key, true);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("fullscreenchange", fullscreen);
    update();
    show(r.screen);
    return () => {
      filters.dispose();
      player.dispose();
      session.current = null;
      runtime.current = null;
      scopes.forEach((s) => s.dispose());
      el.removeEventListener("pointerdown", interact, true);
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("fullscreenchange", fullscreen);
      if (el.classList.contains("presenting")) {
        el.classList.remove("presenting");
        setPresenting(false);
        latest.current.onPresentationChange(false);
        if (document.fullscreenElement === document.documentElement)
          void document.exitFullscreen().catch(() => {});
      }
    };
  }, [props.technicalVisit, props.editable, player]);
  useEffect(() => {
    for (const scope of runtime.current?.scopes ?? [])
      for (const input of scope.shadow.querySelectorAll<HTMLInputElement>('input[type="file"]'))
        input.disabled = !props.editable || !!props.importing;
  }, [props.editable, props.importing]);
  useEffect(() => {
    const r = runtime.current;
    if (!r || !props.qqReady) return;
    player.stop();
    r.qq.loadProjectData({
      rows: props.qq.map((row) => ({
        ...row,
        ci: props.index.get(normalizeLogin(row.lt))?.city || row.ci,
      })),
      names: props.names,
    });
    if (!r.explicitQQUnits)
      r.qq.setUnifiedUnits(r.qq.getUnifiedUnits().units.filter(isQQAdhesionUnit));
    r.update();
  }, [props.qq, props.qqReady, props.index, props.names, props.registry, props.editable, player]);
  useEffect(() => {
    const r = runtime.current;
    if (!r || !props.tcReady || (screen !== "tc" && screen !== "supervisors" && !pendingSlides))
      return;
    const inputs = [props.tc, props.index, props.registry, props.techMap, props.nameUpdates];
    if (r.loadedTC?.every((value, index) => value === inputs[index])) return;
    player.stop();
    r.tc.loadProjectData({
      rows: props.tc.map((row) => ({
        ...row,
        city: props.index.get(normalizeLogin(row.login))?.city || row.city,
      })),
      techMap: props.techMap,
      nameUpdates: props.nameUpdates,
    });
    // Preserve the source's distinct initial defaults (QQ latest month, TC all months).
    // Only an explicit shared month choice overrides TC when it is first opened.
    if (r.sharedMonths !== null) r.tc.setUnifiedMonths(r.sharedMonths);
    r.loadedTC = inputs;
    r.update();
  }, [
    props.tc,
    props.tcReady,
    props.index,
    props.registry,
    props.techMap,
    props.nameUpdates,
    props.editable,
    screen,
    pendingSlides,
    player,
  ]);
  useEffect(() => {
    if (!pendingSlides) return;
    const feedback = root.current?.querySelector<HTMLElement>("#slidesFeedback");
    if (!feedback) return;
    feedback.hidden = false;
    feedback.textContent = "Preparando bases completas para os slides…";
    if (props.tcError || (!props.technicalVisit && props.qqError)) {
      feedback.textContent =
        "Não foi possível preparar os slides. Use Atualizar base para tentar novamente.";
      setPendingSlides(false);
      return;
    }
    if (!props.presentationReady) return;
    setPendingSlides(false);
    if (player.start()) feedback.hidden = true;
    else feedback.textContent = "Não há dados nos meses, datas e unidades selecionados.";
  }, [
    pendingSlides,
    props.presentationReady,
    props.tcError,
    props.qqError,
    props.technicalVisit,
    player,
  ]);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const $ = (id: string) => el.querySelector<HTMLElement>(`#${id}`)!;
    $("slidePlayer").hidden = !playerState.active;
    $("goSlides").hidden = !presenting || playerState.active || screen === "sla";
    el.classList.toggle("slides-running", playerState.active);
    el.classList.toggle("slides-paused", playerState.paused);
    for (const id of ["unitPicker", "monthPicker", "datePicker", "supervisorPicker"])
      $(id).toggleAttribute("inert", playerState.active);
    const slide = playerState.deck[playerState.index];
    if (!slide) return;
    $("slidesPanel").textContent =
      slide.panel === "qq"
        ? "PAINEL DE QUEBRAS"
        : slide.panel === "general"
          ? "QQ — VISÃO GERAL"
          : "TÉCNICO CERTIFICADO";
    $("slidesPosition").textContent = `${playerState.index + 1} / ${playerState.deck.length}`;
    $("slidesContext").textContent =
      slide.panel === "general"
        ? "Todas as cidades · visão consolidada"
        : `${slide.city} · ${slide.label}`;
    $("slidesState").textContent = playerState.paused ? "Pausado" : "Automático";
    $("slidesPause").setAttribute(
      "aria-label",
      playerState.paused ? "Continuar slides" : "Pausar slides",
    );
    $("slidesPauseIcon").innerHTML = playerState.paused
      ? '<svg viewBox="0 0 24 24"><path d="m9 5 10 7-10 7Z"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg>';
    const clock = () => {
      const remaining = playerState.paused
        ? playerState.remaining
        : Math.max(0, playerState.deadline - Date.now());
      $("slidesCountdown").textContent = `${Math.ceil(remaining / 1000)} s`;
      $("slidesProgress").style.width =
        `${Math.max(0, Math.min(100, 100 * (1 - remaining / slide.duration)))}%`;
    };
    clock();
    const timer = window.setInterval(clock, 250);
    return () => window.clearInterval(timer);
  }, [playerState, presenting, screen]);
  return (
    <div
      ref={root}
      className="quality-reference"
      data-screen={screen}
      tabIndex={-1}
      aria-label="Painel original de QQ e Técnico Certificado"
    >
      <div className="reference-header" />
      <div className="reference-status">{props.status}</div>
      <div className="reference-workspace">
        {((screen === "qq" || screen === "general") && !props.qqReady) ||
        (screen === "tc" && !props.tcReady) ? (
          <div className="reference-loading" role="status">
            {(screen === "tc" ? props.tcError : props.qqError)
              ? "Não foi possível concluir o carregamento."
              : `Aguarde o carregamento completo de ${screen === "tc" ? "Técnico Certificado" : "QQ"}.`}
            <span>Os indicadores serão exibidos após a conferência dos dados.</span>
            {(screen === "tc" ? props.tcError : props.qqError) && (
              <button type="button" onClick={props.refresh}>
                Tentar novamente
              </button>
            )}
          </div>
        ) : null}
        <div
          id="referenceQQ"
          className="reference-pane"
          hidden={screen !== "qq" && screen !== "general"}
        />
        <div id="referenceTC" className="reference-pane" hidden={screen !== "tc"} />
        <div id="referenceSLA" className="reference-sla" hidden={screen !== "sla"}>
          {slaOpened ? props.sla?.(screen === "sla", presenting) : null}
        </div>
        <div
          id="referenceDirectory"
          className="reference-directory"
          hidden={screen !== "supervisors"}
        >
          {props.directory}
        </div>
      </div>
    </div>
  );
}
function realButton(label: string, onclick: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.onclick = onclick;
  return button;
}
