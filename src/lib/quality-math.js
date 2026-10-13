// Generated from the reviewed HTML. Pure calculations/parsers only; no DOM, frames or personal seed data.
const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
const group = (a, fn) => {
  const m = {};
  for (const r of a) (m[fn(r)] = m[fn(r)] || []).push(r);
  return m;
};
const txt = (x) => String(x ?? "").trim();
const num = (x) => {
  if (x == null || x === "") return null;
  const v = Number(String(x).trim().replace(",", "."));
  return Number.isFinite(v) ? v : null;
};
const REQUIRED = [
  "LOGIN_TECNICO",
  "QT_REVISITA",
  "TOTAL_OS_TEC1_PADRAO",
  "QTD_TOTAL_OS_TEC1",
  "QTDE_PONTOS",
  "FIM_TRABALHO",
  "DATA_NOTA",
  "NM_MUNICIPIO",
  "SUBCLUSTER",
  "GRUPO_ORDEM_SERVICO",
  "TIPO_JOB",
  "UF",
  "WORKORDER",
];
const OPTIONAL = [
  "UNIDADE_NEGOCIO",
  "FG_DIA_PRODUTIVO",
  "CONTRATO",
  "LISTA_OS",
  "LISTA_ID_OS",
  "LISTA_CD_BAIXA",
  "WO_REVISITA",
  "DSC_LISTA_TEC1",
  "DATA_NOTA",
  "DATA_AGENDA",
  "JANELA_INICIAL",
  "JANELA_FINAL",
  "INICIO_TRABALHO",
  "TIPO_SERVICO",
  "STATUS_JOB",
];
const QQ_MONTHLY_REFERENCES = [
  {
    unit: "JCR-DMV",
    front: "ND",
    month: "2026-09",
    value: 0.0435,
    base: 1379,
    sourceQ: 58,
    signature: "76b85e4d",
  },
  {
    unit: "JCR-DMV",
    front: "MIG",
    month: "2026-09",
    value: 0.0866,
    base: 589,
    sourceQ: 48,
    signature: "4d8d6429",
  },
  {
    unit: "JCR-DMV",
    front: "ME",
    month: "2026-09",
    value: 0.0468,
    base: 235,
    sourceQ: 12,
    signature: "c06c0b30",
  },
  {
    unit: "FTZ-DMV_01",
    front: "PME",
    month: "2026-09",
    value: 0.0571,
    base: 140,
    sourceQ: 9,
    signature: "2b970966",
  },
  {
    unit: "FTZ-DMV_01",
    front: "MIG",
    month: "2026-09",
    value: 0.1419,
    base: 289,
    sourceQ: 39,
    signature: "641853a9",
  },
  {
    unit: "FTZ-DMV_01",
    front: "ME",
    month: "2026-09",
    value: 0.0776,
    base: 361,
    sourceQ: 27,
    signature: "184d92a3",
  },
];
const QQ_MONTHLY_REFERENCE_MAP = new Map(
  QQ_MONTHLY_REFERENCES.map((r) => [[r.unit, r.front, r.month].join("|"), r]),
);
function qqXmlText(s) {
  return String(s).replace(/&(amp|lt|gt|quot|apos|#x[0-9a-fA-F]+|#\d+);/g, (_, e) =>
    e[0] === "#"
      ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
      : { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[e],
  );
}
function qqXmlAttr(s, key) {
  const m = s.match(new RegExp("(?:^|\\s)" + key + "=[\"\\']([^\"\\']*)[\"\\']"));
  return m ? qqXmlText(m[1]) : "";
}
function qqTextNodes(s) {
  return [...s.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => qqXmlText(m[1])).join("");
}
async function qqReadWorkbook(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw Error("Selecione um arquivo XLSX válido.");
  const view = new DataView(buffer);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw Error("XLSX incompleto: índice ZIP ausente.");
  const files = new Map();
  let offset = view.getUint32(end + 16, true),
    count = view.getUint16(end + 10, true);
  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw Error("Índice ZIP inválido.");
    const nl = view.getUint16(offset + 28, true),
      xl = view.getUint16(offset + 30, true),
      cl = view.getUint16(offset + 32, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nl));
    files.set(name, {
      method: view.getUint16(offset + 10, true),
      flags: view.getUint16(offset + 8, true),
      size: view.getUint32(offset + 20, true),
      rawSize: view.getUint32(offset + 24, true),
      local: view.getUint32(offset + 42, true),
    });
    offset += 46 + nl + xl + cl;
  }
  function stream(name) {
    const e = files.get(name);
    if (!e) throw Error("Parte ausente no XLSX: " + name);
    if (e.flags & 1) throw Error("XLSX protegido por senha.");
    const start =
      e.local + 30 + view.getUint16(e.local + 26, true) + view.getUint16(e.local + 28, true);
    const s = new Blob([bytes.subarray(start, start + e.size)]).stream();
    if (e.method === 0) return s;
    if (e.method !== 8) throw Error("Compactação não suportada.");
    return s.pipeThrough(new DecompressionStream("deflate-raw"));
  }
  const text = (name) => new Response(stream(name)).text();
  const workbook = await text("xl/workbook.xml"),
    relations = await text("xl/_rels/workbook.xml.rels");
  const first = workbook.match(/<sheet\b([^>]*?)\/?\s*>/);
  if (!first) throw Error("Nenhuma aba no XLSX.");
  const relId = qqXmlAttr(first[1], "r:id");
  let sheet = "";
  for (const m of relations.matchAll(/<Relationship\b([^>]*?)\/?\s*>/g))
    if (qqXmlAttr(m[1], "Id") === relId) {
      const target = qqXmlAttr(m[1], "Target"),
        parts = (target.startsWith("/") ? target.slice(1) : "xl/" + target).split("/"),
        norm = [];
      for (const p of parts)
        if (p === "..") norm.pop();
        else if (p !== ".") norm.push(p);
      sheet = norm.join("/");
    }
  if (!sheet) throw Error("Relação da primeira aba não encontrada.");
  const strings = [];
  if (files.has("xl/sharedStrings.xml")) {
    const xml = await text("xl/sharedStrings.xml");
    for (const m of xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g))
      strings.push(qqTextNodes(m[1]));
  }
  const wanted = new Set([
    "TIPO_ATENDIMENTO",
    "DAT_AGENDA",
    "SEMANA",
    "LOGIN_TEC",
    "UN_TECNICO",
    "UNIDADE_NEGOCIO",
    "DSC_CLUSTER",
    "TIPO_TRATAMENTO",
    "SUB_AGRUPAMENTO_SC",
    "NM_MUNICIPIO",
    "MUNICIPIO",
    "DSC_MUNICIPIO",
    "CIDADE",
    "NM_CIDADE",
    "CIDADE_TECNICO",
    "MUNICIPIO_TECNICO",
    "CONTRATO",
    "COD_OS",
    "NUM_WO",
    "COD_BAIXA",
    "TIPO_OS",
    "RESPONSAVEL_QUEBRA",
    "MOTIVO_REAGENDAMENTO",
    "PERIODO_AGENDA",
    "DAT_HOR_BAIXA",
    "STATUS_TEC1",
    "STATUS_GEO",
    "SEGMENTO_CONTRATO",
    "TIPO_ORDEM_SERVICO_AGRUPADO",
    "GRUPO_OS",
  ]);
  const date1904 = /<workbookPr\b[^>]*date1904=["'](?:1|true)["']/.test(workbook);
  let headers = null,
    carry = "",
    rows = [];
  const reader = stream(sheet).pipeThrough(new TextDecoderStream()).getReader();
  function consume(xml) {
    const values = {};
    for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const col = qqXmlAttr(m[1], "r").replace(/\d/g, "");
      if (headers && !wanted.has(headers[col])) continue;
      const type = qqXmlAttr(m[1], "t"),
        body = m[2] || "",
        cached = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/);
      let value = null;
      if (type === "s") value = cached ? (strings[Number(cached[1])] ?? null) : null;
      else if (type === "inlineStr") value = qqTextNodes(body);
      else if (type === "str" || type === "d") value = cached ? qqXmlText(cached[1]) : null;
      else if (cached && cached[1] !== "") value = Number(cached[1]);
      values[col] = value;
    }
    if (!headers) {
      headers = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v ?? "")]));
      return;
    }
    const row = {};
    for (const [col, name] of Object.entries(headers))
      if (wanted.has(name)) row[name] = values[col] ?? null;
    if (date1904 && typeof row.DAT_AGENDA === "number") row.DAT_AGENDA += 1462;
    if (Object.values(row).some((v) => v !== null && v !== "")) rows.push(row);
  }
  while (true) {
    const { value, done } = await reader.read();
    if (value) carry += value;
    let close;
    while ((close = carry.indexOf("</row>")) !== -1) {
      const start = carry.indexOf("<row");
      if (start < 0 || start > close) throw Error("Linha inválida no XLSX.");
      consume(carry.slice(start, close + 6));
      carry = carry.slice(close + 6);
    }
    if (done) break;
  }
  if (!headers) throw Error("Aba vazia.");
  return rows;
}
function qqSourceUnit(r) {
  return String(r.UN_TECNICO || r.UNIDADE_NEGOCIO || "").trim();
}
function ymd(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number")
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5).toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? m[3] + "-" + m[2] + "-" + m[1] : null;
}
function catOf(ah) {
  const a = norm(ah);
  if (!a || a === "-3" || a === "-" || a === "N/A") return null;
  if (a.includes("MAIS DE UM")) return { TEC1: 1 / 3, "Contato Cliente": 1 / 3, GEO: 1 / 3 };
  if (a.includes("INFRA")) return { "Infra Claro Tec": 1 };
  if (a.includes("TUBUL")) return { Tubulação: 1 };
  if (a.includes("C.CLIENTE")) return { "Contato Cliente": 1 };
  if (a.includes("GEO")) return { GEO: 1 };
  if (a.includes("TEC1")) return { TEC1: 1 };
  if (a.includes("CUMPRIDO")) return { Baixa100: 1 };
  return { Outros: 1 };
}
function cityFromUnit(un) {
  const u = norm(un);
  if (/^FTZ|^FOR/.test(u)) return "Fortaleza";
  if (/^NTL|^NAT/.test(u)) return "Natal";
  if (/^PWM/.test(u)) return "Parnamirim";
  if (/^MRO|^MOS/.test(u)) return "Mossoró";
  if (/^REC|^RCE|^RCF|^JCR/.test(u)) return "Recife";
  return "";
}
function cityFromRow(r) {
  const fields = [
    "NM_MUNICIPIO",
    "MUNICIPIO",
    "DSC_MUNICIPIO",
    "CIDADE",
    "NM_CIDADE",
    "CIDADE_TECNICO",
    "MUNICIPIO_TECNICO",
  ];
  for (const k of fields) {
    const v = String(r[k] ?? "").trim();
    if (v && v !== "-3" && v !== "-") return v;
  }
  return cityFromUnit(qqSourceUnit(r));
}
function presentationCityLabel(v) {
  const raw = String(v || "").trim();
  const n = norm(raw).replace(/\s+/g, " ");
  if (!n) return "";
  if (n === "NATAL" || n === "PARNAMIRIM" || n === "NATAL / PARNAMIRIM" || n === "NATAL/PARNAMIRIM")
    return "Natal / Parnamirim";
  return raw;
}
function qqServiceGroup(r) {
  const group = norm(r.GRUPO_OS);
  if (group && !["N/A", "NA", "-", "-3"].includes(group)) return group;
  const service = norm(r.TIPO_OS);
  if (service && !["N/A", "NA", "-", "-3"].includes(service))
    return /^(MUDANCA DE ENDERECO|MUDANCA ENDERECO)(?: |$)/.test(service)
      ? "MUDANCA DE ENDERECO"
      : "OUTROS";
  return "";
}
function generalFront(r) {
  const type = norm(r.TIPO_ATENDIMENTO),
    group = norm(r.TIPO_ORDEM_SERVICO_AGRUPADO),
    segment = norm(r.SEGMENTO_CONTRATO),
    serviceGroup = qqServiceGroup(r);
  if (serviceGroup === "MUDANCA DE ENDERECO") return "ME";
  if (type.startsWith("NOVOS")) return segment.includes("PME") ? "PME" : "ND";
  if (type.startsWith("MIGRA")) return "MIG";
  if (!serviceGroup && (group === "ME" || type.startsWith("MUDANCA DE ENDERECO"))) return "ME";
  return null;
}
function qqNormalizeFront(r) {
  const type =
    r.f === "ND"
      ? "NOVOS DOMICILIOS"
      : r.f === "MIG"
        ? "MIGRAÇÃO"
        : r.f === "ME"
          ? "MUDANÇA DE ENDEREÇO"
          : "";
  const gf = generalFront({
    TIPO_ATENDIMENTO: type,
    TIPO_ORDEM_SERVICO_AGRUPADO: r.group,
    SEGMENTO_CONTRATO: r.segment,
    GRUPO_OS: r.osGroup,
    TIPO_OS: r.service,
  });
  if (!gf) return null;
  return { ...r, gf, f: gf === "PME" ? "ND" : gf, sv: 3 };
}
function qqRecordDetails(r) {
  return {
    gf: generalFront(r),
    contract: String(r.CONTRATO ?? ""),
    os: String(r.COD_OS ?? ""),
    wo: String(r.NUM_WO ?? ""),
    baixa: String(r.COD_BAIXA ?? ""),
    rawCategory: String(r.SUB_AGRUPAMENTO_SC ?? ""),
    service: String(r.TIPO_OS ?? ""),
    treatment: String(r.TIPO_TRATAMENTO ?? ""),
    responsible: String(r.RESPONSAVEL_QUEBRA ?? ""),
    reason: String(r.MOTIVO_REAGENDAMENTO ?? ""),
    time: String(r.PERIODO_AGENDA ?? ""),
    lowAt: String(r.DAT_HOR_BAIXA ?? ""),
    tec1: String(r.STATUS_TEC1 ?? ""),
    geo: String(r.STATUS_GEO ?? ""),
    segment: String(r.SEGMENTO_CONTRATO ?? ""),
    group: String(r.TIPO_ORDEM_SERVICO_AGRUPADO ?? ""),
    osGroup: String(r.GRUPO_OS ?? ""),
    sv: 3,
  };
}
function toRec(r) {
  const gf = generalFront(r),
    f = gf === "PME" ? "ND" : gf;
  const d = ymd(r.DAT_AGENDA);
  if (!f || !d) return null;
  const w = (norm(r.SEMANA).match(/\d+/) || [""])[0];
  const lg = (v) => {
    v = String(v == null ? "" : v).trim();
    return !v || v === "-3" || v === "-" ? "(sem login)" : v;
  };
  return {
    f,
    d,
    w,
    lt: lg(r.LOGIN_TEC),
    un: qqSourceUnit(r),
    cl: String(r.DSC_CLUSTER || ""),
    ci: cityFromRow(r),
    b: norm(r.TIPO_TRATAMENTO).startsWith("COM QUEBRA") ? 1 : 0,
    c: catOf(r.SUB_AGRUPAMENTO_SC),
    ...qqRecordDetails(r),
  };
}
function qqClientReschedule(r) {
  return norm(r.responsible).replace(/[ _-]/g, "") === "REAGCLIENTE";
}
function qqMissedAppointment(r) {
  return (
    norm(r.rawCategory) === "AGENDAMENTO NAO CUMPRIDO" && norm(r.treatment).startsWith("COM QUEBRA")
  );
}
function qqQualifiedCategories(r) {
  if (qqClean409(r)) return null;
  if (qqClientReschedule(r) && !qqMissedAppointment(r)) return null;
  return r.c;
}
function stat(a) {
  const s = { n: a.length, b: 0, q: 0, cat: {} };
  let somaCategorias = 0;
  for (const r of a) {
    if (qqClean409(r)) continue;
    s.b += r.b;
    const categories = qqQualifiedCategories(r);
    if (categories) {
      for (const k in categories) {
        s.cat[k] = (s.cat[k] || 0) + categories[k];
        if (k !== "Outros") somaCategorias += categories[k];
      }
    }
  }
  // Qualificada uses only eligible category weights; all agenda records remain in the denominator.
  // Other client rescheduling remains excluded; the original category, base and break population are preserved.
  s.q = Math.round(somaCategorias * 1e9) / 1e9;
  s.pb = s.n ? s.b / s.n : NaN;
  s.pq = s.n ? s.q / s.n : NaN;
  return s;
}
function qqAgendaKey(r) {
  const valid = (v) => {
    const s = String(v ?? "").trim();
    return s && !["-", "-3", "N/A"].includes(s) ? s : "";
  };
  const os = valid(r.os),
    wo = valid(r.wo);
  if (os) return JSON.stringify(["OS", r.d, os, wo, wo ? "" : r.time || ""]);
  if (wo) return JSON.stringify(["WO", r.d, wo, r.contract || "", r.service || ""]);
  return JSON.stringify([
    "legacy",
    r.d,
    r.un,
    r.lt,
    r.f,
    r.contract || "",
    r.service || "",
    r.time || "",
    r.rawCategory || "",
  ]);
}
function qqSameValue(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const aKeys = Object.keys(a).sort(),
    bKeys = Object.keys(b).sort();
  return (
    aKeys.length === bKeys.length &&
    aKeys.every((key, i) => key === bKeys[i] && qqSameValue(a[key], b[key]))
  );
}
function qqMergeAgendaRecords(current, incoming) {
  const rows = [...current],
    positions = new Map(current.map((r, i) => [qqAgendaKey(r), i]));
  let added = 0,
    updated = 0,
    unchanged = 0;
  for (const record of incoming) {
    const key = qqAgendaKey(record),
      index = positions.get(key);
    if (index === undefined) {
      positions.set(key, rows.length);
      rows.push(record);
      added++;
    } else if (qqSameValue(rows[index], record)) {
      unchanged++;
    } else {
      rows[index] = { ...rows[index], ...record };
      updated++;
    }
  }
  return { rows, added, updated, unchanged };
}
function qqMonthlyRecordSignature(records) {
  const keys = records
    .map((r) =>
      JSON.stringify([
        r.d,
        r.os || "",
        r.wo || "",
        r.lt || "",
        r.un || "",
        r.gf || r.f || "",
        r.baixa || "",
        r.rawCategory || "",
        r.responsible || "",
        r.service || "",
        r.b,
        Object.entries(r.c || {}).sort(([a], [b]) => a.localeCompare(b)),
      ]),
    )
    .sort();
  let hash = 2166136261;
  for (const text of keys) {
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 10;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function qqMonthlyInfo(records) {
  const source = stat(records),
    references = [];
  let adjustment = 0;
  for (const [key, rows] of Object.entries(
    group(records, (r) => [r.un, r.gf || r.f, r.d.slice(0, 7)].join("|")),
  )) {
    const ref = QQ_MONTHLY_REFERENCE_MAP.get(key);
    if (!ref || rows.length !== ref.base || qqMonthlyRecordSignature(rows) !== ref.signature)
      continue;
    const observed = stat(rows);
    adjustment += ref.value * rows.length - observed.q;
    references.push(ref);
  }
  const pq = source.n ? (source.q + adjustment) / source.n : NaN;
  return {
    ...source,
    pq,
    sourceRate: source.pq,
    references,
    hasInfo: source.n > 0 && Number.isFinite(pq) && pq > 0,
  };
}
function qqClean409(r) {
  const codes = String(r.baixa ?? "").match(/\d+/g) || [];
  const responsible = norm(r.responsible).replace(/[ _-]/g, "");
  const category = norm(r.rawCategory);
  return (
    codes.includes("409") &&
    norm(r.treatment) === "SEM QUEBRA DE AGENDA" &&
    responsible === "SEMQUEBRA" &&
    ["", "N/A", "NA", "-", "-3", "SEM QUEBRA", "SEM_QUEBRA"].includes(category)
  );
}
function qqNormalize409(r) {
  return qqClean409(r) ? { ...r, b: 0, c: null } : r;
}
function qqFrontMatches(r, front) {
  return front === "ND" || front === "MIG" ? r.f === front : (r.gf || r.f) === front;
}
function tcRule() {
  return {
    rev: 0.0701,
    tec: 0.95,
    prod: 127,
    strict: false,
    label:
      "Regra vigente em todas as operações: revisita < 7,01%; TEC1 ≥ 95%; produtividade ≥ 127 pontos/dia",
  };
}
function tcTecOK(v) {
  const t = tcRule();
  return v != null && (t.strict ? v > t.tec : v >= t.tec);
}
function tcProdOK(v) {
  const t = tcRule();
  return v != null && (t.strict ? v > t.prod : v >= t.prod);
}
function dateParts(s) {
  const m = txt(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m
    ? {
        d: +m[1],
        m: +m[2],
        y: +m[3],
        key: m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0"),
      }
    : null;
}
function parseCsvCompact(
  text,
  fileName,
  resolve = (login, baseUnit) => ({
    name: login,
    company: baseUnit,
    mapped: false,
    mapSource: "base",
  }),
) {
  let headers = null,
    idx = null,
    out = [],
    field = "",
    row = [],
    inQ = false;
  function emit() {
    if (row.length === 1 && row[0] === "") {
      row = [];
      return;
    }
    if (!headers) {
      headers = row.map((v, i) => (i === 0 ? v.replace(/^\uFEFF/, "").trim() : v.trim()));
      idx = {};
      for (const k of REQUIRED.concat(OPTIONAL)) idx[k] = headers.indexOf(k);
      const miss = REQUIRED.filter((k) => idx[k] < 0);
      if (miss.length) throw new Error(fileName + ": colunas ausentes: " + miss.join(", "));
    } else {
      const g = (k) => (idx[k] >= 0 ? (row[idx[k]] ?? "") : "");
      const login = txt(g("LOGIN_TECNICO")),
        dp = dateParts(g("DATA_NOTA")),
        fp = dateParts(g("FIM_TRABALHO")),
        baseUnit = txt(g("UNIDADE_NEGOCIO")),
        m = resolve(login, baseUnit);
      out.push({
        login,
        name: m.name,
        company: m.company,
        mapped: m.mapped,
        mapSource: m.mapSource,
        baseUnit,
        qr: g("QT_REVISITA"),
        tnum: g("TOTAL_OS_TEC1_PADRAO"),
        tden: g("QTD_TOTAL_OS_TEC1"),
        points: g("QTDE_PONTOS"),
        fg: txt(g("FG_DIA_PRODUTIVO")),
        day: fp?.key ?? "",
        month: dp?.m ?? null,
        year: dp?.y ?? null,
        city: txt(g("NM_MUNICIPIO")),
        sub: txt(g("SUBCLUSTER")),
        group: txt(g("GRUPO_ORDEM_SERVICO")),
        type: txt(g("TIPO_JOB")),
        uf: txt(g("UF")),
        wo: txt(g("WORKORDER")),
        finish: txt(g("FIM_TRABALHO")),
        contract: txt(g("CONTRATO")),
        orders: txt(g("LISTA_OS")),
        orderTypes: txt(g("LISTA_ID_OS")),
        lowCodes: txt(g("LISTA_CD_BAIXA")),
        revisitWo: txt(g("WO_REVISITA")),
        tec1Source: txt(g("DSC_LISTA_TEC1")),
        noteAt: txt(g("DATA_NOTA")),
        agendaAt: txt(g("DATA_AGENDA")),
        windowStart: txt(g("JANELA_INICIAL")),
        windowEnd: txt(g("JANELA_FINAL")),
        start: txt(g("INICIO_TRABALHO")),
        service: txt(g("TIPO_SERVICO")),
        jobStatus: txt(g("STATUS_JOB")),
        file: fileName,
      });
    }
    row = [];
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ";") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field.replace(/\r$/, ""));
      field = "";
      emit();
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    emit();
  }
  return out;
}
function tcRowKey(r) {
  const dp = dateParts(r.finish),
    time = String(r.finish || "").match(/\s(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const finish = dp
    ? dp.key +
      "T" +
      (time ? time[1].padStart(2, "0") + ":" + time[2] + ":" + (time[3] || "00") : "00:00:00")
    : String(r.finish || "").trim();
  return (r.wo || "") + "|" + r.login + "|" + finish;
}
async function tcUnzipCsv(buffer) {
  const view = new DataView(buffer),
    bytes = new Uint8Array(buffer);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error("Arquivo ZIP incompleto.");
  const count = view.getUint16(end + 10, true),
    entries = [];
  let offset = view.getUint32(end + 16, true);
  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("Índice ZIP inválido.");
    const nameLength = view.getUint16(offset + 28, true),
      extra = view.getUint16(offset + 30, true),
      comment = view.getUint16(offset + 32, true);
    const name = new TextDecoder("utf-8").decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
    );
    if (/\.csv$/i.test(name))
      entries.push({
        name,
        method: view.getUint16(offset + 10, true),
        flags: view.getUint16(offset + 8, true),
        size: view.getUint32(offset + 20, true),
        rawSize: view.getUint32(offset + 24, true),
        local: view.getUint32(offset + 42, true),
      });
    offset += 46 + nameLength + extra + comment;
  }
  if (entries.length !== 1) throw new Error("Selecione um ZIP com apenas um analítico CSV.");
  const e = entries[0];
  if (e.flags & 1) throw new Error("O ZIP está protegido por senha.");
  if (e.rawSize > 64 * 1024 * 1024) throw new Error("O CSV excede 64 MB.");
  const start =
      e.local + 30 + view.getUint16(e.local + 26, true) + view.getUint16(e.local + 28, true),
    packed = bytes.subarray(start, start + e.size);
  if (e.method === 0) return packed;
  if (e.method !== 8) throw new Error("Compactação ZIP não suportada.");
  const decoded = new Uint8Array(
    await new Response(
      new Blob([packed]).stream().pipeThrough(new DecompressionStream("deflate-raw")),
    ).arrayBuffer(),
  );
  if (decoded.length !== e.rawSize) throw new Error("O CSV compactado está incompleto.");
  return decoded;
}
async function decodeFile(file) {
  let buf = await file.arrayBuffer();
  if (new Uint8Array(buf)[0] === 0x50 && new Uint8Array(buf)[1] === 0x4b)
    buf = await tcUnzipCsv(buf);
  let s = new TextDecoder("utf-8").decode(buf);
  if ((s.match(/\uFFFD/g) || []).length > 10) s = new TextDecoder("windows-1252").decode(buf);
  return s;
}
function tcDistinctRevisit(r) {
  return txt(r.baseUnit).toUpperCase() === "FTZ-DMV_01";
}
function tcRevisitKey(r) {
  const value = txt(r.revisitWo);
  return value && !["-1", "-3", "0", "-"].includes(value)
    ? "retorno|" + value
    : "atendimento|" + tcRowKey(r);
}
function tcAccumulateRevisit(a, r) {
  const bp = num(r.qr) ?? 0;
  a.revAffected = (a.revAffected || 0) + (bp === 0 ? 0 : 1);
  if (tcDistinctRevisit(r)) {
    a.revFTZRows = (a.revFTZRows || 0) + 1;
    a.revGood++;
    if (bp !== 0) {
      const key = tcRevisitKey(r);
      a.revReturns ??= new Set();
      if (!a.revReturns.has(key)) {
        a.revReturns.add(key);
        a.revBad++;
        a.revGood--;
      }
    }
  } else {
    a.revBad += bp === 0 ? 0 : 1;
    a.revGood += bp === 1 ? 0 : 1;
  }
}
function aggregate(rows) {
  const m = new Map();
  for (const r of rows) {
    const key = r.login;
    if (!key) continue;
    let a = m.get(key);
    if (!a) {
      a = {
        name: r.name || key,
        logins: new Set(),
        companies: new Set(),
        units: new Set(),
        ufs: new Set(),
        cities: new Set(),
        sources: new Set(),
        os: 0,
        revBad: 0,
        revGood: 0,
        revAffected: 0,
        revFTZRows: 0,
        tnum: 0,
        tden: 0,
        points: 0,
        days: new Set(),
        daily: new Map(),
      };
      m.set(key, a);
    }
    a.logins.add(r.login);
    a.companies.add(r.company);
    if (r.baseUnit) a.units.add(r.baseUnit);
    if (r.uf) a.ufs.add(r.uf);
    if (r.city) a.cities.add(r.city);
    a.sources.add(r.mapSource);
    a.os++;
    tcAccumulateRevisit(a, r);
    const n = num(r.tnum),
      d = num(r.tden);
    if (n != null) a.tnum += n;
    if (d != null) a.tden += d;
    const p = num(r.points);
    if (p != null) {
      a.points += p;
      if (r.day) {
        a.days.add(r.day);
        let z = a.daily.get(r.day) || {
          points: 0,
          os: 0,
          revBad: 0,
          revGood: 0,
          revAffected: 0,
          revFTZRows: 0,
          tnum: 0,
          tden: 0,
        };
        z.points += p;
        z.os++;
        tcAccumulateRevisit(z, r);
        if (n != null) z.tnum += n;
        if (d != null) z.tden += d;
        a.daily.set(r.day, z);
      }
    }
  }
  const out = [];
  for (const a of m.values()) {
    const den = a.revBad + a.revGood;
    a.revisit = den ? a.revBad / den : null;
    a.tec1 = a.tden ? a.tnum / a.tden : null;
    a.prod = a.days.size ? a.points / a.days.size : null;
    a.loginText = [...a.logins].join(" | ");
    a.companyText = [...a.companies].join(" | ");
    a.status = false;
    a.tecMeta = 0.95;
    a.fails = [];
    out.push(a);
  }
  return out;
}
function applyStatus(result) {
  result.forEach((a) => {
    a.tecMeta = 0.95;
    const revOK = a.revisit != null && a.revisit < tcRule().rev,
      tecOK = tcTecOK(a.tec1),
      prodOK = tcProdOK(a.prod);
    a.fails = [!revOK ? "REV" : null, !tecOK ? "TEC1" : null, !prodOK ? "PROD" : null].filter(
      Boolean,
    );
    a.status = revOK && tecOK && prodOK;
  });
}
function tcProjectionFor(a, ctx) {
  if (!a) return null;
  const rule = tcRule(),
    D = ctx.workDays,
    revDen = a.revBad + a.revGood;
  const revScale = 10000,
    revTarget = Math.round(rule.rev * revScale),
    tecTarget = Math.round(rule.tec * revScale);
  const revTotal =
    revDen > 0
      ? a.revisit < rule.rev
        ? 0
        : Math.max(0, Math.floor((a.revBad * revScale - revTarget * revDen) / revTarget) + 1)
      : null;
  const tecGap = tecTarget * a.tden - revScale * a.tnum;
  const tecTotal =
    a.tden > 0
      ? tcTecOK(a.tec1)
        ? 0
        : Math.max(
            0,
            rule.strict
              ? Math.floor(tecGap / (revScale - tecTarget)) + 1
              : Math.ceil(tecGap / (revScale - tecTarget)),
          )
      : null;
  const pointsTotal =
    a.prod != null
      ? Math.max(0, rule.prod * (a.days.size + D) - a.points + (rule.strict ? 1e-7 : 0))
      : null;
  const dailyPoints =
    D > 0 && pointsTotal != null ? Math.ceil((pointsTotal / D) * 10 - 1e-9) / 10 : null;
  const pointCount = ctx.pointedOrders.get(a.loginText) || 0,
    meanPoints = pointCount > 0 ? a.points / pointCount : null;
  const ordersPerDay =
    dailyPoints != null && meanPoints > 0 ? Math.ceil(dailyPoints / meanPoints - 1e-9) : null;
  return {
    revisit: { total: revTotal, daily: D > 0 && revTotal != null ? Math.ceil(revTotal / D) : null },
    tec1: { total: tecTotal, daily: D > 0 && tecTotal != null ? Math.ceil(tecTotal / D) : null },
    prod: { total: pointsTotal, daily: dailyPoints, ordersPerDay, meanPoints },
    days: D,
  };
}
export {
  qqFrontMatches,
  norm,
  qqReadWorkbook,
  toRec,
  qqNormalizeFront,
  qqNormalize409,
  qqQualifiedCategories,
  qqMergeAgendaRecords,
  qqAgendaKey,
  qqSameValue,
  stat,
  qqMonthlyInfo,
  presentationCityLabel,
  cityFromUnit,
  parseCsvCompact,
  decodeFile,
  tcRowKey,
  aggregate,
  applyStatus,
  tcRule,
  tcProjectionFor,
};
