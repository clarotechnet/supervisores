import { describe, expect, it } from "vitest";
import { reconcileScheduleSelection } from "../src/lib/schedule-selection";
import { controlDecemberReference } from "../src/lib/schedule-control-december-reference";
import { controlFullName } from "../src/lib/schedule-control-names";

const roster = (people: Array<{ name: string; login?: string }>, id = "official-control") => ({
  id,
  city: "natal",
  sector: "controle-operacional",
  schedule_month: "2026-12-01",
  payload: { people },
});
describe("seleção da equipe após atualizar uma escala", () => {
  it("mantém os 42 colaboradores visíveis ao completar todos os nomes no mesmo registro", () => {
    const old = roster(
      controlDecemberReference().map((person) => ({ name: person.name, login: "47" })),
    );
    const next = roster(
      old.payload.people
        .map((person) => ({ ...person, name: controlFullName(person.name) }))
        .reverse(),
    );
    const before = structuredClone(old);
    expect(
      reconcileScheduleSelection(
        old.payload.people.map((p) => p.name),
        old,
        next,
      ),
    ).toEqual(next.payload.people.map((p) => p.name));
    expect(old).toEqual(before);
  });
  it("preserva somente as pessoas escolhidas com as correspondências explícitas do Controle", () => {
    const old = roster([
      { name: "ANTONIA ELIZIENE", login: "47" },
      { name: "ALEX CAMPOS", login: "47" },
      { name: "RODRIGO PESSOA", login: "47" },
    ]);
    const next = roster(
      old.payload.people.map((person) => ({ ...person, name: controlFullName(person.name) })),
    );
    expect(reconcileScheduleSelection(["ALEX CAMPOS", "ANTONIA ELIZIENE"], old, next)).toEqual([
      "ANTONIA ELIZIENE DO NASCIMENTO",
      "ALEX DA COSTA CAMPOS",
    ]);
  });
  it("acompanha uma correção de nome pelo login único nas demais frentes", () => {
    const old = {
      ...roster([
        { name: "ANA", login: "Z1" },
        { name: "BRUNO", login: "Z2" },
      ]),
      sector: "vt",
    };
    const next = {
      ...roster([
        { name: "BRUNO", login: "Z2" },
        { name: "ANA NOME COMPLETO", login: "Z1" },
      ]),
      sector: "vt",
    };
    expect(reconcileScheduleSelection(["ANA"], old, next)).toEqual(["ANA NOME COMPLETO"]);
  });
  it("não associa pessoas por login compartilhado, vazio ou nome aproximado", () => {
    for (const login of ["47", ""]) {
      const old = {
        ...roster([
          { name: "ANA", login },
          { name: "BRUNO", login },
        ]),
        sector: "vt",
      };
      const next = {
        ...roster([
          { name: "ANA OUTRA PESSOA", login },
          { name: "BRUNO", login },
        ]),
        sector: "vt",
      };
      expect(reconcileScheduleSelection(["ANA"], old, next)).toEqual([]);
    }
  });
  it("não usa um login que se tornou duplicado no cadastro novo", () => {
    const old = roster([
      { name: "ANA", login: "Z1" },
      { name: "BRUNO", login: "Z2" },
    ]);
    const next = roster([
      { name: "ANA COMPLETA", login: "Z1" },
      { name: "BRUNO", login: "Z1" },
    ]);
    expect(reconcileScheduleSelection(["ANA"], old, next)).toEqual([]);
  });
  it("respeita a decisão de deixar a seleção vazia e reinicia a equipe ao mudar de escala", () => {
    const old = roster([{ name: "ANA" }]);
    expect(reconcileScheduleSelection([], old, old)).toEqual([]);
    expect(reconcileScheduleSelection([], old, { ...old, id: "another-month" })).toEqual(["ANA"]);
    expect(reconcileScheduleSelection([], null, old)).toEqual(["ANA"]);
    expect(reconcileScheduleSelection(["ANA"], old, null)).toEqual([]);
  });
  it("inclui novos cadastros quando toda a equipe estava selecionada, preservando subconjuntos", () => {
    const old = roster([{ name: "ANA" }, { name: "BRUNO" }]);
    const next = roster([...old.payload.people, { name: "CARLA" }]);
    expect(reconcileScheduleSelection(["ANA", "BRUNO"], old, next)).toEqual([
      "ANA",
      "BRUNO",
      "CARLA",
    ]);
    expect(reconcileScheduleSelection(["BRUNO"], old, next)).toEqual(["BRUNO"]);
    expect(reconcileScheduleSelection(["ANA"], old, roster([{ name: "BRUNO" }]))).toEqual([]);
  });
  it("não aplica as correspondências de Controle em outras cidades ou frentes", () => {
    const old = { ...roster([{ name: "ALEX CAMPOS" }, { name: "BRUNO" }]), city: "fortaleza" };
    const next = {
      ...roster([{ name: "ALEX DA COSTA CAMPOS" }, { name: "BRUNO" }]),
      city: "fortaleza",
    };
    expect(reconcileScheduleSelection(["ALEX CAMPOS"], old, next)).toEqual([]);
  });
});
