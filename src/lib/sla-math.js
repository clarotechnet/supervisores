// Exact business functions from reviewed reference 4ba57ce2a356a8acedc270648099194f68cdc22fef6610d5a61d9853db8d4545.
let importStats={};const metricMode='attendance';const uniqueParts=v=>[...new Set(norm(v).split(',').map(norm).filter(Boolean))];const isConsolidated=r=>r.sourceFormat==='consolidated';
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
function daysBetween(a,b){const x=parseDate(a),y=parseDate(b);return x&&y?Math.round((Date.UTC(x.getFullYear(),x.getMonth(),x.getDate())-Date.UTC(y.getFullYear(),y.getMonth(),y.getDate()))/86400000):NaN;}
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
export function normalizeSlaRows(raw,options={}){const records=standardizeImported(raw,options);return {records,stats:{...importStats}};}
export {csvToRows,groupRows,calc,parseDate};
