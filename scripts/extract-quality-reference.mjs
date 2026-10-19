// Mechanical port of the reviewed visual reference, not execution of uploaded HTML.
// Runtime datasets and personal mappings are deliberately excluded from the bundle.
import fs from "node:fs";
import crypto from "node:crypto";
import ts from "typescript";
import postcss from "postcss";
const path = process.argv[2];
if (!path) throw Error("Provide the reviewed HTML path.");
const html = fs.readFileSync(path, "utf8");
const hash = crypto.createHash("sha256").update(html).digest("hex");
const decode = (s) =>
  s.replace(
    /&(?:quot|#x27|#39|lt|gt|amp);/g,
    (e) =>
      ({ "&quot;": '"', "&#x27;": "'", "&#39;": "'", "&lt;": "<", "&gt;": ">", "&amp;": "&" })[e],
  );
const folder = "src/components/quality/reference";
fs.mkdirSync(folder, { recursive: true });
const plain = (s) => s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
const style = (s) =>
  [...plain(s).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
const body = (s) =>
  plain(s)
    .match(/<body[^>]*>([\s\S]*)<\/body>/)[1]
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, "");
const seedNames = {
  NAME_MAP: "{}",
  TECH_MAP: "{}",
  SUPERVISOR_MAP: "{...(window.parent.getSupervisorMap?.()||{})}",
  QQ_SOURCE_UPDATES: "[]",
  QQ_INITIAL_GZIP: '""',
  QQ_SEPTEMBER_AUDIT_B64: '""',
  QQ_NAME_UPDATES: "{}",
  SV_NAME_CORRECTIONS: "{}",
  TC_NAME_UPDATES: "{}",
  EMBEDDED_CSV_GZIP: '""',
};
const templates = [];
for (const [kind, id, name] of [
  ["qq", "frameQQ", "mountQQ"],
  ["tc", "frameTC", "mountTC"],
]) {
  const frame = decode(
    html.match(new RegExp(`<iframe id="${id}"[^>]*srcdoc="([\\s\\S]*?)"[^>]*>`))[1],
  );
  const scripts = [...frame.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  // The first QQ script is the obsolete embedded SheetJS library. Imports go
  // through the project's reviewed importer; all charts are original inline SVG.
  let code = scripts.slice(kind === "qq" ? 1 : 0).join("\n");
  const ast = ts.createSourceFile(
    "reference.js",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const edits = [];
  for (const node of ast.statements) {
    if (ts.isVariableStatement(node))
      for (const d of node.declarationList.declarations) {
        const replacement = seedNames[d.name.getText(ast)];
        if (replacement !== undefined && d.initializer)
          edits.push([d.initializer.getStart(ast), d.initializer.end, replacement]);
      }
    if (
      ts.isExpressionStatement(node) &&
      node.getText(ast).startsWith("(async") &&
      /QQ_INITIAL_GZIP|embeddedText\(\)/.test(node.getText(ast))
    )
      edits.push([node.getStart(ast), node.end, ""]);
  }
  for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0]))
    code = code.slice(0, start) + replacement + code.slice(end);
  code = code.replace(
    /if\(bytes\[0\]!==0x50\|\|bytes\[1\]!==0x4b\)\{[^\n]*\}/,
    "if(bytes[0]!==0x50||bytes[1]!==0x4b)throw Error('Selecione um XLSX válido.');",
  );
  // The source's downloadable September audit is a private embedded dataset,
  // not part of the renderer. Use the live system audit instead.
  code = code.replace(
    /^\s*\$\('catModalBody'\)\.insertAdjacentHTML\('beforeend',[^\n]*qqDownloadSeptemberAudit[^\n]*\n/gm,
    "",
  );
  code = code.replace(
    /^\s*\$\('qqDownloadSeptemberAudit'\)\.onclick=qqDownloadSeptemberAudit;\s*$/gm,
    "",
  );
  code = code.replace(
    /Fonte incorporada: <b>[^<]+<\/b> e planilhas importadas pelo painel QQ\./g,
    "Fonte: base de QQ publicada no sistema e atualizada pelas importações incrementais.",
  );
  if (/[A-Za-z0-9+/]{5000}/.test(code))
    throw Error("Unexpected embedded dataset remains in " + kind);
  if (kind === "qq") {
    const adapt = (from, to) => {
      if (!code.includes(from)) throw Error("Review the QQ supervisor adapter before porting.");
      code = code.replace(from, to);
    };
    adapt(
      "if(S.view==='logins')svReconcileSelection",
      "if(S.view==='logins'&&!presenting)svReconcileSelection",
    );
    adapt(
      "const base=S.view==='logins'?cityBase.filter",
      "const base=S.view==='logins'||presenting?cityBase.filter",
    );
    adapt(
      "&&['ND','PME','MIG','ME'].includes(r.gf||r.f));",
      "&&['ND','PME','MIG','ME'].includes(r.gf||r.f)&&(!presenting||svAllows(S.supervisors,r.lt)));",
    );
    adapt(
      "function qqGeneralContext(){",
      "function qqGeneralContext(){\n const presenting=document.body.classList.contains('presentation-mode');",
    );
    // Add interaction-only wrappers. Every visible SVG mark, value and formula
    // remains the source's own renderer; drilling uses its already filtered rows.
    for (const metric of ["Q", "B"])
      adapt(`const days${metric}=dk.map((d,i)=>({l:`, `const days${metric}=dk.map((d,i)=>({d,l:`);
    for (const [period, className, metric, title] of [
      ["daily", "daily-chart", "q", "%QUALIFICADA"],
      ["daily", "daily-chart", "b", "%QUEBRA"],
      ["weekly", "week-chart", "q", "%QUALIFICADA"],
      ["weekly", "week-chart", "b", "%QUEBRA"],
    ])
      adapt(
        `class="pres-panel chart-card ${className}"><div class="mini-title">${title}`,
        `class="pres-panel chart-card ${className}" data-qq-chart="${period}:${metric}"><div class="mini-title">${title}`,
      );
    adapt("bars(daysQ,color,meta[f])", "bars(daysQ,color,meta[f],false,NM[f]+' · %Qualificada')");
    adapt(
      "bars(daysB,color,metaQuebra[f])",
      "bars(daysB,color,metaQuebra[f],false,NM[f]+' · %Quebra')",
    );
    adapt(
      "barsWeekly(weekItems('q'),color,meta[f])",
      "barsWeekly(weekItems('q'),color,meta[f],NM[f]+' · %Qualificada')",
    );
    adapt(
      "barsWeekly(weekItems('b'),color,metaQuebra[f])",
      "barsWeekly(weekItems('b'),color,metaQuebra[f],NM[f]+' · %Quebra')",
    );
    const categoryBinding =
      " document.querySelectorAll('[data-cat][data-day]').forEach(el=>el.onclick=()=>{const cat=";
    adapt(
      categoryBinding,
      " wireQQChartDrilldown($('view'),{records:am,days:dk,weeks:wk.map(item=>item.w),months:meses,front:NM[f]},(records,label,metric)=>qqOpenGeneralRecords(records,label,'offenders',metric));\n" +
        categoryBinding,
    );
    adapt(
      "function bars(items,color,meta,loginDaily=false){",
      "function bars(items,color,meta,loginDaily=false,frontChart=''){",
    );
    adapt(
      "  const txt=ok?'var(--ok)':'#555';",
      "  const txt=ok?'var(--ok)':'#555';\n  if(frontChart)s+=qqChartPointMarkup(k,frontChart+' · '+(i.d?i.d.split('-').reverse().join('/'):i.l)+': '+pct(i.v,2),{x:10+k*bw+bw*.08,width:bw*.84,height:H});",
    );
    adapt("if(loginDaily)s+='</g>';", "if(loginDaily||frontChart)s+='</g>';");
    adapt(
      "function barsWeekly(items,color,meta){",
      "function barsWeekly(items,color,meta,frontChart=''){",
    );
    adapt(
      "fill=ok?'var(--ok)':color,txt=ok?'var(--ok)':'#555';s+=",
      "fill=ok?'var(--ok)':color,txt=ok?'var(--ok)':'#555';if(frontChart)s+=qqChartPointMarkup(k,frontChart+' · '+i.l+': '+pct(i.v,2),{x:9+k*bw+bw*.08,width:bw*.84,height:H});s+=",
    );
    adapt(
      '${H-7}" text-anchor="middle" fill="#555" font-size="12">${i.l}</text>`});',
      '${H-7}" text-anchor="middle" fill="#555" font-size="12">${i.l}</text>`;if(frontChart)s+=\'</g>\';});',
    );
  }
  if (kind === "tc") {
    const adapt = (from, to) => {
      if (!code.includes(from)) throw Error("Review the TC filter adapter before porting.");
      code = code.replace(from, to);
    };
    adapt(
      "if(state.ready)svReconcileSelection(tcSupervisors",
      "if(state.ready&&!document.body.classList.contains('presentation-mode'))svReconcileSelection(tcSupervisors",
    );
    adapt(
      "\n    const $ = s => document.querySelector(s)",
      "\nconst tcSelectedUnits = new Set();\n    const $ = s => document.querySelector(s)",
    );
    adapt(
      "if($('#fBaseUnit').value&&r.baseUnit!==$('#fBaseUnit').value)return false;",
      "if(tcSelectedUnits.size?!tcSelectedUnits.has(r.baseUnit):($('#fBaseUnit').value&&r.baseUnit!==$('#fBaseUnit').value))return false;",
    );
    adapt("function resetFilters(){", "function resetFilters(){\n      tcSelectedUnits.clear();");
    adapt(
      "['#fRule', '#fBaseUnit', '#fCompany', '#fSub', '#fMap'].forEach(id => $(id).addEventListener('change', render));",
      "['#fRule', '#fCompany', '#fSub', '#fMap'].forEach(id => $(id).addEventListener('change', render)); $('#fBaseUnit').addEventListener('change',()=>window.setUnifiedUnits($('#fBaseUnit').value?[$('#fBaseUnit').value]:[]));",
    );
    adapt(
      "function presentationCityMembers(label){\n      const grp=presentationCityLabel(label);\n      if(grp==='Natal / Parnamirim'){\n        const avail=uniq(state.rows.map(x=>x.city));\n        return ['Natal','Parnamirim'].filter(v=>avail.includes(v));\n      }\n      return grp?[grp]:[];\n    }",
      "function presentationCityMembers(label){\n      return referenceCityMembers(label,state.rows.map(row=>row.city));\n    }",
    );
    adapt(
      "return {units,selected:value?[value]:[],multiple:false,ready:state.ready};",
      "return {units,selected:tcSelectedUnits.size?[...tcSelectedUnits]:value?[value]:[],multiple:true,ready:state.ready};",
    );
    adapt(
      "if(selected.length>1||selected.some(unit=>!units.includes(unit)))return false;\n $('#fBaseUnit').value=selected[0]||'';render();return true;",
      "if(selected.some(unit=>!units.includes(unit)))return false;\n tcSelectedUnits.clear();selected.forEach(unit=>tcSelectedUnits.add(unit));\n $('#fBaseUnit').value=selected.length===1?selected[0]:'';render();return true;",
    );
    adapt(
      "const snapshot={filters:Object.fromEntries(filterIds.map(id=>[id,$('#'+id).value]))",
      "const snapshot={units:[...tcSelectedUnits],filters:Object.fromEntries(filterIds.map(id=>[id,$('#'+id).value]))",
    );
    adapt(
      "filterIds.forEach(id=>$('#'+id).value='');Object.values(state.multi).forEach(set=>set.clear());tcSupervisors.clear();",
      "tcSelectedUnits.clear();filterIds.forEach(id=>$('#'+id).value='');Object.values(state.multi).forEach(set=>set.clear());tcSupervisors.clear();",
    );
    adapt(
      "active=false;document.body.classList.remove('slides-frame-active');unlock();closeDetails();if(!snapshot)return;",
      "active=false;document.body.classList.remove('slides-frame-active');unlock();closeDetails();if(!snapshot)return;\n   tcSelectedUnits.clear();(snapshot.units||[]).forEach(unit=>tcSelectedUnits.add(unit));",
    );
    // Project-specific exception: VT has a 175-point target; the default renderer
    // still uses the reviewed 127-point rule. All formulas consume tcRule().
    const originalRule =
      "function tcRule(){return {rev:.0701,tec:.95,prod:127,strict:false,label:'Regra vigente em todas as operações: revisita < 7,01%; TEC1 ≥ 95%; produtividade ≥ 127 pontos/dia'};}";
    if (!code.includes(originalRule))
      throw Error("Review the TC rule before porting this reference.");
    code = code.replace(
      originalRule,
      "function tcRule(){return referenceCertificationRule(environment.technicalVisit);}",
    );
    code = code.replace(
      "$('#prodMeta').textContent='≥ 127 pontos/dia';",
      "$('#prodMeta').textContent='≥ '+tcRule().prod+' pontos/dia';$('#fRule option[value=\"fixed\"]').textContent='Todas as operações · ≥ '+tcRule().prod+' pontos/dia';",
    );
    code = code.replace(
      "limite inclusivo de 127 pontos/dia",
      "limite inclusivo de ${tcRule().prod} pontos/dia",
    );
    code = code.replace(
      '<small class="sv-sub">Meta ≥ 127</small>',
      "<small class=\"sv-sub\">Meta ≥ '+tcRule().prod+'</small>",
    );
  }
  const load =
    kind === "qq"
      ? `
  window.loadProjectData = payload => {
    const previous = RECS.length > 0;
    RECS = payload.rows.map(row => ({...row}));
    for (const key of Object.keys(NAME_MAP)) delete NAME_MAP[key];
    Object.assign(NAME_MAP, payload.names || {});
    for (const key of Object.keys(SUPERVISOR_MAP)) delete SUPERVISOR_MAP[key];
    Object.assign(SUPERVISOR_MAP, window.parent.getSupervisorMap?.() || {});
    window.qqDataReady = true; init(!previous);
    msg(RECS.length.toLocaleString('pt-BR')+' registros de QQ carregados do sistema.');
  };
  window.getUnifiedSupervisors = () => {
    const units=getMulti('fUn'),clusters=getMulti('fCl'),months=getMulti('fMes');
    const rows=RECS.filter(row=>qqDatePass(row)&&units.includes(row.un)&&clusters.includes(row.cl)&&months.includes(row.d.slice(0,7))&&(!S.city||presentationCityLabel(recCity(row))===S.city));
    return {supervisors:[...svCounts(rows,'lt')].map(([name,logins])=>({name,count:logins.size})),selected:[...S.supervisors]};
  };
  window.setUnifiedSupervisors = values => {
    S.supervisors.clear();values.forEach(value=>S.supervisors.add(value));S.login=null;S.loginSearch='';draw();
  };
  const qqDrawBeforeUnifiedSupervisor=draw;
  draw=function(){qqDrawBeforeUnifiedSupervisor();window.parent.refreshUnifiedMonth?.();};
  window.redraw = () => draw();
  window.isModalOpen = () => $('catModal').classList.contains('on');
  window.closeModal = () => {$('catModal').classList.remove('on');$('catModal').setAttribute('aria-hidden','true');document.body.style.overflow='';};
  window.getProjectState = () => ({rows:RECS,context:qqGeneralContext()});
  window.openDataAudit = tcCount => {
    $('catModalTitle').textContent='Conferência dos dados';
    $('catModalSub').textContent='Bases publicadas neste sistema • registros de origem preservados';
    const units=group(RECS,row=>row.un);
    $('catModalBody').innerHTML='<p>QQ: <b>'+RECS.length.toLocaleString('pt-BR')+'</b> registros. Técnico Certificado: <b>'+Number(tcCount).toLocaleString('pt-BR')+'</b> registros na base deste módulo.</p><table class="qq-orders"><thead><tr><th>Unidade de origem</th><th>O.S.</th><th>Primeira agenda</th><th>Última agenda</th></tr></thead><tbody>'+Object.entries(units).sort(([a],[b])=>a.localeCompare(b)).map(([unit,rows])=>{const dates=rows.map(row=>row.d).filter(Boolean).sort();return '<tr><td>'+qqEscape(unit)+'</td><td>'+rows.length+'</td><td>'+qqEscape(dates[0]||'—')+'</td><td>'+qqEscape(dates.at(-1)||'—')+'</td></tr>';}).join('')+'</tbody></table><p>Arquivos sobrepostos atualizam os mesmos atendimentos e incluem apenas os novos. Unidades e períodos ausentes no novo arquivo permanecem na base. Esta conferência mostra a base completa; os gráficos respeitam os filtros selecionados.</p>';
    $('catModal').classList.add('on');$('catModal').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
  };
  $('file').accept='.xlsx'; $('file').onchange=async e=>{const input=e.currentTarget,files=[...input.files||[]];input.value='';for(const file of files)await environment.importFile('qq',file);};
  $('drop').ondrop=async e=>{e.preventDefault();const files=[...e.dataTransfer.files];for(const file of files)await environment.importFile('qq',file);};
  $('qqImportMode').querySelector('option[value="replace"]')?.remove();
  $('clr').hidden=true;
  if(!environment.editable){$('drop').hidden=true;$('file').disabled=true;$('qqImportMode').hidden=true;document.querySelector('.qq-import-help').hidden=true;}
  init(true); window.qqDataReady=true;
  `
      : `
  window.loadProjectData = payload => {
    const previous = state.rows.length > 0;
    state.rows=payload.rows.map(row=>({...row}));state.keys=new Set(state.rows.map(tcRowKey));
    for(const key of Object.keys(TECH_MAP))delete TECH_MAP[key];Object.assign(TECH_MAP,payload.techMap||{});
    for(const row of state.rows){const key=svLogin(row.login),name=svValidTechnicianName(row.name,key);TECH_MAP[key]={...TECH_MAP[key],...(name?{name}:{}),company:row.company||TECH_MAP[key]?.company||row.baseUnit};}
    for(const key of Object.keys(TC_NAME_UPDATES))delete TC_NAME_UPDATES[key];Object.assign(TC_NAME_UPDATES,payload.nameUpdates||{});
    for(const key of Object.keys(SUPERVISOR_MAP))delete SUPERVISOR_MAP[key];Object.assign(SUPERVISOR_MAP,window.parent.getSupervisorMap?.()||{});
    state.ready=true;applyMaps();initFilters(!previous);setLoading(false);render();
    $('#fileMeta').textContent=state.rows.length.toLocaleString('pt-BR')+' registros de TC carregados do sistema.';
  };
  window.getUnifiedSupervisors = () => ({supervisors:[...svCounts(state.rows.filter(row=>rowPass(row,false,true)),'login')].map(([name,logins])=>({name,count:logins.size})),selected:[...tcSupervisors]});
  window.setUnifiedSupervisors = values => {
    tcSupervisors.clear();values.forEach(value=>tcSupervisors.add(value));state.focus=null;render();
  };
  const tcRenderBeforeUnifiedSupervisor=render;
  render=function(){tcRenderBeforeUnifiedSupervisor();window.parent.refreshUnifiedMonth?.();};
  window.redraw = () => render();
  window.isModalOpen = () => $('#modal').classList.contains('show');
  window.closeModal = () => tcCloseModal();
  window.getProjectState = () => ({rows:state.rows,result:state.result});
  $('#fileInput').onchange=async e=>{const input=e.currentTarget,files=[...input.files||[]];input.value='';for(const file of files)await environment.importFile('tc',file);};
  $('#dropzone').ondrop=async e=>{e.preventDefault();const files=[...e.dataTransfer.files];for(const file of files)await environment.importFile('tc',file);};
  $('#btnCad').onclick=()=>window.parent.show('supervisors');$('#btnClear').hidden=true;
  if(!environment.editable){$('#dropzone').hidden=true;$('#fileInput').disabled=true;$('#btnCad').hidden=true;}
  state.ready=true;initFilters(true);setLoading(false);render();
  `;
  const imports =
    kind === "tc"
      ? 'import { referenceCertificationRule } from "../reference-certification-rule";\nimport { referenceCityMembers } from "../reference-city-members";\n'
      : 'import { qqChartPointMarkup, wireQQChartDrilldown } from "../reference-qq-charts";\n';
  const output = `// Reviewed reference ${hash}; generated visual engine. No personal seed data.\n${imports}export function ${name}(environment) {\nconst {document,window,localStorage,location,ResizeObserver,setTimeout,clearTimeout,requestAnimationFrame}=environment;\n${code}\n${load}\nreturn window;\n}\n`;
  fs.writeFileSync(`${folder}/${kind}-engine.js`, output);
  fs.writeFileSync(
    `${folder}/${kind}-engine.d.ts`,
    `import type { ReferenceEnvironment, ReferenceEngine } from "../reference-types";\nexport function ${name}(environment: ReferenceEnvironment): ReferenceEngine;\n`,
  );
  const scoped = postcss.parse(style(frame));
  scoped.walkRules((rule) => {
    rule.selectors = rule.selectors.map((selector) =>
      selector
        .replace(
          /(^|[\s>+~,(])(?:body|html)(?=[:.#\s>+~),\[]|$)/g,
          (_, prefix) => prefix + ".reference-body",
        )
        .replace(/:root/g, ":host"),
    );
  });
  // The HTML has no web-font download. Avoid accidentally picking up the
  // application's globally downloaded Inter instead of its original fallback.
  if (kind === "tc")
    scoped.walkDecls("font-family", (decl) => {
      decl.value = decl.value.replace(/\bInter\b/g, '"Quality Reference Inter"');
    });
  scoped.walkAtRules("media", (rule) => {
    if (/^(\s*\((min|max)-(width|height):[^)]+\)\s*(and\s*)?)+$/.test(rule.params)) {
      rule.name = "container";
      rule.params = "quality-frame " + rule.params;
    }
  });
  const css =
    (kind === "tc"
      ? '@font-face{font-family:"Quality Reference Inter";src:local("Inter");font-weight:100 900;}\n'
      : "") +
    scoped
      .toString()
      .replace(/([\d.]+)vh/g, (_, n) => `calc(var(--reference-viewport) * ${Number(n) / 100})`)
      .replace(/([\d.]+)vw/g, (_, n) => `calc(var(--reference-width) * ${Number(n) / 100})`);
  templates.push(
    `export const ${kind}Style=${JSON.stringify(css)};\nexport const ${kind}Markup=${JSON.stringify(body(frame))};`,
  );
}
// Extract only the original outer toolbar. No frame/audit/data/script is shipped.
const outer = html.replace(/<iframe\b[^>]*srcdoc="[\s\S]*?"[^>]*>[\s\S]*?<\/iframe>/g, "");
const toolbar = plain(outer).match(/<header class="top">([\s\S]*?)<\/header>/)[0];
const tree = postcss.parse(style(outer));
tree.walkRules((rule) => {
  if (rule.parent.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
  rule.selectors = rule.selectors.map((selector) =>
    /(^|[\s>+~,(])body(?=[:.#\s>+~),\[]|$)|:root/.test(selector)
      ? selector
          .replace(
            /(^|[\s>+~,(])body(?=[:.#\s>+~),\[]|$)/g,
            (_, prefix) => prefix + ".quality-reference",
          )
          .replace(/:root/g, ".quality-reference")
      : `.quality-reference ${selector}`,
  );
});
templates.push(`export const referenceToolbar=${JSON.stringify(toolbar)};`);
fs.writeFileSync(
  `${folder}/templates.ts`,
  `// Extracted visual markup/styles only, no datasets or executable scripts.\n${templates.join("\n")}\n`,
);
fs.writeFileSync(`${folder}/toolbar.css`, tree.toString());
console.log(
  JSON.stringify({
    sourceHash: hash,
    seedDataExcluded: true,
    iframesExcluded: true,
    originalStylesAndSVG: true,
  }),
);
