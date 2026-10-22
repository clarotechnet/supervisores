// Port only reviewed renderer/logic. Never bundle the reference's personal data.
import fs from "node:fs";
import crypto from "node:crypto";
import ts from "typescript";
import postcss from "postcss";
const path = process.argv[2];
if (!path) throw Error("Provide the reviewed SLA HTML.");
const html = fs.readFileSync(path, "utf8");
const hash = crypto.createHash("sha256").update(html).digest("hex");
const source = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].find((match) =>
  match[2].includes("function standardizeImported("),
)?.[2];
if (!source) throw Error("Unexpected SLA reference structure.");
const ast = ts.createSourceFile("sla.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const empty = { source: "Nenhuma base importada", sourceType: "", stats: {}, fields: [], rows: [] };
const edits = [];
for (const node of ast.statements) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "renderCodes") {
    const original = node.getText(ast);
    const updated = original
      .replace("Códigos de baixa · ofensoras", "Códigos de baixa · ofensores")
      .replace(
        "LIST_COD_BX_OS_OFENSOR, vinculado às OS ofensoras informadas.",
        "LIST_COD_BX_OS_OFENSOR, vinculado às OS ofensoras informadas. Exibe apenas códigos ≥ 100; participação sobre todos os logs do recorte.",
      )
      .replace(
        "for(const o of g.offenders){const name=o.codes||'Não informado';",
        "for(const o of g.offenders){if(!isSlaOffenderChartCode(o.codes))continue;const name=o.codes;",
      );
    if (!updated.includes("if(!isSlaOffenderChartCode(o.codes))continue;"))
      throw Error("Unexpected detailed offender-code chart in SLA reference.");
    edits.push([node.getStart(ast), node.end, updated]);
  }
  if (
    ts.isFunctionDeclaration(node) &&
    ["loadFileV15", "loadFileV16", "loadFile"].includes(node.name?.text)
  )
    edits.push([node.getStart(ast), node.end, ""]);
  if (ts.isVariableStatement(node))
    for (const declaration of node.declarationList.declarations)
      if (declaration.name.getText(ast) === "INITIAL")
        edits.push([
          node.getStart(ast),
          node.end,
          `let INITIAL=${JSON.stringify({ ...empty, history: empty, previousCsv: empty })};`,
        ]);
  if (
    ts.isExpressionStatement(node) &&
    node.getText(ast).startsWith("$('clearDataBtn').addEventListener")
  )
    edits.push([node.getStart(ast), node.end, ""]);
  if (
    ts.isExpressionStatement(node) &&
    node.getText(ast).startsWith("$('fileInput').addEventListener")
  )
    edits.push([node.getStart(ast), node.end, ""]);
}
let code = source;
for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0]))
  code = code.slice(0, start) + replacement + code.slice(end);
for (const name of [
  "archivedRows",
  "previousCsvRows",
  "embeddedRows",
  "previousCsvGroups",
  "previousCsvGroupMap",
])
  code = code.replace(`const ${name}=`, `let ${name}=`);
code = code.replace(
  "populateFilters(true);applyFortaleza();",
  "populateFilters(true);renderAll();",
);
if (/\b(?:eval\s*\(|fetch\s*\(|XLSX\.|new Function)/.test(code))
  throw Error("Unexpected external/executable dependency in SLA port.");
const folder = "src/components/quality/sla-reference";
fs.mkdirSync(folder, { recursive: true });
const adapter = `
async function loadFile(file){await environment.importFile('qq',file);}
function projectPayload(base){return {source:base?.source||'Nenhuma base importada',sourceType:base?.sourceType||'',stats:base?.stats||{},fields:[],rows:[]};}
window.loadProjectData=function(snapshot){
 const previous=embeddedRows.length>0;
 INITIAL={...projectPayload(snapshot.current),history:projectPayload(snapshot.history),previousCsv:projectPayload(snapshot.previousCsv)};
 embeddedRows=snapshot.current?.records.map(row=>({...row}))||[];
 archivedRows=snapshot.history?.records.map(row=>({...row}))||[];
 previousCsvRows=snapshot.previousCsv?.records.map(row=>({...row}))||[];
 previousCsvGroups=groupRows(previousCsvRows);previousCsvGroupMap=new Map(previousCsvGroups.map(group=>[group.key,group]));
 activeBase='current';importedBase=null;allRows=embeddedRows;sourceName=INITIAL.source;sourceType=INITIAL.sourceType;importStats={...INITIAL.stats};referenceData=null;
 if(!allRows.some(row=>row.indicator===currentIndicator))currentIndicator=allRows[0]?.indicator||'Sla Garantia Total';
 for(const option of $('baseSelect').options){option.disabled=option.value==='history'?!archivedRows.length:option.value==='previousCsv'?!previousCsvRows.length:false;const payload=option.value==='current'?INITIAL:option.value==='history'?INITIAL.history:INITIAL.previousCsv;option.textContent=(option.value==='current'?'Base atual':option.value==='history'?'Excel anterior':'CSV anterior')+' · '+payload.source;}
 $('baseSelect').value='current';populateFilters(!previous);renderAll();
};
window.redraw=()=>renderAll();window.isModalOpen=()=>$('drillDialog').open;
window.closeModal=()=>{if($('drillDialog').open)closeDrill();};
window.getProjectState=()=>({rows:allRows,filtered:rawCurrent,groups:groupedCurrent,metrics:calc(groupedCurrent),mode:metricMode,indicator:currentIndicator,source:activeBase});
$('clearDataBtn').hidden=true;$('fileInput').accept='.csv,.xlsx';
$('fileInput').addEventListener('change',async event=>{const input=event.target;const file=input.files?.[0];input.value='';if(file)await loadFile(file);});
if(!environment.editable){$('fileInput').disabled=true;document.querySelector('label[for="fileInput"]').hidden=true;}
`;
fs.writeFileSync(
  `${folder}/sla-engine.js`,
  `// Reviewed SLA reference ${hash}. No embedded personal records.\nimport { isSlaOffenderChartCode } from '../../../lib/sla-code-chart';\nexport function mountSla(environment){\nconst {document,window}=environment;\n${code}\n${adapter}\nreturn window;\n}\n`,
);
fs.writeFileSync(
  `${folder}/sla-engine.d.ts`,
  'import type { ReferenceEnvironment } from "../reference-types";\nimport type { SlaEngine } from "../sla-types";\nexport function mountSla(environment: ReferenceEnvironment): SlaEngine;\n',
);
const mathNames = [
  "norm",
  "fold",
  "n",
  "parseDate",
  "brDate",
  "yyyymm",
  "isSemPadrao",
  "csvToRows",
  "firstValue",
  "standardizeDetailedImported",
  "listValues",
  "groupRowsV15",
  "daysBetween",
  "consolidateUnit",
  "standardizeImported",
  "groupRows",
  "metricSet",
  "calc",
];
const functions = ast.statements
  .filter((node) => ts.isFunctionDeclaration(node) && mathNames.includes(node.name?.text))
  .map((node) => node.getText(ast))
  .join("\n");
if (functions.includes("document.") || functions.includes("XLSX"))
  throw Error("Unexpected DOM in SLA calculation module.");
const constants =
  "let importStats={};const metricMode='attendance';const uniqueParts=v=>[...new Set(norm(v).split(',').map(norm).filter(Boolean))];const isConsolidated=r=>r.sourceFormat==='consolidated';";
fs.writeFileSync(
  "src/lib/sla-math.js",
  `// Exact business functions from reviewed reference ${hash}.\n${constants}\n${functions}\nexport function normalizeSlaRows(raw,options={}){const records=standardizeImported(raw,options);return {records,stats:{...importStats}};}\nexport {csvToRows,groupRows,calc,parseDate};\n`,
);
const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
  .map((match) => match[1])
  .join("\n");
const tree = postcss.parse(styles);
tree.walkRules((rule) => {
  rule.selectors = rule.selectors.map((selector) =>
    selector
      .replace(
        /(^|[\s>+~,(])(?:html|body)(?=[:.#\s>+~),\[]|$)/g,
        (_, prefix) => prefix + ".reference-body",
      )
      .replace(/:root/g, ":host"),
  );
});
const markup = html
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1]
  .replace("Qualidade de atendimento · v18", "Qualidade de atendimento")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
if (markup.includes('id="dataset"') || /[A-Za-z0-9+/]{5000}/.test(markup))
  throw Error("Unexpected seed data in SLA template.");
fs.writeFileSync(
  `${folder}/templates.ts`,
  `// Static original SLA markup and scoped styles. No source data.\nexport const slaMarkup=${JSON.stringify(markup)};\nexport const slaStyle=${JSON.stringify(tree.toString())};\n`,
);
console.log(
  JSON.stringify({
    sourceHash: hash,
    seedDataExcluded: true,
    formulasPreserved: true,
    nativeDOM: true,
  }),
);
