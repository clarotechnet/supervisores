// Mechanical extraction of pure functions from the reviewed reference.
// No attachment script is executed and no embedded records/names are copied.
import fs from "node:fs";
import ts from "typescript";
const decode = (s) =>
  s.replace(
    /&(?:quot|#x27|#39|lt|gt|amp);/g,
    (e) =>
      ({ "&quot;": '"', "&#x27;": "'", "&#39;": "'", "&lt;": "<", "&gt;": ">", "&amp;": "&" })[e],
  );
const html = fs.readFileSync(process.argv[2], "utf8");
function frame(id) {
  const raw = html.match(new RegExp(`<iframe id="${id}"[^>]*srcdoc="([\\s\\S]*?)"[^>]*>`))?.[1];
  if (!raw) throw Error("Reference frame missing: " + id);
  const body = decode(raw);
  return [...body.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((x) => x[1])
    .join("\n");
}
function functions(source, names) {
  const tree = ts.createSourceFile(
    "reference.js",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  return names
    .map((name) => {
      const node = tree.statements.find(
        (n) => ts.isFunctionDeclaration(n) && n.name?.text === name,
      );
      if (!node) throw Error("Function missing: " + name);
      return node.getText(tree);
    })
    .join("\n");
}
const qq = frame("frameQQ"),
  tc = frame("frameTC");
const qqNames = [
  "qqXmlText",
  "qqXmlAttr",
  "qqTextNodes",
  "qqReadWorkbook",
  "qqSourceUnit",
  "ymd",
  "catOf",
  "cityFromUnit",
  "cityFromRow",
  "presentationCityLabel",
  "qqServiceGroup",
  "generalFront",
  "qqNormalizeFront",
  "qqRecordDetails",
  "toRec",
  "qqClientReschedule",
  "qqMissedAppointment",
  "qqQualifiedCategories",
  "stat",
  "qqAgendaKey",
  "qqSameValue",
  "qqMergeAgendaRecords",
  "qqMonthlyRecordSignature",
  "qqMonthlyInfo",
  "qqClean409",
  "qqNormalize409",
  "qqFrontMatches",
];
const tcNames = [
  "tcRule",
  "tcTecOK",
  "tcProdOK",
  "dateParts",
  "parseCsvCompact",
  "tcRowKey",
  "tcUnzipCsv",
  "decodeFile",
  "tcDistinctRevisit",
  "tcRevisitKey",
  "tcAccumulateRevisit",
  "aggregate",
  "applyStatus",
  "tcProjectionFor",
];
let q = functions(qq, qqNames).replace(
  /if\(bytes\[0\]!==0x50\|\|bytes\[1\]!==0x4b\)\{[^\n]*\}/,
  "if(bytes[0]!==0x50||bytes[1]!==0x4b)throw Error('Selecione um arquivo XLSX válido.');",
);
let t = functions(tc, tcNames)
  .replace(
    "function parseCsvCompact(text, fileName)",
    'function parseCsvCompact(text, fileName, resolve = (login, baseUnit) => ({name:login,company:baseUnit,mapped:false,mapSource:"base"}))',
  )
  .replace("$('#legacyStatus').checked=false;", "")
  .replace("ctx=state.projectionContext", "ctx");
const constant = (name) => qq.match(new RegExp(`const ${name}\\s*=\\s*([^\\n]+);`))?.[1];
const required = tc.match(/const REQUIRED = ([^\n]+);/)?.[1],
  optional = tc.match(/const OPTIONAL = ([^\n]+);/)?.[1];
const output = `// Generated from the reviewed HTML. Pure calculations/parsers only; no DOM, frames or personal seed data.\nconst norm=s=>String(s??'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toUpperCase().trim();\nconst group=(a,fn)=>{const m={};for(const r of a)(m[fn(r)]=m[fn(r)]||[]).push(r);return m};\nconst txt=x=>String(x??'').trim();\nconst num=x=>{if(x==null||x==='')return null;const v=Number(String(x).trim().replace(',','.'));return Number.isFinite(v)?v:null};\nconst REQUIRED=${required};\nconst OPTIONAL=${optional};\nconst QQ_MONTHLY_REFERENCES=${constant("QQ_MONTHLY_REFERENCES")};\nconst QQ_MONTHLY_REFERENCE_MAP=new Map(QQ_MONTHLY_REFERENCES.map(r=>[[r.unit,r.front,r.month].join('|'),r]));\n${q}\n${t}\nexport {norm,qqReadWorkbook,toRec,qqNormalizeFront,qqNormalize409,qqQualifiedCategories,qqMergeAgendaRecords,qqAgendaKey,qqSameValue,stat,qqMonthlyInfo,presentationCityLabel,cityFromUnit,parseCsvCompact,decodeFile,tcRowKey,aggregate,applyStatus,tcRule};\n`;
if (/document\.|window\.|\$\(/.test(output))
  throw Error("Unexpected DOM dependency in pure engine");
fs.writeFileSync(
  "src/lib/quality-math.js",
  output
    .replace("export {norm,", "export {qqFrontMatches,norm,")
    .replace("aggregate,applyStatus,tcRule};", "aggregate,applyStatus,tcRule,tcProjectionFor};"),
);
console.log("Extracted pure engine; no DOM or embedded data.");
