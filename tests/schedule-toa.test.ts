import { readFile } from "node:fs/promises";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  buildScheduleToa,
  parseToaProfiles,
  TOA_HEADERS,
  TOA_PERSON_SHIFT,
} from "../src/lib/schedule-toa";
import { buildScheduleToaWorkbook, readScheduleToaCatalog } from "../src/lib/schedule-toa-xlsx";
import type { ScheduleUpload } from "../src/lib/types";

function schedule(overrides: Partial<ScheduleUpload> = {}): ScheduleUpload {
  return {
    id: "toa-sample",
    city: "natal",
    sector: "adesao-servico",
    schedule_month: "2026-11-01",
    source_file: "Escala de teste.xlsx",
    source_sheet: "Novembro",
    employee_count: 1,
    entry_count: 9,
    payload: {
      dates: ["2026-10-31", "2026-11-01", "2026-12-01", "2026-12-02"],
      codes: ["M. 1", "Folga", "T. 5", "T. 2", "AT", "Férias", "P"],
      people: [
        {
          login: "z11",
          name: "Técnico Oficial",
          jobTitle: "Técnico",
          assignments: {
            "2026-10-31": "T. 1",
            "2026-11-01": "M. 1",
            "2026-11-02": "Folga",
            "2026-11-03": "T. 5",
            "2026-11-04": "T. 2",
            "2026-11-05": "AT",
            "2026-11-06": "Férias",
            "2026-11-07": "P",
            "2026-12-01": "M. 1",
            "2026-12-02": "FORA DO RECORTE",
          },
        },
      ],
    },
    imported_by: null,
    imported_at: "",
    updated_at: "",
    ...overrides,
  };
}

const oldRows = [
  [
    "Nº",
    "Cidade",
    "Estado",
    "LOGIN",
    "Nome",
    "Nome do Bucket",
    "ÁREAPADRÃO",
    "TELEFONE",
    "SKILL",
    "CEP",
    "ESCALA",
    "01/10",
  ],
  [
    1,
    "Parnamirim",
    "RN",
    "Z11",
    "Nome da planilha anterior",
    "PWM-DMV",
    "PWM-AREA01",
    "84900000000",
    "SKILL DE TESTE",
    "01234567",
    "0740-1700 ALMOÇO 12-14",
    "Não copiar",
  ],
];
const profiles = parseToaProfiles(oldRows);

describe("Compilado TOA da escala selecionada", () => {
  it("mantém o calendário da escala e usa o cadastro apenas nos dados do próprio login", () => {
    const plan = buildScheduleToa(schedule(), { profiles });
    expect(plan.dates).toHaveLength(31);
    expect(plan.dates[0]).toBe("2026-11-01");
    expect(plan.dates.at(-1)).toBe("2026-12-01");
    expect(plan.people[0]).toMatchObject({
      name: "Técnico Oficial",
      login: "Z11",
      city: "PARNAMIRIM",
      state: "RN",
      cep: "01234567",
      matched: true,
    });
    expect(plan.people[0]?.marks).not.toContain("Não copiar");
    expect(plan.people[0]?.marks).not.toContain("FORA DO RECORTE");
    expect(plan.missingShifts).toEqual(["P"]);
    expect(plan.rules).toContainEqual({ code: "T. 2", shift: "08:00-12:00" });
    expect(plan.rules).toContainEqual({ code: "M. 1", shift: TOA_PERSON_SHIFT });
    expect(plan.needsReview).toBe(true);
  });

  it("preenche a coluna ESCALA com o padrão informado só quando não há horário no cadastro", () => {
    const input = schedule();
    expect(buildScheduleToa(input).people[0]?.shift).toBe("0800-1720 ALMOÇO 13-14");
    expect(buildScheduleToa(input, { profiles }).people[0]?.shift).toBe("0740-1700 ALMOÇO 12-14");
    expect(buildScheduleToa(input, undefined, "09:00-18:00 ALMOÇO 12-13").people[0]?.shift).toBe(
      "09:00-18:00 ALMOÇO 12-13",
    );
    expect(
      buildScheduleToa(input, { profiles: [{ ...profiles[0]!, shift: "" }] }).people[0]?.shift,
    ).toBe("0800-1720 ALMOÇO 13-14");
    expect(
      buildScheduleToa(input, {
        profiles: [{ ...profiles[0]!, shift: "08:00-17:20 ALMOÇO 13-14" }],
      }).people[0]?.shift,
    ).toBe("0800-1720 ALMOÇO 13-14");
  });

  it("trata bucket vazio como ausente e aceita o preenchimento sem cadastro", () => {
    const input = schedule();
    const catalog = { profiles: [{ ...profiles[0]!, bucket: "  " }] };
    const blank = buildScheduleToa(input, catalog, undefined, "   ");
    expect(blank.people[0]?.bucket).toBe("");
    expect(blank.missingProfiles).toBe(1);

    const filled = buildScheduleToa(input, catalog, undefined, "  NTL-PADRAO  ");
    expect(filled.people[0]?.bucket).toBe("NTL-PADRAO");
    expect(filled.missingProfiles).toBe(0);
    expect(buildScheduleToa(input, undefined, undefined, "NTL-PADRAO").people[0]?.bucket).toBe(
      "NTL-PADRAO",
    );
  });

  it.each([
    ["NTL-PADRAO", "NTL-PADRAO"],
    ["", null],
  ])("exporta %j como bucket padrão sem sobrescrever o cadastro", async (bucket, expected) => {
    const input = schedule();
    input.payload.people.push({ ...input.payload.people[0]!, login: "Z22", name: "Outro Técnico" });
    const plan = buildScheduleToa(input, { profiles }, undefined, bucket);
    const workbook = await buildScheduleToaWorkbook(input, plan);
    const output = new ExcelJS.Workbook();
    await output.xlsx.load(await workbook.xlsx.writeBuffer());
    const main = output.getWorksheet("COMPILADO")!;
    expect(main.getCell("F1").value).toBe("Nome do Bucket");
    expect(main.getCell("F2").value).toBe("PWM-DMV");
    expect(main.getCell("F5").value).toBe(expected);
  });

  it.each(["adesao", "adesao-servico", "desconexao"])(
    "exporta o padrão sem dois-pontos na coluna ESCALA para %s",
    async (sector) => {
      const input = schedule({ sector });
      const workbook = await buildScheduleToaWorkbook(input, buildScheduleToa(input));
      const output = new ExcelJS.Workbook();
      await output.xlsx.load(await workbook.xlsx.writeBuffer());
      expect(output.getWorksheet("COMPILADO")?.getCell("I2").value).toBe("0800-1720 ALMOÇO 13-14");
    },
  );

  it.each(["vt", "mdu", "mossoro", "instalacao", "servico"])(
    "não aplica o padrão de Adesão e Desconexão a %s",
    (sector) => {
      const input = schedule({ sector });
      expect(buildScheduleToa(input).people[0]?.shift).toBe("");
      expect(buildScheduleToa(input, { profiles }).people[0]?.shift).toBe("0740-1700 ALMOÇO 12-14");
    },
  );

  it("não usa os horários de Natal na VT de outra cidade ou um cadastro com cidade incompatível", () => {
    const natal = buildScheduleToa(schedule({ sector: "vt" }), { profiles });
    expect(natal.rules).toContainEqual({ code: "T. 2", shift: "10:00-19:48 ALMOÇO 13-14" });
    const recife = buildScheduleToa(schedule({ city: "recife", sector: "instalacao" }), {
      profiles,
    });
    expect(recife.people[0]).toMatchObject({
      city: "RECIFE",
      state: "PE",
      bucket: "",
      matched: false,
    });
    expect(recife.missingShifts).toContain("T. 2");
    expect(recife.missingProfiles).toBe(1);
  });

  it("só recupera um login ausente com um nome único e não troca um login existente", () => {
    const data = schedule();
    const profile = { ...profiles[0]!, name: "Tecnico Oficial" };
    const original = data.payload.people[0]!;
    const changed = {
      ...data,
      payload: { ...data.payload, people: [{ ...original, login: "Z22" }] },
    };
    expect(buildScheduleToa(changed, { profiles: [profile] }).people[0]).toMatchObject({
      login: "Z22",
      bucket: "",
    });
    const missing = {
      ...data,
      payload: { ...data.payload, people: [{ ...original, login: undefined }] },
    };
    expect(buildScheduleToa(missing, { profiles: [profile] }).people[0]?.login).toBe("Z11");
    expect(
      buildScheduleToa(missing, { profiles: [profile, { ...profile, login: "Z44" }] }).people[0]
        ?.login,
    ).toBe("");
  });

  it("gera um XLSX com as três linhas e fórmulas, sem telefone nem skill em nenhuma aba", async () => {
    const input = schedule();
    const plan = buildScheduleToa(input, { profiles });
    const original = await buildScheduleToaWorkbook(input, plan);
    const bytes = await original.xlsx.writeBuffer();
    const output = new ExcelJS.Workbook();
    await output.xlsx.load(bytes);
    const main = output.getWorksheet("COMPILADO")!;
    expect(output.worksheets.map((s) => s.name)).toEqual(["COMPILADO", "escala", "Turnos TOA"]);
    expect(Array.from({ length: 9 }, (_, i) => main.getCell(1, i + 1).value)).toEqual(TOA_HEADERS);
    expect(main.getCell("J1").value).toEqual(new Date("2026-11-01T00:00:00Z"));
    expect(main.getCell("J2").formula).toContain("VLOOKUP");
    expect(main.getCell("J2").result).toBe("0740-1700 ALMOÇO 12-14");
    expect(main.getCell("J3").result).toBe("PWM-AREA01");
    expect(main.getCell("J4").result).toBe("01234567");
    expect(main.getCell("K2").result).toBe("FOLGA");
    expect(main.getCell("L3").result).toBe("NTL-AREA01_NTL-AREA02_NTL-AREA03_PWM-AREA01_DMV");
    expect(main.getCell("M2").result).toBe("08:00-12:00");
    expect(main.getCell("N2").result).toBe("ATESTADO");
    expect(main.getCell("O2").result).toBe("FÉRIAS");
    expect(main.getCell("P2").result).toBe("P");
    expect(output.getWorksheet("escala")?.getCell("K2").value).toBeNull();
    expect(main.getCell("Q2").result ?? "").toBe("");
    expect(main.getCell("Q3").result ?? "").toBe("");
    expect(main.getCell("J5").value).toBeNull();
    expect(main.getCell("D4").master.address).toBe("D2");
    for (const sheet of output.worksheets) {
      sheet.eachRow((row) =>
        row.eachCell((cell) => {
          expect(String(cell.value ?? "")).not.toMatch(/TELEFONE|84900000000|SKILL/);
        }),
      );
    }

    const catalog = await readScheduleToaCatalog(
      new File([bytes as BlobPart], "compilado-toa.xlsx"),
    );
    expect(catalog.profiles).toHaveLength(1);
    expect(catalog.profiles[0]).toMatchObject({ login: "Z11", cep: "01234567" });
    expect(catalog.rules).toMatchObject({ city: "natal", sector: "adesao-servico" });
  }, 20_000);
});

const templateDir = process.env["TOA_TEMPLATE_DIR"];
describe.skipIf(!templateDir)("cadastros dos cinco modelos TOA fornecidos", () => {
  it.each([
    ["Compilado TOA DESCONEXÃO Novembro 2026.xlsx", "natal", "desconexao"],
    ["Compilado TOA MDU Novembro 2026.xlsx", "natal", "mdu"],
    ["Compilado TOA MOSSORÓ  Novembro 2026.xlsx", "mossoro", "mossoro"],
    ["Compilado TOA VT Novembro 2026.xlsx", "natal", "vt"],
    ["Compilado_TOA_INSTALACAO_Novembro_2026.xlsx", "natal", "adesao-servico"],
  ])(
    "lê o cadastro de %s sem copiar dias, telefone ou skill",
    async (name, city, sector) => {
      const bytes = await readFile(join(templateDir!, name));
      const catalog = await readScheduleToaCatalog(new File([Uint8Array.from(bytes)], name));
      const profile = catalog.profiles.find(
        (row) => row.bucket && row.area && row.cep && row.shift,
      )!;
      expect(profile).toBeDefined();
      expect(Object.keys(profile).sort()).toEqual([
        "area",
        "bucket",
        "cep",
        "city",
        "login",
        "name",
        "shift",
        "state",
      ]);
      const input = schedule({ city, sector });
      input.payload.people[0]!.login = profile.login;
      const plan = buildScheduleToa(input, catalog);
      expect(plan.matchedProfiles).toBe(1);
      expect(plan.people[0]?.marks[1]).toBe("Folga");
      expect(plan.people[0]?.bucket).toBe(profile.bucket);
    },
    20_000,
  );
});
