// Reviewed reference e2a41044c855276006e3d977a81bbd10ca220f96a720b7dfedf1f6888fde7dd2; generated visual engine. No personal seed data.
import { referenceCertificationRule } from "../reference-certification-rule";
import { referenceCityMembers } from "../reference-city-members";
export function mountTC(environment) {
const {document,window,localStorage,location,ResizeObserver,setTimeout,clearTimeout,requestAnimationFrame}=environment;
const BUSINESS_UNITS=Object.freeze(["FTZ-DMV_01_VT","FTZ-DMV_01","FTZ-DMV_ADM","MRO-DMV","NTL-DMV_ADM","PWM-DMV_ADM","NTL-DMV","PWM-DMV","NTL-DMV_VT","PWM-DMV_VT","JCR-DMV","JCR-DMV_ADM"]);
function businessUnitOptions(values=[]){
 return [...new Set([...BUSINESS_UNITS,...values].map(v=>String(v??'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
}

    function tcRule(){return referenceCertificationRule(environment.technicalVisit);}
    function tcTecOK(v){const t=tcRule();return v!=null&&(t.strict?v>t.tec:v>=t.tec);}
    function tcProdOK(v){const t=tcRule();return v!=null&&(t.strict?v>t.prod:v>=t.prod);}
    function tcRefreshRuleLabels(){$('#ruleNotice').textContent=tcRule().label;$('#revMeta').textContent='< 7,01%';$('#tecMeta').textContent='≥ 95%';$('#prodMeta').textContent='≥ '+tcRule().prod+' pontos/dia';$('#fRule option[value="fixed"]').textContent='Todas as operações · ≥ '+tcRule().prod+' pontos/dia';}

    'use strict';
    const TECH_MAP = {};
    const EMBEDDED_CSV_GZIP = ""; const EMBEDDED_NAME = "REL_TOA_TEC_CERTIFICADO_TRIMESTRAL_conferencia 1.csv";
    const REQUIRED = ['LOGIN_TECNICO', 'QT_REVISITA', 'TOTAL_OS_TEC1_PADRAO', 'QTD_TOTAL_OS_TEC1', 'QTDE_PONTOS', 'FIM_TRABALHO', 'DATA_NOTA', 'NM_MUNICIPIO', 'SUBCLUSTER', 'GRUPO_ORDEM_SERVICO', 'TIPO_JOB', 'UF', 'WORKORDER'];
    const OPTIONAL = ['UNIDADE_NEGOCIO', 'FG_DIA_PRODUTIVO','CONTRATO','LISTA_OS','LISTA_ID_OS','LISTA_CD_BAIXA','WO_REVISITA','DSC_LISTA_TEC1','DATA_NOTA','DATA_AGENDA','JANELA_INICIAL','JANELA_FINAL','INICIO_TRABALHO','TIPO_SERVICO','STATUS_JOB'];
    // Cadastro fornecido em supervirores.xlsx — associação exclusivamente pelo Login.
const SUPERVISOR_MAP={...(window.parent.getSupervisorMap?.()||{})};
const SV_NAME_CORRECTIONS={};
const SV_UNASSIGNED='Sem supervisor';
function svLogin(login){return String(login??'').trim().toUpperCase();}
function svValidTechnicianName(value,login){
 const name=String(value??'').trim(),key=svLogin(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 return name&&svLogin(name)!==svLogin(login)&&!['NOME NAO LOCALIZADO','SEM NOME','NAO INFORMADO','(SEM LOGIN)','N/A','-','-1','-3'].includes(key)?name:'';
}
function svRegisteredTechnicianName(login){return svValidTechnicianName(SUPERVISOR_MAP[svLogin(login)]?.name,login);}
function svFor(login){return SUPERVISOR_MAP[svLogin(login)]?.supervisor||SV_UNASSIGNED;}
function svNames(){return [...new Set(Object.values(SUPERVISOR_MAP).map(x=>x.supervisor).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));}
function svEscape(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function svCounts(records,key){const counts=new Map();for(const r of records){const name=svFor(r[key]);if(!counts.has(name))counts.set(name,new Set());counts.get(name).add(svLogin(r[key]));}return counts;}
function svReconcileSelection(selected,records,key){const available=svCounts(records,key);for(const value of [...selected])if(!available.has(value))selected.delete(value);}
function svAllows(selected,login){return !selected?.size||selected.has(svFor(login));}
function svLabel(selected,all='Todos os supervisores'){return !selected?.size?all:selected.size===1?[...selected][0]:selected.size+' supervisores';}
function svPickerInner(selected,records,key){
 const counts=svCounts(records,key),names=[...counts.keys()].sort((a,b)=>(a===SV_UNASSIGNED)-(b===SV_UNASSIGNED)||a.localeCompare(b,'pt-BR'));
 return `<summary title="${svEscape([...selected].join(' / ')||'Todos os supervisores da cidade e período')}">${svEscape(svLabel(selected))}<span>▾</span></summary><div class="sv-picker-menu"><label class="sv-picker-all"><input type="checkbox" data-sv-all ${selected.size?'':'checked'}>Todos os supervisores</label>${names.map(name=>`<label><input type="checkbox" data-sv-name="${svEscape(name)}" ${selected.has(name)?'checked':''}><span>${svEscape(name)}</span><small>${counts.get(name).size}</small></label>`).join('')||'<div class="sv-empty">Sem equipes no recorte.</div>'}</div>`;
}
function svPickerMarkup(id,selected,records,key){return `<details id="${id}" class="sv-picker">${svPickerInner(selected,records,key)}</details>`;}
function svRenderPicker(id,selected,records,key){const root=document.getElementById(id);if(!root)return;const focused=root.contains(document.activeElement)?document.activeElement.dataset.svName:null,scroll=root.querySelector('.sv-picker-menu')?.scrollTop||0;root.innerHTML=svPickerInner(selected,records,key);const menu=root.querySelector('.sv-picker-menu');menu.scrollTop=scroll;if(focused)for(const input of root.querySelectorAll('[data-sv-name]'))if(input.dataset.svName===focused)input.focus({preventScroll:true});}
function svWirePicker(id,selected,change){const root=document.getElementById(id);root.onchange=e=>{if(e.target.matches('[data-sv-all]'))selected.clear();else if(e.target.matches('[data-sv-name]'))e.target.checked?selected.add(e.target.dataset.svName):selected.delete(e.target.dataset.svName);else return;change();};root.querySelector('[data-sv-all]').indeterminate=!!selected.size;}
function svOpenEditor(){try{window.parent.show('supervisors');}catch(e){}}
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.sv-picker'))document.querySelectorAll('.sv-picker[open]').forEach(p=>p.open=false);});
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.sv-picker[open]').forEach(p=>p.open=false);});
function svDownloadMissing(records,loginKey,nameFor,panel){
 const missing=new Map();for(const r of records){const login=svLogin(r[loginKey]);if(svFor(login)===SV_UNASSIGNED&&!missing.has(login))missing.set(login,nameFor(r));}
 const csv=['Login;Técnico;Supervisor;Painel',...[...missing].sort(([a],[b])=>a.localeCompare(b)).map(([l,n])=>[l,n,'',panel].map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';'))].join('\r\n');
 const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='logins_sem_supervisor_'+panel.toLowerCase()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function svChart(items,target,percent=true,chartHeight=185){
 const valid=items.filter(x=>x.v!=null&&Number.isFinite(x.v));if(!valid.length)return '<div class="sv-empty">Sem dados no recorte selecionado.</div>';
 const W=1000,H=chartHeight,left=28,right=28,top=30,bottom=37,max=Math.max(target||0,...valid.map(x=>x.v))*1.25||1;
 const y=v=>H-bottom-v/max*(H-top-bottom),bw=(W-left-right)/items.length,fmt=v=>v==null||!Number.isFinite(v)?'—':new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1,minimumFractionDigits:1}).format(percent?v*100:v)+(percent?'%':'');
 let s=`<svg class="sv-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução do resultado"><line x1="${left}" x2="${W-right}" y1="${H-bottom}" y2="${H-bottom}" stroke="#d8e0e9"/>`;
 if(target!=null)s+=`<line x1="${left}" x2="${W-right}" y1="${y(target)}" y2="${y(target)}" stroke="#7a8fa8" stroke-dasharray="6 5"/><text x="${W-right}" y="17" text-anchor="end" fill="#5f7187" font-size="12">Meta ${fmt(target)}</text>`;
 for(let i=0;i<items.length;i++){const x=items[i],v=x.v,available=v!=null&&Number.isFinite(v),good=available&&(percent?x.higher?v>=target:v<=target:v>=target),color=available?good?'#149654':'#dc3450':'#99a8b9',cx=left+bw*(i+.5),width=Math.min(95,bw*.55);s+=`<g><title>${svEscape(x.l)}: ${fmt(v)}${x.t?' · '+svEscape(x.t):''}</title>${available?`<rect x="${cx-width/2}" y="${y(v)}" width="${width}" height="${Math.max(1,H-bottom-y(v))}" rx="3" fill="${color}"/>`:''}<text x="${cx}" y="${available?y(v)-8:H-bottom-9}" text-anchor="middle" fill="${color}" font-size="${items.length>16?11:14}" font-weight="700">${fmt(v)}</text><text x="${cx}" y="${H-12}" text-anchor="middle" fill="#64748b" font-size="12">${svEscape(x.l)}</text></g>`;}
 return s+'</svg>';
}

const state = { rows: [], keys: new Set(), files: [], customMap: {}, filteredRows: [], result: [], sort: { key: 'status', month: null, dir: 1 }, multi: { city: new Set(), group: new Set(), type: new Set() }, ready: false, view: 'panel', metric: 'revisit', focus: null, matrixSort: { key: 'avg', dir: -1 } };
const tcSelectedUnits = new Set();
    const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
    const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }), nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pct1 = x => x == null ? '—' : nf1.format(x * 100) + '%', num = x => { if (x == null || x === '') return null; const v = Number(String(x).trim().replace(',', '.')); return Number.isFinite(v) ? v : null }, txt = x => String(x ?? '').trim();
    function dateParts(s) { const m = txt(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? { d: +m[1], m: +m[2], y: +m[3], key: m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') } : null } function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) }
    function setLoading(on, t = 'Processando…') { $('#loading').classList.toggle('show', !!on); $('#loadingText').textContent = t } function setBadge(ok, t) { $('#dataDot').className = 'dot ' + (ok ? 'ok' : 'bad'); $('#dataBadge').textContent = t }
    function resolve(login, baseUnit) {
 const key=svLogin(login),custom=state.customMap[key]||state.customMap[login],u=custom||TECH_MAP[key]||TECH_MAP[login];
 const registered=svRegisteredTechnicianName(key);
 const name=registered||svValidTechnicianName(custom?.name,key)||svValidTechnicianName(TC_NAME_UPDATES[key],key)||svValidTechnicianName(u?.name,key)||String(login??'').trim()||'(sem login)';
 return {name,company:u?.company||baseUnit||'SEM EMPRESA/UN',mapped:!!(u||registered),mapSource:u?(u.source==='Excel'?'excel':'manual'):registered?'manual':'base'};
}
    function applyMaps() { for (const r of state.rows) { const x = resolve(r.login, r.baseUnit); r.name = x.name; r.company = x.company; r.mapped = x.mapped; r.mapSource = x.mapSource } }
    function parseCsvCompact(text, fileName) { let headers = null, idx = null, out = [], field = '', row = [], inQ = false; function emit() { if (row.length === 1 && row[0] === '') { row = []; return } if (!headers) { headers = row.map((v, i) => i === 0 ? v.replace(/^\uFEFF/, '').trim() : v.trim()); idx = {}; for (const k of REQUIRED.concat(OPTIONAL)) idx[k] = headers.indexOf(k); const miss = REQUIRED.filter(k => idx[k] < 0); if (miss.length) throw new Error(fileName + ': colunas ausentes: ' + miss.join(', ')) } else { const g = k => idx[k] >= 0 ? (row[idx[k]] ?? '') : ''; const login = txt(g('LOGIN_TECNICO')), dp = dateParts(g('DATA_NOTA')), fp = dateParts(g('FIM_TRABALHO')), baseUnit = txt(g('UNIDADE_NEGOCIO')), m = resolve(login, baseUnit); out.push({ login, name: m.name, company: m.company, mapped: m.mapped, mapSource: m.mapSource, baseUnit, qr: g('QT_REVISITA'), tnum: g('TOTAL_OS_TEC1_PADRAO'), tden: g('QTD_TOTAL_OS_TEC1'), points: g('QTDE_PONTOS'), fg: txt(g('FG_DIA_PRODUTIVO')), day: fp?.key ?? '', month: dp?.m ?? null, year: dp?.y ?? null, city: txt(g('NM_MUNICIPIO')), sub: txt(g('SUBCLUSTER')), group: txt(g('GRUPO_ORDEM_SERVICO')), type: txt(g('TIPO_JOB')), uf: txt(g('UF')), wo: txt(g('WORKORDER')), finish: txt(g('FIM_TRABALHO')), contract: txt(g('CONTRATO')), orders: txt(g('LISTA_OS')), orderTypes: txt(g('LISTA_ID_OS')), lowCodes: txt(g('LISTA_CD_BAIXA')), revisitWo: txt(g('WO_REVISITA')), tec1Source: txt(g('DSC_LISTA_TEC1')), noteAt: txt(g('DATA_NOTA')), agendaAt: txt(g('DATA_AGENDA')), windowStart: txt(g('JANELA_INICIAL')), windowEnd: txt(g('JANELA_FINAL')), start: txt(g('INICIO_TRABALHO')), service: txt(g('TIPO_SERVICO')), jobStatus: txt(g('STATUS_JOB')), file: fileName }) } row = [] } for (let i = 0; i < text.length; i++) { const c = text[i]; if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false } else field += c } else if (c === '"') inQ = true; else if (c === ';') { row.push(field); field = '' } else if (c === '\n') { row.push(field.replace(/\r$/, '')); field = ''; emit() } else field += c } if (field.length || row.length) { row.push(field.replace(/\r$/, '')); emit() } return out }
function tcRowKey(r){
 const dp=dateParts(r.finish),time=String(r.finish||'').match(/\s(\d{1,2}):(\d{2})(?::(\d{2}))?/);
 const finish=dp?dp.key+'T'+(time?time[1].padStart(2,'0')+':'+time[2]+':'+(time[3]||'00'):'00:00:00'):String(r.finish||'').trim();
 return (r.wo||'')+'|'+r.login+'|'+finish;
}
async function tcUnzipCsv(buffer){
 const view=new DataView(buffer),bytes=new Uint8Array(buffer);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw new Error('Arquivo ZIP incompleto.');
 const count=view.getUint16(end+10,true),entries=[];let offset=view.getUint32(end+16,true);
 for(let i=0;i<count;i++){
  if(view.getUint32(offset,true)!==0x02014b50)throw new Error('Índice ZIP inválido.');
  const nameLength=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true);
  const name=new TextDecoder('utf-8').decode(bytes.subarray(offset+46,offset+46+nameLength));
  if(/\.csv$/i.test(name))entries.push({name,method:view.getUint16(offset+10,true),flags:view.getUint16(offset+8,true),size:view.getUint32(offset+20,true),rawSize:view.getUint32(offset+24,true),local:view.getUint32(offset+42,true)});
  offset+=46+nameLength+extra+comment;
 }
 if(entries.length!==1)throw new Error('Selecione um ZIP com apenas um analítico CSV.');
 const e=entries[0];if(e.flags&1)throw new Error('O ZIP está protegido por senha.');
 if(e.rawSize>64*1024*1024)throw new Error('O CSV excede 64 MB.');
 const start=e.local+30+view.getUint16(e.local+26,true)+view.getUint16(e.local+28,true),packed=bytes.subarray(start,start+e.size);
 if(e.method===0)return packed;
 if(e.method!==8)throw new Error('Compactação ZIP não suportada.');
 const decoded=new Uint8Array(await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
 if(decoded.length!==e.rawSize)throw new Error('O CSV compactado está incompleto.');
 return decoded;
}
    async function decodeFile(file) { let buf = await file.arrayBuffer(); if(new Uint8Array(buf)[0]===0x50&&new Uint8Array(buf)[1]===0x4b)buf=await tcUnzipCsv(buf); let s = new TextDecoder('utf-8').decode(buf); if ((s.match(/\uFFFD/g) || []).length > 10) s = new TextDecoder('windows-1252').decode(buf); return s } async function embeddedText() { if (!('DecompressionStream' in window)) throw new Error('Navegador sem descompactação automática; selecione o CSV manualmente.'); const bin = atob(EMBEDDED_CSV_GZIP), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++)bytes[i] = bin.charCodeAt(i); const st = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')); return await new Response(st).text() }
    function uniq(a) { return [...new Set(a.filter(v => v !== '' && v != null))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true })) } function fillSelect(el, vals, label = 'Todos', sel = '') { const cur = sel || el.value; el.innerHTML = '<option value="">' + label + '</option>' + vals.map(v => '<option value="' + esc(v) + '">' + esc(v) + '</option>').join(''); if (vals.includes(cur)) el.value = cur }
    function setupMulti(id, vals, set) { const root = $(id), menu = root.querySelector('.multi-menu'), btn = root.querySelector('.multi-btn'), valid = new Set(vals);[...set].forEach(v => { if (!valid.has(v)) set.delete(v) }); menu.innerHTML = '<label><input type="checkbox" data-all ' + (set.size === 0 ? 'checked' : '') + '> <b>Todos</b></label>' + vals.map(v => '<label><input type="checkbox" value="' + esc(v) + '" ' + (set.has(v) ? 'checked' : '') + '> ' + esc(v) + '</label>').join(''); const lab = () => btn.textContent = set.size === 0 ? 'Todos' : set.size === 1 ? [...set][0] : set.size + ' selecionados'; lab(); menu.onchange = e => { const t = e.target; if (t.matches('[data-all]')) { set.clear(); menu.querySelectorAll('input:not([data-all])').forEach(x => x.checked = false); t.checked = true } else { t.checked ? set.add(t.value) : set.delete(t.value); menu.querySelector('[data-all]').checked = set.size === 0 } lab(); render() }; btn.onclick = e => { e.stopPropagation(); $$('.multi').filter(x => x !== root).forEach(x => x.classList.remove('open')); root.classList.toggle('open') } }
    function monthKey(r){return r.year&&r.month?String(r.year)+'-'+String(r.month).padStart(2,'0'):''}
    function monthLabel(key){const [year,month]=key.split('-');return ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][Number(month)-1]+' / '+year}
    function companyContextRows() { const uf = $('#fUf').value; return state.rows.filter(r => tcDatePass(r) && tcMonthPass(r) && (!uf || r.uf === uf)) }
    function syncCompanyOptions() { const el = $('#fCompany'), cur = el.value, vals = uniq(companyContextRows().map(x => x.company)); fillSelect(el, vals, 'Todas as empresas/unidades', cur); return cur && !vals.includes(cur) }
    function initFilters(defaults = false) { const r = state.rows; fillSelect($('#fBaseUnit'), businessUnitOptions(r.map(x=>x.baseUnit)), 'Todas as unidades'); const months = uniq(r.map(monthKey)).sort(); fillSelect($('#fMonth'), months, 'Todos os meses'); [...$('#fMonth').options].forEach(o=>{if(o.value)o.textContent=monthLabel(o.value)}); if (defaults) $('#fMonth').value = ''; fillSelect($('#fUf'), uniq(r.map(x => x.uf)), 'Todas as UFs'); syncCompanyOptions(); fillSelect($('#fSub'), uniq(r.map(x => x.sub)), 'Todos os subclusters'); setupMulti('#mCity', uniq(r.map(x => x.city)), state.multi.city); setupMulti('#mGroup', uniq(r.map(x => x.group)), state.multi.group); setupMulti('#mType', uniq(r.map(x => x.type)), state.multi.type) }
    function rowPass(r,ignoreMonth=false,ignoreSupervisor=false) { if(ignoreSupervisor!==true&&!svAllows(tcSupervisors,r.login))return false; if(tcSelectedUnits.size?!tcSelectedUnits.has(r.baseUnit):($('#fBaseUnit').value&&r.baseUnit!==$('#fBaseUnit').value))return false; const mo = $('#fMonth').value, uf = $('#fUf').value, co = $('#fCompany').value, sub = $('#fSub').value, mp = $('#fMap').value, q = $('#fSearch').value.trim().toLocaleUpperCase('pt-BR'); if (!tcDatePass(r)) return false; if (ignoreMonth!==true && !tcMonthPass(r)) return false; if (uf && r.uf !== uf) return false; if (co && r.company !== co) return false; if (sub && r.sub !== sub) return false; if (mp && r.mapSource !== mp) return false; if (state.multi.city.size && !state.multi.city.has(r.city)) return false; if (state.multi.group.size && !state.multi.group.has(r.group)) return false; if (state.multi.type.size && !state.multi.type.has(r.type)) return false; if (q && !((r.name + ' ' + r.login + ' ' + r.company + ' ' + r.baseUnit).toLocaleUpperCase('pt-BR').includes(q))) return false; return true }
function tcDistinctRevisit(r){return txt(r.baseUnit).toUpperCase()==='FTZ-DMV_01';}
function tcRevisitKey(r){
 const value=txt(r.revisitWo);
 return value&&!['-1','-3','0','-'].includes(value)?'retorno|'+value:'atendimento|'+tcRowKey(r);
}
function tcAccumulateRevisit(a,r){
 const bp=num(r.qr)??0;
 a.revAffected=(a.revAffected||0)+(bp===0?0:1);
 if(tcDistinctRevisit(r)){
  a.revFTZRows=(a.revFTZRows||0)+1;a.revGood++;
  if(bp!==0){
   const key=tcRevisitKey(r);a.revReturns??=new Set();
   if(!a.revReturns.has(key)){a.revReturns.add(key);a.revBad++;a.revGood--;}
  }
 }else{a.revBad+=(bp===0?0:1);a.revGood+=(bp===1?0:1);}
}
function tcRevisitUnit(a){
 return a?.revFTZRows===a?.os&&a?.os?'retornos distintos':a?.revFTZRows?'revisitas contadas':'WOs com revisita';
}
function tcRevisitExplanation(a){
 return a?.revFTZRows?'Em Fortaleza, cada WO de retorno conta uma vez por técnico dentro do recorte. A base mantém todas as WOs atendidas.':'A revisita conta as WOs marcadas com QT_REVISITA na origem.';
}
function aggregate(rows){
 const m=new Map();
 for(const r of rows){
  const key=r.login;if(!key)continue;
  let a=m.get(key);
  if(!a){a={name:r.name||key,logins:new Set(),companies:new Set(),units:new Set(),ufs:new Set(),cities:new Set(),sources:new Set(),os:0,revBad:0,revGood:0,revAffected:0,revFTZRows:0,tnum:0,tden:0,points:0,days:new Set(),daily:new Map()};m.set(key,a);}
  a.logins.add(r.login);a.companies.add(r.company);if(r.baseUnit)a.units.add(r.baseUnit);if(r.uf)a.ufs.add(r.uf);if(r.city)a.cities.add(r.city);a.sources.add(r.mapSource);a.os++;
  tcAccumulateRevisit(a,r);
  const n=num(r.tnum),d=num(r.tden);if(n!=null)a.tnum+=n;if(d!=null)a.tden+=d;
  const p=num(r.points);
  if(p!=null){
   a.points+=p;
   if(r.day){
    a.days.add(r.day);
    let z=a.daily.get(r.day)||{points:0,os:0,revBad:0,revGood:0,revAffected:0,revFTZRows:0,tnum:0,tden:0};
    z.points+=p;z.os++;tcAccumulateRevisit(z,r);if(n!=null)z.tnum+=n;if(d!=null)z.tden+=d;a.daily.set(r.day,z);
   }
  }
 }
 const out=[];
 for(const a of m.values()){
  const den=a.revBad+a.revGood;a.revisit=den?a.revBad/den:null;a.tec1=a.tden?a.tnum/a.tden:null;a.prod=a.days.size?a.points/a.days.size:null;a.loginText=[...a.logins].join(' | ');a.companyText=[...a.companies].join(' | ');a.status=false;a.tecMeta=.95;a.fails=[];out.push(a);
 }
 return out;
}

    function applyStatus(result) {
      $('#legacyStatus').checked=false;
      result.forEach(a=>{a.tecMeta=.95;const revOK=a.revisit!=null&&a.revisit<tcRule().rev,tecOK=tcTecOK(a.tec1),prodOK=tcProdOK(a.prod);
        a.fails=[!revOK?'REV':null,!tecOK?'TEC1':null,!prodOK?'PROD':null].filter(Boolean);a.status=revOK&&tecOK&&prodOK;});
    }
    function sortResult(arr){return tcQuarterSort(arr);} function metricClass(v, ok) { return 'metric ' + (v == null ? 'na' : ok ? 'good' : 'bad') }
    function render() { if (!state.ready) return; tcRefreshRuleLabels(); const rows = state.rows.filter(rowPass); state.filteredRows = rows;tcBuildMonthly(rows);tcBuildCurrentMonth();tcBuildTrendContext();let result = aggregate(rows); applyStatus(result); sortResult(result); state.result = result; const evalN = result.filter(x => x.prod != null).length, cert = result.filter(x => x.status).length, score = evalN ? cert / evalN : null; $('#scoreVal').textContent = score == null ? '—' : nf2.format(score * 100) + '%'; $('#scoreSub').textContent = score == null ? 'Sem técnicos avaliáveis' : cert + ' certificados de ' + evalN + ' avaliados'; tcUpdateScoreTrend(score);tcUpdateMetaProgress(score); $('#kCert').textContent = nf0.format(cert); $('#kEval').textContent = nf0.format(evalN); $('#kOs').textContent = nf0.format(rows.length); $('#kRowsSub').textContent = nf0.format(result.length) + ' técnicos no recorte'; setBadge(true, state.files.join(' + ')); renderTable(); if(!document.body.classList.contains('presentation-mode')){if(state.view==='daily')renderDaily();} }
    function dayMetric(a, day, k) { const z = a.daily.get(day); if (!z) return null; if (k === 'revisit') { const den = z.revBad + z.revGood; return den ? z.revBad / den : null } if (k === 'tec1') return z.tden ? z.tnum / z.tden : null; if (k === 'prod') return z.points; return null } function fmtMetric(v, k) { return v == null ? '' : k === 'prod' ? nf0.format(v) : pct1(v) } function goodMetric(v, k) { return v != null && (k === 'revisit' ? v < tcRule().rev : k === 'tec1' ? tcTecOK(v) : tcProdOK(v)) }
    function renderDaily() { if (!state.ready) return; $$('.metricbtn[data-metric]').forEach(b => b.classList.toggle('on', b.dataset.metric === state.metric)); const R = state.result, days = uniq(state.filteredRows.map(r => r.day)).sort(); if (state.metric === 'all') { $('#matrix').classList.add('allmode'); const specs = [['revisit', 'REVISITA', 'meta < '+nf2.format(tcRule().rev*100)+'%'], ['tec1', 'TEC1', 'meta '+(tcRule().strict?'>':'≥')+' 95%'], ['prod', 'PONTOS/DIA', 'meta '+(tcRule().strict?'>':'≥')+' '+tcRule().prod]]; $('#matrixInfo').textContent = 'Revisita + TEC1 + Produtividade • ' + days.length + ' dias • cada técnico ocupa 3 linhas'; $('#matrix').innerHTML = '<thead><tr><th>TÉCNICO</th><th>INDICADOR</th><th>MÊS</th>' + days.map(d => `<th>${d.slice(8)}/${d.slice(5, 7)}</th>`).join('') + '</tr></thead><tbody>' + R.map(a => specs.map(([k, label, meta], i) => { const avg = a[k], ac = avg == null ? '' : goodMetric(avg, k) ? 'cellgood' : 'cellbad'; return `<tr data-name="${esc(a.name)}" class="${i === 0 ? 'metric-start' : ''}">${i === 0 ? `<td class="techcol" rowspan="3">${esc(a.name)}<div class="src">${esc(a.loginText)}</div></td>` : ''}<td class="metriclabel">${label}<span class="metric-sub">${meta}</span></td><td class="avg ${ac}">${tcMetricButton(a,k,avg)}</td>${days.map(d => { const v = dayMetric(a, d, k); return `<td class="${v == null ? '' : goodMetric(v, k) ? 'cellgood' : 'cellbad'}">${v==null?'':tcMetricButton(a,k,v,d)}</td>` }).join('')}</tr>` }).join('')).join('') + '</tbody>'; $('#matrix').querySelectorAll('tbody tr').forEach(tr => tr.onclick = () => { state.focus = tr.dataset.name; renderCharts() }); tcWireMetricLinks($('#matrix')); renderCharts(); return } $('#matrix').classList.remove('allmode'); const rows = R.map(a => ({ a, avg: a[state.metric], ...Object.fromEntries(days.map(d => [d, dayMetric(a, d, state.metric)])) })); const ms = state.matrixSort; rows.sort((x, y) => { let A = ms.key === 'avg' ? x.avg : ms.key === 'name' ? x.a.name : x[ms.key], B = ms.key === 'avg' ? y.avg : ms.key === 'name' ? y.a.name : y[ms.key]; if (typeof A === 'string' || typeof B === 'string') return ms.dir * String(A ?? '').localeCompare(String(B ?? ''), 'pt-BR'); A = A ?? -Infinity; B = B ?? -Infinity; return ms.dir * (A - B) }); $('#matrixInfo').textContent = (state.metric === 'revisit' ? 'Revisita' : state.metric === 'tec1' ? 'TEC1' : 'Produtividade') + ' • ' + days.length + ' dias • clique no cabeçalho para ordenar'; $('#matrix').innerHTML = '<thead><tr>' + [['name', 'TÉCNICO'], ['avg', 'MÊS']].concat(days.map(d => [d, d.slice(8) + '/' + d.slice(5, 7)])).map(([k, l]) => `<th data-k="${k}">${l}${ms.key === k ? (ms.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('') + '</tr></thead><tbody>' + rows.map(o => `<tr data-name="${esc(o.a.name)}"><td class="techcol">${esc(o.a.name)}<div class="src">${esc(o.a.loginText)}</div></td><td class="avg ${o.avg == null ? '' : goodMetric(o.avg, state.metric) ? 'cellgood' : 'cellbad'}">${tcMetricButton(o.a,state.metric,o.avg)}</td>${days.map(d => { const v = o[d]; return `<td class="${v == null ? '' : goodMetric(v, state.metric) ? 'cellgood' : 'cellbad'}">${v==null?'':tcMetricButton(o.a,state.metric,v,d)}</td>` }).join('')}</tr>`).join('') + '</tbody>'; $('#matrix').querySelectorAll('th[data-k]').forEach(h => h.onclick = () => { const k = h.dataset.k; state.matrixSort = state.matrixSort.key === k ? { key: k, dir: -state.matrixSort.dir } : { key: k, dir: k === 'name' ? 1 : -1 }; renderDaily() }); $('#matrix').querySelectorAll('tbody tr').forEach(tr => tr.onclick = () => { state.focus = tr.dataset.name; renderCharts() }); tcWireMetricLinks($('#matrix')); renderCharts() }
    function seriesFor(a) { const days = uniq(state.filteredRows.map(r => r.day)).sort(), targets = a ? [a] : state.result; return days.map(day => { let os = 0, rb = 0, rg = 0, tn = 0, td = 0, p = 0, count = 0, has = false; for (const t of targets) { const z = t.daily.get(day); if (!z) continue; has = true; count++; os += z.os; rb += z.revBad; rg += z.revGood; tn += z.tnum; td += z.tden; p += z.points } return { day, rev: has && rb + rg ? rb / (rb + rg) : null, tec1: has && td ? tn / td : null, prod: has ? p / count : null } }) }
    function chart(el, title, S, k, target, lo, fmt) { const vals = S.map(x => x[k]).filter(v => v != null); if (!vals.length) { $(el).innerHTML = '<strong>' + title + '</strong><div class="empty">Sem dados</div>'; return } const W = 560, H = 190, all = vals.concat([target]), mn0 = Math.min(...all), mx0 = Math.max(...all), pad = (mx0 - mn0) * .12 || 1, mn = mn0 - pad, mx = mx0 + pad, X = i => 42 + i * (W - 54) / Math.max(1, S.length - 1), Y = v => H - 28 - (v - mn) / (mx - mn) * (H - 52), step = Math.ceil(S.length / 12); let s = `<svg viewBox="0 0 ${W} ${H}"><text x="42" y="14" style="fill:var(--ink);font-size:12px;font-weight:800">${title}</text><line x1="42" x2="${W - 10}" y1="${Y(target)}" y2="${Y(target)}" stroke="var(--warn)" stroke-dasharray="4"/><text x="2" y="${Y(target) + 3}">${fmt(target)}</text>`; const pts = S.map((q, i) => q[k] == null ? null : [X(i), Y(q[k])]).filter(Boolean); if (pts.length) s += `<polyline fill="none" stroke="var(--muted)" points="${pts.map(p => p.join(',')).join(' ')}"/>`; S.forEach((q, i) => { if (q[k] == null) return; const ok = lo ? q[k] < target : q[k] >= target; s += `<circle cx="${X(i)}" cy="${Y(q[k])}" r="3.5" fill="var(${ok ? '--ok' : '--bad'})"><title>${q.day}: ${fmt(q[k])}</title></circle>` + (i % step === 0 ? `<text x="${X(i) - 10}" y="${H - 8}">${q.day.slice(8)}/${q.day.slice(5, 7)}</text>` : '') }); $(el).innerHTML = s + '</svg>' }
    function renderCharts() { const a = state.focus ? state.result.find(x => x.name === state.focus) : null, S = seriesFor(a), who = a ? a.name : 'todos os técnicos filtrados'; chart('#chart1', 'REVISITA — ' + who, S, 'rev', tcRule().rev, true, pct1); chart('#chart2', 'TEC1 — ' + who, S, 'tec1', .95, false, pct1); chart('#chart3', (a?'PONTOS/DIA — ':'MÉDIA DE PONTOS/TÉCNICO/DIA — ') + who, S, 'prod', tcRule().prod, false, v => nf0.format(v)) }
    function showTech(a) { $('#modalTitle').textContent = a.name; const drows = [...a.daily.entries()].sort((x, y) => x[0].localeCompare(y[0])), formulas = `<div class="formula"><b>Revisita:</b> ${nf0.format(a.revBad)} ${tcRevisitUnit(a)} ÷ ${nf0.format(a.revBad+a.revGood)} WOs = <b>${pct1(a.revisit)}</b>. ${tcRevisitExplanation(a)}</div><div class="formula"><b>TEC1:</b> Σ TOTAL_OS_TEC1_PADRAO (${nf0.format(a.tnum)}) ÷ Σ QTD_TOTAL_OS_TEC1 (${nf0.format(a.tden)}) = <b>${pct1(a.tec1)}</b> • meta de status aplicada: <b>${nf1.format(a.tecMeta * 100)}%</b></div><div class="formula"><b>Produtividade:</b> ${nf0.format(a.points)} pontos ÷ ${a.days.size} dias com pontos = <b>${a.prod == null ? '—' : nf1.format(a.prod)}</b></div>`; $('#modalBody').innerHTML = `<div class="detailgrid"><div class="mini"><span>Login(s)</span><b style="font-size:13px">${esc(a.loginText)}</b></div><div class="mini"><span>Empresa / UN</span><b style="font-size:13px">${esc(a.companyText)}</b></div><div class="mini"><span>O.S.</span><b>${nf0.format(a.os)}</b></div><div class="mini"><span>Status</span><b class="${a.status ? 'metric good' : 'metric bad'}">${a.status ? 'CERTIFICADO' : 'NÃO CERTIFICADO'}</b></div></div>${formulas}<h3 style="font-size:14px;margin:18px 0 8px">Composição diária</h3><table class="audit"><thead><tr><th>Dia</th><th>Pontos</th><th>O.S. c/ pontos</th><th>Revisita</th><th>TEC1</th></tr></thead><tbody>${drows.map(([day, z]) => { const den = z.revBad + z.revGood; return `<tr><td>${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)}</td><td>${nf0.format(z.points)}</td><td>${z.os}</td><td>${den ? pct1(z.revBad / den) : '—'}</td><td>${z.tden ? pct1(z.tnum / z.tden) : '—'}</td></tr>` }).join('')}</tbody></table>`; $('#modal').classList.add('show') }
    function rules() { $('#modalTitle').textContent='Critérios do cálculo e fontes';$('#modalBody').innerHTML=`<div class="formula"><b>Fonte:</b> ${esc(EMBEDDED_NAME)} e CSVs importados. Competência por DATA_NOTA; filtro de datas e dias de produtividade por FIM_TRABALHO. Os dados enviados têm defasagem de dez dias entre essas datas.</div><div class="formula"><b>Revisita:</b> em Fortaleza (FTZ-DMV_01), WOs de retorno distintas por técnico, entre os atendimentos com QT_REVISITA = 1, ÷ total de WOs atendidas. A unicidade é calculada dentro de cada recorte diário, mensal ou de período. Nas demais unidades, WOs com QT_REVISITA = 1 ÷ total de WOs. Se a WO do retorno não estiver informada, o atendimento marcado conta individualmente. <b>TEC1:</b> soma TOTAL_OS_TEC1_PADRAO ÷ soma QTD_TOTAL_OS_TEC1. <b>Produtividade:</b> soma QTDE_PONTOS ÷ dias distintos com pontos, em pontos/dia.</div><div class="formula"><b>Regra vigente em todas as operações:</b> ${esc(tcRule().label)}. Certificação exige os três critérios simultaneamente. A nota é certificados ÷ técnicos com produtividade calculada. A produtividade usa o limite inclusivo de ${tcRule().prod} pontos/dia informado nesta revisão. A comparação mensal respeita DATA_NOTA e permite consultar os contratos de cada competência.</div><div class="formula"><b>População:</b> agrupamento por LOGIN_TECNICO. Todos os logins da fonte são preservados, inclusive os sem nome no cadastro. Nomes e empresas provêm do cadastro herdado ou importado; a unidade da equipe vem do CSV.</div><div class="formula"><b>Importação:</b> registros com a mesma WO/login/fim de trabalho são atualizados; registros novos são adicionados e os demais permanecem. Para substituir integralmente a base, use Limpar base e importe o arquivo completo. O gráfico geral de pontos/dia mostra a média dos técnicos com pontos no dia.</div><p>Abra a aba <b>Conferência</b> para consultar as cinco referências, os totais auditados e as divergências.</p>`;$('#modal').classList.add('show'); }
    function exportResult() { if (!state.result.length) return; const head = ['TECNICO', 'LOGIN', 'SUPERVISOR', 'EMPRESA_UN', 'UF', 'MUNICIPIO', 'REVISITA', 'TEC1', 'PRODUTIVIDADE', 'DIAS_PROD', 'OS', 'REVISITAS', 'META_TEC1_STATUS', 'STATUS', 'ORIGEM_CADASTRO'], lines = [head.join(';')]; for (const a of state.result) lines.push([a.name, a.loginText, svFor(a.loginText), a.companyText, [...a.ufs].join(' | '), [...a.cities].join(' | '), a.revisit == null ? '' : (a.revisit * 100).toFixed(4).replace('.', ','), a.tec1 == null ? '' : (a.tec1 * 100).toFixed(4).replace('.', ','), a.prod == null ? '' : a.prod.toFixed(4).replace('.', ','), a.days.size, a.os, a.revBad, (a.tecMeta * 100).toFixed(1).replace('.', ','), a.status ? 'CERTIFICADO' : 'NAO CERTIFICADO', [...a.sources].join(' | ')].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';')); download(lines, 'resultado_tecnico_certificado_mestre.csv') }
    function download(lines, name) { const u = URL.createObjectURL(new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000) }
    function exportUnmapped() { const rows = uniq(state.rows.filter(r => r.mapSource === 'base').map(r => r.login)).map(login => { const r = state.rows.find(x => x.login === login); return [login, '', r?.baseUnit || '', r?.uf || '', r?.city || ''].join(';') }); download(['login;nome;empresa;uf;municipio', ...rows], 'logins_sem_cadastro.csv') }
    async function importCadastro(file) { const t = await decodeFile(file); const rows = t.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean), sep = rows[0]?.includes(';') ? ';' : ','; let n = 0; for (let i = 0; i < rows.length; i++) { const p = rows[i].split(sep).map(x => x.trim().replace(/^"|"$/g, '')); if (i === 0 && /login/i.test(p[0])) continue; if (!p[0]) continue; state.customMap[p[0]] = { name: (p[1] || p[0]).toUpperCase(), company: (p[2] || '').toUpperCase(), source: 'Importado' }; n++ } applyMaps(); initFilters(false); render(); $('#fileMeta').textContent += ' • ' + n + ' cadastros importados' }
    async function addTexts(items, replace = false) {
      setLoading(true,'Lendo e consolidando CSVs…');await new Promise(r=>setTimeout(r,25));
      try{
        const parsedItems=[];
        for(const it of items){const t=it.text!=null?it.text:await decodeFile(it.file);const rows=parseCsvCompact(t,it.name);
          for(const r of rows){if(!r.login||!r.day||!r.month||!r.year)throw new Error(it.name+': login ou data inválida.');if(![0,1].includes(num(r.qr))||[r.tnum,r.tden,r.points].some(v=>num(v)==null))throw new Error(it.name+': indicadores numéricos inválidos.');}
          parsedItems.push({name:it.name,rows});
        }
        const map=new Map((replace?[]:state.rows).map(r=>[tcRowKey(r),r]));let add=0,updated=0,dup=0;
        for(const it of parsedItems)for(const r of it.rows){const k=tcRowKey(r),old=map.get(k);if(!old)add++;else if(['qr','tnum','tden','points','baseUnit','month','year','city','sub','group','type','uf','fg','contract','orders','orderTypes','lowCodes','revisitWo','tec1Source','noteAt','agendaAt','windowStart','windowEnd','start','service','jobStatus'].some(f=>old[f]!==r[f]))updated++;else dup++;map.set(k,r);}
        state.rows=[...map.values()];state.keys=new Set(map.keys());state.files=[...new Set([...(replace?[]:state.files),...parsedItems.map(it=>it.name)])];
        applyMaps();state.ready=true;state.multi.city.clear();state.multi.group.clear();state.multi.type.clear();initFilters(replace);render();
        $('#fileMeta').textContent=state.files.join(' + ')+' • '+nf0.format(state.rows.length)+' WOs únicas • '+nf0.format(add)+' adicionadas • '+nf0.format(updated)+' atualizadas • '+nf0.format(dup)+' repetidas sem alteração';
      }catch(e){console.error(e);setBadge(false,'Erro ao ler CSV');$('#fileMeta').textContent=e.message;return false;}finally{setLoading(false);}
    }
    function resetFilters(){
      tcSelectedUnits.clear();
      state.selectedMonths=[];tcDates={start:'',end:''};state.focus=null;state.sort={key:'status',month:null,dir:1};state.matrixSort={key:'avg',dir:-1};
      state.multi.city.clear();state.multi.group.clear();state.multi.type.clear();
      ['fBaseUnit','fMonth','fUf','fCompany','fSub','fSearch','fMap'].forEach(id=>$('#'+id).value='');$('#legacyStatus').checked=false;
      initFilters(true);tcSyncDates();
      if(window.parent!==window&&window.parent.clearUnifiedDates)window.parent.clearUnifiedDates();else render();
    }
    function preset() { resetFilters(); const months = uniq(state.rows.map(monthKey)).sort(); if (months.length) {state.selectedMonths=[months.at(-1)];$('#fMonth').value=months.at(-1);} $('#fUf').value = [...$('#fUf').options].some(o => o.value === 'RN') ? 'RN' : ''; $('#fCompany').value = [...$('#fCompany').options].some(o => o.value === 'DMV - NTL SERV') ? 'DMV - NTL SERV' : '';['Natal', 'Parnamirim'].forEach(v => { if (uniq(state.rows.map(x => x.city)).includes(v)) state.multi.city.add(v) }); if (uniq(state.rows.map(x => x.group)).includes('INSTALACAO')) state.multi.group.add('INSTALACAO'); setupMulti('#mCity', uniq(state.rows.map(x => x.city)), state.multi.city); setupMulti('#mGroup', uniq(state.rows.map(x => x.group)), state.multi.group); render() }
    function switchView(v) { state.view = v; $('#panelView').hidden = v !== 'panel'; $('#dailyView').hidden = v !== 'daily'; $('#tabPanel').classList.toggle('on', v === 'panel'); $('#tabDaily').classList.toggle('on', v === 'daily'); if (v === 'daily') renderDaily() }
    ['#fMonth', '#fUf'].forEach(id => $(id).addEventListener('change', () => { syncCompanyOptions(); render() }));['#fRule', '#fCompany', '#fSub', '#fMap'].forEach(id => $(id).addEventListener('change', render)); $('#fBaseUnit').addEventListener('change',()=>window.setUnifiedUnits($('#fBaseUnit').value?[$('#fBaseUnit').value]:[])); $('#fSearch').addEventListener('input', () => { clearTimeout(window.__q); window.__q = setTimeout(render, 100) }); $$('thead th[data-sort]').forEach(th => th.onclick = () => { const k = th.dataset.sort; state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: k === 'name' || k === 'loginText' || k === 'companyText' ? 1 : -1 }; render() }); $$('.metricbtn[data-metric]').forEach(b => b.onclick = () => { state.metric = b.dataset.metric; state.matrixSort = { key: 'avg', dir: -1 }; if (state.metric === 'all') state.focus = null; renderDaily() }); $('#tabPanel').onclick = () => switchView('panel'); $('#tabDaily').onclick = () => switchView('daily');
    $('#dropzone').onclick = () => $('#fileInput').click(); $('#fileInput').onchange = e => { const f = [...e.target.files]; if (f.length) addTexts(f.map(file => ({ file, name: file.name })), false); e.target.value = '' };['dragenter', 'dragover'].forEach(ev => $('#dropzone').addEventListener(ev, e => { e.preventDefault(); $('#dropzone').classList.add('drag') }));['dragleave', 'drop'].forEach(ev => $('#dropzone').addEventListener(ev, e => { e.preventDefault(); $('#dropzone').classList.remove('drag') })); $('#dropzone').addEventListener('drop', e => { const f = [...e.dataTransfer.files].filter(x => /\.(csv|zip)$/i.test(x.name)); if (f.length) addTexts(f.map(file => ({ file, name: file.name })), false) });
    const header = $('.topbar'), headerToggle = $('#btnHeaderToggle');
    function setHeaderCompact(compact) { header.classList.toggle('compact', compact); headerToggle.textContent = compact ? 'Mostrar opções' : 'Ocultar opções'; headerToggle.setAttribute('aria-expanded', compact ? 'false' : 'true'); try { localStorage.setItem('tc_header_compact', compact ? '1' : '0') } catch (e) { } }
    headerToggle.onclick = () => setHeaderCompact(!header.classList.contains('compact'));
    try { if (localStorage.getItem('tc_header_compact') === '1') setHeaderCompact(true) } catch (e) { }
    $('#btnRules').onclick = rules; $('#btnExport').onclick = exportResult; $('#btnUnmapped').onclick = exportUnmapped; $('#btnReset').onclick = resetFilters; $('#btnPreset').onclick = preset; $('#btnCad').onclick = () => $('#cadInput').click(); $('#cadInput').onchange = e => { if (e.target.files[0]) importCadastro(e.target.files[0]); e.target.value = '' }; $('#btnClear').onclick = () => { if (!confirm('Limpar toda a base carregada deste HTML?')) return; state.rows = []; state.keys.clear(); state.files = []; state.ready = true; state.multi.city.clear(); state.multi.group.clear(); state.multi.type.clear(); initFilters(false); render(); $('#fileMeta').textContent = 'Base limpa. Arraste novos CSVs para continuar.' }; $('#modalClose').onclick = () => $('#modal').classList.remove('show'); $('#modal').onclick = e => { if (e.target === $('#modal')) $('#modal').classList.remove('show') }; document.addEventListener('click', e => { if (!e.target.closest('.multi')) $$('.multi').forEach(x => x.classList.remove('open')) });

    /* ===== APRESENTAÇÃO: RESULTADO CENTRAL ===== */
    function presentationCityLabel(v){
      const raw=String(v||'').trim();
      const n=raw.toLocaleUpperCase('pt-BR');
      if(!n)return '';
      if(n==='NATAL'||n==='PARNAMIRIM'||n==='NATAL / PARNAMIRIM'||n==='NATAL/PARNAMIRIM') return 'Natal / Parnamirim';
      return raw;
    }
    function presentationCityMembers(label){
      return referenceCityMembers(label,state.rows.map(row=>row.city));
    }
    function presentationSelectedCityLabel(){
      if(!state.multi.city.size) return '';
      const grouped=uniq([...state.multi.city].map(presentationCityLabel));
      return grouped.length===1 ? grouped[0] : '';
    }
    const __presentationRequestedCity = new URLSearchParams(location.search).get('cidade') || '';
    let __presentationCityApplied = false;
    const __baseRenderPresentation = render;
    function presentationCityList(){ return uniq(state.rows.map(x=>presentationCityLabel(x.city)).filter(Boolean)).sort((a,b)=>a.localeCompare(b,'pt-BR')); }
    function updatePresentationCityStrip(){
      const root=$('#presentationCityStrip'); if(!root) return;
      const cities=presentationCityList();
      let selected=presentationSelectedCityLabel();
      root.innerHTML='<span class="city-label">Cidade</span>'+[
        `<button class="presentation-city-btn ${!selected?'on':''}" data-city="">Todas</button>`,
        ...cities.map(c=>`<button class="presentation-city-btn ${selected===c?'on':''}" data-city="${esc(c)}">${esc(c)}</button>`)
      ].join('');
      root.querySelectorAll('[data-city]').forEach(b=>b.onclick=()=>{
        const city=presentationCityLabel(b.dataset.city);
        state.multi.city.clear(); presentationCityMembers(city).forEach(v=>state.multi.city.add(v));
        $('#fUf').value=''; syncCompanyOptions(); $('#fCompany').value=''; $('#fSub').value='';
        try{const u=new URL(location.href);if(city)u.searchParams.set('cidade',city);else u.searchParams.delete('cidade');history.replaceState(null,'',u)}catch(e){}
        render();
      });
      tcBindToolsToggle();
      const go=$('#goQual'); if(go){go.href='#';go.onclick=e=>{e.preventDefault();window.parent.show?.('qq')};}
    }
    render=function(){
      if(!__presentationCityApplied && state.rows.length){
        __presentationCityApplied=true;
        if(__presentationRequestedCity){
          const reqGroup=presentationCityLabel(__presentationRequestedCity);
          const match=presentationCityList().find(c=>presentationCityLabel(c).toLocaleUpperCase('pt-BR')===reqGroup.toLocaleUpperCase('pt-BR'));
          if(match){state.multi.city.clear();presentationCityMembers(match).forEach(v=>state.multi.city.add(v));}
        }
      }
      const presenting=document.body.classList.contains('presentation-mode');
      __baseRenderPresentation();
      if(presenting){
        $('#panelView').hidden=false; $('#dailyView').hidden=true;
      }else{
        $('#panelView').hidden=state.view!=='panel'; $('#dailyView').hidden=state.view!=='daily';
        $('#tabPanel').classList.toggle('on',state.view==='panel'); $('#tabDaily').classList.toggle('on',state.view==='daily');
      }
      updatePresentationCityStrip();
    };
    const __fsBtn=$('#btnFullscreen'); if(__fsBtn)__fsBtn.onclick=async()=>{try{if(!document.fullscreenElement){await document.documentElement.requestFullscreen();__fsBtn.textContent='Sair da apresentação';}else{await document.exitFullscreen();__fsBtn.textContent='Modo apresentação';}}catch(e){}};
    document.addEventListener('fullscreenchange',()=>{const b=$('#btnFullscreen');if(b)b.textContent=document.fullscreenElement?'Sair da apresentação':'Modo apresentação'});
    window.setUnifiedPresentation=function(on){document.body.classList.add('unified-embed');document.body.classList.toggle('presentation-mode',!!on);render();};


    window.getUnifiedMonths=function(){return {months:uniq(state.rows.map(monthKey)).sort(),selected:$('#fMonth').value?[$('#fMonth').value]:[]};};
    window.setUnifiedMonth=function(month){
      if(month&&!window.getUnifiedMonths().months.includes(month))return;
      $('#fMonth').value=month;syncCompanyOptions();render();
    };
    const __renderMonth=render;
    render=function(){__renderMonth();try{window.parent.refreshUnifiedMonth?.();}catch(e){}};

    function showClosureAudit(){window.parent.show?.('audit');}
$('#btnClosureAudit').onclick=showClosureAudit;




/* Contract drilldown uses the same filtered population and formulas as the panel. */
const TC_METRICS={revisit:'Revisita',tec1:'TEC1',prod:'Produtividade'};
let tcContractView=null,tcModalReturnFocus=null;
function tcDateLabel(day){return day?day.split('-').reverse().join('/'):'—';}
function tcSourceValue(v){return v==null||!txt(v)||['-1','-3'].includes(txt(v))?'Não informado':txt(v);}
function tcMetricValue(v,k){return v==null?'—':k==='prod'?nf1.format(v):pct1(v);}
function tcMetricTarget(k){const t=tcRule();return k==='revisit'?(t.strict?'< 7,0%':'< 7,01%'):k==='tec1'?(t.strict?'> 95%':'≥ 95%'):(t.strict?'> ':'≥ ')+t.prod+' pontos/dia';}
function tcMetricButton(a,k,value,day=null){
 if(value==null)return '<span class="metric na">—</span>';
 const label=tcMetricValue(value,k),name=TC_METRICS[k],trend=a.tcMonth&&!day?tcMonthlyTrend(a,k,value):null;
 const message='Ver contratos ofensores de '+name+(trend?' · '+trend.message:'');
 return `<button type="button" class="tc-metric-link ${goodMetric(value,k)?'good':'bad'}" data-tc-metric="${k}" data-tc-login="${esc(a.loginText)}" ${a.tcMonth?`data-tc-month="${a.tcMonth}"`:""} ${day?`data-tc-day="${esc(day)}"`:''} title="${esc(message)}" aria-label="${esc(a.name+' · '+name+' '+label+(day?' · '+tcDateLabel(day):'')+' · '+message)}"><span>${label}</span>${trend?tcTrendMarkup(trend):''}</button>`;
}
function tcWireMetricLinks(root){
 root.querySelectorAll('[data-tc-metric]').forEach(b=>b.onclick=e=>{
  e?.stopPropagation();
  const a=b.dataset.tcMonth?tcFindMonthly(b.dataset.tcMonth,b.dataset.tcLogin):state.result.find(x=>x.logins.has(b.dataset.tcLogin));
  if(a){tcModalReturnFocus=b;tcOpenContracts(a,b.dataset.tcMetric,b.dataset.tcDay||null);}
 });
}
function tcContractContext(a,k,day=null){
 const scopedRows=a.tcMonth===state.currentMonth?state.currentRows:state.filteredRows;
 const allRows=scopedRows.filter(r=>a.logins.has(r.login)&&(!a.tcMonth||monthKey(r)===a.tcMonth));
 const days=new Map();
 for(const r of allRows){const p=num(r.points);if(p!=null&&r.day)days.set(r.day,(days.get(r.day)||0)+p);}
 const base=day?allRows.filter(r=>r.day===day):allRows;
 const bad=r=>k==='revisit'?(num(r.qr)??0)!==0:k==='tec1'?(num(r.tden)??0)>(num(r.tnum)??0):num(r.points)!=null&&days.has(r.day)&&!tcProdOK(days.get(r.day));
 const offenders=base.filter(bad);
 const totals=aggregate(base)[0];
 const value=totals?.[k]??null;
 const n=base.length;
 const detail=k==='revisit'?`${totals?.revBad||0} ${tcRevisitUnit(totals)} ÷ ${n} WOs`:k==='tec1'?`${nf0.format(totals?.tnum||0)} O.S. no padrão ÷ ${nf0.format(totals?.tden||0)} O.S. avaliadas`:`${nf0.format(totals?.points||0)} pontos ÷ ${totals?.days.size||0} dias com pontos`;
 const badUnits=k==='tec1'?offenders.reduce((s,r)=>s+Math.max(0,(num(r.tden)??0)-(num(r.tnum)??0)),0):k==='prod'?new Set(offenders.map(r=>r.day)).size:(totals?.revBad||0);
 return {a,k,day,base,offenders,days,value,detail,badUnits,totals};
}
function tcOpenModal(){const modal=$('#modal');modal.classList.add('show');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';$('#modalClose').focus();}
function tcCloseModal(){const modal=$('#modal');modal.classList.remove('show');modal.setAttribute('aria-hidden','true');document.body.style.overflow='';tcModalReturnFocus?.focus();}
function tcOpenContracts(a,k,day=null,scope='offenders',search=''){
 const ctx=tcContractContext(a,k,day);tcContractView={ctx,scope,search};
 $('#modalTitle').textContent=TC_METRICS[k]+' — contratos '+(scope==='offenders'?'ofensores':'da base');
 const months=uniq(ctx.base.map(monthKey)).map(monthLabel).join(' · ');
 const note=k==='revisit'?'São exibidos os atendimentos marcados com revisita na origem. '+tcRevisitExplanation(ctx.totals):k==='tec1'?'São exibidas as WOs que contêm O.S. fora do padrão TEC1. A diferença entre avaliadas e no padrão é o impacto no indicador.':'São exibidas as WOs executadas nos dias abaixo da meta de pontos. A meta é diária; os pontos de cada contrato compõem o total do dia.';
 $('#modalBody').innerHTML=`<div class="tc-detail-toolbar"><button type="button" class="btn" id="tcBackSummary">← Resumo do técnico</button><span>${esc(a.name)} · <b>${esc(a.loginText)}</b><br>${esc(months||'Sem dados')}${day?' · trabalho em '+tcDateLabel(day):''}</span></div>
 <div class="detailgrid tc-detail-kpis"><div class="mini"><span>${TC_METRICS[k]}${day?' do dia':' no recorte'}</span><b class="${goodMetric(ctx.value,k)?'metric good':'metric bad'}">${tcMetricValue(ctx.value,k)}</b><small>Meta ${tcMetricTarget(k)}</small></div><div class="mini"><span>${k==='tec1'?'O.S. fora do padrão':k==='prod'?'Dias abaixo da meta':tcRevisitUnit(ctx.totals)}</span><b>${nf0.format(ctx.badUnits)}</b></div><div class="mini"><span>Contratos ofensores</span><b>${nf0.format(new Set(ctx.offenders.filter(r=>r.contract).map(r=>r.contract)).size)}</b><small>${ctx.offenders.length} WOs</small></div><div class="mini"><span>Base consultada</span><b>${nf0.format(ctx.base.length)} WOs</b></div></div>
 <div class="tc-calculation">${esc(ctx.detail)} = <b>${tcMetricValue(ctx.value,k)}</b></div><p class="tc-detail-note">${note} A competência vem da data da nota; o dia de trabalho vem de FIM_TRABALHO.</p>
 <div class="tc-detail-controls"><div class="tc-scope"><button type="button" id="tcOnlyOffenders" class="${scope==='offenders'?'on':''}">Somente ofensores (${ctx.offenders.length})</button><button type="button" id="tcWholeBase" class="${scope==='all'?'on':''}">Toda a base (${ctx.base.length})</button></div><label class="tc-contract-search">Buscar contrato / WO <input type="search" id="tcContractSearch" placeholder="Contrato, WO ou O.S." value="${esc(search)}"></label></div>
 <div id="tcContractList"></div><div id="tcContractFields" class="tc-contract-fields"><p class="tc-detail-note">Selecione um contrato para ver a O.S., baixa e os campos da origem.</p></div>`;
 $('#tcBackSummary').onclick=()=>showTech(a);
 $('#tcOnlyOffenders').onclick=()=>tcOpenContracts(a,k,day,'offenders',$('#tcContractSearch').value);
 $('#tcWholeBase').onclick=()=>tcOpenContracts(a,k,day,'all',$('#tcContractSearch').value);
 $('#tcContractSearch').oninput=e=>{tcContractView.search=e.target.value;tcRenderContractList();};
 tcRenderContractList();tcOpenModal();
}
function tcRowImpact(r,ctx){
 if(ctx.k==='revisit'){
  if((num(r.qr)??0)===0)return 'Sem revisita';
  if(!tcDistinctRevisit(r))return 'Com revisita';
  const matches=ctx.offenders.filter(x=>tcDistinctRevisit(x)&&tcRevisitKey(x)===tcRevisitKey(r)).length;
  return 'Retorno '+tcSourceValue(r.revisitWo)+(matches>1?' · ligado a '+matches+' atendimentos · contado uma vez':' · contado uma vez');
 }
 if(ctx.k==='tec1'){const n=num(r.tnum)??0,d=num(r.tden)??0;return d?`${Math.max(0,d-n)} fora do padrão / ${d} O.S.`:'Sem base TEC1';}
 const total=ctx.days.get(r.day);return total==null?'Sem pontos no dia':nf0.format(total)+' pontos no dia'+(!tcProdOK(total)?' · abaixo da meta':' · meta atendida');
}
function tcRenderContractList(){
 const {ctx,scope,search}=tcContractView;
 const query=normTcSearch(search);
 const rows=(scope==='all'?ctx.base:ctx.offenders).filter(r=>!query||normTcSearch([r.contract,r.wo,r.revisitWo,r.orders,r.day,tcDateLabel(r.day)].join(' ')).includes(query)).sort((a,b)=>a.day.localeCompare(b.day)||a.contract.localeCompare(b.contract)||a.wo.localeCompare(b.wo));
 $('#tcContractFields').innerHTML='<p class="tc-detail-note">Selecione um contrato para consultar os campos da origem.</p>';
 $('#tcContractList').innerHTML=rows.length?`<div class="tc-list-count">${rows.length} WOs exibidas · clique no contrato ou na linha para consultar os detalhes</div><div class="tc-contract-scroll"><table class="audit tc-contract-table"><thead><tr><th>Dia do trabalho</th><th>Contrato</th><th>WO / O.S.</th><th>Código de baixa</th><th>${ctx.k==='prod'?'Pontos do contrato':'Impacto no indicador'}</th>${ctx.k==='prod'?'<th>Resultado do dia</th>':''}</tr></thead><tbody>${rows.map((r,i)=>`<tr data-tc-order="${i}" tabindex="0" role="button" aria-label="${esc('Detalhes do contrato '+tcSourceValue(r.contract))}"><td>${tcDateLabel(r.day)}</td><td><button type="button" class="tc-contract-link" data-tc-contract="${i}">${esc(tcSourceValue(r.contract))}</button></td><td><b>${esc(tcSourceValue(r.wo))}</b><small>O.S. ${esc(tcSourceValue(r.orders))}</small></td><td>${esc(tcSourceValue(r.lowCodes))}</td><td class="${ctx.offenders.includes(r)?'cellbad':'cellgood'}">${ctx.k==='prod'?nf1.format(num(r.points)||0):esc(tcRowImpact(r,ctx))}</td>${ctx.k==='prod'?'<td>'+esc(tcRowImpact(r,ctx))+'</td>':''}</tr>`).join('')}</tbody></table></div>`:'<div class="tc-no-contracts">'+(query?'Nenhum contrato corresponde à busca.':scope==='offenders'?'Nenhum contrato ofensor neste indicador e recorte.':'Nenhuma WO neste recorte.')+'</div>';
 const select=i=>tcShowContract(rows[i],ctx);
 $('#tcContractList').querySelectorAll('[data-tc-order]').forEach(tr=>{tr.onclick=()=>select(Number(tr.dataset.tcOrder));tr.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(Number(tr.dataset.tcOrder));}};});
 $('#tcContractList').querySelectorAll('[data-tc-contract]').forEach(b=>b.onclick=e=>{e.stopPropagation();select(Number(b.dataset.tcContract));});
 if(rows.length)select(0);
}
function normTcSearch(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();}
function tcShowContract(r,ctx){
 const pairs=[['Contrato',r.contract],['Workorder',r.wo],['O.S. da origem',r.orders],['Códigos de baixa',r.lowCodes],['Login técnico',r.login],['Unidade da equipe',r.baseUnit],['Município',r.city],['Data da nota',r.noteAt],['Data da agenda',r.agendaAt],['Janela da agenda',[r.windowStart,r.windowEnd].filter(Boolean).join(' a ')],['Início do trabalho',r.start],['Fim do trabalho',r.finish],['Revisita',num(r.qr)===1?'Sim':'Não'],['WO da revisita',r.revisitWo],['TEC1 no padrão / avaliadas',`${num(r.tnum)??0} / ${num(r.tden)??0}`],['Descrição TEC1 da origem',r.tec1Source],['Pontos do contrato',num(r.points)],['Tipo de serviço',r.service||r.type],['Grupo do serviço',r.group],['Status do trabalho',r.jobStatus]];
 $('#tcContractFields').innerHTML=`<div class="tc-contract-heading"><strong>Contrato ${esc(tcSourceValue(r.contract))}</strong><span>${esc(tcRowImpact(r,ctx))}</span></div><div class="tc-contract-grid">${pairs.map(([label,value])=>`<div><small>${label}</small><b>${esc(tcSourceValue(value))}</b></div>`).join('')}</div>`;
 $('#tcContractList').querySelectorAll('[data-tc-order]').forEach(tr=>{const active=tr.querySelector('[data-tc-contract]')?.textContent===r.contract&&tr.textContent.includes(r.wo);tr.classList.toggle('selected',!!active);});
}
const tcBaseShowTech=showTech;
showTech=function(a){tcBaseShowTech(a);$('#modalBody').insertAdjacentHTML('afterbegin',`<div class="tc-summary-links"><span>Consultar contratos${a.tcMonth?' · '+esc(monthLabel(a.tcMonth)):''}:</span>${['revisit','tec1','prod'].map(k=>`<div><small>${TC_METRICS[k]}</small>${tcMetricButton(a,k,a[k])}</div>`).join('')}</div>`);tcWireMetricLinks($('#modalBody'));tcOpenModal();};
$('#modalClose').onclick=tcCloseModal;
$('#modal').onclick=e=>{if(e.target===$('#modal'))tcCloseModal();};
document.addEventListener('keydown',e=>{
 if(!$('#modal').classList.contains('show'))return;
 if(e.key==='Escape'){e.preventDefault();tcCloseModal();}
 if(e.key==='Tab'){
  const elements=[...$('#modal').querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex="0"]')].filter(x=>!x.hidden),first=elements[0],last=elements.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
 }
});

/* Monthly certification uses DATA_NOTA; work-day productivity stays unchanged. */
function tcBuildMonthly(rows){
 const groups=new Map();
 for(const r of rows){const m=monthKey(r);if(!groups.has(m))groups.set(m,[]);groups.get(m).push(r);}
 state.monthly=new Map();
 for(const [month,list]of groups){const items=aggregate(list);applyStatus(items);for(const a of items)a.tcMonth=month;state.monthly.set(month,new Map(items.map(a=>[a.loginText,a])));}
 const visible=tcDisplayMonths();
 if(!('month' in state.sort)&&['revisit','tec1','prod'].includes(state.sort.key))state.sort.month=[...groups.keys()].sort().at(-1)||null;
 else if(state.sort.month&&!visible.includes(state.sort.month))state.sort.month=tcSelectedMonths().length===1?tcSelectedMonths()[0]:null;
}
function tcDisplayMonths(){const selected=tcSelectedMonths();return selected.length?[...selected].sort():uniq(state.rows.filter(tcDatePass).map(monthKey)).sort();}
function tcMonthlyResult(a,month){return state.monthly?.get(month)?.get(a.loginText)||null;}
function tcQuarterSort(arr){
 const {key,dir,month}=state.sort;
 const val=a=>{const x=key==='status'?tcCurrentResult(a):month?tcMonthlyResult(a,month):a;return x==null?null:key==='days'?x.days.size:key==='status'?+x.status:x[key];};
 return arr.sort((a,b)=>{
  const rank=tcCurrentRank(a)-tcCurrentRank(b);if(rank)return rank;
  if(key==='status')return (tcCurrentResult(b)?.fails.length||0)-(tcCurrentResult(a)?.fails.length||0)||a.name.localeCompare(b.name,'pt-BR');
  const A=val(a),B=val(b);if(typeof A==='string'||typeof B==='string')return dir*String(A??'').localeCompare(String(B??''),'pt-BR',{numeric:true})||a.name.localeCompare(b.name,'pt-BR');
  if(A==null&&B!=null)return 1;if(B==null&&A!=null)return -1;
  return dir*((A??0)-(B??0))||a.name.localeCompare(b.name,'pt-BR');
 });
}
let tcProjectionPlans={};
try{const saved=JSON.parse(localStorage.getItem('tc_projection_plans_v1')||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))tcProjectionPlans=saved;}catch(e){}
let tcProjectionPlannerOpen=false;
const TC_DAY_MS=86400000;
function tcProjectionEpoch(key){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(key||''))return NaN;
 const [y,m,d]=key.split('-').map(Number),epoch=Date.UTC(y,m-1,d);
 return new Date(epoch).toISOString().slice(0,10)===key?epoch:NaN;
}
function tcPrepareProjection(){
 const month=state.currentMonth,monthRows=state.rows.filter(r=>monthKey(r)===month),lags=new Map();
 for(const r of monthRows){const note=dateParts(r.noteAt)?.key,lag=(tcProjectionEpoch(note)-tcProjectionEpoch(r.day))/TC_DAY_MS;if(Number.isInteger(lag)&&lag>=0&&lag<=60)lags.set(lag,(lags.get(lag)||0)+1);}
 const lag=[...lags].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0]?.[0]??0;
 const loaded=uniq((state.currentRows.length?state.currentRows:monthRows).map(r=>r.day)).sort().at(-1)||'';
 const [year,mo]=(month||'').split('-').map(Number);
 const suggestedEnd=month?new Date(Date.UTC(year,mo,0)-lag*TC_DAY_MS).toISOString().slice(0,10):'';
 const saved=tcProjectionPlans[month]||{};
 const reference=Number.isFinite(tcProjectionEpoch(saved.reference))&&saved.reference>=loaded?saved.reference:loaded;
 const end=Number.isFinite(tcProjectionEpoch(saved.end))?saved.end:suggestedEnd;
 const calendarDays=reference&&end?Math.max(0,Math.round((tcProjectionEpoch(end)-tcProjectionEpoch(reference))/TC_DAY_MS)):0;
 const workDays=Number.isInteger(saved.workDays)&&saved.workDays>=0?Math.min(saved.workDays,calendarDays):calendarDays;
 const pointedOrders=new Map();for(const r of state.currentRows)if(num(r.points)!=null)pointedOrders.set(r.login,(pointedOrders.get(r.login)||0)+1);
 state.projectionContext={month,loaded,reference,end,suggestedEnd,lag,calendarDays,workDays,pointedOrders};
}
function tcProjectionFor(a,ctx=state.projectionContext){
 if(!a)return null;
 const rule=tcRule(),D=ctx.workDays,revDen=a.revBad+a.revGood;
 const revScale=10000,revTarget=Math.round(rule.rev*revScale),tecTarget=Math.round(rule.tec*revScale);
 const revTotal=revDen>0?(a.revisit<rule.rev?0:Math.max(0,Math.floor((a.revBad*revScale-revTarget*revDen)/revTarget)+1)):null;
 const tecGap=tecTarget*a.tden-revScale*a.tnum;
 const tecTotal=a.tden>0?(tcTecOK(a.tec1)?0:Math.max(0,rule.strict?Math.floor(tecGap/(revScale-tecTarget))+1:Math.ceil(tecGap/(revScale-tecTarget)))):null;
 const pointsTotal=a.prod!=null?Math.max(0,rule.prod*(a.days.size+D)-a.points+(rule.strict?1e-7:0)):null;
 const dailyPoints=D>0&&pointsTotal!=null?Math.ceil(pointsTotal/D*10-1e-9)/10:null;
 const pointCount=ctx.pointedOrders.get(a.loginText)||0,meanPoints=pointCount>0?a.points/pointCount:null;
 const ordersPerDay=dailyPoints!=null&&meanPoints>0?Math.ceil(dailyPoints/meanPoints-1e-9):null;
 return {revisit:{total:revTotal,daily:D>0&&revTotal!=null?Math.ceil(revTotal/D):null},tec1:{total:tecTotal,daily:D>0&&tecTotal!=null?Math.ceil(tecTotal/D):null},prod:{total:pointsTotal,daily:dailyPoints,ordersPerDay,meanPoints},days:D};
}
function tcRenderProjectionToolbar(){
 const root=$('#tcProjectionToolbar');if(!root)return;
 const c=state.projectionContext,date=x=>x?tcDateLabel(x):'—';
 if(!c.month){root.textContent='Importe a base do TC para calcular a projeção.';return;}
 const endLabel=Number.isFinite(tcProjectionEpoch(tcProjectionPlans[c.month]?.end))?'fechamento':'fechamento sugerido';
 root.innerHTML=`<span class="tc-projection-context">Projeção · ${esc(monthLabel(c.month))} · base até <b>${date(c.loaded)}</b> · ${endLabel} <b>${date(c.end)}</b> · <b>${c.workDays} dias de trabalho previstos</b></span>
 <details class="tc-projection-planner" id="tcProjectionPlanner" ${tcProjectionPlannerOpen?'open':''}><summary>Ajustar planejamento</summary><div class="tc-projection-form">
 <strong>Planejamento do TC</strong><label>Data de referência<input id="tcProjectionReference" type="date" value="${c.reference}" min="${c.loaded}"></label><label>Fechamento do TC<input id="tcProjectionEnd" type="date" value="${c.end}"></label><label>Dias de trabalho restantes<input id="tcProjectionDays" type="number" min="0" max="${c.calendarDays}" step="1" value="${c.workDays}"></label>
 <p>Fechamento sugerido: fim da competência por DATA_NOTA menos ${c.lag} dias de defasagem observada. Ajuste a data ao fechamento oficial. Por padrão, todos os ${c.calendarDays} dias corridos restantes são considerados dias de trabalho; ajuste à escala.</p><span id="tcProjectionError" role="status"></span><button type="button" id="tcProjectionReset">Restaurar planejamento sugerido</button></div></details>`;
 $('#tcProjectionPlanner').ontoggle=e=>{tcProjectionPlannerOpen=e.target.open;};
 const save=(field,value)=>{tcProjectionPlans[c.month]={...(tcProjectionPlans[c.month]||{}),[field]:value};try{localStorage.setItem('tc_projection_plans_v1',JSON.stringify(tcProjectionPlans));}catch(e){}tcProjectionPlannerOpen=true;render();};
 $('#tcProjectionReference').onchange=e=>{const v=e.target.value;if(!Number.isFinite(tcProjectionEpoch(v))||v<c.loaded){$('#tcProjectionError').textContent='A referência deve ser igual ou posterior à última data da base.';return;}save('reference',v);};
 $('#tcProjectionEnd').onchange=e=>{const v=e.target.value;if(!Number.isFinite(tcProjectionEpoch(v))){$('#tcProjectionError').textContent='Informe uma data de fechamento válida.';return;}save('end',v);};
 $('#tcProjectionDays').onchange=e=>{const v=Number(e.target.value);if(e.target.value===''||!Number.isInteger(v)||v<0||v>c.calendarDays){$('#tcProjectionError').textContent='Informe de 0 a '+c.calendarDays+' dias de trabalho.';return;}save('workDays',v);};
 $('#tcProjectionReset').onclick=()=>{delete tcProjectionPlans[c.month];try{localStorage.setItem('tc_projection_plans_v1',JSON.stringify(tcProjectionPlans));}catch(e){}tcProjectionPlannerOpen=true;render();};
}
function tcProjectionCell(a){
 const current=tcCurrentResult(a),c=state.projectionContext,p=tcProjectionFor(current);
 if(!p)return '<td class="tc-projection-cell"><span class="tc-no-data">Sem dados no mês vigente</span></td>';
 const parts=['revisit','tec1','prod'].map(k=>{
  const z=p[k],label=k==='revisit'?'REV':k==='tec1'?'TEC1':'PROD';
  const available=z.daily!=null&&(k!=='prod'||z.ordersPerDay!=null)&&Number.isFinite(current[k]);
  const inside=available&&(k==='revisit'?current.revisit<tcRule().rev:k==='tec1'?tcTecOK(current.tec1):tcProdOK(current.prod));
  const status=available?(inside?'good':'need'):'neutral';
  const value=z.daily==null?'—':k==='prod'?(z.ordersPerDay==null?'—':'≈ '+nf0.format(z.ordersPerDay)):nf0.format(z.daily);
  const unit=k==='tec1'?'O.S./dia':'WOs/dia';
  const note=z.daily==null?(c.workDays===0?(c.calendarDays===0?'TC encerrado':'Sem dias previstos'):'Sem base'):k==='prod'?'≥ '+nf1.format(z.daily)+' pts/dia':z.total===0?'Sem déficit':k==='revisit'?'sem revisita':'no padrão';
  return `<button type="button" class="tc-projection-item ${status}" data-tc-projection-login="${esc(a.loginText)}" data-tc-projection-metric="${k}" title="${esc('Ver cálculo da projeção de '+TC_METRICS[k]+' · '+(k==='prod'?'WOs estimadas pela média de pontos da base':'quantidade adicional necessária'))}" aria-label="${esc(TC_METRICS[k]+': '+value+' '+unit+' · '+note+' · ver cálculo')}"><small>${label}</small><b>${value}<span>${unit}</span></b><em>${note}</em></button>`;
 }).join('');
 return `<td class="tc-projection-cell" data-reference-month="${c.month}"><div class="tc-projection-items">${parts}</div></td>`;
}
function tcOpenProjection(a,k){
 const c=state.projectionContext,p=tcProjectionFor(a),z=p[k],D=c.workDays;
 const period=c.month?monthLabel(c.month):'Sem competência';
 let amount;
 if(k==='revisit'){
  amount=z.total==null?'Sem base':nf0.format(z.total)+' novas WOs sem revisita';
 }else if(k==='tec1'){
  amount=z.total==null?'Sem base':nf0.format(z.total)+' novas O.S. no padrão';
 }else{
  amount=z.total==null?'Sem base':nf1.format(z.total)+' pontos adicionais';
 }
 const projected=k==='revisit'&&z.daily!=null?a.revBad/(a.revBad+a.revGood+z.daily*D):k==='tec1'&&z.daily!=null?(a.tnum+z.daily*D)/(a.tden+z.daily*D):k==='prod'&&z.daily!=null?(a.points+z.daily*D)/(a.days.size+D):null;
 $('#modalTitle').textContent='Projeção necessária — '+TC_METRICS[k];
 $('#modalBody').innerHTML=`<div class="tc-projection-modal-context"><b>${esc(a.name)}</b> · ${esc(a.loginText)} · ${esc(period)}<br>Base até ${tcDateLabel(c.loaded)} · referência ${tcDateLabel(c.reference)} · fechamento ${tcDateLabel(c.end)} · ${D} dias de trabalho previstos.</div>
 <div class="detailgrid"><div class="mini"><span>Indicador atual</span><b>${tcMetricValue(a[k],k)}</b><small>Meta ${esc(tcMetricTarget(k))}</small></div><div class="mini"><span>Necessário por dia</span><b>${z.daily==null?'—':k==='prod'?nf1.format(z.daily)+' pts':nf0.format(z.daily)+' '+(k==='tec1'?'O.S.':'WOs')}</b><small>${k==='prod'&&z.ordersPerDay!=null?'≈ '+nf0.format(z.ordersPerDay)+' WOs/dia estimadas':k==='revisit'?'Sem revisita':k==='tec1'?'Dentro do padrão':'Sem conversão para WOs'}</small></div><div class="mini"><span>Total adicional até o fechamento</span><b>${esc(amount)}</b></div><div class="mini"><span>Resultado projetado com esse ritmo</span><b>${tcMetricValue(projected,k)}</b><small>Após ${D} dias previstos</small></div></div>
 <button type="button" class="btn" id="tcProjectionContracts">Consultar contratos do indicador</button>`;
 $('#tcProjectionContracts').onclick=()=>tcOpenContracts(a,k);
 tcOpenModal();
}
function tcWireProjectionLinks(root){
 root.querySelectorAll('[data-tc-projection-login]').forEach(b=>b.onclick=e=>{e?.stopPropagation();const a=state.currentTech.get(b.dataset.tcProjectionLogin);if(a){tcModalReturnFocus=b;tcOpenProjection(a,b.dataset.tcProjectionMetric);}});
}
function renderTable(){
 const tb=$('#tbody'),head=$('#tcHead'),table=$('#tcResults'),R=state.result,months=tcDisplayMonths();
 tcPrepareProjection();tcRenderProjectionToolbar();
 document.body.classList.toggle('tc-single-month',months.length===1);table.setAttribute('data-month-count',String(months.length));
 table.style.setProperty('--tc-table-min',(months.length===1?1040:220+months.length*3*82+300+76+130)+'px');
 $('#tcPanelContext').textContent=R.length+' técnicos · '+months.length+(months.length===1?' mês':' meses')+(months.length===1?' · '+monthLabel(months[0]):' · comparação mensal');
 const currentLabel=state.currentMonth?monthLabel(state.currentMonth):'Sem mês na base';table.setAttribute('data-current-month',state.currentMonth);$('#tcCurrentReferenceNote').textContent='Volume e certificação: '+currentLabel+' · ofensores primeiro · clique na certificação para ver os contratos.';
 const marks=(key,month=null)=>state.sort.key===key&&(state.sort.month||null)===month?(state.sort.dir>0?' ▲':' ▼'):'';
 $('#tcColumns').innerHTML='<col class="tc-name-col">'+months.map(()=>'<col class="tc-month-col"><col class="tc-month-col"><col class="tc-month-col">').join('')+'<col class="tc-projection-col"><col class="tc-volume-col"><col class="tc-status-col">';
 head.innerHTML=`<tr class="tc-groups"><th rowspan="2" class="tc-identity-head" data-sort="name">TÉCNICO${marks('name')}</th>${months.map((m,i)=>{
  const data=[...(state.monthly.get(m)?.values()||[])],n=data.filter(a=>a.prod!=null).length,c=data.filter(a=>a.status).length;
  return `<th colspan="3" class="tc-month-head month-${i%2}" title="${esc(n?c+' certificados de '+n+' avaliados no mês':'Sem dados neste mês e recorte')}">${esc(monthLabel(m))}${n?'':'<small>Sem dados</small>'}</th>`;
 }).join('')}<th rowspan="2" class="tc-projection-head" title="Produção adicional por dia de trabalho previsto para fechar o TC dentro de cada meta">PROJEÇÃO NECESSÁRIA / DIA<small>${esc(currentLabel)} · ${state.projectionContext.workDays} dias previstos</small></th><th rowspan="2" class="tc-volume-head tc-fixed-volume" title="Último mês disponível na base">VOLUME<small>${esc(currentLabel)}</small></th><th rowspan="2" class="tc-status-head tc-fixed-status" data-sort="status" title="Ordenação fixa: ofensores do último mês primeiro">CERTIFICAÇÃO ▲<small>${esc(currentLabel)}</small><small class="tc-current-priority">Ofensores primeiro</small></th></tr>
 <tr class="tc-columns">${months.map(m=>['revisit','tec1','prod'].map((k,i)=>`<th data-sort="${k}" data-month="${m}" class="${i===0?'tc-month-start':''}">${k==='revisit'?'REVISITA':k==='tec1'?'TEC1':'PONTOS/DIA'}${marks(k,m)}<small>${esc(tcMetricTarget(k))}</small></th>`).join('')).join('')}</tr>`;
 head.querySelectorAll('[data-sort]').forEach(h=>h.onclick=()=>{const key=h.dataset.sort,month=h.dataset.month||null,current=state.sort.key===key&&(state.sort.month||null)===month;state.sort=key==='status'?{key:'status',month:null,dir:1}:{key,month,dir:current?-state.sort.dir:key==='name'?1:-1};render();});
 requestAnimationFrame(tcUpdateCurrentPins);
 if(!R.length){tb.innerHTML='';$('#empty').style.display='block';$('#empty').textContent=$('#fBaseUnit').value?'Sem registros de Técnico Certificado para '+$('#fBaseUnit').value+' com os filtros atuais. Importe o analítico de TC correspondente para consultar essa unidade.':'Nenhum técnico encontrado com os filtros atuais.';return;}
 $('#empty').style.display='none';
 tb.innerHTML=R.map((a,i)=>`<tr data-i="${i}"><td class="tc-name" title="${esc(a.name+' · '+a.companyText)}"><div class="tc-person-name">${esc(a.name)}</div><div class="tc-identity-meta"><span class="tc-identity-sub" title="${esc(a.loginText+' · '+[...a.units].join(' / '))}">${esc(a.loginText)} · ${esc([...a.units].join(' / '))}</span><span class="sv-label ${svFor(a.loginText)===SV_UNASSIGNED?'missing':''}" title="${esc('Supervisor: '+svFor(a.loginText))}">${esc(svFor(a.loginText))}</span></div></td>${months.map(month=>{
  const part=tcMonthlyResult(a,month);
  return ['revisit','tec1','prod'].map((k,j)=>`<td class="tc-month-value ${j===0?'tc-month-start':''}" data-month="${month}" data-indicator="${k}">${part?tcMetricButton(part,k,part[k]):'<span class="tc-no-data" title="Sem dados neste mês">—</span>'}</td>`).join('');
 }).join('')}${tcProjectionCell(a)}${tcCurrentCells(a)}</tr>`).join('');
 tb.querySelectorAll('tr[data-i]').forEach(tr=>tr.onclick=()=>showTech(R[Number(tr.dataset.i)]));tcWireMetricLinks(tb);tcWireCurrentResults(tb);tcWireProjectionLinks(tb);
}
let tcToolsOpen=false;
try{tcToolsOpen=localStorage.getItem('tc_tools_open_127')==='1';}catch(e){}
function tcSetToolsOpen(open){
 tcToolsOpen=!!open;$('#tcTools').hidden=!tcToolsOpen;document.body.classList.toggle('tc-tools-open',tcToolsOpen);
 try{localStorage.setItem('tc_tools_open_127',tcToolsOpen?'1':'0');}catch(e){}
 const b=$('#tcToolsToggle');if(b){b.textContent=(tcToolsOpen?'Ocultar':'Importação e filtros')+(tcToolsOpen?' ▴':' ▾');b.setAttribute('aria-expanded',String(tcToolsOpen));}
}
function tcBindToolsToggle(){
 const root=$('#presentationCityStrip');root.insertAdjacentHTML('beforeend',`<button type="button" id="tcToolsToggle" class="tc-tools-toggle" aria-controls="tcTools" aria-expanded="${tcToolsOpen}">${tcToolsOpen?'Ocultar ▴':'Importação e filtros ▾'}</button>`);
 $('#tcToolsToggle').onclick=()=>tcSetToolsOpen(!tcToolsOpen);
}
$('#tcToolsClose').onclick=()=>tcSetToolsOpen(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&tcToolsOpen&&!$('#modal').classList.contains('show')){tcSetToolsOpen(false);$('#tcToolsToggle')?.focus();}});
tcSetToolsOpen(tcToolsOpen);

/* Trends compare the immediately preceding calendar month under the same filters. */
function tcPreviousMonth(month){
 if(!/^\d{4}-\d{2}$/.test(month||''))return '';
 const [y,m]=month.split('-').map(Number);
 return new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,7);
}
function tcBuildTrendContext(){
 state.trendMonthly=new Map(state.monthly);
 state.trendMonthly.set(state.currentMonth,state.currentTech);
 const currentPrevious=tcPreviousMonth(state.currentMonth);
 if(currentPrevious&&!state.trendMonthly.has(currentPrevious)){
  const currentPreviousRows=state.rows.filter(r=>monthKey(r)===currentPrevious&&rowPass(r,true)),items=aggregate(currentPreviousRows);applyStatus(items);
  for(const a of items)a.tcMonth=currentPrevious;
  state.trendMonthly.set(currentPrevious,new Map(items.map(a=>[a.loginText,a])));
 }
 for(const selected of tcSelectedMonths()){const previous=tcPreviousMonth(selected);if(state.trendMonthly.has(previous))continue;const rows=state.rows.filter(r=>monthKey(r)===previous&&rowPass(r,true)),items=aggregate(rows);applyStatus(items);for(const a of items)a.tcMonth=previous;state.trendMonthly.set(previous,new Map(items.map(a=>[a.loginText,a])));}
}
function tcTrend(value,previous,key){
 if(value==null||previous==null||!Number.isFinite(value)||!Number.isFinite(previous))return {direction:'missing',outcome:'missing',symbol:'',delta:null};
 const delta=value-previous,epsilon=1e-10*Math.max(1,Math.abs(value),Math.abs(previous));
 if(Math.abs(delta)<=epsilon)return {direction:'flat',outcome:'stable',symbol:'→',delta:0};
 const up=delta>0,better=key==='revisit'?!up:up;
 return {direction:up?'up':'down',outcome:better?'improved':'worsened',symbol:up?'↑':'↓',delta};
}
function tcTrendDelta(t,key){
 if(t.delta==null)return '';
 return (t.delta>0?'+':t.delta<0?'−':'')+nf2.format(Math.abs(t.delta)*(key==='prod'?1:100))+(key==='prod'?' pontos/dia':' p.p.');
}
function tcMonthlyTrend(a,key,value){
 const previousMonth=tcPreviousMonth(a.tcMonth),previous=state.trendMonthly?.get(previousMonth)?.get(a.loginText)?.[key];
 const t=tcTrend(value,previous,key),label=monthLabel(previousMonth);
 t.message=t.direction==='missing'?'Sem base comparável em '+label:
  (t.outcome==='improved'?'Melhora':t.outcome==='worsened'?'Piora':'Sem variação')+' em relação a '+label+' · '+tcTrendDelta(t,key)+' · anterior: '+tcMetricValue(previous,key);
 return t;
}
function tcTrendMarkup(t){return t.direction==='missing'?'':`<span class="tc-trend ${t.outcome}" data-trend="${t.direction}" data-outcome="${t.outcome}" aria-hidden="true">${modernTrendSvg(t.direction,t.outcome==='improved'?'good':t.outcome==='worsened'?'bad':'neutral')}</span>`;}
function tcUpdateScoreTrend(score){
 const badge=$('#tcScoreTrend'),note=$('#tcScoreTrendNote');badge.hidden=true;note.hidden=true;badge.replaceChildren();note.textContent='';
 if(score!=null){const good=score>=.75,message=good?'Meta atingida: Nota consolidada ≥ 75%':'Abaixo da meta: Nota consolidada < 75%';badge.className='tc-score-trend '+(good?'improved':'worsened');badge.innerHTML=modernTrendSvg(good?'up':'down',good?'good':'bad');badge.dataset.trend=good?'up':'down';badge.dataset.outcome=good?'on-target':'below-target';badge.setAttribute('aria-label',message);badge.title=message;badge.hidden=false;}
 const selected=tcSelectedMonths();if(selected.length!==1)return;
 const previousMonth=tcPreviousMonth(selected[0]),items=[...(state.trendMonthly.get(previousMonth)?.values()||[])],n=items.filter(a=>a.prod!=null).length,previous=n?items.filter(a=>a.status).length/n:null,t=tcTrend(score,previous,'score');
 if(t.direction!=='missing'){note.textContent=tcTrendDelta(t,'score')+' vs. '+monthLabel(previousMonth);note.hidden=false;}
}
function tcUpdateMetaProgress(score){
 const progress=targetProgress(score,.75),hasData=progress!=null,good=hasData&&score>=.75,root=$('#tcScoreProgress'),goal=$('#scoreRing');
 const status=!hasData?'Sem dados':good?'Meta atingida':'Abaixo da meta';
 const detail=hasData?status+'. '+nf1.format(progress)+'% de cumprimento':status;
 goal.className='tc-goal-display '+(!hasData?'is-empty':good?'is-achieved':'is-below');
 goal.setAttribute('aria-label','Meta: 75% ou mais. '+detail);
 goal.title='Meta: 75% ou mais · '+detail;
 root.className='score-progress '+(!hasData?'empty':good?'good':'pending');
 root.innerHTML=`<div class="tc-goal-state"><span class="tc-goal-dot" aria-hidden="true"></span><span>${status}</span></div><div class="score-goal-track" role="progressbar" aria-label="Cumprimento da meta de certificação" aria-valuemin="0" aria-valuemax="100" ${hasData?`aria-valuenow="${progress.toFixed(2)}"`:''} aria-valuetext="${detail}"><span class="score-goal-fill" style="width:${progress||0}%"></span></div>`;
}

/* The two fixed columns always use the newest DATA_NOTA month in the full base. */
function tcBuildCurrentMonth(){
 state.currentMonth=uniq(state.rows.filter(tcDatePass).map(monthKey)).sort().at(-1)||'';
 state.currentRows=state.rows.filter(r=>monthKey(r)===state.currentMonth&&rowPass(r,true));
 if(state.monthly.has(state.currentMonth))state.currentTech=state.monthly.get(state.currentMonth);
 else{
  const items=aggregate(state.currentRows);applyStatus(items);
  for(const a of items)a.tcMonth=state.currentMonth;
  state.currentTech=new Map(items.map(a=>[a.loginText,a]));
 }
}
function tcCurrentResult(a){return state.currentTech?.get(a.loginText)||null;}
function tcCurrentRank(a){const current=tcCurrentResult(a);return !current?2:current.status?1:0;}
function tcFindMonthly(month,login){return state.monthly.get(month)?.get(login)||(month===state.currentMonth?state.currentTech.get(login):null)||state.trendMonthly?.get(month)?.get(login)||null;}
function tcCurrentCells(a){
 const current=tcCurrentResult(a),month=state.currentMonth,label=month?monthLabel(month):'Sem mês na base';
 const volume=current?`<b>${nf0.format(current.os)}</b><small>WOs · ${current.days.size} dias</small>`:'<span class="tc-no-data">—</span><small>Sem dados</small>';
 const status=current?`<button type="button" class="tc-status-pill ${current.status?'ok':'no'}" data-tc-current-login="${esc(a.loginText)}" title="${esc('Ver resultado e contratos de '+a.name+' · '+label)}">${current.status?'Certificado':'Fora da meta'}${current.status?'':'<small>'+esc(current.fails.join(' · '))+'</small>'}</button>`:'<span class="tc-status-pill tc-status-na">Sem dados</span>';
 return `<td class="tc-volume tc-fixed-volume" data-reference-month="${month}" title="${esc('Volume de '+label)}">${volume}</td><td class="tc-period-status tc-fixed-status" data-reference-month="${month}" data-current-state="${!current?'missing':current.status?'certified':'offender'}">${status}</td>`;
}
function tcWireCurrentResults(root){
 root.querySelectorAll('[data-tc-current-login]').forEach(b=>b.onclick=e=>{
  e?.stopPropagation();const current=state.currentTech.get(b.dataset.tcCurrentLogin);
  if(current){tcModalReturnFocus=b;showTech(current);}
 });
}
function tcUpdateCurrentPins(){
 const table=$('#tcResults'),header=table.querySelector('.tc-fixed-status'),width=header?.getBoundingClientRect().width||0;
 if(width>0)table.style.setProperty('--tc-current-status-width',width.toFixed(2)+'px');
}
if(typeof ResizeObserver==='function'){
 const currentPinsObserver=new ResizeObserver(tcUpdateCurrentPins);currentPinsObserver.observe($('#tcResults'));
}

function modernTrendSvg(direction,outcome='neutral'){
 const paths={up:'M3 28L18 13L30 25L48 7L44 3L61 0L58 17L54 13L30 37L18 25L9 34Z',down:'M3 10L18 25L30 13L48 31L44 35L61 38L58 21L54 25L30 1L18 13L9 4Z',flat:'M5 15H43V6L60 20L43 34V25H5Z'};
 return `<svg class="modern-trend ${outcome}" viewBox="-2 -3 68 46" aria-hidden="true" focusable="false"><path d="${paths[direction]||paths.flat}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}
function targetProgress(value,target,lower=false){
 if(value==null||!Number.isFinite(value)||target==null)return null;
 const ratio=lower?(value<=0?1:target/value):value/target;
 return Math.max(0,Math.min(100,ratio*100));
}

const TC_NAME_UPDATES={};
for(const [login,name]of Object.entries(TC_NAME_UPDATES))TECH_MAP[login]={...TECH_MAP[login],name};
let tcDates={start:'',end:''};state.selectedMonths=[];
function tcSelectedMonths(){return state.selectedMonths||[];}
function tcMonthPass(r){return !tcSelectedMonths().length||tcSelectedMonths().includes(monthKey(r));}
function tcDatePass(r){if(!tcDates.start&&!tcDates.end)return true;const day=r.day||dateParts(r.finish)?.key||'';return !!day&&(!tcDates.start||day>=tcDates.start)&&(!tcDates.end||day<=tcDates.end);}
function tcSyncDates(){$('#tcDateStart').value=tcDates.start;$('#tcDateEnd').value=tcDates.end;$('#tcRangeError').textContent='';}
window.getUnifiedDates=()=>({...tcDates});
window.setUnifiedDates=function(range){if(range.start&&range.end&&range.start>range.end)return false;tcDates={start:range.start||'',end:range.end||''};tcSyncDates();syncCompanyOptions();render();return true;};
window.getUnifiedMonths=()=>({months:uniq(state.rows.map(monthKey)).sort(),selected:[...tcSelectedMonths()].sort()});
window.setUnifiedMonths=function(months){const all=window.getUnifiedMonths().months;state.selectedMonths=[...new Set(months||[])].filter(m=>all.includes(m));$('#fMonth').value=state.selectedMonths.length===1?state.selectedMonths[0]:'';syncCompanyOptions();render();};
window.setUnifiedMonth=month=>window.setUnifiedMonths(month?[month]:[]);
function tcRefreshMonthPicker(){
 const {months,selected}=window.getUnifiedMonths(),signature=JSON.stringify([months,selected]),root=$('#tcMonthOptions');if(root.dataset.signature===signature)return;root.dataset.signature=signature;
 const all=!selected.length||months.every(m=>selected.includes(m));$('#tcMonthLabel').textContent=all?'Todos os meses':selected.length===1?monthLabel(selected[0]):selected.length+' meses selecionados';
 root.innerHTML='<label class="all-months"><input type="checkbox" data-tc-all '+(all?'checked':'')+'>Todos os meses</label>'+months.map(m=>`<label><input type="checkbox" data-tc-month="${m}" ${all||selected.includes(m)?'checked':''}>${esc(monthLabel(m))}</label>`).join('');
 root.querySelector('[data-tc-all]').indeterminate=!all&&selected.length>0;
 root.querySelector('[data-tc-all]').onchange=()=>window.setUnifiedMonths([]);
 root.querySelectorAll('[data-tc-month]').forEach(box=>box.onchange=()=>{const values=[...root.querySelectorAll('[data-tc-month]:checked')].map(x=>x.dataset.tcMonth);if(!values.length){box.checked=true;return;}window.setUnifiedMonths(values);});
}
const tcInitMultiMonths=initFilters;initFilters=function(defaults=false){const available=uniq(state.rows.map(monthKey));state.selectedMonths=defaults?[]:tcSelectedMonths().filter(m=>available.includes(m));tcInitMultiMonths(defaults);$('#fMonth').value=tcSelectedMonths().length===1?tcSelectedMonths()[0]:'';tcRefreshMonthPicker();};
const tcRenderFilters=render;render=function(){tcRenderFilters();tcRefreshMonthPicker();const range=[tcDates.start,tcDates.end].filter(Boolean).map(tcDateLabel).join(' a ');if(range&&$('#tcPanelContext'))$('#tcPanelContext').textContent+=' · trabalho: '+range;};
function tcChangeDates(){const range={start:$('#tcDateStart').value,end:$('#tcDateEnd').value};if(range.start&&range.end&&range.start>range.end){$('#tcRangeError').textContent='A data inicial deve ser anterior ou igual à final.';return;}if(window.parent!==window&&window.parent.applyUnifiedDates)window.parent.applyUnifiedDates(range);else window.setUnifiedDates(range);}
['tcDateStart','tcDateEnd'].forEach(id=>$('#'+id).addEventListener('change',tcChangeDates));
document.addEventListener('click',e=>{if(!e.target.closest('#tcMonthPicker'))$('#tcMonthPicker').open=false;});

    
  

const tcSupervisors=new Set();let tcSupervisorMode=false;
Object.assign(TC_NAME_UPDATES,SV_NAME_CORRECTIONS);
function tcTeamStats(items){
 const evaluated=items.filter(a=>a.prod!=null).length,certified=items.filter(a=>a.status).length;
 const sum=k=>items.reduce((n,a)=>n+(Number(a[k])||0),0),days=items.reduce((n,a)=>n+a.days.size,0),den=sum('revBad')+sum('revGood'),td=sum('tden');
 return {n:items.length,evaluated,certified,score:evaluated?certified/evaluated:null,os:sum('os'),revisit:den?sum('revBad')/den:null,tec1:td?sum('tnum')/td:null,prod:days?sum('points')/days:null};
}
function tcSupervisorValue(value,key){
 if(value==null||!Number.isFinite(value))return '<span class="sv-neutral">—</span>';
 const good=key==='score'?value>=.75:key==='revisit'?value<tcRule().rev:key==='tec1'?tcTecOK(value):tcProdOK(value),label=key==='prod'?nf1.format(value):pct1(value);
 return `<span class="sv-value ${good?'sv-good':'sv-bad'}">${label}${modernTrendSvg(good?'up':'down',good?'good':'bad')}</span>`;
}
function tcRenderSupervisors(){
 const rows=state.filteredRows,months=tcDisplayMonths(),context=state.rows.filter(r=>rowPass(r,false,true));
 svRenderPicker('tcSupervisorSelect',tcSupervisors,context,'login');svWirePicker('tcSupervisorSelect',tcSupervisors,()=>{state.focus=null;render();});
 $$('#tcSupervisorControls [data-sv-mode]').forEach(b=>b.classList.toggle('on',b.dataset.svMode===(tcSupervisorMode?'supervisor':'technician')));
 $('#tcSupervisorContext').textContent=svLabel(tcSupervisors,'Todas as equipes')+' · '+state.result.length+' técnicos';
 const missing=new Set(state.rows.filter(r=>svFor(r.login)===SV_UNASSIGNED).map(r=>svLogin(r.login))).size;
 $('#tcSupervisorMissing').textContent='Editar supervisores'+(missing?' · '+missing+' sem vínculo':'');
 document.body.classList.toggle('sv-team-active',tcSupervisorMode);$('#supervisorView').hidden=!tcSupervisorMode;
 if(!tcSupervisorMode)return;
 $('#panelView').hidden=true;$('#dailyView').hidden=true;
 const groups=new Map();for(const r of rows){const name=svFor(r.login);if(!groups.has(name))groups.set(name,[]);groups.get(name).push(r);}
 const teams=[...groups].map(([name,list])=>{
  const byMonth=new Map();for(const month of months){const items=aggregate(list.filter(r=>monthKey(r)===month));applyStatus(items);byMonth.set(month,tcTeamStats(items));}
  const items=aggregate(list);applyStatus(items);return {name,list,byMonth,overall:tcTeamStats(items)};
 }).sort((a,b)=>(a.name===SV_UNASSIGNED)-(b.name===SV_UNASSIGNED)||((a.byMonth.get(months.at(-1))?.score??2)-(b.byMonth.get(months.at(-1))?.score??2))||a.name.localeCompare(b.name,'pt-BR'));
 const trend=months.map(month=>{const items=[...(state.monthly.get(month)?.values()||[])],s=tcTeamStats(items);return {l:month.slice(5)+'/'+month.slice(0,4),v:s.score,higher:true,t:s.certified+' certificados / '+s.evaluated+' avaliados'};});
 $('#supervisorView').innerHTML=`<section class="sv-panel"><div class="sv-panel-head"><strong>SUPERVISORES | CERTIFICAÇÃO E EVOLUÇÃO MENSAL</strong><small>${esc(svLabel(tcSupervisors))} · ${teams.length} equipe(s) · ${months.length} mês(es)</small></div>${svChart(trend,.75,true,130)}<div class="sv-table-wrap"><table class="sv-table" id="tcSupervisorTable" style="min-width:${Math.max(750,230+months.length*340)}px"><thead><tr><th rowspan="2">SUPERVISOR</th>${months.map(month=>`<th class="sv-month-start" colspan="4">${esc(monthLabel(month))}</th>`).join('')}</tr><tr>${months.map(()=>'<th class="sv-month-start">CERTIFICADOS<small class="sv-sub">Meta ≥ 75% dos avaliados</small></th><th>REVISITA<small class="sv-sub">Meta &lt; 7,01%</small></th><th>TEC1<small class="sv-sub">Meta ≥ 95%</small></th><th>PONTOS / TÉCNICO / DIA<small class="sv-sub">Meta ≥ '+tcRule().prod+'</small></th>').join('')}</tr></thead><tbody>${teams.map((team,i)=>`<tr><td><button type="button" class="sv-team-link" data-tc-team="${i}">${esc(team.name)}<small>${team.overall.n} técnicos no período · ver equipe →</small></button></td>${months.map(month=>{const s=team.byMonth.get(month);return `<td class="sv-month-start">${tcSupervisorValue(s.score,'score')}<small class="sv-sub">${s.evaluated?s.certified+' / '+s.evaluated+' avaliados':'Sem dados'}</small></td><td>${tcSupervisorValue(s.revisit,'revisit')}<small class="sv-sub">${s.os?nf0.format(s.os)+' WOs':''}</small></td><td>${tcSupervisorValue(s.tec1,'tec1')}</td><td>${tcSupervisorValue(s.prod,'prod')}</td>`;}).join('')}</tr>`).join('')||`<tr><td colspan="${1+months.length*4}" class="sv-empty">Nenhuma equipe encontrada com os filtros atuais.</td></tr>`}</tbody></table></div><div class="sv-note">Clique no supervisor para apresentar os técnicos da equipe. Certificação = técnicos certificados ÷ avaliados. Revisita e TEC1 usam os totais da equipe; pontos/dia = pontos ÷ soma dos dias produtivos de cada técnico. Competência por DATA_NOTA.</div></section>`;
 $$('#supervisorView [data-tc-team]').forEach(button=>button.onclick=()=>{tcSupervisors.clear();tcSupervisors.add(teams[Number(button.dataset.tcTeam)].name);tcSupervisorMode=false;state.view='panel';render();});
}
// Mantém o filtro de equipe nas métricas, nos históricos e nas projeções existentes.
const tcRenderBeforeSupervisor=render;
render=function(){if(state.ready&&!document.body.classList.contains('presentation-mode'))svReconcileSelection(tcSupervisors,state.rows.filter(r=>rowPass(r,false,true)),'login');tcRenderBeforeSupervisor();if(state.ready)tcRenderSupervisors();};
const tcSwitchBeforeSupervisor=switchView;
switchView=function(view){tcSupervisorMode=false;tcSwitchBeforeSupervisor(view);render();};
const tcResetBeforeSupervisor=resetFilters;
resetFilters=function(){tcSupervisors.clear();tcResetBeforeSupervisor();};
$('#btnReset').onclick=resetFilters;

$$('#tcSupervisorControls [data-sv-mode]').forEach(button=>button.onclick=()=>{tcSupervisorMode=button.dataset.svMode==='supervisor';if(!tcSupervisorMode)state.view='panel';render();});
$('#tcSupervisorMissing').onclick=svOpenEditor;
window.getSupervisorRoster=()=>state.rows.map(r=>({login:r.login,name:r.name,city:presentationCityLabel(r.city)}));
window.refreshSupervisorRegistry=()=>{applyMaps();render();};


window.getUnifiedUnits=function(){
 const units=businessUnitOptions(state.rows.map(row=>row.baseUnit)),value=$('#fBaseUnit').value;
 return {units,selected:tcSelectedUnits.size?[...tcSelectedUnits]:value?[value]:[],multiple:true,ready:state.ready};
};
window.setUnifiedUnits=function(values){
 const units=businessUnitOptions(state.rows.map(row=>row.baseUnit)),selected=[...new Set(values||[])];
 if(selected.some(unit=>!units.includes(unit)))return false;
 tcSelectedUnits.clear();selected.forEach(unit=>tcSelectedUnits.add(unit));
 $('#fBaseUnit').value=selected.length===1?selected[0]:'';render();return true;
};


/* One city and one supervisor per screen, using the existing technician result table. */
(() => {
 let active=false;
 const locks=new Map(),filterIds=['fBaseUnit','fUf','fCompany','fSub','fMap','fSearch'];
 const periodRows=()=>state.rows.filter(r=>tcDatePass(r)&&tcMonthPass(r));
 function list(){
  const cities=new Map();
  for(const r of periodRows()){
   const city=presentationCityLabel(r.city);if(!city||!r.login)continue;
   if(!cities.has(city))cities.set(city,new Set());cities.get(city).add(svFor(r.login));
  }
  return [...cities.keys()].sort((a,b)=>a.localeCompare(b,'pt-BR')).flatMap(city=>[...cities.get(city)].sort((a,b)=>(a===SV_UNASSIGNED)-(b===SV_UNASSIGNED)||a.localeCompare(b,'pt-BR')).map(supervisor=>({panel:'tc',city,supervisor,label:supervisor,duration:30000})));
 }
 function lock(){for(const el of document.querySelectorAll('#presentationCityStrip,#tcSupervisorControls,#tcTools,#tcProjectionToolbar')){if(!locks.has(el))locks.set(el,el.getAttribute('inert'));el.setAttribute('inert','');}}
 function unlock(){for(const [el,old]of locks){if(old===null)el.removeAttribute('inert');else el.setAttribute('inert',old);}locks.clear();}
 function closeDetails(){tcCloseModal();tcProjectionPlannerOpen=false;}
 window.technetSlides={
  ready:()=>!!state.ready,
  list,
  begin(){
   const snapshot={units:[...tcSelectedUnits],filters:Object.fromEntries(filterIds.map(id=>[id,$('#'+id).value])),multi:Object.fromEntries(Object.entries(state.multi).map(([k,v])=>[k,[...v]])),supervisors:[...tcSupervisors],supervisorMode:tcSupervisorMode,view:state.view,focus:state.focus,sort:{...state.sort},tools:tcToolsOpen,planner:tcProjectionPlannerOpen};
   active=true;document.body.classList.add('slides-frame-active');closeDetails();
   tcSelectedUnits.clear();filterIds.forEach(id=>$('#'+id).value='');Object.values(state.multi).forEach(set=>set.clear());tcSupervisors.clear();
   state.view='panel';state.focus=null;state.sort={key:'status',month:null,dir:1};tcSupervisorMode=false;
   tcToolsOpen=false;$('#tcTools').hidden=true;document.body.classList.remove('tc-tools-open');syncCompanyOptions();
   return snapshot;
  },
  show(slide){
   if(!active||slide.panel!=='tc'||!slide.city||!slide.supervisor||!list().some(s=>s.city===slide.city&&s.supervisor===slide.supervisor))return false;
   state.multi.city.clear();for(const r of state.rows)if(presentationCityLabel(r.city)===slide.city)state.multi.city.add(r.city);
   tcSupervisors.clear();tcSupervisors.add(slide.supervisor);tcSupervisorMode=false;state.view='panel';state.focus=null;
   closeDetails();syncCompanyOptions();render();
   requestAnimationFrame(()=>{document.scrollingElement?.scrollTo?.(0,0);for(const el of document.querySelectorAll('#panelView .tablewrap,#panelView .table-wrap,#panelView .tc-table-scroll')){el.scrollTop=0;el.scrollLeft=0;}});
   return true;
  },
  restore(snapshot){
   active=false;document.body.classList.remove('slides-frame-active');unlock();closeDetails();if(!snapshot)return;
   tcSelectedUnits.clear();(snapshot.units||[]).forEach(unit=>tcSelectedUnits.add(unit));
   for(const [key,values]of Object.entries(snapshot.multi)){state.multi[key].clear();values.forEach(v=>state.multi[key].add(v));}
   for(const id of filterIds)if(id!=='fCompany')$('#'+id).value=snapshot.filters[id];
   syncCompanyOptions();$('#fCompany').value=snapshot.filters.fCompany;
   tcSupervisors.clear();snapshot.supervisors.forEach(v=>tcSupervisors.add(v));tcSupervisorMode=snapshot.supervisorMode;state.view=snapshot.view;state.focus=snapshot.focus;state.sort=snapshot.sort;tcProjectionPlannerOpen=snapshot.planner;
   setupMulti('#mCity',uniq(state.rows.map(r=>r.city)),state.multi.city);setupMulti('#mGroup',uniq(state.rows.map(r=>r.group)),state.multi.group);setupMulti('#mType',uniq(state.rows.map(r=>r.type)),state.multi.type);
   tcSetToolsOpen(snapshot.tools);render();
  }
 };
 const previousRender=render;render=function(){previousRender();if(active)lock();};
})();


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
  
return window;
}
