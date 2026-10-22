// Reviewed SLA reference 4ba57ce2a356a8acedc270648099194f68cdc22fef6610d5a61d9853db8d4545. No embedded personal records.
import { isSlaOffenderChartCode } from '../../../lib/sla-code-chart';
import { createSlaDirectoryPresentation } from '../../../lib/sla-directory';
import { createSlaTableSort } from '../../../lib/sla-table-sort';
export function mountSla(environment){
const {document,window}=environment;
const technicians=createSlaDirectoryPresentation(()=>window.parent.getSupervisorMap());

const serviceSort=createSlaTableSort(document,'serviceBody',[
 {type:'text',value:r=>r.name},
 {type:'number',value:r=>r.os},
 {type:'number',value:r=>r.os},
 {type:'number',value:r=>r.total},
 {type:'number',value:r=>r.revis},
 {type:'number',value:r=>r.logs},
 {type:'number',value:r=>r.sla}
],()=>renderServiceTable());
const techSort=createSlaTableSort(document,'techBody',[
 {type:'text',value:r=>technicians.text(r.name)},
 {type:'number',value:r=>r.total},
 {type:'number',value:r=>r.good},
 {type:'number',value:r=>r.revis},
 {type:'number',value:r=>r.logs},
 {type:'number',value:r=>r.sla}
],()=>renderTechTable());
const detailSort=createSlaTableSort(document,'detailBody',[
 {type:'date',value:r=>r.reportDate},
 {type:'text',value:r=>r.contract},
 {type:'text',value:r=>r.city},
 {type:'text',value:r=>technicians.text(r.tech)},
 {type:'text',value:r=>r.businessUnit},
 {type:'text',value:r=>r.os},
 {type:'number',value:r=>r.taskCount},
 {type:'number',value:r=>r.logs},
 {type:'text',value:r=>r.revisit?'SEM PADRÃO':'COM PADRÃO'},
 {type:'text',value:r=>r.typeOS}
],()=>{page=1;renderDetails();});


const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let INITIAL={"source":"Nenhuma base importada","sourceType":"","stats":{},"fields":[],"rows":[],"history":{"source":"Nenhuma base importada","sourceType":"","stats":{},"fields":[],"rows":[]},"previousCsv":{"source":"Nenhuma base importada","sourceType":"","stats":{},"fields":[],"rows":[]}};
let allRows=INITIAL.rows.map(values=>Object.fromEntries(INITIAL.fields.map((k,i)=>[k,values[i]])));
let sourceName=INITIAL.source,sourceType=INITIAL.sourceType||'CSV',importStats=INITIAL.stats;
let metricMode='attendance';
let currentIndicator='Sla Garantia Total',selectedLocations=new Set(),locationOptions=[];
let rawCurrent=[],groupedCurrent=[],dayData=[],techData=[],serviceData=[];
let page=1,drillPage=1,drillRows=[],drillTrigger=null,drillContext={};
const PAGE_SIZE=40,DRILL_SIZE=30;
let actions=new Map(),actionSeq=0;
function norm(s){ return String(s ?? '').trim(); }
function fold(s){ return norm(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase(); }
function n(v){
  if(typeof v==='number') return Number.isFinite(v)?v:NaN;
  let s=norm(v); if(!s) return NaN;
  if(s.includes(',')) s=s.replace(/\./g,'').replace(',','.');
  const x=Number(s); return Number.isFinite(x)?x:NaN;
}
function parseDate(v){
  if(v instanceof Date) return isNaN(v)?null:new Date(v.getFullYear(),v.getMonth(),v.getDate());
  if(typeof v==='number' && v>0){const d=new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000);return new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());}
  const s = norm(v);
  if(!s) return null;
  let m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(m){const d=new Date(Number(m[3]),Number(m[2])-1,Number(m[1]));return d.getFullYear()===Number(m[3])&&d.getMonth()===Number(m[2])-1&&d.getDate()===Number(m[1])?d:null;}
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m){const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));return d.getFullYear()===Number(m[1])&&d.getMonth()===Number(m[2])-1&&d.getDate()===Number(m[3])?d:null;}
  const d = new Date(s);
  return isNaN(d)?null:d;
}
function brDate(v){ const d = v instanceof Date ? v : parseDate(v); return d ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : ''; }
function yyyymm(v){ const d=parseDate(v); return d ? `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}` : ''; }
function pct(v){ return Number.isFinite(v) ? v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%' : '—'; }
function intfmt(v){ return Math.round(Number(v||0)).toLocaleString('pt-BR'); }
function isSemPadrao(q){ const f = fold(q); return f.includes('SEM PADRAO') || f.includes('SEM PADRÃO'); }

function csvToRows(text){
  text = String(text||'').replace(/^\uFEFF/, '');
  const first = (text.split(/\r?\n/, 1)[0] || '');
  const delims = [';', ',', '\t'];
  const delim = delims.sort((a,b)=>first.split(b).length-first.split(a).length)[0];
  const rows=[]; let row=[], field='', q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(q){
      if(ch==='"' && text[i+1]==='"'){ field+='"'; i++; }
      else if(ch==='"') q=false;
      else field+=ch;
    } else {
      if(ch==='"') q=true;
      else if(ch===delim){ row.push(field); field=''; }
      else if(ch==='\n'){ row.push(field.replace(/\r$/, '')); rows.push(row); row=[]; field=''; }
      else field+=ch;
    }
  }
  if(q)throw new Error('CSV contém aspas não fechadas. Confira o arquivo de origem.');
  if(field.length || row.length){ row.push(field.replace(/\r$/, '')); rows.push(row); }
  const headers=(rows[0]||[]).map(h=>String(h).trim().replace(/^\uFEFF/,''));
  return rows.slice(1).filter(r=>r.some(v=>String(v).trim()!==''))
    .map(r=>{ const o={}; headers.forEach((h,i)=>o[h]=r[i]??''); return o; });
}

function firstValue(obj, keys){
  for(const k of keys){ if(Object.prototype.hasOwnProperty.call(obj,k) && norm(obj[k])!=='') return obj[k]; }
  return '';
}
function standardizeDetailedImported(raw,{legacy=false}={}){
  const stats={total:raw.length,otherIndicator:0,expurgated:0,notExecuted:0,duplicates:0,fallback:0,legacy:legacy?raw.length:0};
  const seen=new Map();
  const prepared=[];
  for(let index=0;index<raw.length;index++){
    const r=Object.fromEntries(Object.entries(raw[index]).map(([k,v])=>[norm(k).replace(/^\uFEFF/,''),v]));
    const indicator=norm(firstValue(r,['NM_INDICADOR_NEGOCIO_BI','indicator']));
    if(!indicator && !legacy) throw new Error(`Linha ${index+2}: falta NM_INDICADOR_NEGOCIO_BI. Não é seguro misturar os indicadores.`);
    if(!legacy && !['SLA GARANTIA TOTAL','SLA GARANTIA'].includes(fold(indicator))){stats.otherIndicator++;continue;}
    const report = firstValue(r,['DT_NOTA','DAT_NOTA','reportDate']);
    const contract = firstValue(r,['NR_CONTRATO','NUM_CONTA','contract']);
    const city = firstValue(r,['MUNICIPIO','DSC_MUNICIPIO_BI','city']);
    const status = firstValue(r,['NM_TIPO_FECHAMENTO_SOLIC_BI','statusFechamento']);
    const qualifier=norm(firstValue(r,['DSC_QUALIFICADOR_OS','qualifier']));
    if(fold(status)==='EXPURGADO'||fold(qualifier)==='EXPURGADO'){stats.expurgated++;continue;}
    if(!norm(status)&&!legacy)throw new Error(`Linha ${index+2}: falta o status de fechamento para identificar as OS executadas.`);
    if(norm(status) && fold(status)!=='EXECUTADA'){stats.notExecuted++;continue;}
    const logs=n(firstValue(r,['QT_LOG_VISITA','QTD_LOG_OS_VT','logs']));
    if(!Number.isInteger(logs)||logs<0) throw new Error(`Linha ${index+2}: QT_LOG_VISITA ausente ou inválido.`);
    const standard=firstValue(r,['QTD_ATEND_PADRAO','QTD_OS_ATEND_PADRAO','standardCount']);
    let standardCount=n(standard);
    if(standard===''){
      if(!['COM PADRAO','SEM PADRAO'].includes(fold(qualifier))) throw new Error(`Linha ${index+2}: falta QTD_ATEND_PADRAO e qualificador válido.`);
      standardCount=isSemPadrao(qualifier)?0:1;stats.fallback++;
    }
    if(![0,1].includes(standardCount)) throw new Error(`Linha ${index+2}: QTD_ATEND_PADRAO deve ser 0 ou 1.`);
    const row={
      indicator:legacy?'Sla Garantia Total':(fold(indicator)==='SLA GARANTIA'?'Sla Garantia':'Sla Garantia Total'),
      reportDate: brDate(report) || norm(report),
      contract: norm(contract),
      os: norm(firstValue(r,['NR_ORDEM_SERVICO','COD_OS','os'])),
      city: norm(city),
      uf: norm(firstValue(r,['UF','DSC_SGL_ESTADO','uf'])),
      cluster: norm(firstValue(r,['NM_CLUSTER','DSC_CLUSTER_BI','cluster'])),
      businessUnit: norm(firstValue(r,['NM_UNIDADE_NEGOCIO_TECNICO','DSC_UNIDADE_NEGOCIO_UNIF','businessUnit'])),
      segment: norm(firstValue(r,['SEGMENTACAO','DSC_SEG_PRODUTO','NM_SEGMENTO_MUNICIPIO','segment'])),
      company: norm(firstValue(r,['NM_EMPRESA_EXECUCAO','company'])),
      tech: norm(firstValue(r,['CD_LOGIN_TECNICO','COD_LOGIN_TECNICO','tech'])),
      typeOS: norm(firstValue(r,['DSC_TIPO_OS','DSC_TIPO_ORDEM_SERVICO','typeOS'])),
      qualifier, standardCount, logs, legacyNoOffenders:legacy,
      codigoBaixa: norm(firstValue(r,['CODIGO_BAIXA','COD_BAIXA','codigoBaixa'])),
      statusFechamento: norm(status),
      execDate: brDate(firstValue(r,['DH_BAIXA_ORDEM_SERVICO','DAT_BAIXA','execDate'])),
      offenderOS:norm(firstValue(r,['LIST_NR_ORDEM_SERVICO_OFENSOR','offenderOS'])),
      offenderCodes:norm(firstValue(r,['LIST_COD_BX_OS_OFENSOR','offenderCodes'])),
      offenderTypes:norm(firstValue(r,['LS_NM_TP_ORD_SERVICO_OFENSOR','offenderTypes'])),
      offenderCompanyIDs:norm(firstValue(r,['LS_ID_EMPRESA_EXECUCAO_OFENSOR','offenderCompanyIDs'])),
      offenderCompanies:norm(firstValue(r,['LS_NM_EMPRESA_EXECUCAO_OFENSOR','offenderCompanies'])),
      offenderDates:norm(firstValue(r,['DSC_LISTA_DT_BAIXA_OS_OFENSORA','offenderDates'])),
      logicalKey:norm(firstValue(r,['CHAVE_LOGICA','logicalKey']))
    };
    if(!parseDate(row.reportDate)||!row.contract||!row.city||!row.os) throw new Error(`Linha ${index+2}: data, contrato, município ou OS inválido.`);
    const offenderCount=new Set(listValues(row.offenderOS)).size;
    if(!legacy && offenderCount!==row.logs)throw new Error(`OS ${row.os}: a lista de OS ofensoras contém ${offenderCount} revisitas, mas QT_LOG_VISITA informa ${row.logs}. É necessário conferir a lista para consolidar sem duplicar logs.`);
    row.recordKey=JSON.stringify([row.indicator,row.reportDate,row.city,row.os]);
    const serial=JSON.stringify(row);
    if(seen.has(row.recordKey)){
      if(seen.get(row.recordKey)!==serial) throw new Error(`OS ${row.os}: registros conflitantes na mesma data e cidade. Confira o analítico.`);
      stats.duplicates++;continue;
    }
    seen.set(row.recordKey,serial);prepared.push(row);
  }
  if(!prepared.length)throw new Error('O arquivo não contém registros válidos de Sla Garantia nem de Sla Garantia Total.');
  importStats=stats;
  return prepared;
}

function exportDetailedRowsText(data){
  // O export analítico preserva as OS de origem, mesmo quando a tela agrupa atendimentos.
  data=[...new Map(data.flatMap(r=>r.rows||[r]).map(r=>[r.recordKey,r])).values()];
  const columns=[['DT_NOTA','reportDate'],['NM_INDICADOR_NEGOCIO_BI','indicator'],['DH_BAIXA_ORDEM_SERVICO','execDate'],['NR_CONTRATO','contract'],['NR_ORDEM_SERVICO','os'],['MUNICIPIO','city'],['UF','uf'],['NM_CLUSTER','cluster'],['NM_UNIDADE_NEGOCIO_TECNICO','businessUnit'],['SEGMENTACAO','segment'],['CD_LOGIN_TECNICO','tech'],['NM_EMPRESA_EXECUCAO','company'],['DSC_TIPO_OS','typeOS'],['CODIGO_BAIXA','codigoBaixa'],['QTD_ATEND_PADRAO','standardCount'],['QT_LOG_VISITA','logs'],['DSC_QUALIFICADOR_OS','qualifier'],['NM_TIPO_FECHAMENTO_SOLIC_BI','statusFechamento'],['LIST_NR_ORDEM_SERVICO_OFENSOR','offenderOS'],['LIST_COD_BX_OS_OFENSOR','offenderCodes'],['LS_NM_TP_ORD_SERVICO_OFENSOR','offenderTypes'],['LS_ID_EMPRESA_EXECUCAO_OFENSOR','offenderCompanyIDs'],['LS_NM_EMPRESA_EXECUCAO_OFENSOR','offenderCompanies'],['DSC_LISTA_DT_BAIXA_OS_OFENSORA','offenderDates'],['CHAVE_LOGICA','logicalKey']];
  const cell=s=>{let v=String(s??'');if(/^[=+@]/.test(v))v="'"+v;return /[;"\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
  return '\uFEFF'+[columns.map(c=>c[0]).join(';'),...data.map(r=>columns.map(c=>cell(r[c[1]])).join(';'))].join('\r\n');
}

function downloadRows(data,name){
  const blob = new Blob([exportRowsText(data)], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=name;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function searchText(r){return fold([technicians.text(r.tech),r.contract,r.os,r.city,r.tech,r.company,r.typeOS,r.businessUnit,r.offenderOS,r.offenderCodes,r.offenderCompanies,r.offenderTypes,r.offenderDates].join(' '));}

function sourceList(value){
  const s=norm(value);
  if(!s||/^-\d+$/.test(s)) return '<span class="muted">Não informado</span>';
  return esc(s).replace(/,\s*/g,'<br>');
}



function listValues(value){return norm(value).split(',').map(norm).filter(v=>v&&!/^-\d+$/.test(v));}
function groupRowsV15(rows){
 const m=new Map();
 for(const r of rows){
  const key=JSON.stringify([r.indicator,r.contract,r.reportDate,r.city]);
  if(!m.has(key))m.set(key,{key,rows:[],offenders:new Map()});
  const g=m.get(key);g.rows.push(r);
  norm(r.offenderOS).split(',').map(norm).forEach((os,i)=>{
   if(!os||/^-\d+$/.test(os))return;
   const read=field=>{const v=norm(r[field]).split(',').map(norm)[i]||'';return /^-\d+$/.test(v)?'':v;};
   const o={os,codes:read('offenderCodes'),types:read('offenderTypes'),companies:read('offenderCompanies'),companyIDs:read('offenderCompanyIDs'),dates:read('offenderDates')};
   const old=g.offenders.get(os);
   if(old){for(const field of ['codes','types','companies','companyIDs','dates']){if(!old[field])old[field]=o[field];}}
   else g.offenders.set(os,o);
  });
 }
 return [...m.values()].map(g=>{
  const unique=field=>[...new Set(g.rows.map(r=>r[field]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'pt-BR')).join(', ');
  const offenders=[...g.offenders.values()],legacy=g.rows.some(r=>r.legacyNoOffenders);
  const logs=legacy?Math.max(0,...g.rows.map(r=>r.logs)):offenders.length;
  // Preserva a classificação do analítico. SEM PADRAO sem log não vira COM PADRAO.
  const revisit=g.rows.some(r=>r.standardCount===0||isSemPadrao(r.qualifier))||logs>0;
  return {...g.rows[0],key:g.key,rows:g.rows,offenders,os:unique('os'),osCount:g.rows.length,
   tech:unique('tech'),company:unique('company'),businessUnit:unique('businessUnit'),segment:unique('segment'),typeOS:unique('typeOS'),execDate:unique('execDate'),
   logs,revisit,standardCount:Number(!revisit),qualifier:revisit?'SEM PADRAO':'COM PADRAO',noLogException:revisit&&logs===0,
   offenderOS:offenders.map(o=>o.os).join(', '),offenderCodes:offenders.map(o=>o.codes||'Não informado').join(', '),
   offenderTypes:offenders.map(o=>o.types||'Não informado').join(', '),offenderCompanies:offenders.map(o=>o.companies||'Não informado').join(', '),offenderDates:offenders.map(o=>o.dates||'Não informado').join(', ')};
 }).sort((a,b)=>parseDate(a.reportDate)-parseDate(b.reportDate)||a.contract.localeCompare(b.contract));
}
function calcV15(groups){const total=groups.length,good=groups.reduce((s,g)=>s+g.standardCount,0),logs=groups.reduce((s,g)=>s+g.logs,0);return {total,good,revis:total-good,logs,sla:total+logs?good*100/(total+logs):NaN};}
function summarize(groups,keyFn){const map=new Map();for(const g of groups){const key=keyFn(g)||'Não informado';if(!map.has(key))map.set(key,[]);map.get(key).push(g);}return [...map].map(([name,rows])=>({name,rows,...calc(rows)}));}
function dimensionV15(rows,field){const map=new Map();for(const r of rows){const key=r[field]||'Não informado';if(!map.has(key))map.set(key,[]);map.get(key).push(r);}return [...map].map(([name,raw])=>{const rows=groupRows(raw);return {name,raw,rows,os:raw.length,withLog:raw.filter(r=>r.logs>0).length,...calc(rows)};});}
function action(fn){const id=String(++actionSeq);actions.set(id,fn);return `data-action="${id}"`;}
function link(label,fn,title='Abrir contratos, OS e ofensores'){return `<button class="text-link" ${action(fn)} title="${esc(title)}">${esc(label)}</button>`;}
function hit(fn,title){return `${action(fn)} role="button" tabindex="0" aria-label="${esc(title)}"`;}
function tooltip(d){return `${d.technicianLabel||d.name}: ${intfmt(d.total)} ${modeLabel(metricMode)}; ${intfmt(d.revis)} sem padrão; ${intfmt(d.logs)} logs; SLA ${pct(d.sla)}`;}
function drillFor(d,title,filter='bad',context={}){openDrill(d.rows,title||d.name,filter,context);}
function optionFill(id,values,first='Todos'){const el=$(id),prev=el.value;el.innerHTML=`<option value="">${first}</option>`+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');if(values.includes(prev))el.value=prev;}
function populateFiltersV15(latest=false){
 const rows=allRows.filter(r=>r.indicator===currentIndicator),unique=field=>[...new Set(rows.map(r=>r[field]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const months=[...new Set(rows.map(r=>yyyymm(r.reportDate)))].sort();optionFill('fMonth',months);
 if(latest)$('fMonth').value=months.at(-1)||'';
 optionFill('fType',unique('typeOS'));optionFill('fSegment',unique('segment'));optionFill('fBU',unique('businessUnit'));
 locationOptions=[...new Set(rows.flatMap(r=>[r.city,r.cluster]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 selectedLocations=new Set([...selectedLocations].filter(x=>locationOptions.includes(x)));renderLocationOptions();
}
function renderLocationOptions(){
 const q=fold($('fLocSearch').value),visible=locationOptions.filter(v=>!q||fold(v).includes(q));
 $('fLocOptions').innerHTML=visible.map(v=>`<label class="multi-option"><input type="checkbox" data-location="${esc(v)}" ${selectedLocations.has(v)?'checked':''}>${esc(v)}</label>`).join('')||'<p class="muted">Nenhum resultado</p>';
 const selected=[...selectedLocations];$('fLocButton').textContent=selected.length?selected.join(', '):'Todos';$('fLocButton').title=selected.join(', ')||'Todos';
}
function filteredRowsV15(){return allRows.filter(r=>r.indicator===currentIndicator&&(!selectedLocations.size||selectedLocations.has(r.city)||selectedLocations.has(r.cluster))&&(!$('fMonth').value||yyyymm(r.reportDate)===$('fMonth').value)&&(!$('fType').value||r.typeOS===$('fType').value)&&(!$('fSegment').value||r.segment===$('fSegment').value)&&(!$('fBU').value||r.businessUnit===$('fBU').value));}
function dateDay(v){const d=parseDate(v);return d?d.getDay():null;}
function kindOf(v){const d=dateDay(v);return d===0?'sunday':d===6?'saturday':'weekday';}
function shortDate(v){return v.slice(0,5);}
function makeDaily(groups){
 if(!groups.length)return [];
 const existing=new Map(summarize(groups,g=>g.reportDate).map(d=>[d.name,d]));
 const dates=groups.map(g=>parseDate(g.reportDate)),start=new Date(Math.min(...dates)),end=new Date(Math.max(...dates));
 // Ausência de linha não equivale a zero ou a 100%: mantém lacunas entre datas.
 const out=[];for(let d=start;d<=end;d.setDate(d.getDate()+1)){const name=brDate(d);out.push(existing.get(name)||{name,rows:[],...calc([])});}return out;
}
function rangeText(values){const ds=values.filter(Boolean).map(parseDate).filter(Boolean).sort((a,b)=>a-b);return ds.length?`${brDate(ds[0])} a ${brDate(ds.at(-1))}`:'Sem dados';}
function renderHeaderV15(){
 const c=calc(groupedCurrent),isTotal=currentIndicator==='Sla Garantia Total';
 $('kTotal').textContent=intfmt(c.total);$('kSem').textContent=intfmt(c.revis);$('kLogs').textContent=intfmt(c.logs);$('kCom').textContent=intfmt(c.good);$('kSlaValue').textContent=pct(c.sla);
 $('indicatorTotal').classList.toggle('selected',isTotal);$('indicatorRegular').classList.toggle('selected',!isTotal);
 $('indicatorTotal').disabled=!allRows.some(r=>r.indicator==='Sla Garantia Total');$('indicatorRegular').disabled=!allRows.some(r=>r.indicator==='Sla Garantia');
 $('indicatorCaution').textContent=isTotal?'Regra do glossário · contrato + data do relatório + município':'Comparativo de 10 dias · o glossário recebido documenta somente o indicador Total.';
 $('mainChartTitle').textContent=isTotal?'SLA Garantia Total · mensal':'SLA Garantia · mensal (comparativo)';
 const range=rangeText(rawCurrent.map(r=>r.reportDate));$('periodLabel').textContent=range;
 const last=rawCurrent.map(r=>parseDate(r.reportDate)).sort((a,b)=>b-a)[0];
 const partial=last&&last.getDate()<new Date(last.getFullYear(),last.getMonth()+1,0).getDate();
 $('sourceInfo').innerHTML=`Fonte: <b>${esc(sourceName)}</b> · ${intfmt(rawCurrent.length)} OS de origem · ${intfmt(c.total)} atendimentos · execução: ${esc(rangeText(rawCurrent.map(r=>r.execDate)))}${partial?' · <b>Último mês parcial</b>':''}`;
 $('formulaNote').textContent=c.total?`SLA = (${intfmt(c.total)} − ${intfmt(c.revis)}) ÷ (${intfmt(c.total)} + ${intfmt(c.logs)}) × 100 = ${pct(c.sla)}. Clique nos indicadores para detalhar.`:'Sem registros para os filtros selecionados.';
 const exceptions=groupedCurrent.filter(g=>g.noLogException);
 $('qualityNotice').hidden=!exceptions.length&&!importStats.legacy;
 $('qualityNotice').innerHTML=importStats.legacy?'Base legada: resultado exploratório, sem identificação completa das OS ofensoras.':exceptions.length?`${link(`${exceptions.length} atendimento${exceptions.length===1?'':'s'} sem padrão e sem log detalhado`,()=>openDrill(exceptions,'Exceções do analítico · sem padrão / zero logs','all'))}. A classificação QTD_ATEND_PADRAO = 0 foi mantida no cálculo. Veja as OS e a memória de cálculo para conferir.`:'';
 $('monthlyNote').textContent=last?`Última DT_NOTA no recorte: ${brDate(last)}${partial?' · mês parcial':''}.`:'Sem registros.';
}
function renderBars(id,data,{value='sla',percent=false,total=0,color='var(--total)',onClick}={}){
 const el=$(id);if(!data.length){el.innerHTML='<div class="msg">Sem registros neste recorte.</div>';return;}
 const max=value==='sla'?100:Math.max(1,...data.map(d=>d[value]));
 el.innerHTML=data.map(d=>{const val=d[value],display=value==='sla'?pct(val):`${intfmt(val)}${percent?' · '+pct(total?100*val/total:NaN):''}`;return `<button class="bar-row" ${action(()=>onClick?onClick(d):drillFor(d))} title="${esc(d.name)} · ${esc(display)}"><span class="bar-caption"><span class="name">${esc(d.name)}</span><span class="value">${esc(display)}</span></span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(0,Math.min(100,val/max*100))}%;background:${color}"></div></div></button>`;}).join('');
}
function renderGeography(){
 const data=summarize(groupedCurrent,g=>g[$('fView').value]).sort((a,b)=>a.sla-b.sla);
 const target=$('visaoChart');if(!data.length){target.innerHTML='<div class="msg">Sem dados.</div>';return;}
 const W=Math.max(300,data.length*95),H=220,mt=30,base=165,ih=125,step=(W-35)/data.length;
 target.innerHTML=`<svg viewBox="0 0 ${W} ${H}" style="min-width:${W}px" aria-label="SLA por localidade">${[0,50,100].map(v=>`<line class="grid" x1="30" y1="${base-v/100*ih}" x2="${W}" y2="${base-v/100*ih}"/><text class="lab" x="25" y="${base-v/100*ih+4}" text-anchor="end">${v}</text>`).join('')}${data.map((d,i)=>{const x=35+(i+.5)*step,w=Math.min(50,step*.5),label=d.name.replace('Cluster ','');return `<g ${hit(()=>drillFor(d,`SLA · ${d.name}`),tooltip(d))}><title>${esc(tooltip(d))}</title><rect x="${x-w/2}" y="${base-d.sla/100*ih}" width="${w}" height="${d.sla/100*ih}" fill="var(--red)"/><text x="${x}" y="${base-d.sla/100*ih-8}" text-anchor="middle" class="val">${pct(d.sla)}</text><text class="lab" x="${x}" y="${base+20}" text-anchor="middle">${esc(label.length>17?label.slice(0,16)+'…':label)}</text></g>`;}).join('')}</svg>`;
}
function renderCombo(id,data,{daily=false,volumeOnly=false}={}){
 const target=$(id);if(!data.length){target.innerHTML='<div class="msg">Sem dados.</div>';return;}
 const named=volumeOnly&&data.some(d=>d.technicianLabel);
 const step=daily?76:volumeOnly?68:140,W=Math.max(volumeOnly?600:460,data.length*step+88+(named?55:0)),H=daily?280:named?310:250,ml=named?100:45,mr=43,mt=43,mb=volumeOnly?(named?132:72):40,ih=H-mt-mb,iw=W-ml-mr,s=iw/data.length;
 const max=Math.max(1,...data.map(d=>Math.max(d.total,d.logs))),top=Math.ceil(max/4)*4;
 let svg=`<svg viewBox="0 0 ${W} ${H}" style="min-width:${W}px" aria-label="${daily?'Evolução diária':'Volume e SLA'}"><text class="lab" x="${ml}" y="12">Quantidade</text><text class="lab" x="${W-mr}" y="12" text-anchor="end">SLA %</text>`;
 for(let j=0;j<=4;j++){const y=mt+ih-ih*j/4;svg+=`<line class="grid" x1="${ml}" y1="${y}" x2="${W-mr}" y2="${y}"/><text class="lab" x="${ml-7}" y="${y+3}" text-anchor="end">${intfmt(top*j/4)}</text><text class="lab" x="${W-mr+8}" y="${y+3}">${j*25}%</text>`;}
 let segments=[],points=[];
 data.forEach((d,i)=>{
  const cx=ml+s*(i+.5),valid=Number.isFinite(d.sla),py=mt+ih-d.sla/100*ih;
  if(valid)points.push(`${cx},${py}`);else if(points.length){segments.push(points);points=[];}
  const fn=()=>drillFor(d,`${daily?'SLA de ':volumeOnly?'Matrícula ':'SLA de '}${d.name}`),title=tooltip(d),bw=Math.min(volumeOnly?28:19,s/(volumeOnly?2:4.6));
  svg+=`<g ${hit(fn,title)}><title>${esc(title)}</title>`;
  if(d.total){const fields=volumeOnly?['total']:['total','revis','logs'];fields.forEach((f,j)=>{const val=d[f],x=volumeOnly?cx-bw/2:cx+(j-1)*bw-bw/2,color=f==='total'?(daily?`var(--${kindOf(d.name)})`:'var(--total)'):f==='revis'?'var(--revis)':'var(--logs)';svg+=`<rect x="${x}" y="${mt+ih-val/top*ih}" width="${bw-1}" height="${val/top*ih}" fill="${color}"/>`;if(!daily&&!volumeOnly)svg+=`<text class="lab" x="${x+bw/2}" y="${mt+ih-val/top*ih-5}" text-anchor="middle">${intfmt(val)}</text>`;});}
  else svg+=`<text class="lab" x="${cx}" y="${mt+ih-7}" text-anchor="middle">—</text>`;
  const name=daily?shortDate(d.name):(d.axisName||d.name);
  svg+=volumeOnly?`<text class="lab" x="${cx}" y="${mt+ih+14}" text-anchor="end" transform="rotate(-40 ${cx} ${mt+ih+14})">${esc(name)}${d.technicianLabel?`<tspan x="${cx}" dy="13">${esc(d.axisLogin)}</tspan>`:''}</text>`:`<text class="lab" x="${cx}" y="${H-19}" text-anchor="middle">${esc(name)}</text>`;
  if(daily)svg+=`<text class="lab" style="font-size:9px" x="${cx}" y="${H-6}" text-anchor="middle">${['dom','seg','ter','qua','qui','sex','sáb'][dateDay(d.name)]}</text>`;
  svg+='</g>';
 });
 if(points.length)segments.push(points);svg+=segments.map(p=>`<polyline points="${p.join(' ')}" fill="none" stroke="#292d33" stroke-width="1.7" pointer-events="none"/>`).join('');
 data.forEach((d,i)=>{if(!Number.isFinite(d.sla))return;const x=ml+s*(i+.5),y=mt+ih-d.sla/100*ih;svg+=`<g ${hit(()=>drillFor(d,`${daily?'SLA de ':volumeOnly?'Matrícula ':'SLA de '}${d.name}`),tooltip(d))}><title>${esc(tooltip(d))}</title><circle cx="${x}" cy="${y}" r="3" fill="#292d33"/><text class="val" x="${x}" y="${y-10}" text-anchor="middle" style="paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round">${pct(d.sla)}</text></g>`;});
 target.innerHTML=svg+'</svg>';
}
function renderDaily(){
 dayData=makeDaily(groupedCurrent);renderCombo('dailyChart',dayData,{daily:true});
 const kinds=[['weekday','Seg–Sex'],['saturday','Sábado'],['sunday','Domingo']];
 $('dailyDaySummary').innerHTML=kinds.map(([kind,label])=>{const rows=groupedCurrent.filter(g=>kindOf(g.reportDate)===kind),c=calc(rows);return `<button class="daily-kind" ${action(()=>openDrill(rows,`SLA · ${label}`))}><i class="sw" style="background:var(--${kind})"></i>${label}<strong>${pct(c.sla)}</strong><span class="count">${intfmt(c.total)} ${modeLabel(metricMode)}</span></button>`;}).join('');
 $('dailyBody').innerHTML=dayData.map(d=>`<tr><td>${esc(d.name)}</td><td>${['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][dateDay(d.name)]}</td><td class="num">${d.total||'—'}</td><td class="num">${d.total?d.revis:'—'}</td><td class="num">${d.total?d.logs:'—'}</td><td class="num">${d.total?d.good:'—'}</td><td class="num">${d.total?d.total+d.logs:'—'}</td><td class="num">${d.total?link(pct(d.sla),()=>drillFor(d,`Memória de cálculo · ${d.name}`,'all')):'Sem registros'}</td></tr>`).join('');
 const c=calc(groupedCurrent);$('dailyFoot').innerHTML=`<tr><td colspan="2">Total do recorte</td><td class="num">${intfmt(c.total)}</td><td class="num">${intfmt(c.revis)}</td><td class="num">${intfmt(c.logs)}</td><td class="num">${intfmt(c.good)}</td><td class="num">${intfmt(c.total+c.logs)}</td><td class="num">${link(pct(c.sla),()=>openDrill(groupedCurrent,'Total do recorte','all'))}</td></tr>`;
}
function renderCodesV15(){
 const map=new Map();for(const g of groupedCurrent)for(const o of g.offenders){const name=o.codes||'Não informado';if(!map.has(name))map.set(name,{name,value:0,groups:new Map()});const d=map.get(name);d.value++;d.groups.set(g.key,g);}
 const data=[...map.values()].map(d=>({...d,rows:[...d.groups.values()]})).sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name));
 renderBars('codigoChart',data,{value:'value',percent:true,total:calc(groupedCurrent).logs,onClick:d=>openDrill(d.rows,`Baixa ofensora ${d.name} · ${intfmt(d.value)} logs`,'all',{code:d.name,note:`${intfmt(d.value)} logs deste código no recorte. Abaixo, o SLA é recalculado para os atendimentos associados, considerando todos os seus logs. O código selecionado está destacado.`})});
}
function renderCountBars(id,data,{label='Logs',onClick}={}){
 const el=$(id);if(!data.length){el.innerHTML='<div class="msg">Nenhum log no recorte.</div>';return;}
 const W=Math.max(300,data.length*42+35),H=210,base=126,ih=100,max=Math.max(1,...data.map(d=>d.value)),step=(W-30)/data.length;
 el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" style="min-width:${W}px" aria-label="${esc(label)}">${data.map((d,i)=>{const x=15+step*(i+.5),y=base-d.value/max*ih;return `<g ${hit(()=>onClick(d),`${d.name}: ${d.value} ${label}`)}><title>${esc(d.title||d.name)} · ${intfmt(d.value)} ${label}</title><rect x="${x-10}" y="${y}" width="20" height="${base-y}" fill="var(--total)"/><text class="val" x="${x}" y="${y-6}" text-anchor="middle">${intfmt(d.value)}</text><text class="lab" x="${x}" y="${base+15}" text-anchor="end" transform="rotate(-55 ${x} ${base+15})">${esc(d.name)}</text></g>`;}).join('')}</svg>`;
}
function renderLogAndContractsV15(){
 const logs=summarize(groupedCurrent.filter(g=>g.logs>0),g=>String(g.logs)).map(d=>({...d,value:d.total})).sort((a,b)=>Number(b.name)-Number(a.name));
 renderCountBars('logDistChart',logs,{label:'atendimentos',onClick:d=>drillFor(d,`Atendimentos com ${d.name} logs`,'all')});
 const contracts=summarize(groupedCurrent.filter(g=>g.logs>0),g=>JSON.stringify([g.contract,g.city])).map(d=>({...d,name:d.rows[0].contract,title:d.rows[0].contract+' · '+d.rows[0].city,value:d.logs})).sort((a,b)=>b.value-a.value||b.total-a.total).slice(0,25);
 renderCountBars('contractChart',contracts,{onClick:d=>drillFor(d,`Contrato ${d.title}`,'all')});
}
function renderServiceAndTechV15(){
 serviceData=dimension(rawCurrent,'typeOS').sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 renderBars('servicesChart',serviceData.filter(d=>d.withLog>0).sort((a,b)=>b.withLog-a.withLog),{value:'withLog',onClick:d=>openDrill(groupRows(d.raw.filter(r=>r.logs>0)),`${d.name} · OS com log`,'all',{note:`${intfmt(d.withLog)} OS de origem com pelo menos um log, agrupadas nos atendimentos abaixo.`})});
 const c=calc(groupedCurrent);$('serviceCount').textContent=`${serviceData.length} tipos de OS`;
 renderServiceTable();
 $('serviceFoot').innerHTML=`<tr><td>Total distinto do recorte</td><td class="num">${intfmt(rawCurrent.length)}</td><td class="num">${rawCurrent.length?'100,00%':'—'}</td><td class="num">${intfmt(c.total)}</td><td class="num">${intfmt(c.revis)}</td><td class="num">${intfmt(c.logs)}</td><td class="num">${link(pct(c.sla),()=>openDrill(groupedCurrent,'Todos os serviços'))}</td></tr>`;
 techData=dimension(rawCurrent,'tech').sort((a,b)=>$('techOrder').value==='volume'?(b.total-a.total||a.sla-b.sla):(a.sla-b.sla||b.total-a.total));
 renderCombo('techChart',techData.slice(0,25).map(d=>technicians.chart(d)),{volumeOnly:true});$('techCount').textContent=`${techData.length} matrículas`;
 renderTechTable();
 renderBars('unitChart',dimension(rawCurrent,'businessUnit').sort((a,b)=>a.sla-b.sla).slice(0,20),{color:'var(--red)',onClick:d=>drillFor(d,`Unidade ${d.name}`)});
}
function filteredDetails(){const q=fold($('detailSearch').value);return detailSort.rows(q?groupedCurrent.filter(r=>searchText(r).includes(q)):groupedCurrent);}
function renderDetailsV15(){
 const data=filteredDetails(),pages=Math.max(1,Math.ceil(data.length/PAGE_SIZE));page=Math.min(page,pages);
 $('detailCount').textContent=`${intfmt(data.length)} atendimentos · ${intfmt(data.reduce((s,g)=>s+g.osCount,0))} OS`;
 $('pageInfo').textContent=`Página ${page} de ${pages}`;$('prevBtn').disabled=page===1;$('nextBtn').disabled=page===pages;
 $('detailBody').innerHTML=data.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE).map(g=>`<tr><td>${esc(g.reportDate)}</td><td>${link(g.contract,()=>openDrill([g],`Contrato ${g.contract} · ${g.city}`,'all'))}</td><td>${esc(g.city)}</td><td>${technicians.cell(g.tech)}</td><td>${esc(g.businessUnit)}</td><td>${link(g.os,()=>openDrill([g],`OS do contrato ${g.contract}`,'all'))}</td><td class="num">${intfmt(g.logs)}</td><td><span class="badge ${g.revisit?'no':'ok'}">${g.revisit?'SEM':'COM'} PADRÃO</span>${g.noLogException?' <span class="muted">sem log detalhado</span>':''}</td><td class="wrap-cell">${esc(g.typeOS)}</td></tr>`).join('')||'<tr><td colspan="9" class="msg">Sem registros para esta busca.</td></tr>';
}
function daysBetween(a,b){const x=parseDate(a),y=parseDate(b);return x&&y?Math.round((Date.UTC(x.getFullYear(),x.getMonth(),x.getDate())-Date.UTC(y.getFullYear(),y.getMonth(),y.getDate()))/86400000):NaN;}
function renderAuditV15(){
 const c=calc(groupedCurrent),anomalies=groupedCurrent.filter(g=>g.noLogException),isTotal=currentIndicator==='Sla Garantia Total',windowDays=isTotal?30:10;
 const invalidDates=rawCurrent.filter(r=>daysBetween(r.reportDate,r.execDate)!==windowDays),missing=dayData.filter(d=>!d.total).map(d=>d.name);
 const observedRevis=groupedCurrent.filter(g=>g.logs>0).length,onlyListed=c.total?(c.total-observedRevis)*100/(c.total+c.logs):NaN;
 $('auditBody').innerHTML=`<p><b>${esc(currentIndicator)}:</b> atendimento = contrato + DT_NOTA + município. O numerador usa os atendimentos com padrão; o denominador soma atendimentos executados e todos os logs de revisita.</p><div class="audit-stats"><span class="audit-stat">A = <b>${intfmt(c.total)}</b></span><span class="audit-stat">R = <b>${intfmt(c.revis)}</b></span><span class="audit-stat">L = <b>${intfmt(c.logs)}</b></span><span class="audit-stat">(${intfmt(c.total)} − ${intfmt(c.revis)}) ÷ (${intfmt(c.total)} + ${intfmt(c.logs)}) × 100 = <b>${pct(c.sla)}</b></span></div>
 <table class="rule-table"><thead><tr><th>Métrica</th><th>Aplicação no analítico</th></tr></thead><tbody>
 <tr><td>Período do indicador</td><td>DT_NOTA, com execução em DH_BAIXA_ORDEM_SERVICO. ${intfmt(rawCurrent.length-invalidDates.length)} de ${intfmt(rawCurrent.length)} OS do recorte têm diferença de ${windowDays} dias.${invalidDates.length?' '+link('Ver datas divergentes',()=>openDrill(groupRows(invalidDates),'Datas fora da janela esperada','all')):''}</td></tr>
 <tr><td>Atendimentos executados (A)</td><td>OS EXECUTADA, sem EXPURGADO, agrupadas por NR_CONTRATO + DT_NOTA + MUNICIPIO. CHAVE_LOGICA não substitui essa chave.</td></tr>
 <tr><td>Revisitas / sem padrão (R)</td><td>Um atendimento é sem padrão quando alguma OS de origem tem QTD_ATEND_PADRAO = 0 / SEM PADRAO, ou quando há log de revisita. A classificação é preservada mesmo se a lista de ofensoras estiver vazia.</td></tr>
 <tr><td>Logs (L)</td><td>União das OS em LIST_NR_ORDEM_SERVICO_OFENSOR dentro de cada atendimento. A quantidade de cada linha é validada contra QT_LOG_VISITA. O mesmo log repetido nas OS de origem não é somado novamente; ofensoras diferentes são somadas. A mesma ofensora ligada a atendimentos diferentes conta em cada atendimento.</td></tr>
 <tr><td>SLA diário e mensal</td><td>(A − R) × 100 ÷ (A + L), calculado pelos totais de cada período, com duas casas decimais. Mês sem fechamento completo permanece identificado como parcial.</td></tr>
 <tr><td>Serviços / matrículas</td><td>O agrupamento por atendimento é refeito dentro de cada categoria. As categorias podem compartilhar atendimentos, portanto seus totais não devem ser somados para obter o consolidado.</td></tr></tbody></table>
 ${anomalies.length?`<p class="notice">${link(`${anomalies.length} atendimentos (${anomalies.reduce((s,g)=>s+g.osCount,0)} OS) classificados sem padrão, sem logs detalhados`,()=>openDrill(anomalies,'Exceções de classificação do analítico','all'))}. O resultado pela classificação do arquivo é <b>${pct(c.sla)}</b>. Se fossem consideradas apenas as listas de ofensoras, seria <b>${pct(onlyListed)}</b>. Esse segundo valor é uma conferência, não substitui o SLA exibido.</p>`:''}
 <p><b>Referência histórica das imagens — julho/2026:</b> (4.283 − 401) ÷ (4.283 + 546) × 100 = <b>${pct((4283-401)*100/(4283+546))}</b>. A fórmula reproduz o percentual mostrado. Os valores da imagem são apenas uma conferência matemática; gráficos e indicadores usam exclusivamente o arquivo carregado e seus filtros.</p>
 ${missing.length?`<p><b>Dias sem registros entre o início e o fim do recorte:</b> ${missing.map(esc).join(', ')}. Ausência no arquivo não comprova ausência de atendimentos; o SLA desses dias fica em branco.</p>`:''}
 ${!isTotal?'<p><b>Indicador de 10 dias:</b> a janela é observada no arquivo. A fórmula é exibida como comparativo, pois o glossário fornecido documenta apenas SLA Garantia Total.</p>':''}
 ${importStats.legacy?'<p class="notice">Base legada sem todas as colunas de auditoria: o indicador, o fechamento e os ofensores não podem ser confirmados. Logs consolidados pelo maior valor informado por atendimento; uso exploratório.</p>':''}<p><b>Memória diária do recorte atual</b></p>`;
 $('auditFooter').textContent=`Arquivo: ${intfmt(importStats.total)} linhas lidas; ${intfmt(importStats.expurgated)} expurgadas; ${intfmt(importStats.notExecuted)} de outros fechamentos; ${intfmt(importStats.duplicates)} duplicatas idênticas removidas; ${intfmt(importStats.otherIndicator)} de indicadores não suportados. ${intfmt(allRows.filter(r=>r.indicator!==currentIndicator).length)} OS do outro indicador ficam separadas do cálculo atual. Exportações preservam a base para reimportação.`;
}
function renderAllV15(){
 actions=new Map();actionSeq=0;rawCurrent=filteredRows();groupedCurrent=groupRows(rawCurrent);page=1;
 renderHeader();renderGeography();renderCombo('monthlyChart',summarize(groupedCurrent,g=>yyyymm(g.reportDate)).sort((a,b)=>a.name.localeCompare(b.name)));renderDaily();renderCodes();renderServiceAndTech();renderLogAndContracts();renderDetails();renderAudit();
}
function openDrillV15(rows,title,filter='bad',context={}){
 drillRows=rows;drillPage=1;drillTrigger=document.activeElement;drillContext=context;
 $('drillTitle').textContent=title;const c=calc(rows);
 $('drillSummary').innerHTML=`${context.note?`<div>${esc(context.note)}</div>`:''}<b>SLA ${pct(c.sla)}</b> = (${intfmt(c.total)} atendimentos − ${intfmt(c.revis)} sem padrão) ÷ (${intfmt(c.total)} atendimentos + ${intfmt(c.logs)} logs) × 100. <b>${intfmt(rows.reduce((s,g)=>s+g.osCount,0))} OS de origem.</b>`;
 $('drillSearch').value='';$('drillStatus').value=filter;renderDrill();if(!$('drillDialog').open)$('drillDialog').showModal();$('drillSearch').focus();
}
function closeDrill(){$('drillDialog').close();if(drillTrigger?.isConnected)drillTrigger.focus();}
function filteredDrill(){const q=fold($('drillSearch').value),s=$('drillStatus').value;return drillRows.filter(g=>(s==='all'||(s==='bad'?g.revisit:!g.revisit))&&(!q||searchText(g).includes(q)));}
function renderDrillV15(){
 const data=filteredDrill(),pages=Math.max(1,Math.ceil(data.length/DRILL_SIZE));drillPage=Math.min(drillPage,pages);
 const off=(g,field)=>g.offenders.map(o=>`<div${drillContext.code===(o.codes||'Não informado')?' class="offender-match"':''}>${esc(o[field]||'Não informado')}</div>`).join('')||'<span class="muted">Sem registro</span>';
 $('drillCount').textContent=`${intfmt(data.length)} atendimentos · ${intfmt(data.reduce((s,g)=>s+g.osCount,0))} OS · página ${drillPage} de ${pages}`;$('drillPrev').disabled=drillPage===1;$('drillNext').disabled=drillPage===pages;
 $('drillBody').innerHTML=data.slice((drillPage-1)*DRILL_SIZE,drillPage*DRILL_SIZE).map(g=>`<tr><td><b>${esc(g.contract)}</b><br>${esc(g.city)}</td><td>${g.rows.map(r=>`<div><b>${esc(r.os)}</b> · ${esc(r.tech||'Não informado')}</div>`).join('')}</td><td>${esc(g.reportDate)}<br><span class="muted">Exec.: ${esc(g.execDate)}</span></td><td class="wrap-cell">${esc(g.typeOS)}<br><span class="muted">${esc(g.businessUnit)} · ${esc(g.company)}</span></td><td><span class="badge ${g.revisit?'no':'ok'}">${g.revisit?'SEM':'COM'} PADRÃO</span>${g.noLogException?'<br><span class="muted">Sem log detalhado</span>':''}</td><td class="num">${g.logs}</td><td>${off(g,'os')}</td><td>${off(g,'codes')}</td><td>${off(g,'types')}</td><td>${off(g,'companies')}</td><td>${off(g,'dates')}</td></tr>`).join('')||'<tr><td colspan="11" class="msg">Nenhum atendimento nesta lista. Selecione “Todos os atendimentos” para conferir a base do percentual.</td></tr>';
}
function csvText(columns,data){const cell=v=>{let s=String(v??'');if(/^[=+@]/.test(s))s="'"+s;return /[;"\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};return '\uFEFF'+[columns,...data].map(r=>r.map(cell).join(';')).join('\r\n');}
function saveText(text,name){const u=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function exportDailyV15(){saveText(csvText(['DT_NOTA','DIA_SEMANA','ATENDIMENTOS','REVISITAS_SEM_PADRAO','LOGS','NUMERADOR','DENOMINADOR','SLA_PERCENTUAL'],dayData.map(d=>[d.name,['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][dateDay(d.name)],d.total||'',d.total?d.revis:'',d.total?d.logs:'',d.total?d.good:'',d.total?d.total+d.logs:'',Number.isFinite(d.sla)?d.sla.toFixed(6).replace('.',','):''])),'SLA_Garantia_Memoria_Diaria.csv');}
function exportOffendersV15(){const data=filteredDrill().flatMap(g=>g.offenders.map(o=>[g.indicator,g.reportDate,g.contract,g.city,g.os,o.os,o.codes,o.types,o.companies,o.dates,drillContext.code?String(drillContext.code===(o.codes||'Não informado')):'']));saveText(csvText(['INDICADOR','DT_NOTA','CONTRATO','MUNICIPIO','OS_ORIGEM','OS_OFENSORA','CODIGO_BAIXA_OFENSORA','TIPO_OS_OFENSORA','EMPRESA_OFENSORA','DATA_BAIXA_OFENSORA','CODIGO_SELECIONADO'],data),'SLA_Garantia_Ofensores.csv');}
function clearFiltersV15(){selectedLocations.clear();$('fLocSearch').value='';['fMonth','fType','fSegment','fBU','detailSearch'].forEach(id=>$(id).value='');renderLocationOptions();renderAll();}
function selectIndicator(name){if(!allRows.some(r=>r.indicator===name))return;currentIndicator=name;populateFilters();$('detailSearch').value='';renderAll();}

const SEPTEMBER_REFERENCE=[100,84,81,84,74,85,85,100,83,88,89,78,80,85,77,77,79,85,68,88,80,65,77,77,79,78,80,87,88,75];
const referenceConfig={month:'2026/09',cities:['Natal','Parnamirim'],uf:'RN',unit:'NTL-DMV',sla:80.8,volumeK:7.32};
let referenceData=null;
const isConsolidated=r=>r.sourceFormat==='consolidated';
const modeLabel=mode=>mode==='tasks'?'tarefas':'atendimentos';
const fmt1=v=>Number.isFinite(v)?v.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%':'—';
const uniqueParts=v=>[...new Set(norm(v).split(',').map(norm).filter(Boolean))];
function rawDisplay(v){return v===null||v===undefined||v===''?'Não informado':String(v);}
function consolidateUnit(raw,preferred){return norm(preferred)||uniqueParts(raw).join(', ');}

function standardizeImported(raw,options={}){
 const consolidated=raw.length>0&&Object.hasOwn(raw[0],'QTD_TAREFAS')&&Object.hasOwn(raw[0],'DAT_NOTA');
 if(!consolidated){const rows=standardizeDetailedImported(raw,options);for(const r of rows){r.sourceFormat='detailed';r.taskCount=1;}importStats.profile='detailed';return rows;}
 const stats={total:raw.length,otherIndicator:0,expurgated:0,notExecuted:0,duplicates:0,fallback:0,legacy:0,profile:'consolidated',numericCodeLists:0};
 const rows=[],seen=new Map(),attendanceSeen=new Map();
 for(let i=0;i<raw.length;i++){
  const source=raw[i],get=k=>source[k]??'';
  const qualifier=norm(get('DSC_QUALIFICADOR_OS'));
  if(fold(qualifier)==='EXPURGADO'){stats.expurgated++;continue;}
  if(!['COM PADRAO','SEM PADRAO'].includes(fold(qualifier)))throw new Error(`Linha ${i+2}: classificador ausente ou não reconhecido.`);
  const reportDate=brDate(get('DAT_NOTA')),execDate=brDate(get('DAT_BAIXA'));
  const contract=norm(get('NUM_CONTA')),os=norm(get('COD_OS')),city=norm(get('DSC_MUNICIPIO_BI'));
  const logs=n(get('QTD_LOG_OS_VT')),standardCount=n(get('QTD_OS_ATEND_PADRAO')),taskCount=n(get('QTD_TAREFAS'));
  if(!reportDate||!execDate||!contract||!os||!city)throw new Error(`Linha ${i+2}: contrato, OS, cidade ou datas ausentes/inválidos.`);
  if(!Number.isInteger(logs)||logs<0||![0,1].includes(standardCount)||!Number.isInteger(taskCount)||taskCount<1)throw new Error(`Linha ${i+2}: quantidade de tarefas, logs ou padrão inválida.`);
  if(standardCount!==Number(fold(qualifier)==='COM PADRAO'))throw new Error(`Linha ${i+2}: QTD_OS_ATEND_PADRAO diverge do qualificador.`);
  const delta=daysBetween(reportDate,execDate),explicit=norm(get('NM_INDICADOR_NEGOCIO_BI'));
  if(![10,30].includes(delta))throw new Error(`Linha ${i+2}: a distância entre DAT_NOTA e DAT_BAIXA é ${delta} dias. Não é possível atribuir esta linha aos indicadores de 10 ou 30 dias.`);
  const indicator=delta===30?'Sla Garantia Total':'Sla Garantia';
  if(explicit&&fold(explicit)!==fold(indicator))throw new Error(`Linha ${i+2}: indicador informado diverge da janela entre as datas.`);
  const unitOriginal=norm(get('DSC_UNIDADE_NEGOCIO_UNIF')),unitPreferred=norm(get('UN'));
  const row={sourceFormat:'consolidated',indicator,reportDate,execDate,contract,os,city,uf:norm(get('DSC_SGL_ESTADO')),cluster:norm(get('DSC_CLUSTER_BI')),
   businessUnit:consolidateUnit(unitOriginal,unitPreferred),unitOriginal,unitPreferred,unitFlag:norm(get('FLAG_UN')),segment:norm(get('DSC_SEG_PRODUTO')),company:'',
   tech:uniqueParts(get('COD_LOGIN_TECNICO')).join(', '),typeOS:norm(get('DSC_TIPO_ORDEM_SERVICO')),qualifier,standardCount,logs,taskCount,codigoBaixa:norm(get('COD_BAIXA')),
   statusFechamento:'Não informado no Excel',offenderOS:'',offenderCodes:'',offenderTypes:'',offenderCompanies:'',offenderCompanyIDs:'',offenderDates:'',legacyNoOffenders:false,
   rawCodeList:get('DSC_LISTA_BAIXA_OS_OFENSORA'),selectedCode:get('COD_BAIXA_OFENSOR'),selectedOffender:norm(get('COD_OFENSOR'))||norm(get('CONCATENADO_DIM')),
   offenderReason:norm(get('DESC_MOTIVO_DIM'))||norm(get('DSC_MOTIVO_BAIXA_OS')),offenderFamily:norm(get('FAMILIA_DIM'))||norm(get('FAMILIA_ORIG')),
   logicalKey:norm(get('DSC_CHAVE_LOGICA')),sourceRN:get('RN'),sourceMonth:norm(get('MES'))||yyyymm(reportDate).replace('/','-')};
  if(typeof row.rawCodeList==='number'&&!Number.isInteger(row.rawCodeList))stats.numericCodeLists++;
  row.recordKey=JSON.stringify([indicator,reportDate,city,os]);
  const serial=JSON.stringify(row),attendanceKey=JSON.stringify([indicator,contract,reportDate,city]);
  if(seen.has(row.recordKey)){if(seen.get(row.recordKey)!==serial)throw new Error(`OS ${os}: registros conflitantes no mesmo dia e cidade.`);stats.duplicates++;continue;}
  if(attendanceSeen.has(attendanceKey))throw new Error(`Contrato ${contract} em ${reportDate}, ${city}: mais de uma linha consolidada para o mesmo atendimento. O arquivo precisa informar uma única quantidade consolidada de tarefas e logs.`);
  seen.set(row.recordKey,serial);attendanceSeen.set(attendanceKey,true);rows.push(row);
 }
 if(!rows.length)throw new Error('Nenhum atendimento válido no arquivo.');
 importStats=stats;return rows;
}
function groupRows(rows){
 if(!rows.length)return [];
 const formats=new Set(rows.map(r=>r.sourceFormat||'detailed'));
 if(formats.size>1)throw new Error('A mesma base não pode misturar registros detalhados e atendimentos já consolidados.');
 if(isConsolidated(rows[0]))return rows.map(r=>{
  const revisit=r.standardCount===0||r.logs>0;
  return {...r,key:JSON.stringify([r.indicator,r.contract,r.reportDate,r.city]),rows:[r],offenders:[],osCount:1,revisit,noLogException:revisit&&r.logs===0,standardCount:Number(!revisit),qualifier:revisit?'SEM PADRAO':'COM PADRAO'};
 }).sort((a,b)=>parseDate(a.reportDate)-parseDate(b.reportDate)||a.contract.localeCompare(b.contract));
 return groupRowsV15(rows).map(g=>({...g,taskCount:g.osCount,sourceFormat:'detailed'}));
}
function metricSet(total,good,logs){return {total,good,revis:total-good,logs,sla:total+logs?good*100/(total+logs):NaN};}
function calc(groups,mode=metricMode){
 const attendance=metricSet(groups.length,groups.reduce((s,g)=>s+g.standardCount,0),groups.reduce((s,g)=>s+g.logs,0));
 const tasks=metricSet(groups.reduce((s,g)=>s+g.taskCount,0),groups.reduce((s,g)=>s+g.taskCount*g.standardCount,0),groups.reduce((s,g)=>s+g.taskCount*g.logs,0));
 return {...(mode==='tasks'?tasks:attendance),attendance,tasks,mode};
}
function dimension(rows,field){
 const map=new Map();for(const r of rows){const keys=field==='tech'?uniqueParts(r.tech):[r[field]||'Não informado'];for(const key of keys.length?keys:['Não informado']){if(!map.has(key))map.set(key,[]);map.get(key).push(r);}}
 return [...map].map(([name,raw])=>{const rows=groupRows(raw);return {name,raw,rows,os:raw.length,withLog:raw.filter(r=>r.logs>0).length,...calc(rows)};});
}
function populateFilters(latest=false){populateFiltersV15(latest);optionFill('fUF',[...new Set(allRows.filter(r=>r.indicator===currentIndicator).map(r=>r.uf).filter(Boolean))].sort());}
function filteredRowsV16({ignoreMonth=false}={}){return allRows.filter(r=>r.indicator===currentIndicator&&(!selectedLocations.size||selectedLocations.has(r.city)||selectedLocations.has(r.cluster))&&(!$('fUF').value||r.uf===$('fUF').value)&&(ignoreMonth||!$('fMonth').value||yyyymm(r.reportDate)===$('fMonth').value)&&(!$('fType').value||r.typeOS===$('fType').value)&&(!$('fSegment').value||r.segment===$('fSegment').value)&&(!$('fBU').value||r.businessUnit===$('fBU').value));}
function renderHeaderV16(){
 renderHeaderV15();const c=calc(groupedCurrent),consolidated=rawCurrent.some(isConsolidated),taskMode=metricMode==='tasks';
 $('totalUnitLabel').textContent=taskMode?'Tarefas informadas no analítico':'Atendimentos distintos';$('revisUnitLabel').textContent=taskMode?'Tarefas sem padrão':'Atendimentos sem padrão';$('logsUnitLabel').textContent=taskMode?'Logs ponderados pelas tarefas':'Logs de revisita por atendimento';$('slaUnitLabel').textContent=taskMode?'SLA por tarefa · comparação':'SLA por atendimento · glossário';
 $('metricAttendance').classList.toggle('selected',!taskMode);$('metricTasks').classList.toggle('selected',taskMode);
 $('metricNote').textContent=taskMode?'Comparação: tarefas, sem padrão e logs ponderados por QTD_TAREFAS.':'Unidade do glossário: cada contrato + data do relatório + município conta uma vez.';
 $('sourceInfo').innerHTML=`Fonte: <b>${esc(sourceName)}</b> · ${intfmt(rawCurrent.length)} registros · <b>${intfmt(c.attendance.total)} atendimentos</b> · <b>${intfmt(c.tasks.total)} tarefas</b> · execução: ${esc(rangeText(rawCurrent.map(r=>r.execDate)))}`;
 $('indicatorCaution').textContent=consolidated?`${currentIndicator==='Sla Garantia Total'?'30':'10'} dias entre DAT_NOTA e DAT_BAIXA · base consolidada por atendimento`:(currentIndicator==='Sla Garantia Total'?'Base detalhada · indicador Total de 30 dias':'Indicador de 10 dias · comparativo');
 $('formulaNote').textContent=c.total?`${taskMode?'Por tarefas (comparação)':'Por atendimento (glossário)'}: (${intfmt(c.total)} − ${intfmt(c.revis)}) ÷ (${intfmt(c.total)} + ${intfmt(c.logs)}) × 100 = ${pct(c.sla)}.`:'Sem registros para os filtros selecionados.';
 $('mainChartTitle').textContent=`SLA mensal · ${taskMode?'tarefas':'atendimentos'} · até 5 meses`;
 $('monthlyNote').textContent='Histórico usa localidade, UF, tipo, segmento e unidade selecionados; inclui os meses disponíveis além do mês do filtro.';
 const anomaly=groupedCurrent.filter(g=>g.noLogException);
 if(anomaly.length)$('qualityNotice').innerHTML=`${link(`${anomaly.length} atendimento sem padrão, sem log detalhado`,()=>openDrill(anomaly,'Classificação do analítico · sem padrão / zero logs','all'))}. A classificação informada no arquivo foi mantida.`;
 $('qualityNotice').hidden=!anomaly.length;
}
function searchText(r){return fold([technicians.text(r.tech),r.contract,r.os,r.city,r.uf,r.tech,r.company,r.typeOS,r.businessUnit,r.unitOriginal,r.rawCodeList,r.selectedCode,r.selectedOffender,r.offenderFamily,r.offenderReason,r.offenderOS,r.offenderCodes,r.offenderCompanies,r.offenderTypes,r.offenderDates].join(' '));}
function selectedCodeLabel(g){return g.selectedOffender||((norm(g.selectedCode)&&norm(g.selectedCode)!=='-3')?String(g.selectedCode)+' · sem descrição':'Não informado');}
function renderCodes(){
 if(!rawCurrent.some(isConsolidated)){
  $('codeTitle').textContent='Códigos de baixa · ofensores';$('codeNote').textContent='Quantidade e participação nos logs por atendimento';$('codeSourceNote').textContent='LIST_COD_BX_OS_OFENSOR, vinculado às OS ofensoras informadas. Exibe apenas códigos ≥ 100; participação sobre todos os logs do recorte.';
  const map=new Map();for(const g of groupedCurrent)for(const o of g.offenders){if(!isSlaOffenderChartCode(o.codes))continue;const name=o.codes;if(!map.has(name))map.set(name,{name,value:0,groups:new Map()});const d=map.get(name);d.value++;d.groups.set(g.key,g);}
  renderBars('codigoChart',[...map.values()].map(d=>({...d,rows:[...d.groups.values()]})).sort((a,b)=>b.value-a.value),{value:'value',percent:true,total:calc(groupedCurrent,'attendance').logs,onClick:d=>openDrill(d.rows,`Baixa ${d.name}`,'all')});return;
 }
 $('codeTitle').textContent='Ofensor selecionado · código de baixa';$('codeNote').textContent='Atendimentos com log e sua participação no recorte';$('codeSourceNote').textContent='COD_OFENSOR / COD_BAIXA_OFENSOR. Uma classificação selecionada por atendimento; não é a contagem individual de todos os logs.';
 const subset=groupedCurrent.filter(g=>g.logs>0),data=summarize(subset,selectedCodeLabel).map(d=>({...d,value:d.rows.length})).sort((a,b)=>b.value-a.value);
 renderBars('codigoChart',data,{value:'value',percent:true,total:subset.length,onClick:d=>openDrill(d.rows,`Ofensor selecionado · ${d.name}`,'all',{note:`${intfmt(d.rows.length)} atendimentos com este ofensor selecionado no arquivo. A lista de baixas original permanece disponível para conferência.`})});
}
function renderFamilies(){const subset=groupedCurrent.filter(g=>g.logs>0),data=summarize(subset,g=>g.offenderFamily||'Não informado').map(d=>({...d,value:d.rows.length})).sort((a,b)=>b.value-a.value);renderBars('familyChart',data,{value:'value',percent:true,total:subset.length,onClick:d=>openDrill(d.rows,`Família de baixa · ${d.name}`,'all')});}
function renderServiceAndTech(){renderServiceAndTechV15();$('serviceNote').textContent=rawCurrent.some(isConsolidated)?'Atendimentos com log · por tipo da OS registrada':'OS de origem com log · por tipo de OS';}
function renderLogAndContracts(){
 const logs=summarize(groupedCurrent.filter(g=>g.logs>0),g=>String(g.logs)).map(d=>({...d,value:d.rows.length})).sort((a,b)=>Number(b.name)-Number(a.name));
 renderCountBars('logDistChart',logs,{label:'atendimentos',onClick:d=>drillFor(d,`Atendimentos com ${d.name} logs`,'all')});
 const contracts=summarize(groupedCurrent.filter(g=>g.logs>0),g=>JSON.stringify([g.contract,g.city])).map(d=>({...d,name:d.rows[0].contract,title:d.rows[0].contract+' · '+d.rows[0].city,value:d.rows.reduce((s,g)=>s+g.logs,0)})).sort((a,b)=>b.value-a.value).slice(0,25);
 renderCountBars('contractChart',contracts,{onClick:d=>drillFor(d,`Contrato ${d.title}`,'all')});
}
function renderDetails(){
 const data=filteredDetails(),pages=Math.max(1,Math.ceil(data.length/PAGE_SIZE));page=Math.min(page,pages);const c=calc(data);
 $('detailCount').textContent=`${intfmt(data.length)} atendimentos · ${intfmt(c.tasks.total)} tarefas · ${intfmt(data.reduce((s,g)=>s+g.osCount,0))} OS identificadas`;
 $('pageInfo').textContent=`Página ${page} de ${pages}`;$('prevBtn').disabled=page===1;$('nextBtn').disabled=page===pages;
 $('detailBody').innerHTML=data.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE).map(g=>`<tr><td>${esc(g.reportDate)}</td><td>${link(g.contract,()=>openDrill([g],`Contrato ${g.contract} · ${g.city}`,'all'))}</td><td>${esc(g.city)}</td><td>${technicians.cell(g.tech)}</td><td>${esc(g.businessUnit)}</td><td>${link(g.os,()=>openDrill([g],`OS registrada do contrato ${g.contract}`,'all'))}</td><td class="num">${intfmt(g.taskCount)}</td><td class="num">${intfmt(g.logs)}</td><td><span class="badge ${g.revisit?'no':'ok'}">${g.revisit?'SEM':'COM'} PADRÃO</span></td><td class="wrap-cell">${esc(g.typeOS)}</td></tr>`).join('')||'<tr><td colspan="10" class="msg">Sem registros.</td></tr>';
}
function openDrill(rows,title,filter='bad',context={}){
 drillRows=rows;drillPage=1;drillTrigger=document.activeElement;drillContext=context;const mode=context.mode||metricMode,c=calc(rows,mode);
 $('drillTitle').textContent=title;
 $('drillSummary').innerHTML=`${context.note?`<div>${esc(context.note)}</div>`:''}<b>SLA por ${modeLabel(mode)}: ${pct(c.sla)}</b> = (${intfmt(c.total)} − ${intfmt(c.revis)}) ÷ (${intfmt(c.total)} + ${intfmt(c.logs)}) × 100.<br>${intfmt(c.attendance.total)} atendimentos, ${intfmt(c.tasks.total)} tarefas e ${intfmt(c.attendance.logs)} logs por atendimento. ${intfmt(rows.reduce((s,g)=>s+g.osCount,0))} números de OS de origem disponíveis.`;
 $('drillSearch').value='';$('drillStatus').value=filter;renderDrill();if(!$('drillDialog').open)$('drillDialog').showModal();$('drillSearch').focus();
}
function renderDrill(){
 const data=filteredDrill(),pages=Math.max(1,Math.ceil(data.length/DRILL_SIZE));drillPage=Math.min(drillPage,pages);
 $('drillCount').textContent=`${intfmt(data.length)} atendimentos · ${intfmt(calc(data).tasks.total)} tarefas · página ${drillPage} de ${pages}`;$('drillPrev').disabled=drillPage===1;$('drillNext').disabled=drillPage===pages;
 const detailedDrill=drillRows.some(g=>!isConsolidated(g));$('drillOSHeader').textContent=detailedDrill?'OS de origem / matrículas':'OS registrada / matrículas';$('drillOffenderHeader').textContent=detailedDrill?'Tipo de OS ofensora':'Ofensor selecionado';
 $('drillBody').innerHTML=data.slice((drillPage-1)*DRILL_SIZE,drillPage*DRILL_SIZE).map(g=>{
  const con=isConsolidated(g);return `<tr><td><b>${esc(g.contract)}</b><br>${esc(g.city)} / ${esc(g.uf)}</td><td>${g.rows.map(r=>`<div><b>${esc(r.os)}</b></div>`).join('')}${technicians.cell(g.tech)}</td><td>${esc(g.reportDate)}<br><span class="muted">Exec.: ${esc(g.execDate)}</span></td><td class="wrap-cell">${esc(g.typeOS)}<br><b>${esc(g.businessUnit)}</b>${con&&g.unitOriginal!==g.businessUnit?`<br><span class="muted">Original: ${esc(g.unitOriginal)}; UN: ${esc(g.unitPreferred)}</span>`:''}</td><td class="num">${g.taskCount}</td><td><span class="badge ${g.revisit?'no':'ok'}">${g.revisit?'SEM':'COM'} PADRÃO</span><br>${g.logs} logs${g.noLogException?'<br><span class="source-warning">Sem padrão, sem logs</span>':''}</td><td class="wrap-cell">${con?historicOffenderLink(g):sourceList(g.offenderOS)}</td><td class="wrap-cell">${con?esc(rawDisplay(g.rawCodeList)):sourceList(g.offenderCodes)}${con&&typeof g.rawCodeList==='number'&&!Number.isInteger(g.rawCodeList)?'<br><span class="muted">Célula numérica preservada; não separada em códigos.</span>':''}</td><td class="wrap-cell">${con?esc(selectedCodeLabel(g)):sourceList(g.offenderTypes)}${g.offenderReason?'<br>'+esc(g.offenderReason):''}</td><td class="wrap-cell">${esc(g.offenderFamily||'Não informado')}</td><td class="wrap-cell">${con?'Excel consolidado: logs de QTD_LOG_OS_VT; tarefas de QTD_TAREFAS. A OS exibida não é a lista de todas as tarefas.':`${sourceList(g.offenderCompanies)}<br>${sourceList(g.offenderDates)}`}</td></tr>`;
 }).join('')||'<tr><td colspan="11" class="msg">Nenhum atendimento neste filtro. Escolha “Todos os atendimentos” para ver a base completa do percentual.</td></tr>';
}
function referenceGroups(unit=false){return groupRows(allRows.filter(r=>r.indicator==='Sla Garantia Total'&&yyyymm(r.reportDate)===referenceConfig.month&&referenceConfig.cities.includes(r.city)&&r.uf===referenceConfig.uf&&(!unit||r.businessUnit===referenceConfig.unit)));}
function getReferenceData(){
 const regional=referenceGroups(false),unit=referenceGroups(true),regionalScore=calc(regional,'attendance'),unitScore=calc(unit,'tasks');
 const daily=SEPTEMBER_REFERENCE.map((expected,i)=>{const date=String(i+1).padStart(2,'0')+'/09/2026',reg=regional.filter(g=>g.reportDate===date),rows=unit.filter(g=>g.reportDate===date),a=calc(reg,'attendance'),b=calc(rows,'tasks');return {date,expected,regional:reg,rows,attendance:a,weighted:b,match:Number.isFinite(b.sla)&&Math.round(b.sla)===expected};});
 return {regional,unit,regionalScore,unitScore,daily,matches:daily.filter(d=>d.match).length,monthlyMatch:Number.isFinite(unitScore.sla)&&Math.round(unitScore.sla*10)/10===referenceConfig.sla,volumeMatch:Math.round(unitScore.tasks.total/10)/100===referenceConfig.volumeK};
}
function renderReference(){
 const d=getReferenceData();referenceData=d;const {regionalScore:a,unitScore:b}=d;
 $('referenceAll').disabled=!d.regional.length;$('referenceTasks').disabled=!d.unit.length;$('referenceExport').disabled=!d.regional.length;
 if(!d.regional.length){$('referenceSummary').innerHTML='<p class="reference-result">O arquivo carregado não tem atendimentos de setembro/2026 em Natal/Parnamirim–RN. A comparação ficará disponível quando esse período for importado.</p>';$('referenceTable').innerHTML='';return;}
 const card=(name,value,desc)=>`<div class="reference-stat"><div class="name">${name}</div><strong>${value}</strong><div class="desc">${desc}</div></div>`;
 const dayList=d.daily.filter(x=>!x.match).map(x=>String(Number(x.date.slice(0,2)))).join(', ');
 $('referenceSummary').innerHTML=`<div class="reference-cards">${card('Imagem · setembro','80,8%','Volume mostrado: 7,32 mil. SLA mensal com uma casa decimal; diário sem casas decimais.')}${card('Natal + Parnamirim · todas as unidades',link(pct(a.sla),()=>openDrill(d.regional,'Setembro · Natal + Parnamirim · glossário','all',{mode:'attendance'})),`${intfmt(a.total)} atendimentos − ${intfmt(a.revis)} sem padrão; ${intfmt(a.logs)} logs. Unidade do glossário.`)}${card('NTL-DMV · comparação por tarefas',link(pct(b.sla),()=>openDrill(d.unit,'Setembro · NTL-DMV · por tarefas','all',{mode:'tasks'})),`${intfmt(b.total)} tarefas − ${intfmt(b.revis)} sem padrão; ${intfmt(b.logs)} logs ponderados. Arredondado: ${fmt1(b.sla)}.`)}${card('Rótulos diários compatíveis',`${d.matches}/30`,`${d.monthlyMatch?'Mensal compatível':'Mensal divergente'} na precisão da imagem. ${d.volumeMatch?'Volume compatível ao arredondar.':'Volume divergente.'}`)}</div>
 <p class="reference-result"><b>Os resultados não coincidem integralmente.</b> O cenário NTL-DMV por tarefas ${d.monthlyMatch?'reproduz':'não reproduz'} o percentual mensal arredondado da imagem; ${d.matches} de 30 dias coincidem no arredondamento. ${dayList?`Dias divergentes: <b>${dayList}</b>.`:''} O recorte NTL-DMV é uma hipótese de comparação sugerida pelo volume; a captura não mostra os filtros completos. A base do glossário continua disponível separadamente.</p>`;
 $('referenceTable').innerHTML=`<table><thead><tr><th>Dia</th><th class="num">Imagem</th><th class="num">Todas UNs · atend.</th><th class="num">NTL · atend.</th><th class="num">NTL · tarefas</th><th class="num">NTL arred.</th><th class="num">Tarefas / sem padrão / logs pond.</th><th>Comparação da imagem</th></tr></thead><tbody>${d.daily.map(x=>`<tr><td>${x.date}</td><td class="num">${x.expected}%</td><td class="num">${link(pct(x.attendance.sla),()=>openDrill(x.regional,`${x.date} · todas as unidades`,'all',{mode:'attendance'}))}</td><td class="num">${link(pct(x.weighted.attendance.sla),()=>openDrill(x.rows,`${x.date} · NTL-DMV · atendimentos`,'all',{mode:'attendance'}))}</td><td class="num">${link(pct(x.weighted.sla),()=>openDrill(x.rows,`${x.date} · NTL-DMV · tarefas`,'all',{mode:'tasks'}))}</td><td class="num">${Number.isFinite(x.weighted.sla)?Math.round(x.weighted.sla)+'%':'—'}</td><td class="num">${x.weighted.total} / ${x.weighted.revis} / ${x.weighted.logs}</td><td class="${x.match?'match':'mismatch'}">${x.match?'Compatível no arredondamento':'Divergente'}</td></tr>`).join('')}</tbody></table>`;
}
function applyReferenceV16(tasks=false){
 currentIndicator='Sla Garantia Total';metricMode=tasks?'tasks':'attendance';populateFilters();
 selectedLocations=new Set(referenceConfig.cities.filter(c=>locationOptions.includes(c)));$('fLocSearch').value='';renderLocationOptions();
 $('fUF').value=[...$('fUF').options].some(o=>o.value==='RN')?'RN':'';
 $('fMonth').value=[...$('fMonth').options].some(o=>o.value==='2026/09')?'2026/09':([...$('fMonth').options].at(-1)?.value||'');
 ['fType','fSegment','detailSearch'].forEach(id=>$(id).value='');$('fBU').value=tasks&&[...$('fBU').options].some(o=>o.value==='NTL-DMV')?'NTL-DMV':'';renderAll();
}
function renderAudit(){
 const c=calc(groupedCurrent),con=rawCurrent.some(isConsolidated),windowDays=currentIndicator==='Sla Garantia Total'?30:10,invalid=rawCurrent.filter(r=>daysBetween(r.reportDate,r.execDate)!==windowDays),anomalies=groupedCurrent.filter(g=>g.noLogException);
 const numericLists=rawCurrent.filter(r=>typeof r.rawCodeList==='number'&&!Number.isInteger(r.rawCodeList));
 $('auditBody').innerHTML=`<p><b>Unidade ativa: ${metricMode==='tasks'?'tarefas, para comparação':'atendimento, conforme o glossário'}.</b> ${con?'O Excel recebido tem uma linha por contrato + DAT_NOTA + município, com uma OS registrada e a quantidade consolidada de tarefas.':'A base detalhada é agrupada por contrato + DT_NOTA + município.'}</p>
 <table class="rule-table"><thead><tr><th>Medida</th><th>Por atendimento · glossário</th><th>Por tarefa · comparação</th></tr></thead><tbody><tr><td>Total</td><td>${intfmt(c.attendance.total)} atendimentos distintos</td><td>${intfmt(c.tasks.total)} = soma de QTD_TAREFAS</td></tr><tr><td>Sem padrão</td><td>${intfmt(c.attendance.revis)} atendimentos classificados sem padrão</td><td>${intfmt(c.tasks.revis)} = tarefas dos atendimentos sem padrão</td></tr><tr><td>Logs</td><td>${intfmt(c.attendance.logs)} = ${con?'soma de QTD_LOG_OS_VT, uma vez por atendimento':'OS ofensoras distintas dentro de cada atendimento'}</td><td>${intfmt(c.tasks.logs)} = soma de QTD_TAREFAS × logs do atendimento</td></tr><tr><td>SLA</td><td>${link(pct(c.attendance.sla),()=>openDrill(groupedCurrent,'SLA por atendimento','all',{mode:'attendance'}))}</td><td>${link(pct(c.tasks.sla),()=>openDrill(groupedCurrent,'SLA por tarefa','all',{mode:'tasks'}))}</td></tr></tbody></table>
 <p><b>Fórmula:</b> (total − sem padrão) × 100 ÷ (total + logs). Os totais e pesos acima definem a unidade de cálculo. O modo por tarefas aplica a classificação e a quantidade de logs do atendimento a cada tarefa informada; é uma reconstrução para comparação, não uma redefinição do glossário.</p>
 <p><b>Datas:</b> ${intfmt(rawCurrent.length-invalid.length)} de ${intfmt(rawCurrent.length)} registros têm ${windowDays} dias entre a data de execução e a data do relatório. Mês e dia são filtrados pela data do relatório. O mensal usa seus totais, sem média simples dos percentuais diários.</p>
 ${con?'<p><b>Campos disponíveis:</b> DAT_NOTA, NUM_CONTA, DSC_MUNICIPIO_BI, QTD_OS_ATEND_PADRAO, QTD_LOG_OS_VT e QTD_TAREFAS. O arquivo não contém o status de fechamento nem os números das OS ofensoras. Não foram criados status ou números de OS ausentes. O consolidado fornecido é usado como base.</p><p><b>Unidades:</b> quando UN está preenchida, ela é usada como unidade consolidada; caso contrário, usa-se DSC_UNIDADE_NEGOCIO_UNIF. Valores repetidos na lista são removidos. As duas informações originais aparecem no detalhamento e na exportação.</p>':'<p>A base detalhada mantém as OS executadas não expurgadas; as listas de ofensoras são conferidas com a quantidade de logs informada.</p>'}
 ${numericLists.length?`<p><b>Lista de baixas:</b> ${link(`${intfmt(numericLists.length)} células numéricas com casas decimais`,()=>openDrill(groupRows(numericLists),'Listas de baixa armazenadas como número','all'))} foram preservadas exatamente como valores do arquivo. Não foram divididas nem transformadas em números de OS. Os gráficos de código e família usam os campos de classificação selecionada do analítico.</p>`:''}
 ${anomalies.length?`<p>${link(`${anomalies.length} atendimento sem padrão com zero logs`,()=>openDrill(anomalies,'Exceção do qualificador','all'))}. A classificação sem padrão permanece no numerador.</p>`:''}
 <p><b>Memória diária · ${modeLabel(metricMode)}</b></p>`;
 $('auditFooter').textContent=`Fonte completa: ${intfmt(importStats.total)} linhas lidas; ${intfmt(importStats.expurgated)} expurgadas; ${intfmt(importStats.duplicates)} duplicatas idênticas removidas. ${con?'Uma linha consolidada por atendimento; tentativas de importar duas linhas conflitantes para o mesmo atendimento são rejeitadas.':'Os indicadores de 10 e 30 dias são mantidos separados.'} Dias sem registros não recebem percentuais artificiais.`;
}
function renderAllV16(){
 actions=new Map();actionSeq=0;rawCurrent=filteredRows();groupedCurrent=groupRows(rawCurrent);page=1;
 renderHeader();renderGeography();const history=groupRows(filteredRows({ignoreMonth:true}));
 const monthly=summarize(history,g=>yyyymm(g.reportDate)).sort((a,b)=>a.name.localeCompare(b.name)).slice(-5),partial=[];
 for(const d of monthly){const dates=allRows.filter(r=>r.indicator===currentIndicator&&yyyymm(r.reportDate)===d.name).map(r=>parseDate(r.reportDate)),last=dates.length?new Date(Math.max(...dates)):null;if(last&&last.getDate()<new Date(last.getFullYear(),last.getMonth()+1,0).getDate()){partial.push(`${d.name} até ${brDate(last)}`);d.name+='*';}}
 renderCombo('monthlyChart',monthly);$('monthlyNote').textContent='Histórico mantém os filtros de localidade, UF, tipo, segmento e unidade; mostra até 5 meses disponíveis.'+(partial.length?' * Mês parcial: '+partial.join('; ')+'.':'');
 renderDaily();renderCodes();renderFamilies();renderServiceAndTech();renderLogAndContracts();renderDetails();renderAudit();renderReference();
}
function clearFiltersV16(){selectedLocations.clear();$('fLocSearch').value='';['fMonth','fType','fSegment','fBU','fUF','detailSearch'].forEach(id=>$(id).value='');renderLocationOptions();renderAll();}
function exportRowsText(data){
 const rows=[...new Map(data.flatMap(g=>g.rows||[g]).map(r=>[r.recordKey,r])).values()];
 if(!rows.length||!rows.some(isConsolidated))return exportDetailedRowsText(rows);
 const cols=[['DAT_NOTA','reportDate'],['NUM_CONTA','contract'],['COD_OS','os'],['DAT_BAIXA','execDate'],['DSC_MUNICIPIO_BI','city'],['DSC_SGL_ESTADO','uf'],['DSC_CLUSTER_BI','cluster'],['DSC_UNIDADE_NEGOCIO_UNIF','unitOriginal'],['UN','unitPreferred'],['FLAG_UN','unitFlag'],['COD_LOGIN_TECNICO','tech'],['DSC_TIPO_ORDEM_SERVICO','typeOS'],['DSC_SEG_PRODUTO','segment'],['QTD_TAREFAS','taskCount'],['QTD_LOG_OS_VT','logs'],['QTD_OS_ATEND_PADRAO','standardCount'],['DSC_QUALIFICADOR_OS','qualifier'],['COD_BAIXA','codigoBaixa'],['DSC_LISTA_BAIXA_OS_OFENSORA','rawCodeList'],['COD_BAIXA_OFENSOR','selectedCode'],['COD_OFENSOR','selectedOffender'],['DESC_MOTIVO_DIM','offenderReason'],['FAMILIA_DIM','offenderFamily'],['DSC_CHAVE_LOGICA','logicalKey'],['RN','sourceRN'],['MES','sourceMonth']];
 return csvText(cols.map(c=>c[0]),rows.map(r=>cols.map(c=>r[c[1]])));
}
function exportDaily(){saveText(csvText(['DATA_RELATORIO','UNIDADE_CALCULO','BASE','SEM_PADRAO','LOGS_DA_FORMULA','SLA_PERCENTUAL','ATENDIMENTOS','TAREFAS','LOGS_POR_ATENDIMENTO'],dayData.map(d=>[d.name,modeLabel(metricMode),d.total||'',d.total?d.revis:'',d.total?d.logs:'',Number.isFinite(d.sla)?d.sla.toFixed(6).replace('.',','):'',d.attendance?.total??'',d.tasks?.total??'',d.attendance?.logs??''])),'SLA_Garantia_Memoria_Diaria.csv');}
function exportOffenders(){
 if(!filteredDrill().some(isConsolidated)){exportOffendersV15();return;}
 saveText(csvText(['DATA_RELATORIO','CONTRATO','MUNICIPIO','OS_REGISTRADA','TAREFAS','LOGS_POR_ATENDIMENTO','LISTA_BAIXAS_ORIGINAL','CODIGO_SELECIONADO','OFENSOR_SELECIONADO','FAMILIA','NUMEROS_OS_OFENSORAS'],filteredDrill().map(g=>[g.reportDate,g.contract,g.city,g.os,g.taskCount,g.logs,g.rawCodeList,g.selectedCode,g.selectedOffender,g.offenderFamily,'NAO INFORMADOS NO EXCEL'])),'SLA_Garantia_Baixas_Analitico.csv');
}
function exportReference(){const d=getReferenceData(),number=v=>Number.isFinite(v)?v.toFixed(6).replace('.',','):'';saveText(csvText(['DT_NOTA','IMAGEM_PERCENTUAL','TODAS_UNIDADES_SLA_ATENDIMENTOS','NTL_SLA_ATENDIMENTOS','NTL_SLA_TAREFAS','NTL_TAREFAS','NTL_TAREFAS_SEM_PADRAO','NTL_LOGS_PONDERADOS','COMPATIVEL_ARREDONDAMENTO'],d.daily.map(x=>[x.date,x.expected,number(x.attendance.sla),number(x.weighted.attendance.sla),number(x.weighted.sla),x.weighted.total,x.weighted.revis,x.weighted.logs,x.match?'SIM':'NAO'])),'Comparacao_Setembro_Natal_Parnamirim_RN.csv');}

const OCTOBER_IMAGE={1:67,2:74,3:84,4:76,5:78,7:100,8:82,9:77,10:74,11:72,12:72,14:89,15:77,16:84,17:73,18:83};
const decodeBase=p=>p.rows.map(values=>Object.fromEntries(p.fields.map((key,i)=>[key,values[i]])));
let archivedRows=decodeBase(INITIAL.history);
let previousCsvRows=decodeBase(INITIAL.previousCsv);
const FORTALEZA_UNIT='FTZ-DMV_01';
const OCTOBER_VOLUME_K={1:0.07,2:0.09,3:0.09,4:0.08,5:0.07,8:0.08,9:0.09,10:0.09,11:0.07,12:0.07,14:0.07,15:0.07,16:0.08,17:0.07,18:0.06};
let embeddedRows=allRows;
let previousCsvGroups=groupRows(previousCsvRows);
let previousCsvGroupMap=new Map(previousCsvGroups.map(g=>[g.key,g]));
let activeBase='current',importedBase=null,comparisonState=null,baseDeltaState=null;
const iso=v=>{const d=parseDate(v);return d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:'';};
const logShare=c=>c.total+c.logs?100*c.logs/(c.total+c.logs):NaN;
const comparisonCard=(name,value,desc)=>`<div class="reference-stat"><div class="name">${name}</div><strong>${value}</strong><div class="desc">${desc}</div></div>`;
function dateRangeInvalid(){return Boolean($('fDateFrom').value&&$('fDateTo').value&&$('fDateFrom').value>$('fDateTo').value);}
function acceptsPeriod(date){
 const day=iso(date);
 return !dateRangeInvalid()&&(!$('fMonth').value||yyyymm(date)===$('fMonth').value)&&(!$('fDateFrom').value||day>=$('fDateFrom').value)&&(!$('fDateTo').value||day<=$('fDateTo').value);
}
function filteredRows(){
 return allRows.filter(r=>r.indicator===currentIndicator&&acceptsPeriod(r.reportDate)&&(!selectedLocations.size||selectedLocations.has(r.city)||selectedLocations.has(r.cluster))&&(!$('fUF').value||r.uf===$('fUF').value)&&(!$('fType').value||r.typeOS===$('fType').value)&&(!$('fSegment').value||r.segment===$('fSegment').value)&&(!$('fBU').value||r.businessUnit===$('fBU').value));
}
function sourceBounds(rows){const dates=rows.map(r=>iso(r.reportDate)).filter(Boolean).sort();return dates.length?{from:dates[0],to:dates.at(-1)}:null;}
function requestedPeriod(){
 const pieces=[];
 if($('fMonth').value)pieces.push($('fMonth').value.replace('/','-'));
 if($('fDateFrom').value)pieces.push('de '+brDate($('fDateFrom').value));
 if($('fDateTo').value)pieces.push('até '+brDate($('fDateTo').value));
 return pieces.join(' · ')||'Todas as datas disponíveis';
}
function activateBase(key){
 const saved={month:$('fMonth').value,from:$('fDateFrom').value,to:$('fDateTo').value,uf:$('fUF').value,unit:$('fBU').value,locations:new Set(selectedLocations)};
 const base=key==='history'?{rows:archivedRows,payload:INITIAL.history}:key==='previousCsv'?{rows:previousCsvRows,payload:INITIAL.previousCsv}:key==='current'?{rows:embeddedRows,payload:INITIAL}:key==='imported'&&importedBase?importedBase:null;
 if(!base)return;
 activeBase=key;allRows=base.rows;sourceName=base.payload.source;sourceType=base.payload.sourceType;importStats={...base.payload.stats};
 if(!allRows.some(r=>r.indicator===currentIndicator))currentIndicator=allRows[0]?.indicator||'Sla Garantia Total';
 $('baseSelect').value=key;['fType','fSegment','fBU','detailSearch'].forEach(id=>$(id).value='');
 populateFilters();
 $('fMonth').value=[...$('fMonth').options].some(o=>o.value===saved.month)?saved.month:'';
 $('fDateFrom').value=saved.from;$('fDateTo').value=saved.to;
 $('fUF').value=[...$('fUF').options].some(o=>o.value===saved.uf)?saved.uf:'';
 $('fBU').value=[...$('fBU').options].some(o=>o.value===saved.unit)?saved.unit:'';
 selectedLocations=new Set([...saved.locations].filter(c=>locationOptions.includes(c)));renderLocationOptions();renderAll();
}
function applyFortaleza(lastDay=18){
 currentIndicator='Sla Garantia Total';metricMode='attendance';populateFilters();
 selectedLocations=new Set(locationOptions.includes('Fortaleza')?['Fortaleza']:[]);$('fLocSearch').value='';renderLocationOptions();
 $('fUF').value=[...$('fUF').options].some(o=>o.value==='CE')?'CE':'';
 $('fMonth').value=[...$('fMonth').options].some(o=>o.value==='2026/10')?'2026/10':'';
 $('fDateFrom').value='2026-10-01';$('fDateTo').value=`2026-10-${String(lastDay).padStart(2,'0')}`;
 ['fType','fSegment','detailSearch'].forEach(id=>$(id).value='');
 $('fBU').value=[...$('fBU').options].some(o=>o.value===FORTALEZA_UNIT)?FORTALEZA_UNIT:'';renderAll();
}
function applyReference(tasks=false){
 if(activeBase!=='history')activateBase('history');
 $('fDateFrom').value='';$('fDateTo').value='';applyReferenceV16(tasks);
}
function renderHeader(){
 renderHeaderV16();
 const scoped=allRows.filter(r=>r.indicator===currentIndicator&&(!selectedLocations.size||selectedLocations.has(r.city)||selectedLocations.has(r.cluster))&&(!$('fUF').value||r.uf===$('fUF').value));
 $('availablePeriod').textContent=`Datas encontradas na fonte para a localidade: ${rangeText(scoped.map(r=>r.reportDate))}. O corte usa a data do relatório, independentemente do nome do arquivo.`;
 $('periodError').hidden=!dateRangeInvalid();
 $('periodLabel').textContent=dateRangeInvalid()?'Período inválido':rangeText(rawCurrent.map(r=>r.reportDate));
 $('selectedPeriod').textContent=requestedPeriod();
 $('mainChartTitle').textContent=`SLA mensal · período filtrado · ${modeLabel(metricMode)}`;
 $('legacyReference').hidden=activeBase!=='history';
 $('metricTasks').textContent='Tarefas · diagnóstico';
 const detailed=rawCurrent.some(r=>!isConsolidated(r));
 $('familySection').hidden=detailed;
 $('unitFilterLabel').textContent=detailed?'Unidade do técnico':'Unidade consolidada';
 $('detailsOSHeader').textContent=detailed?'OS de origem':'OS registrada';detailSort.syncHeaders();
 $('drillOSHeader').textContent=detailed?'OS de origem / matrículas':'OS registrada / matrículas';
 $('drillOffenderHeader').textContent=detailed?'Tipo de OS ofensora':'Ofensor selecionado';
}
function makeDaily(groups){
 if(!groups.length)return [];
 const existing=new Map(summarize(groups,g=>g.reportDate).map(d=>[d.name,d]));
 let from=iso(groups[0].reportDate),to=from;
 for(const g of groups){const d=iso(g.reportDate);if(d<from)from=d;if(d>to)to=d;}
 const month=$('fMonth').value.replace('/','-');
 if($('fDateFrom').value)from=$('fDateFrom').value;
 if($('fDateTo').value)to=$('fDateTo').value;
 if(month){from=from<month+'-01'?month+'-01':from;const [y,m]=month.split('-').map(Number),last=iso(new Date(y,m,0));if(to>last)to=last;}
 const out=[];
 for(let d=parseDate(from),end=parseDate(to);d&&d<=end;d.setDate(d.getDate()+1)){const name=brDate(d);out.push(existing.get(name)||{name,rows:[],...calc([])});}
 return out;
}
function comparisonScopeOK(){
 if(currentIndicator!=='Sla Garantia Total'||metricMode!=='attendance'||$('fType').value||$('fSegment').value)return false;
 if($('fBU').value&&$('fBU').value!==FORTALEZA_UNIT)return false;
 if(!rawCurrent.length||rawCurrent.some(r=>r.city!=='Fortaleza'||r.uf!=='CE'||r.businessUnit!==FORTALEZA_UNIT))return false;
 return rawCurrent.every(r=>yyyymm(r.reportDate)==='2026/10');
}
function renderLogParticipation(monthly){
 const d=monthly.map(x=>({...x,value:logShare(x)}));
 if(!d.length){$('logParticipationChart').innerHTML='<p class="msg">Sem registros neste recorte.</p>';return;}
 const W=Math.max(340,d.length*105+50),H=190,base=146,top=Math.max(1,...d.map(x=>x.logs)),step=(W-45)/d.length;
 $('logParticipationChart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" style="min-width:${W}px" aria-label="Participação mensal dos logs">${d.map((x,i)=>{const cx=30+step*(i+.5),height=x.logs/top*100;return `<g ${hit(()=>openDrill(x.rows.filter(g=>g.logs>0),'Participação dos logs · '+x.name,'all',{mode:metricMode,note:`Participação = ${x.logs} ÷ (${x.total} + ${x.logs}) × 100 = ${pct(x.value)}. O detalhamento lista os atendimentos com logs.`}),`${x.name}: ${pct(x.value)}, ${x.logs} logs`)}><title>${x.name}: ${pct(x.value)}; ${x.logs} logs</title><rect x="${cx-19}" y="${base-height}" width="38" height="${height}" fill="#b9b2ae"/><text class="val" x="${cx}" y="${base-height-10}" text-anchor="middle">${pct(x.value)}</text><text class="lab" x="${cx}" y="${base+15}" text-anchor="middle">${esc(x.name)}</text><text class="lab" x="${cx}" y="${base+30}" text-anchor="middle">${x.logs} logs</text></g>`;}).join('')}</svg>`;
}
function renderAll(){
 actions=new Map();actionSeq=0;rawCurrent=filteredRows();groupedCurrent=groupRows(rawCurrent);page=1;
 renderHeader();renderGeography();
 const monthly=summarize(groupedCurrent,g=>yyyymm(g.reportDate)).sort((a,b)=>a.name.localeCompare(b.name));
 renderCombo('monthlyChart',monthly);
 $('monthlyNote').textContent='Todos os gráficos seguem o mesmo período: '+requestedPeriod()+'. Para visualizar o histórico completo, limpe as datas e o mês e selecione o Excel anterior.';
 renderDaily();renderCodes();renderFamilies();renderServiceAndTech();renderLogAndContracts();renderDetails();renderAudit();renderReference();renderLogParticipation(monthly);renderUnitScope();renderOctoberComparison();renderBaseDeltas();
 $('auditBody').innerHTML+=`<p><b>Corte aplicado:</b> ${esc(requestedPeriod())}. Indicadores, mensal, diário, rankings, contratos e exportação do analítico usam o mesmo recorte. O agrupamento é feito após os filtros pela data do relatório.</p><p><b>Participação dos logs:</b> L ÷ (A + L) × 100. Esta medida é explicitada para conferência; a captura recebida não documenta a fórmula usada pela operadora.</p>`;
}
function clearFilters(){selectedLocations.clear();$('fLocSearch').value='';['fMonth','fType','fSegment','fBU','fUF','fDateFrom','fDateTo','detailSearch'].forEach(id=>$(id).value='');renderLocationOptions();renderAll();}

function comparisonBaseline(){return $('deltaBase').value==='history'?{key:'history',rows:archivedRows,name:'Excel anterior',source:INITIAL.history.source}:{key:'previousCsv',rows:previousCsvRows,name:'CSV anterior',source:INITIAL.previousCsv.source};}
function referenceRows(rows){return rows.filter(r=>r.indicator==='Sla Garantia Total'&&r.city==='Fortaleza'&&r.uf==='CE'&&r.businessUnit===FORTALEZA_UNIT&&yyyymm(r.reportDate)==='2026/10');}
function getOctoberComparison(){
 const scope=comparisonScopeOK();if(!scope)return {scope:false,daily:[],matches:0,comparable:0};
 const baseline=comparisonBaseline(),source=referenceRows(allRows),bounds=sourceBounds(source),oldSource=referenceRows(baseline.rows),oldBounds=sourceBounds(oldSource),old=groupRows(oldSource.filter(r=>acceptsPeriod(r.reportDate)));
 const daily=Array.from({length:18},(_,i)=>String(i+1).padStart(2,'0')+'/10/2026').filter(acceptsPeriod).map(date=>{
  const rows=groupedCurrent.filter(g=>g.reportDate===date),score=calc(rows,'attendance'),expected=OCTOBER_IMAGE[Number(date.slice(0,2))],available=Boolean(bounds&&iso(date)>=bounds.from&&iso(date)<=bounds.to),previous=old.filter(g=>g.reportDate===date),baselineAvailable=Boolean(oldBounds&&iso(date)>=oldBounds.from&&iso(date)<=oldBounds.to),comparable=available&&Number.isFinite(score.sla)&&expected!==undefined;
  const expectedVolumeK=OCTOBER_VOLUME_K[Number(date.slice(0,2))],volumeComparable=available&&score.total>0&&expectedVolumeK!==undefined,volumeMatch=volumeComparable&&Math.round(score.total/10)/100===expectedVolumeK;
  return {date,rows,score,expected,available,baseline:previous,baselineAvailable,baselineScore:calc(previous,'attendance'),comparable,match:comparable&&Math.round(score.sla)===expected,expectedVolumeK,volumeComparable,volumeMatch};
 });
 const comparable=daily.filter(d=>d.comparable).length,matches=daily.filter(d=>d.match).length;
 const complete=Array.from({length:18},(_,i)=>String(i+1).padStart(2,'0')+'/10/2026').every(acceptsPeriod)&&bounds?.from<='2026-10-01'&&bounds?.to>='2026-10-18'&&groupedCurrent.every(g=>iso(g.reportDate)<='2026-10-18');
 const score=calc(groupedCurrent,'attendance'),monthlyMatch=complete&&Math.round(score.sla*10)/10===77.3,logMatch=complete&&Math.round(logShare(score)*10)/10===12.6,volumeMatch=complete&&Math.round(score.total/10)/100===1.14;
 return {scope,daily,comparable,matches,score,complete,bounds,baseline,monthlyMatch,logMatch,volumeMatch,dailyVolumeComparable:daily.filter(x=>x.volumeComparable).length,dailyVolumeMatches:daily.filter(x=>x.volumeMatch).length};
}
function selectFortalezaUnit(unit){
 selectedLocations=new Set(['Fortaleza']);$('fUF').value='CE';$('fBU').value=unit;renderLocationOptions();renderAll();
}
function renderUnitScope(){
 const rows=allRows.filter(r=>r.indicator==='Sla Garantia Total'&&r.city==='Fortaleza'&&r.uf==='CE'&&acceptsPeriod(r.reportDate)&&(!$('fType').value||r.typeOS===$('fType').value)&&(!$('fSegment').value||r.segment===$('fSegment').value));
 const groups=groupRows(rows),data=summarize(groups,g=>g.businessUnit).map(d=>({...d,...calc(d.rows,'attendance')})).sort((a,b)=>b.total-a.total),total=calc(groups,'attendance'),target=calc(groups.filter(g=>g.businessUnit===FORTALEZA_UNIT),'attendance');
 if(!groups.length||currentIndicator!=='Sla Garantia Total'){$('unitScopeNote').textContent='Referência da imagem: Fortaleza/CE, unidade FTZ-DMV_01, Garantia Total, outubro/2026.';$('unitScopeTable').innerHTML='';$('unitScopeDetails').hidden=true;return;}
 $('unitScopeDetails').hidden=false;
 $('unitScopeNote').innerHTML=`<b>Recorte que reproduz a imagem: Fortaleza/CE · ${FORTALEZA_UNIT}.</b> Nesta fonte e período, Fortaleza tem ${intfmt(total.total)} atendimentos; ${intfmt(target.total)} pertencem à unidade de referência e ${intfmt(total.total-target.total)} às demais unidades. O filtro de unidade mantém essas populações separadas. A tabela abaixo mostra o efeito de cada recorte.`;
 const row=(name,c,unit)=>`<tr><td>${link(name,()=>selectFortalezaUnit(unit),'Aplicar unidade em todos os gráficos')}</td><td class="num">${intfmt(c.total)}</td><td class="num">${intfmt(c.revis)}</td><td class="num">${intfmt(c.logs)}</td><td class="num">${link(pct(c.sla),()=>openDrill(c.rows||groups,`Unidade ${name} · ${requestedPeriod()}`,'all',{mode:'attendance'}))}</td><td class="num">${pct(logShare(c))}</td></tr>`;
 $('unitScopeTable').innerHTML=`<table><thead><tr><th>Unidade consolidada</th><th class="num">Atendimentos</th><th class="num">Revisitas</th><th class="num">Logs</th><th class="num">SLA</th><th class="num">Participação dos logs</th></tr></thead><tbody>${data.map(d=>row(d.name,d,d.name)).join('')}</tbody><tfoot>${row('Todas as unidades de Fortaleza',total,'')}</tfoot></table>`;
}
function renderOctoberComparison(){
 const d=getOctoberComparison();comparisonState=d;$('octoberExport').disabled=!d.scope;
 $('octoberResult').classList.remove('comparison-good');
 if(!d.scope){$('octoberSummary').innerHTML='<p class="reference-result">Para conferir esta imagem, selecione <b>Fortaleza/CE · FTZ-DMV_01 · outubro/2026 · Garantia Total por atendimento</b>, sem restringir tipo de OS ou segmento. A visão com todas as unidades tem outra população e outro SLA.</p>';$('octoberTable').innerHTML='';$('octoberResult').textContent='';return;}
 const differences=d.daily.filter(x=>x.comparable&&!x.match).map(x=>x.date.slice(0,5));
 $('octoberSummary').innerHTML=`<div class="reference-cards">${comparisonCard('SLA da fonte · FTZ-DMV_01',link(pct(d.score.sla),()=>openDrill(groupedCurrent,'SLA · Fortaleza · '+requestedPeriod(),'all',{mode:'attendance'})),`${intfmt(d.score.total)} atendimentos − ${intfmt(d.score.revis)} com revisita; ${intfmt(d.score.logs)} logs.`)}${comparisonCard('Rótulos diários compatíveis',`${d.matches}/${d.comparable}`,'Comparação com as casas decimais exibidas na imagem. Dias sem percentual ficam fora dessa contagem.')}${comparisonCard('Acumulado da imagem',d.complete?'77,3%':'Não comparável',d.complete?`${d.monthlyMatch?'SLA compatível':'SLA divergente'} no arredondamento. Volume da imagem: 1,14 mil; fonte: ${intfmt(d.score.total)} (${d.volumeMatch?'compatível':'divergente'}).`:'A captura informa 77,3% até 18/10. Não informa o acumulado do período menor selecionado.')}${comparisonCard('Participação dos logs na fonte',link(pct(logShare(d.score)),()=>openDrill(groupedCurrent.filter(g=>g.logs>0),'Logs · Fortaleza · '+requestedPeriod(),'all',{mode:'attendance'})),d.complete?`Imagem: 12,6% · ${d.logMatch?'compatível':'divergente'} no arredondamento. L ÷ (A + L).`:'L ÷ (A + L). Os 12,6% da imagem são de outro corte de datas.')}</div>`;
 const allDaily=d.matches===d.comparable&&d.comparable>0,allVolumes=d.dailyVolumeMatches===d.dailyVolumeComparable,allChecks=allDaily&&allVolumes&&(!d.complete||(d.monthlyMatch&&d.logMatch&&d.volumeMatch));
 $('octoberResult').classList.toggle('comparison-good',allChecks);
 $('octoberResult').innerHTML=d.comparable?`<b>${allChecks?'Os resultados coincidem na precisão das imagens.':'Há divergências entre a fonte selecionada e a imagem.'}</b> ${d.matches} de ${d.comparable} percentuais diários e ${d.dailyVolumeMatches} de ${d.dailyVolumeComparable} volumes diários compatíveis.${d.complete?` SLA mensal ${d.monthlyMatch?'compatível':'divergente'}, participação dos logs ${d.logMatch?'compatível':'divergente'} e volume ${d.volumeMatch?'compatível':'divergente'}.`:''} ${differences.length?`Dias divergentes: <b>${differences.join(', ')}</b>. `:''}O painel mantém duas casas decimais; a imagem apresenta uma casa no mensal e nenhuma nos dias. O acumulado usa as quantidades do período, sem média dos percentuais diários.`:'Não há dias com percentuais comparáveis neste recorte.';
 $('octoberTable').innerHTML=`<table><thead><tr><th>Data do relatório</th><th class="num">Imagem</th><th class="num">Fonte atual</th><th class="num">Arredondado</th><th class="num">A / R / L</th><th class="num">Volume na imagem</th><th class="num">${esc(d.baseline.name)}</th><th>Conferência</th></tr></thead><tbody>${d.daily.map(x=>`<tr><td>${x.date}</td><td class="num">${x.expected===undefined?'—':x.expected+'%'}</td><td class="num">${x.score.total?link(pct(x.score.sla),()=>openDrill(x.rows,`Fonte atual · ${x.date}`,'all',{mode:'attendance'})):'—'}</td><td class="num">${Number.isFinite(x.score.sla)?Math.round(x.score.sla)+'%':'—'}</td><td class="num">${x.score.total?`${x.score.total} / ${x.score.revis} / ${x.score.logs}`:'—'}</td><td class="num">${x.expectedVolumeK!==undefined?x.expectedVolumeK.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' mil':'—'}</td><td class="num">${x.baselineAvailable&&x.baseline.length?link(pct(x.baselineScore.sla),()=>openDrill(x.baseline,`${d.baseline.name} · ${x.date}`,'all',{mode:'attendance',note:'Fonte anterior: '+d.baseline.source+'. Não é a base do resultado atualizado.'})):'—'}</td><td class="${x.comparable?(x.match?'match':'mismatch'):''}">${x.comparable?(x.match&&(!x.volumeComparable||x.volumeMatch)?'Compatível no arredondamento':'Divergente'):x.expected===undefined?'Sem percentual na imagem':!x.available?'Data fora da cobertura da fonte':'Sem registros na fonte'}</td></tr>`).join('')}</tbody></table>`;
}
function getBaseDeltas(){
 const d=comparisonState;
 if(!d?.scope||activeBase===d.baseline.key)return {available:false,rows:[],old:[],current:[]};
 const commonDates=new Set(d.daily.filter(x=>x.available&&x.baselineAvailable).map(x=>x.date));
 const old=groupRows(referenceRows(d.baseline.rows).filter(r=>commonDates.has(r.reportDate))),current=groupedCurrent.filter(r=>commonDates.has(r.reportDate));
 const outside=groupRows(allRows.filter(r=>r.indicator==='Sla Garantia Total'&&r.city==='Fortaleza'&&r.uf==='CE'&&r.businessUnit!==FORTALEZA_UNIT&&commonDates.has(r.reportDate))),outsideMap=new Map(outside.map(g=>[g.key,g]));
 const oldMap=new Map(old.map(g=>[g.key,g])),currentMap=new Map(current.map(g=>[g.key,g])),rows=[];
 for(const key of new Set([...oldMap.keys(),...currentMap.keys()])){
  const a=oldMap.get(key),b=currentMap.get(key),other=outsideMap.get(key);
  if(a&&b&&a.logs===b.logs&&a.standardCount===b.standardCount)continue;
  rows.push({key,date:(a||b).reportDate,contract:(a||b).contract,old:a,current:b,outside:!b?other:null,reason:!a?'Incluído no recorte atualizado':!b?(other?'Unidade atual: '+other.businessUnit:'Ausente na fonte atual'):'Classificação ou logs alterados'});
 }
 rows.sort((a,b)=>a.date.localeCompare(b.date)||a.contract.localeCompare(b.contract));
 return {available:commonDates.size>0,rows,old,current,dates:[...commonDates].sort(),oldScore:calc(old,'attendance'),currentScore:calc(current,'attendance'),baseline:d.baseline};
}
function renderBaseDeltas(){
 const d=getBaseDeltas();baseDeltaState=d;$('deltaExport').disabled=!d.available;
 if(!d.available){$('deltaSummary').textContent=comparisonState?.scope?'Selecione uma base anterior diferente da fonte ativa para comparar as alterações.':'A comparação de atendimentos exige o recorte de referência FTZ-DMV_01 e datas presentes nas duas fontes.';$('deltaTable').innerHTML='';return;}
 const removed=d.rows.filter(x=>!x.current).length,added=d.rows.filter(x=>!x.old).length,changed=d.rows.length-removed-added,reassigned=d.rows.filter(x=>x.outside).length;
 $('deltaSummary').innerHTML=`<b>${d.rows.length} atendimentos explicam a mudança no período comum de ${d.dates[0]} a ${d.dates.at(-1)}.</b> São ${added} incluídos no recorte atualizado e ${removed} fora dele${reassigned?` (${reassigned} atribuídos a outra unidade na fonte atual)`:''}; ${changed} com classificação/logs alterados nas chaves presentes nas duas bases. <b>${esc(d.baseline.name)}:</b> ${d.oldScore.total} atendimentos / ${d.oldScore.revis} revisitas / ${d.oldScore.logs} logs → ${pct(d.oldScore.sla)}. <b>Fonte atual:</b> ${d.currentScore.total} / ${d.currentScore.revis} / ${d.currentScore.logs} → ${pct(d.currentScore.sla)}. A coluna “fora do recorte” mostra a unidade atual sem somar esses atendimentos ao SLA de FTZ-DMV_01.`;
 const open=(g,label,source)=>openDrill([g],`${label} · contrato ${g.contract} · ${g.reportDate}`,'all',{mode:'attendance',note:'Fonte: '+source+'. Unidade: '+g.businessUnit+'. '+(isConsolidated(g)?'Excel consolidado: há uma OS registrada por atendimento.':'CSV detalhado com as OS de origem e ofensoras informadas.')});
 $('deltaTable').innerHTML=`<table><thead><tr><th>Data</th><th>Contrato</th><th>Diferença</th><th>OS · ${esc(d.baseline.name)}</th><th>OS · recorte atual</th><th>Fora do recorte · unidade / OS</th><th class="num">R / L anterior</th><th class="num">R / L atual</th></tr></thead><tbody>${d.rows.map(x=>`<tr><td>${x.date}</td><td>${esc(x.contract)}</td><td>${esc(x.reason)}</td><td class="wrap-cell">${x.old?link(x.old.os,()=>open(x.old,d.baseline.name,d.baseline.source)):'Ausente'}</td><td class="wrap-cell">${x.current?link(x.current.os,()=>open(x.current,'Fonte atual',sourceName)):'Fora do recorte'}</td><td class="wrap-cell">${x.outside?esc(x.outside.businessUnit)+' · '+link(x.outside.os,()=>open(x.outside,'Fora do recorte de referência',sourceName)):'—'}</td><td class="num">${x.old?`${1-x.old.standardCount} / ${x.old.logs}`:'—'}</td><td class="num">${x.current?`${1-x.current.standardCount} / ${x.current.logs}`:'—'}</td></tr>`).join('')||'<tr><td colspan="8">Nenhuma diferença em presença, classificação ou logs no período comum.</td></tr>'}</tbody></table>`;
}
function historicOffenderLink(g){
 const previous=previousCsvGroupMap.get(g.key);
 if(!previous)return 'Números não informados no Excel';
 return 'Números não informados no Excel.<span class="source-badge">'+link('Consultar OS no CSV anterior',()=>openDrill([previous],`Registro anterior · ${g.contract} · ${g.reportDate}`,'all',{mode:'attendance',note:'Consulta histórica: '+INITIAL.previousCsv.source+'. Estas OS pertencem à extração anterior e não completam automaticamente o Excel atualizado. O SLA do painel permanece baseado na fonte ativa.'}))+'</span>';
}
function exportOctoberComparison(){
 const d=getOctoberComparison();if(!d.scope)return;
 saveText(csvText(['DATA_RELATORIO','UNIDADE_REFERENCIA','IMAGEM_PERCENTUAL','SLA_FONTE_PERCENTUAL','FONTE_ARREDONDADA','ATENDIMENTOS','REVISITAS','LOGS','COMPATIVEL','VOLUME_IMAGEM_MIL','VOLUME_COMPATIVEL','FONTE_ANTERIOR','SLA_ANTERIOR'],d.daily.map(x=>[x.date,FORTALEZA_UNIT,x.expected??'',Number.isFinite(x.score.sla)?x.score.sla.toFixed(6).replace('.',','):'',Number.isFinite(x.score.sla)?Math.round(x.score.sla):'',x.score.total||'',x.score.total?x.score.revis:'',x.score.total?x.score.logs:'',x.comparable?(x.match?'SIM':'NAO'):'NAO COMPARAVEL',x.expectedVolumeK!==undefined?String(x.expectedVolumeK).replace('.',','):'',x.volumeComparable?(x.volumeMatch?'SIM':'NAO'):'NAO COMPARAVEL',d.baseline.source,x.baselineAvailable&&Number.isFinite(x.baselineScore.sla)?x.baselineScore.sla.toFixed(6).replace('.',','):''])),'Comparacao_Fortaleza_Outubro_Periodo_Filtrado.csv');
}
function exportBaseDeltas(){
 const d=getBaseDeltas();if(!d.available)return;
 saveText(csvText(['DATA_RELATORIO','CONTRATO','DIFERENCA','FONTE_ANTERIOR','OS_ANTERIOR','OS_RECORTE_ATUAL','UNIDADE_FORA_RECORTE','OS_FORA_RECORTE','PRESENTE_ANTERIOR','PRESENTE_RECORTE_ATUAL','REVISITA_ANTERIOR','REVISITA_RECORTE_ATUAL','LOGS_ANTERIOR','LOGS_RECORTE_ATUAL'],d.rows.map(x=>[x.date,x.contract,x.reason,d.baseline.source,x.old?.os||'',x.current?.os||'',x.outside?.businessUnit||'',x.outside?.os||'',Number(Boolean(x.old)),Number(Boolean(x.current)),x.old?1-x.old.standardCount:0,x.current?1-x.current.standardCount:0,x.old?.logs||0,x.current?.logs||0])),'Diferencas_Contratos_Fortaleza_Periodo_Filtrado.csv');
}

$('baseSelect').addEventListener('change',()=>activateBase($('baseSelect').value));
['fDateFrom','fDateTo'].forEach(id=>$(id).addEventListener('change',renderAll));
$('cutoffTen').addEventListener('click',()=>applyFortaleza(10));
$('cutoffEighteen').addEventListener('click',()=>applyFortaleza(18));
$('compareFortaleza').addEventListener('click',()=>applyFortaleza(18));
$('deltaBase').addEventListener('change',renderAll);
$('clearPeriod').addEventListener('click',()=>{$('fDateFrom').value='';$('fDateTo').value='';renderAll();});
$('octoberExport').addEventListener('click',exportOctoberComparison);
$('deltaExport').addEventListener('click',exportBaseDeltas);

$('metricAttendance').addEventListener('click',()=>{metricMode='attendance';renderAll();});
$('metricTasks').addEventListener('click',()=>{metricMode='tasks';renderAll();});
$('referenceAll').addEventListener('click',()=>applyReference(false));
$('referenceTasks').addEventListener('click',()=>applyReference(true));
$('referenceExport').addEventListener('click',exportReference);


document.addEventListener('click',e=>{const button=e.target.closest('[data-action]');if(button){const fn=actions.get(button.dataset.action);if(fn)fn();}if(!e.target.closest('#fLocMulti')){$('fLocMulti').classList.remove('open');$('fLocButton').setAttribute('aria-expanded','false');}});
document.addEventListener('keydown',e=>{const button=e.target.closest('[data-action]');if(button&&button.getAttribute('role')==='button'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();actions.get(button.dataset.action)?.();}});
$('fLocButton').addEventListener('click',()=>{$('fLocMulti').classList.toggle('open');$('fLocButton').setAttribute('aria-expanded',String($('fLocMulti').classList.contains('open')));});
$('fLocSearch').addEventListener('input',renderLocationOptions);
$('fLocOptions').addEventListener('change',e=>{const v=e.target.dataset.location;if(v){if(e.target.checked)selectedLocations.add(v);else selectedLocations.delete(v);renderLocationOptions();renderAll();}});
$('fLocClear').addEventListener('click',()=>{selectedLocations.clear();renderLocationOptions();renderAll();});
$('fLocSelectVisible').addEventListener('click',()=>{const q=fold($('fLocSearch').value);locationOptions.filter(v=>!q||fold(v).includes(q)).forEach(v=>selectedLocations.add(v));renderLocationOptions();renderAll();});
['fType','fSegment','fBU','fUF','fView','techOrder'].forEach(id=>$(id).addEventListener('change',renderAll));
$('fMonth').addEventListener('change',()=>{$('fDateFrom').value='';$('fDateTo').value='';renderAll();});
$('indicatorTotal').addEventListener('click',()=>selectIndicator('Sla Garantia Total'));$('indicatorRegular').addEventListener('click',()=>selectIndicator('Sla Garantia'));
$('clearFiltersBtn').addEventListener('click',clearFilters);


$('exportBtn').addEventListener('click',()=>downloadRows(filteredDetails(),'SLA_Garantia_Analitico.csv'));$('dailyExport').addEventListener('click',exportDaily);
$('detailSearch').addEventListener('input',()=>{page=1;renderDetails();});$('prevBtn').addEventListener('click',()=>{if(page>1){page--;renderDetails();}});$('nextBtn').addEventListener('click',()=>{if(page<Math.ceil(filteredDetails().length/PAGE_SIZE)){page++;renderDetails();}});
$('kTotalButton').addEventListener('click',()=>openDrill(groupedCurrent,'Base do indicador selecionado','all'));$('kRevisButton').addEventListener('click',()=>openDrill(groupedCurrent,'Revisitas · atendimentos sem padrão'));$('kGoodButton').addEventListener('click',()=>openDrill(groupedCurrent,'Atendimentos com padrão','good'));$('kLogsButton').addEventListener('click',()=>openDrill(groupedCurrent.filter(g=>g.logs>0),'Atendimentos com logs de revisita','all'));$('kSla').addEventListener('click',()=>openDrill(groupedCurrent,'SLA do recorte selecionado'));
$('auditToggle').addEventListener('click',()=>{$('auditPanel').open=!$('auditPanel').open;$('auditToggle').setAttribute('aria-expanded',String($('auditPanel').open));if($('auditPanel').open)$('auditPanel').scrollIntoView({behavior:'smooth',block:'start'});});$('auditPanel').addEventListener('toggle',()=>$('auditToggle').setAttribute('aria-expanded',String($('auditPanel').open)));
$('drillClose').addEventListener('click',closeDrill);$('drillDialog').addEventListener('click',e=>{if(e.target===$('drillDialog')){const r=$('drillDialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDrill();}});
['drillSearch','drillStatus'].forEach(id=>$(id).addEventListener(id==='drillSearch'?'input':'change',()=>{drillPage=1;renderDrill();}));$('drillPrev').addEventListener('click',()=>{if(drillPage>1){drillPage--;renderDrill();}});$('drillNext').addEventListener('click',()=>{if(drillPage<Math.ceil(filteredDrill().length/DRILL_SIZE)){drillPage++;renderDrill();}});
$('drillExport').addEventListener('click',()=>downloadRows(filteredDrill(),'SLA_Garantia_Contratos_OS.csv'));$('offenderExport').addEventListener('click',exportOffenders);
populateFilters(true);renderAll();


function renderServiceTable(){ $('serviceBody').innerHTML=serviceSort.rows(serviceData).map(d=>`<tr><td class="wrap-cell">${esc(d.name)}</td><td class="num">${intfmt(d.os)}</td><td class="num">${link(pct(d.os/rawCurrent.length*100),()=>drillFor(d,d.name,'all'))}</td><td class="num">${intfmt(d.total)}</td><td class="num">${intfmt(d.revis)}</td><td class="num">${intfmt(d.logs)}</td><td class="num">${link(pct(d.sla),()=>drillFor(d,d.name))}</td></tr>`).join('');}

function renderTechTable(){ $('techBody').innerHTML=techSort.rows(techData).map(d=>`<tr><td>${technicians.cell(d.name)}</td><td class="num">${intfmt(d.total)}</td><td class="num">${intfmt(d.good)}</td><td class="num">${intfmt(d.revis)}</td><td class="num">${intfmt(d.logs)}</td><td class="num">${link(pct(d.sla),()=>drillFor(d,`Matrícula ${d.name}`))}</td></tr>`).join('');}


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
window.refreshSupervisorRegistry=()=>{renderServiceAndTech();renderDetails();if($('drillDialog').open)renderDrill();};
window.closeModal=()=>{if($('drillDialog').open)closeDrill();};
window.getProjectState=()=>({rows:allRows,filtered:rawCurrent,groups:groupedCurrent,metrics:calc(groupedCurrent),mode:metricMode,indicator:currentIndicator,source:activeBase});
$('clearDataBtn').hidden=true;$('fileInput').accept='.csv,.xlsx';
$('fileInput').addEventListener('change',async event=>{const input=event.target;const file=input.files?.[0];input.value='';if(file)await loadFile(file);});
if(!environment.editable){$('fileInput').disabled=true;document.querySelector('label[for="fileInput"]').hidden=true;}

return window;
}
