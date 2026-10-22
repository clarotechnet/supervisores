import { describe, expect, it } from "vitest";
import { createSlaDirectoryPresentation, resolveSlaTechnicians } from "../src/lib/sla-directory";
import type { QualityRegistry } from "../src/lib/quality";

const registry: QualityRegistry = {
  Z1: { name: "João da Conceição", supervisor: "Maria Supervisora" },
  Z2: { name: "Ana Técnica", supervisor: "Pedro Supervisor" },
};
describe("cadastro de técnicos e supervisores no SLA (somente apresentação)", () => {
  it("consulta o login normalizado sem confundir logins de nomes parecidos", () => {
    expect(resolveSlaTechnicians(" z1 ", registry)).toEqual([
      { login: "z1", name: "João da Conceição", supervisor: "Maria Supervisora" },
    ]);
    expect(resolveSlaTechnicians("1", registry)).toEqual([
      { login: "1", name: "", supervisor: "" },
    ]);
  });
  it("mantém os técnicos separados em atendimentos com várias matrículas", () => {
    const people = resolveSlaTechnicians("Z1, Z2, z1", registry);
    expect(people.map((person) => person.name)).toEqual(["João da Conceição", "Ana Técnica"]);
    const labels = createSlaDirectoryPresentation(() => registry);
    expect(labels.text("Z1, Z2")).toContain(
      "João da Conceição (Z1) · Supervisor: Maria Supervisora",
    );
    expect(labels.text("Z1, Z2")).toContain("Ana Técnica (Z2) · Supervisor: Pedro Supervisor");
  });
  it("inclui nome, login e supervisor no HTML sem perder a identidade original", () => {
    const html = createSlaDirectoryPresentation(() => registry).cell("Z1");
    expect(html).toContain("João da Conceição");
    expect(html).toContain("Login: Z1");
    expect(html).toContain("Supervisor: Maria Supervisora");
  });
  it("atualiza os rótulos quando o cadastro muda, sem reimportar o SLA", () => {
    let current = registry;
    const labels = createSlaDirectoryPresentation(() => current);
    expect(labels.text("Z1")).toContain("Maria Supervisora");
    current = { ...registry, Z1: { name: "João Atualizado", supervisor: "Outra Supervisora" } };
    expect(labels.text("Z1")).toContain("João Atualizado");
    expect(labels.text("Z1")).toContain("Outra Supervisora");
    expect(registry.Z1?.supervisor).toBe("Maria Supervisora");
  });
  it("preserva o comportamento anterior para logins sem cadastro", () => {
    const labels = createSlaDirectoryPresentation(() => registry);
    const point = { name: "SEM-CADASTRO", total: 5 };
    expect(labels.text(point.name)).toBe(point.name);
    expect(labels.cell(point.name)).toBe(point.name);
    expect(labels.chart(point)).toBe(point);
  });
  it("não usa nomes ausentes ou placeholders como nome do técnico", () => {
    const labels = createSlaDirectoryPresentation(() => ({
      Z1: { name: "Nome não localizado", supervisor: "Maria" },
    }));
    expect(labels.text("Z1")).toBe("Z1 · Supervisor: Maria");
    expect(labels.cell("Z1")).not.toContain("Nome não localizado");
  });
  it("escapa nomes e supervisores vindos do cadastro", () => {
    const labels = createSlaDirectoryPresentation(() => ({
      Z1: { name: '<img src=x onerror="alert(1)">', supervisor: "A & B <script>" },
    }));
    expect(labels.cell("Z1")).not.toMatch(/<img|<script>/);
    expect(labels.cell("Z1")).toContain("&lt;img");
    expect(labels.cell("Z1")).toContain("A &amp; B &lt;script&gt;");
  });
  it("decora os gráficos sem trocar chaves, linhas ou valores dos cálculos", () => {
    const labels = createSlaDirectoryPresentation(() => registry);
    const rows = [{ tech: "Z1", logs: 2 }];
    const point = Object.freeze({ name: "Z1", rows, total: 3, logs: 2, sla: 20 });
    const decorated = labels.chart(point);
    expect(decorated).toMatchObject(point);
    expect(decorated.rows).toBe(rows);
    expect(decorated.name).toBe("Z1");
    expect(decorated).toHaveProperty("axisLogin", "Z1");
    expect(decorated).toHaveProperty(
      "technicianLabel",
      "João da Conceição (Z1) · Supervisor: Maria Supervisora",
    );
    expect(point).not.toHaveProperty("technicianLabel");
  });
  it("abrevia somente o rótulo do eixo; mantém o texto completo acessível", () => {
    const name = "TÉCNICO COM NOME MUITO EXTENSO QUE NÃO PODE SER PERDIDO";
    const labels = createSlaDirectoryPresentation(() => ({ Z1: { name, supervisor: "Maria" } }));
    const decorated = labels.chart({ name: "Z1" });
    expect(decorated).toHaveProperty("axisName", name.slice(0, 15) + "…");
    expect(labels.text("Z1")).toContain(name);
    expect(labels.cell("Z1")).toContain(name);
  });
});
