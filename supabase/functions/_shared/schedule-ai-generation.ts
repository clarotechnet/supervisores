/** Contrato restrito de composição. Nunca recebe nomes, logins, cargos ou códigos de saúde. */
export type GenerationOption = {
  id: string;
  pendingChecks: number;
  repeatedDuties: number;
  maxDuties: number;
  workloadSpread: number;
  events: Array<{ date: string; planned: number | null; roster: string[] }>;
};
export type GenerationChoiceInput = {
  city: string;
  sector: string;
  month: string;
  options: GenerationOption[];
};
export type GenerationChoice = {
  ok: true;
  source: "generation";
  mode: "ai" | "rules";
  selectedOption: string;
  summary: string;
  note: string;
  writeActions: 0;
};
export class InvalidGenerationInput extends Error {}
const fail = (): never => {
  throw new InvalidGenerationInput("Propostas inválidas para geração assistida.");
};
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : fail();
const exact = (o: Record<string, unknown>, keys: string[]) =>
  Object.keys(o).length === keys.length && Object.keys(o).every((k) => keys.includes(k));
const integer = (v: unknown, max: number): v is number =>
  Number.isInteger(v) && Number(v) >= 0 && Number(v) <= max;
export function validateGenerationChoice(value: unknown): GenerationChoiceInput {
  const row = object(value);
  if (
    !exact(row, ["city", "sector", "month", "options"]) ||
    typeof row["city"] !== "string" ||
    !/^[a-z0-9-]{2,50}$/.test(row["city"]) ||
    typeof row["sector"] !== "string" ||
    !/^[a-z0-9-]{2,80}$/.test(row["sector"]) ||
    typeof row["month"] !== "string" ||
    !/^20\d{2}-(0[1-9]|1[0-2])$/.test(row["month"]) ||
    !Array.isArray(row["options"]) ||
    row["options"].length < 1 ||
    row["options"].length > 3
  )
    return fail();
  const month = row["month"];
  const options = row["options"].map((raw) => {
    const o = object(raw);
    if (
      !exact(o, [
        "id",
        "pendingChecks",
        "repeatedDuties",
        "maxDuties",
        "workloadSpread",
        "events",
      ]) ||
      typeof o["id"] !== "string" ||
      !/^option-[0-2]$/.test(o["id"]) ||
      !integer(o["pendingChecks"], 10000) ||
      !integer(o["repeatedDuties"], 22500) ||
      !integer(o["maxDuties"], 45) ||
      !integer(o["workloadSpread"], 45) ||
      !Array.isArray(o["events"]) ||
      o["events"].length > 20
    )
      return fail();
    const events = o["events"].map((rawEvent) => {
      const e = object(rawEvent);
      if (
        !exact(e, ["date", "planned", "roster"]) ||
        typeof e["date"] !== "string" ||
        !e["date"].startsWith(month + "-") ||
        !/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(e["date"]) ||
        !Number.isFinite(Date.parse(e["date"] + "T12:00:00Z")) ||
        new Date(e["date"] + "T12:00:00Z").toISOString().slice(0, 10) !== e["date"] ||
        (e["planned"] !== null && !integer(e["planned"], 500)) ||
        !Array.isArray(e["roster"]) ||
        e["roster"].length > 500 ||
        !e["roster"].every((k) => typeof k === "string" && /^P[0-4]\d{2}$/.test(k)) ||
        new Set(e["roster"]).size !== e["roster"].length
      )
        return fail();
      if (o["pendingChecks"] === 0 && e["planned"] !== null && e["roster"].length !== e["planned"])
        return fail();
      return {
        date: e["date"],
        planned: e["planned"] as number | null,
        roster: e["roster"] as string[],
      };
    });
    if (new Set(events.map((e) => e["date"])).size !== events.length) return fail();
    return {
      id: o["id"],
      pendingChecks: o["pendingChecks"],
      repeatedDuties: o["repeatedDuties"],
      maxDuties: o["maxDuties"],
      workloadSpread: o["workloadSpread"],
      events,
    };
  });
  if (new Set(options.map((o) => o["id"])).size !== options.length) return fail();
  const events = options[0]!.events.map((e) => [e["date"], e["planned"]]);
  if (
    options.some(
      (o) =>
        JSON.stringify(o["events"].map((e) => [e["date"], e["planned"]])) !==
        JSON.stringify(events),
    )
  )
    return fail();
  return { city: row["city"], sector: row["sector"], month, options };
}
export function rankedGenerationOptions(input: GenerationChoiceInput) {
  const sorted = [...input.options].sort(
    (a, b) =>
      a.pendingChecks - b.pendingChecks ||
      a.repeatedDuties - b.repeatedDuties ||
      a.maxDuties - b.maxDuties ||
      a.workloadSpread - b.workloadSpread ||
      a.id.localeCompare(b.id),
  );
  return sorted.filter((o) => o["pendingChecks"] === sorted[0]!.pendingChecks);
}
export async function chooseGenerationOption(
  input: GenerationChoiceInput,
  config: { key?: string | undefined; model: string; fetcher?: typeof fetch },
): Promise<GenerationChoice> {
  const options = rankedGenerationOptions(input),
    fallback = options[0]!;
  const base: GenerationChoice = {
    ok: true,
    source: "generation",
    mode: "rules",
    selectedOption: fallback.id,
    summary: "Prévia montada pelas regras e pelo histórico sincronizado.",
    note: "",
    writeActions: 0,
  };
  if (!config.key || options.length === 1)
    return {
      ...base,
      note: !config.key
        ? "IA não configurada; geração pelas regras mantida."
        : "Uma proposta distinta disponível; não foi necessário consultar a IA.",
    };
  const abort = new AbortController(),
    timer = setTimeout(() => abort.abort(), 18000);
  try {
    const response = await (config.fetcher || fetch)(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        signal: abort.signal,
        headers: { Authorization: "Bearer " + config.key, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          store: false,
          max_completion_tokens: 700,
          reasoning_effort: "low",
          messages: [
            {
              role: "system",
              content:
                "Escolha a proposta de escala operacional com melhor rodízio. Receberá somente identificadores anônimos e contagens verificadas. Priorize menor repetição em relação ao mês anterior, menor concentração de plantões e equilíbrio. As folgas fixas e restrições já estão preservadas. Escolha somente um id fornecido. A escolha altera apenas uma prévia, sem aprovar, publicar ou gravar no Sheets. Responda em português no schema.",
            },
            { role: "user", content: JSON.stringify({ options }) },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "schedule_generation_choice",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["selectedOption", "summary"],
                properties: {
                  selectedOption: { type: "string", enum: options.map((o) => o["id"]) },
                  summary: { type: "string" },
                },
              },
            },
          },
        }),
      },
    );
    if (!response.ok)
      return {
        ...base,
        note:
          "IA indisponível (HTTP " +
          response.status +
          "); a melhor proposta pelas regras foi mantida.",
      };
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const choice = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    if (
      !options.some((o) => o["id"] === choice.selectedOption) ||
      typeof choice.summary !== "string"
    )
      return {
        ...base,
        note: "A IA retornou uma escolha inválida; a proposta verificada foi mantida.",
      };
    return {
      ...base,
      mode: "ai",
      selectedOption: choice.selectedOption,
      summary: choice.summary.replace(/[<>]/g, "").slice(0, 600),
      note: "A IA escolheu entre propostas verificadas. Nenhuma alteração externa foi executada.",
    };
  } catch {
    return {
      ...base,
      note: "IA indisponível nesta geração; a melhor proposta pelas regras foi mantida.",
    };
  } finally {
    clearTimeout(timer);
  }
}
