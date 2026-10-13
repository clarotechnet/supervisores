import { gunzipSync, strFromU8 } from "fflate";
import type { Json } from "@/integrations/supabase/types";

export const QUALITY_PROJECT_REF = "rwstmomeldwrjmczrmnp";
export const QUALITY_CHUNK_SIZE = 250;
export type QualityKind = "quebra" | "certification" | "technical_visit";
export type CertificationKind = Exclude<QualityKind, "quebra">;
export type QualityRecord = Record<string, Json>;
export type QualityRegistry = Record<string, { name: string; supervisor: string }>;
export interface QualitySnapshot {
  records: QualityRecord[];
  [key: string]: Json | QualityRecord[] | undefined;
}
export interface QualityImport {
  id: string;
  kind: QualityKind;
  source_file: string;
  imported_by: string;
  created_at: string;
  published_at: string | null;
  row_count: number;
  chunk_count: number;
  metadata: Json;
  base_import_id: string | null;
}
export interface QualityState {
  datasets: Partial<Record<QualityKind, QualitySnapshot>>;
  imports: Partial<Record<QualityKind, QualityImport>>;
  registry: QualityRegistry;
}
export function assertQualityRecords(
  kind: QualityKind,
  records: unknown,
): asserts records is QualityRecord[] {
  if (!Array.isArray(records) || !records.length || records.length > 1_000_000) {
    throw new Error("A base precisa conter registros válidos (limite: 1 milhão).");
  }
  for (const record of records) {
    if (!record || typeof record !== "object") throw new Error("Registro inválido na base.");
    if (kind === "quebra") {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(record.d) ||
        typeof record.lt !== "string" ||
        ![0, 1].includes(record.b)
      ) {
        throw new Error("Base QQ inválida: data, login ou indicador de quebra ausente.");
      }
    } else if (
      typeof record.login !== "string" ||
      !record.login ||
      !/^\d{4}-\d{2}-\d{2}$/.test(record.day) ||
      !record.month ||
      !record.year
    ) {
      throw new Error("Base de certificação inválida: login ou data ausente.");
    }
  }
}

export function decodeHtmlEntities(text: string): string {
  return text.replace(
    /&(?:quot|#x27|#39|lt|gt|amp);/g,
    (entity) =>
      ({
        "&quot;": '"',
        "&#x27;": "'",
        "&#39;": "'",
        "&lt;": "<",
        "&gt;": ">",
        "&amp;": "&",
      })[entity] ?? entity,
  );
}

// Extract data only. Uploaded HTML scripts are never executed.
export function extractQualityHtml(html: string) {
  const frame = (id: string) => {
    const match = html.match(new RegExp(`<iframe id="${id}"[^>]*srcdoc="([\\s\\S]*?)"[^>]*>`));
    if (!match?.[1]) throw new Error("Selecione o HTML unificado de QQ e Técnico certificado.");
    return decodeHtmlEntities(match[1]);
  };
  const qq = frame("frameQQ"),
    tc = frame("frameTC");
  const object = (source: string, name: string, fallback: Json = {}) => {
    const raw = source.match(
      new RegExp(`const ${name}\\s*=\\s*([\\[{][^\\n]*?);(?:\\r?\\n|$)`),
    )?.[1];
    return raw ? (JSON.parse(raw) as Json) : fallback;
  };
  const compressed = (source: string, name: string) => {
    const raw = source.match(new RegExp(`const ${name}\\s*=\\s*"([^"]+)"`))?.[1];
    if (!raw) throw new Error(`Base incorporada ausente: ${name}.`);
    const binary = atob(raw),
      bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return strFromU8(gunzipSync(bytes));
  };
  const records: unknown = JSON.parse(compressed(qq, "QQ_INITIAL_GZIP"));
  assertQualityRecords("quebra", records);
  const registry = JSON.parse(
    html.match(/<script id="supervisorSeed"[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? "{}",
  ) as QualityRegistry;
  return {
    registry,
    quebra: {
      records,
      names: {
        ...(object(qq, "NAME_MAP") as Record<string, Json>),
        ...(object(qq, "QQ_NAME_UPDATES") as Record<string, Json>),
      },
      corrections: object(qq, "SV_NAME_CORRECTIONS"),
      sourceUpdates: object(qq, "QQ_SOURCE_UPDATES", []),
    } satisfies QualitySnapshot,
    certificationMetadata: {
      techMap: object(tc, "TECH_MAP"),
      nameUpdates: object(tc, "TC_NAME_UPDATES"),
      corrections: object(tc, "SV_NAME_CORRECTIONS"),
    },
    certificationCsv: compressed(tc, "EMBEDDED_CSV_GZIP"),
  };
}

export function qualityErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === "42P01" || code === "PGRST205" || code === "PGRST202") {
    return "O módulo de qualidade ainda não foi instalado no banco. Execute a migration add_quality_dashboard no projeto supervisortechnet.";
  }
  return (
    (error as { message?: string })?.message ?? "Não foi possível carregar ou salvar o painel."
  );
}
