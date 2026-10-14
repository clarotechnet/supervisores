import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  qqMarkup,
  tcMarkup,
  referenceToolbar,
  qqStyle,
  tcStyle,
} from "../src/components/quality/reference/templates";
const source = (name: string) =>
  readFileSync(new URL(`../src/components/quality/reference/${name}`, import.meta.url), "utf8");
describe("visual original integrado", () => {
  it("mantém os três modos e os controles de apresentação do HTML", () => {
    for (const id of [
      "goQQ",
      "goGeneral",
      "goTC",
      "goSupervisors",
      "goFS",
      "goSlides",
      "slidePlayer",
      "unitPicker",
      "monthPicker",
      "datePicker",
    ])
      expect(referenceToolbar).toContain(`id="${id}"`);
    expect(qqMarkup).toContain('id="qqGeneralView"');
    expect(tcMarkup).toContain('id="panelView"');
    expect(tcMarkup).toContain('id="dailyView"');
  });
  it("não incorpora os dados pessoais nem executa HTML importado", () => {
    for (const markup of [qqMarkup, tcMarkup, referenceToolbar]) {
      expect(markup).not.toMatch(/<iframe\b|<script\b|javascript:|\son\w+=/i);
      expect(markup).not.toMatch(/[A-Za-z0-9+/]{5000}/);
    }
    for (const file of ["qq-engine.js", "tc-engine.js"]) {
      const engine = source(file);
      expect(engine).not.toMatch(/\beval\s*\(|new Function\s*\(|\bfetch\s*\(/);
      expect(engine).not.toMatch(/[A-Za-z0-9+/]{5000}/);
      expect(engine).toContain("e2a41044c855276006e3d977a81bbd10ca220f96a720b7dfedf1f6888fde7dd2");
      expect(engine).toContain("window.loadProjectData");
      expect(engine).toContain("environment.importFile");
    }
  });
  it("preserva os gráficos SVG originais e os detalhamentos", () => {
    expect(source("qq-engine.js")).toContain("function barsWeekly(");
    expect(source("qq-engine.js")).toContain("function qqGeneralBars(");
    expect(source("qq-engine.js")).toContain("function qqOpenOrders(");
    expect(source("tc-engine.js")).toContain("function svChart(");
    expect(source("tc-engine.js")).toContain("tcProjectionFor");
  });
  it("isola o CSS sem corromper classes que contêm body", () => {
    expect(qqStyle).toContain(".modal-body");
    expect(qqStyle).not.toContain("modal-.reference-body");
    expect(qqStyle).toContain(".reference-body.qq-general");
    expect(qqStyle).toContain("var(--reference-width)");
    expect(qqStyle).toContain("@container quality-frame");
  });
  it("oculta somente o cabeçalho auxiliar e os controles de TC durante a apresentação", () => {
    const css = source("tc-presentation.css");
    expect(css).toContain(".reference-body:is(.presentation-mode, .slides-frame-active)");
    expect(css).toContain("#panelView > .tablecard > .tabletop");
    expect(css).toContain("#tcSupervisorControls");
    expect(css).toContain("display: none !important");
    expect(css).not.toMatch(/#tcResults|#tcProjectionToolbar|#kCert|\.tablewrap/);
    expect(tcMarkup).toContain("Resultado por técnico");
    expect(tcMarkup).toContain("Clique no indicador para consultar os contratos ofensores");
  });
  it("encaminha importações ao serviço e não limpa o histórico pela tela legada", () => {
    expect(source("qq-engine.js")).toContain("$('clr').hidden=true");
    expect(source("tc-engine.js")).toContain("$('#btnClear').hidden=true");
    expect(source("qq-engine.js")).toContain("$('file').disabled=true");
    expect(source("tc-engine.js")).toContain("$('#fileInput').disabled=true");
    expect(source("qq-engine.js")).toContain("const input=e.currentTarget,files=");
    expect(source("tc-engine.js")).toContain("const input=e.currentTarget,files=");
  });
});
