// Reviewed reference e2a41044c855276006e3d977a81bbd10ca220f96a720b7dfedf1f6888fde7dd2; generated visual engine. No personal seed data.
import { qqChartPointMarkup, wireQQChartDrilldown } from "../reference-qq-charts";
export function mountQQ(environment) {
const {document,window,localStorage,location,ResizeObserver,setTimeout,clearTimeout,requestAnimationFrame}=environment;
const BUSINESS_UNITS=Object.freeze(["FTZ-DMV_01_VT","FTZ-DMV_01","FTZ-DMV_ADM","MRO-DMV","NTL-DMV_ADM","PWM-DMV_ADM","NTL-DMV","PWM-DMV","NTL-DMV_VT","PWM-DMV_VT","JCR-DMV","JCR-DMV_ADM"]);
function businessUnitOptions(values=[]){
 return [...new Set([...BUSINESS_UNITS,...values].map(v=>String(v??'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
function qqUnitOptions(){return businessUnitOptions(RECS.map(r=>r.un));}
function qqSourceUnit(r){return String(r.UN_TECNICO||r.UNIDADE_NEGOCIO||'').trim();}
/* Leitura incremental de XLSX: evita materializar milhões de células da planilha. */
function qqXmlText(s){return String(s).replace(/&(amp|lt|gt|quot|apos|#x[0-9a-fA-F]+|#\d+);/g,(_,e)=>e[0]==='#'?String.fromCodePoint(e[1]==='x'?parseInt(e.slice(2),16):Number(e.slice(1))):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[e]);}
function qqXmlAttr(s,key){const m=s.match(new RegExp('(?:^|\\s)'+key+'=["\\\']([^"\\\']*)["\\\']'));return m?qqXmlText(m[1]):'';}
function qqTextNodes(s){return [...s.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m=>qqXmlText(m[1])).join('');}
async function qqReadWorkbook(buffer){
 const bytes=new Uint8Array(buffer);
 if(bytes[0]!==0x50||bytes[1]!==0x4b)throw Error('Selecione um XLSX válido.');
 const view=new DataView(buffer);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw Error('XLSX incompleto: índice ZIP ausente.');
 const files=new Map();let offset=view.getUint32(end+16,true),count=view.getUint16(end+10,true);
 for(let i=0;i<count;i++){
  if(view.getUint32(offset,true)!==0x02014b50)throw Error('Índice ZIP inválido.');
  const nl=view.getUint16(offset+28,true),xl=view.getUint16(offset+30,true),cl=view.getUint16(offset+32,true);
  const name=new TextDecoder().decode(bytes.subarray(offset+46,offset+46+nl));
  files.set(name,{method:view.getUint16(offset+10,true),flags:view.getUint16(offset+8,true),size:view.getUint32(offset+20,true),rawSize:view.getUint32(offset+24,true),local:view.getUint32(offset+42,true)});offset+=46+nl+xl+cl;
 }
 function stream(name){const e=files.get(name);if(!e)throw Error('Parte ausente no XLSX: '+name);if(e.flags&1)throw Error('XLSX protegido por senha.');const start=e.local+30+view.getUint16(e.local+26,true)+view.getUint16(e.local+28,true);const s=new Blob([bytes.subarray(start,start+e.size)]).stream();if(e.method===0)return s;if(e.method!==8)throw Error('Compactação não suportada.');return s.pipeThrough(new DecompressionStream('deflate-raw'));}
 const text=name=>new Response(stream(name)).text();
 const workbook=await text('xl/workbook.xml'),relations=await text('xl/_rels/workbook.xml.rels');
 const first=workbook.match(/<sheet\b([^>]*?)\/?\s*>/);if(!first)throw Error('Nenhuma aba no XLSX.');
 const relId=qqXmlAttr(first[1],'r:id');let sheet='';
 for(const m of relations.matchAll(/<Relationship\b([^>]*?)\/?\s*>/g))if(qqXmlAttr(m[1],'Id')===relId){const target=qqXmlAttr(m[1],'Target'),parts=(target.startsWith('/')?target.slice(1):'xl/'+target).split('/'),norm=[];for(const p of parts)if(p==='..')norm.pop();else if(p!=='.')norm.push(p);sheet=norm.join('/');}
 if(!sheet)throw Error('Relação da primeira aba não encontrada.');
 const strings=[];
 if(files.has('xl/sharedStrings.xml')){const xml=await text('xl/sharedStrings.xml');for(const m of xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g))strings.push(qqTextNodes(m[1]));}
 const wanted=new Set(['TIPO_ATENDIMENTO','DAT_AGENDA','SEMANA','LOGIN_TEC','UN_TECNICO','UNIDADE_NEGOCIO','DSC_CLUSTER','TIPO_TRATAMENTO','SUB_AGRUPAMENTO_SC','NM_MUNICIPIO','MUNICIPIO','DSC_MUNICIPIO','CIDADE','NM_CIDADE','CIDADE_TECNICO','MUNICIPIO_TECNICO','CONTRATO','COD_OS','NUM_WO','COD_BAIXA','TIPO_OS','RESPONSAVEL_QUEBRA','MOTIVO_REAGENDAMENTO','PERIODO_AGENDA','DAT_HOR_BAIXA','STATUS_TEC1','STATUS_GEO','SEGMENTO_CONTRATO','TIPO_ORDEM_SERVICO_AGRUPADO','GRUPO_OS']);
 const date1904=/<workbookPr\b[^>]*date1904=["'](?:1|true)["']/.test(workbook);
 let headers=null,carry='',rows=[];const reader=stream(sheet).pipeThrough(new TextDecoderStream()).getReader();
 function consume(xml){
  const values={};for(const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
   const col=qqXmlAttr(m[1],'r').replace(/\d/g,'');if(headers&&!wanted.has(headers[col]))continue;
   const type=qqXmlAttr(m[1],'t'),body=m[2]||'',cached=body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/);let value=null;
   if(type==='s')value=cached?strings[Number(cached[1])]??null:null;else if(type==='inlineStr')value=qqTextNodes(body);else if(type==='str'||type==='d')value=cached?qqXmlText(cached[1]):null;else if(cached&&cached[1]!=='')value=Number(cached[1]);
   values[col]=value;
  }
  if(!headers){headers=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,String(v??'')]));return;}
  const row={};for(const [col,name] of Object.entries(headers))if(wanted.has(name))row[name]=values[col]??null;
  if(date1904&&typeof row.DAT_AGENDA==='number')row.DAT_AGENDA+=1462;
  if(Object.values(row).some(v=>v!==null&&v!==''))rows.push(row);
 }
 while(true){const {value,done}=await reader.read();if(value)carry+=value;let close;
  while((close=carry.indexOf('</row>'))!==-1){const start=carry.indexOf('<row');if(start<0||start>close)throw Error('Linha inválida no XLSX.');consume(carry.slice(start,close+6));carry=carry.slice(close+6);}
  if(done)break;
 }
 if(!headers)throw Error('Aba vazia.');return rows;
}


/* ===== REGRAS (validadas contra os KPIs do modelo: FTZ-DMV_01, set/2026) =====
 Frente: TIPO_ATENDIMENTO (col BX) = NOVOS DOMICILIOS (ND) | MIGRAÇÃO (MIG)
 %Quebra = TIPO_TRATAMENTO (F) "COM QUEBRA DE AGENDA" / total de OS da frente
 %Qualificada = soma das categorias exibidas (Infra, TEC1, Tubulação, Contato Cliente, GEO e Baixa100) / total de OS da frente
 "Outros" não participa do %Qualificada e não é exibido na tabela
 Categoria pela AH; "MAIS DE UM PROCESSO" é rateada 1/3 entre TEC1, Contato Cliente e GEO
 Evolução semanal = SEMANA (CB) | Dia/Mês = DAT_AGENDA (M) | UN = UN_TECNICO (K) */
const CATS=['Infra Claro Tec','TEC1','Tubulação','Contato Cliente','GEO','Baixa100'];
const QQ_QUALIFIED_GOAL=Object.freeze({ND:0.07,PME:0.07,MIG:0.115,ME:0.07}),QQ_BREAK_GOAL=Object.freeze({ND:0.20,PME:0.20,MIG:0.30,ME:0.20});
const MESES=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
const REQ=['TIPO_ATENDIMENTO','DAT_AGENDA','TIPO_TRATAMENTO','SUB_AGRUPAMENTO_SC'];
const NAME_MAP={};
const techName=login=>svRegisteredTechnicianName(login)||svValidTechnicianName(NAME_MAP[svLogin(login)]||NAME_MAP[login],login)||'Nome não localizado';
const norm=s=>String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
function ymd(v){
 if(v==null||v==='')return null;
 if(v instanceof Date)return v.toISOString().slice(0,10);
 if(typeof v==='number')return new Date(Date.UTC(1899,11,30)+Math.floor(v)*864e5).toISOString().slice(0,10);
 const s=String(v).trim();let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return m[1]+'-'+m[2]+'-'+m[3];
 m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);return m?m[3]+'-'+m[2]+'-'+m[1]:null}
function catOf(ah){
 const a=norm(ah);if(!a||a==='-3'||a==='-'||a==='N/A')return null;
 if(a.includes('MAIS DE UM'))return{'TEC1':1/3,'Contato Cliente':1/3,'GEO':1/3};
 if(a.includes('INFRA'))return{'Infra Claro Tec':1};
 if(a.includes('TUBUL'))return{'Tubulação':1};
 if(a.includes('C.CLIENTE'))return{'Contato Cliente':1};
 if(a.includes('GEO'))return{'GEO':1};
 if(a.includes('TEC1'))return{'TEC1':1};
 if(a.includes('CUMPRIDO'))return{'Baixa100':1};
 return{'Outros':1}}
function cityFromUnit(un){
 const u=norm(un);
 if(/^FTZ|^FOR/.test(u))return 'Fortaleza';
 if(/^NTL|^NAT/.test(u))return 'Natal';
 if(/^PWM/.test(u))return 'Parnamirim';
 if(/^MRO|^MOS/.test(u))return 'Mossoró';
 if(/^REC|^RCE|^RCF|^JCR/.test(u))return 'Recife';
 return '';
}
function cityFromRow(r){
 const fields=['NM_MUNICIPIO','MUNICIPIO','DSC_MUNICIPIO','CIDADE','NM_CIDADE','CIDADE_TECNICO','MUNICIPIO_TECNICO'];
 for(const k of fields){const v=String(r[k]??'').trim();if(v&&v!=='-3'&&v!=='-')return v;}
 return cityFromUnit(qqSourceUnit(r));
}
function recCity(r){return String(r.ci||cityFromUnit(r.un)||'').trim()}
function presentationCityLabel(v){
 const raw=String(v||'').trim();
 const n=norm(raw).replace(/\s+/g,' ');
 if(!n)return '';
 if(n==='NATAL'||n==='PARNAMIRIM'||n==='NATAL / PARNAMIRIM'||n==='NATAL/PARNAMIRIM')return 'Natal / Parnamirim';
 return raw;
}
function toRec(r){
 const gf=generalFront(r),f=gf==='PME'?'ND':gf;
 const d=ymd(r.DAT_AGENDA);if(!f||!d)return null;
 const w=(norm(r.SEMANA).match(/\d+/)||[''])[0];
 const lg=v=>{v=String(v==null?'':v).trim();return(!v||v==='-3'||v==='-')?'(sem login)':v};
 return{f,d,w,lt:lg(r.LOGIN_TEC),un:qqSourceUnit(r),cl:String(r.DSC_CLUSTER||''),ci:cityFromRow(r),b:norm(r.TIPO_TRATAMENTO).startsWith('COM QUEBRA')?1:0,c:catOf(r.SUB_AGRUPAMENTO_SC),...qqRecordDetails(r)}}
// Explicit unfulfilled appointments remain qualified even when the responsible field is REAG_CLIENTE.
function qqClientReschedule(r){return norm(r.responsible).replace(/[ _-]/g,'')==='REAGCLIENTE';}
function qqMissedAppointment(r){
 return norm(r.rawCategory)==='AGENDAMENTO NAO CUMPRIDO'&&norm(r.treatment).startsWith('COM QUEBRA');
}
function qqQualifiedCategories(r){
 if(qqClean409(r))return null;
 if(qqClientReschedule(r)&&!qqMissedAppointment(r))return null;
 return r.c;
}
function stat(a){
 const s={n:a.length,b:0,q:0,cat:{}};
 let somaCategorias=0;
 for(const r of a){
  if(qqClean409(r))continue;
  s.b+=r.b;
  const categories=qqQualifiedCategories(r);
  if(categories){
   for(const k in categories){
    s.cat[k]=(s.cat[k]||0)+categories[k];
    if(k!=='Outros')somaCategorias+=categories[k];
   }
  }
 }
 // Qualificada uses only eligible category weights; all agenda records remain in the denominator.
 // Other client rescheduling remains excluded; the original category, base and break population are preserved.
 s.q=Math.round(somaCategorias*1e9)/1e9;
 s.pb=s.n?s.b/s.n:NaN;s.pq=s.n?s.q/s.n:NaN;return s}
const group=(a,fn)=>{const m={};for(const r of a)(m[fn(r)]=m[fn(r)]||[]).push(r);return m};

const numBR=(v,d=2)=>Number(v||0).toFixed(d).replace('.',',');
function openCategoryModal(cat, records, labelPeriodo, frenteNome){
 const modal=document.getElementById('catModal');
 const title=document.getElementById('catModalTitle');
 const sub=document.getElementById('catModalSub');
 const body=document.getElementById('catModalBody');

 // Apenas OS que efetivamente contribuíram para a categoria selecionada.
 const contributing=records.filter(r=>Number(qqQualifiedCategories(r)?.[cat]||0)>0);
 const totalBase=records.length;
 const totalCat=contributing.reduce((acc,r)=>acc+Number(qqQualifiedCategories(r)?.[cat]||0),0);

 const byLogin={};
 for(const r of contributing){
  const login=r.lt||'(sem login)';
  if(!byLogin[login])byLogin[login]={login,rows:0,contrib:0};
  byLogin[login].rows++;
  byLogin[login].contrib+=Number(qqQualifiedCategories(r)?.[cat]||0);
 }
 const itens=Object.values(byLogin).sort((a,b)=>b.contrib-a.contrib||b.rows-a.rows||a.login.localeCompare(b.login));
 const max=itens.length?itens[0].contrib:1;

 const indicador=totalBase?totalCat/totalBase:0;
 title.textContent=`${cat} — ofensores por LOGIN_TEC`;
 sub.textContent=`${frenteNome} · ${labelPeriodo} · clique fora do popup ou no × para fechar`;

 const fmtContrib=v=>Math.abs(v-Math.round(v))<1e-9?String(Math.round(v)):numBR(v,2);

 const rows=itens.map((o,i)=>{
  const pctCategoria=totalCat?o.contrib/totalCat:0;
  const pctBase=totalBase?o.contrib/totalBase:0;
  const width=max?Math.max(3,o.contrib/max*100):0;
  return `<tr>
   <td class="modal-rank">${i+1}º</td>
   <td class="modal-login"><b>${o.login}</b><div class="modal-name">${techName(o.login)}</div></td>
   <td>${o.rows}</td>
   <td><b>${fmtContrib(o.contrib)}</b></td>
   <td>${pct(pctCategoria,2)}</td>
   <td>${pct(pctBase,2)}</td>
   <td><div class="modal-bar-wrap"><div class="modal-bar-track"><div class="modal-bar-fill" style="width:${width.toFixed(1)}%"></div></div><span>${pct(pctCategoria,2)}</span></div></td>
  </tr>`;
 }).join('');

 body.innerHTML=`
  <div class="modal-kpis">
   <div class="modal-kpi"><small>Valor do indicador</small><b>${pct(indicador,2)}</b></div>
   <div class="modal-kpi"><small>Contribuição da categoria</small><b>${fmtContrib(totalCat)} OS</b></div>
   <div class="modal-kpi"><small>Base do período</small><b>${totalBase} OS</b></div>
   <div class="modal-kpi"><small>Técnicos envolvidos</small><b>${itens.length}</b></div>
  </div>
  ${itens.length?`
   <div style="overflow-x:auto">
    <table class="modal-table">
     <tr>
      <th>#</th><th>Login / Nome</th><th>Ocorrências</th><th>Contribuição OS</th>
      <th>% da categoria</th><th>% sobre a base</th><th>Participação</th>
     </tr>
     ${rows}
    </table>
   </div>
   <div class="note" style="margin-top:10px">
    A soma de “Contribuição OS” reproduz o valor da categoria selecionada. Quando a origem é “MAIS DE UM PROCESSO”, a regra original continua rateando 1/3 para TEC1, Contato Cliente e GEO.
   </div>`:
   `<div class="modal-empty">Nenhum técnico contribuiu para <b>${cat}</b> neste período.</div>`}`;

 modal.classList.add('on');
 modal.setAttribute('aria-hidden','false');
 document.body.style.overflow='hidden';
}
function closeCategoryModal(){
 const modal=document.getElementById('catModal');
 if(!modal)return;
 modal.classList.remove('on');
 modal.setAttribute('aria-hidden','true');
 document.body.style.overflow='';
}
document.addEventListener('click',e=>{
 if(e.target?.id==='catModalClose'||e.target?.id==='catModal')closeCategoryModal();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeCategoryModal()});

//UI
const $=id=>document.getElementById(id);
const pct=(v,d=2)=>isFinite(v)?(v*100).toFixed(d).replace('.',',')+'%':'–';
const pp=v=>isFinite(v)?(v>0?'+':'')+(v*100).toFixed(2).replace('.',',')+' p.p.':'–';
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

// Source revisions are verified row versions from the supplied analytic files.
// They migrate only a matching old version, preserving later or unrelated edits.
const QQ_SOURCE_UPDATES=[];
function qqAgendaKey(r){
 const valid=v=>{const s=String(v??'').trim();return s&&!['-','-3','N/A'].includes(s)?s:'';};
 const os=valid(r.os),wo=valid(r.wo);
 if(os)return JSON.stringify(['OS',r.d,os,wo,wo?'':r.time||'']);
 if(wo)return JSON.stringify(['WO',r.d,wo,r.contract||'',r.service||'']);
 return JSON.stringify(['legacy',r.d,r.un,r.lt,r.f,r.contract||'',r.service||'',r.time||'',r.rawCategory||'']);
}
function qqSameValue(a,b){
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 const aKeys=Object.keys(a).sort(),bKeys=Object.keys(b).sort();
 return aKeys.length===bKeys.length&&aKeys.every((key,i)=>key===bKeys[i]&&qqSameValue(a[key],b[key]));
}
function qqApplySourceUpdates(records){
 const updates=new Map(QQ_SOURCE_UPDATES.map(update=>[qqAgendaKey(update.before),update]));
 let count=0;
 const rows=records.map(record=>{
  const update=updates.get(qqAgendaKey(record));if(!update)return record;
  const matches=Object.keys(update.before).filter(k=>k!=='sv').every(k=>
   k==='osGroup'&&record[k]===undefined||qqSameValue(record[k],update.before[k]));
  if(!matches)return record;
  count++;return {...record,...update.after};
 });
 return {rows,count};
}
function qqMergeAgendaRecords(current,incoming){
 const rows=[...current],positions=new Map(current.map((r,i)=>[qqAgendaKey(r),i]));
 let added=0,updated=0,unchanged=0;
 for(const record of incoming){
  const key=qqAgendaKey(record),index=positions.get(key);
  if(index===undefined){positions.set(key,rows.length);rows.push(record);added++;}
  else if(qqSameValue(rows[index],record)){unchanged++;}
  else{rows[index]={...rows[index],...record};updated++;}
 }
 return {rows,added,updated,unchanged};
}


let RECS=[],S={f:'ND',ind:'q',view:'front',login:null,loginSearch:'',city:(new URLSearchParams(location.search).get('cidade')||'')};
try{RECS=JSON.parse(localStorage.getItem('dashQualif_conferida_20261007_v2')||'[]')}catch(e){}
if(RECS.length&&!('lt' in RECS[0])){RECS=[];try{localStorage.removeItem('dashQualif_conferida_20261007_v2')}catch(e){}}
let qqSaveVersion=0;
async function save(){
 const version=++qqSaveVersion,raw=JSON.stringify(RECS);
 try{
  let value=raw;
  if(typeof CompressionStream==='function'){
   const bytes=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
   let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));value='gz:'+btoa(binary);
  }
  if(version===qqSaveVersion)localStorage.setItem('dashQualif_conferida_20261007_v2',value);
 }catch(e){$('msg').textContent+=' (não foi possível salvar esta base no navegador; reimporte ao reabrir)'}
}
function msg(t,e){$('msg').textContent=t;$('msg').className=e?'err':''}
async function importFile(file){
 try{
  msg('Lendo '+file.name+'…');
  const rows=await qqReadWorkbook(await file.arrayBuffer());
  if(!rows.length)throw new Error('planilha vazia');
  const miss=REQ.filter(c=>!(c in rows[0]));
  if(!('UN_TECNICO' in rows[0])&&!('UNIDADE_NEGOCIO' in rows[0]))miss.push('UN_TECNICO ou UNIDADE_NEGOCIO');
  if(miss.length)throw new Error('colunas ausentes: '+miss.join(', '));
  const nr=rows.map(toRec).filter(Boolean).map(qqNormalize409);
  if(!nr.length)throw new Error('nenhum registro válido de ND/PME/Migração/ME');
  const ms=new Set(nr.map(r=>r.d.slice(0,7))),mode=$('qqImportMode')?.value||'merge';
  if(mode==='replace'){
   RECS=RECS.filter(r=>!ms.has(r.d.slice(0,7))).concat(nr);
   await save();
   msg(`OK: ${rows.length} linhas lidas; ${nr.length} registros válidos. Meses substituídos pela base completa: ${[...ms].sort().join(', ')}.`);
  }else{
   const merged=qqMergeAgendaRecords(RECS,nr);RECS=merged.rows;
   await save();
   msg(`OK: ${rows.length} linhas lidas; ${merged.updated} O.S. atualizadas, ${merged.added} incluídas e ${merged.unchanged} sem alteração. Os demais registros foram preservados.`);
  }
  init(true)
 }catch(e){msg('Erro ao importar: '+e.message,1)}}
$('drop').onclick=()=>$('file').click();
$('file').onchange=e=>{if(e.target.files[0])importFile(e.target.files[0]);e.target.value=''};
$('drop').ondragover=e=>{e.preventDefault();$('drop').classList.add('on')};
$('drop').ondragleave=()=>$('drop').classList.remove('on');
$('drop').ondrop=e=>{e.preventDefault();$('drop').classList.remove('on');if(e.dataTransfer.files[0])importFile(e.dataTransfer.files[0])};
$('clr').onclick=()=>{RECS=[];qqSaveVersion++;try{localStorage.setItem('dashQualif_conferida_20261007_v2','[]')}catch(e){}init(true);msg('Dados removidos.')};

/* ===== APRESENTAÇÃO: DUAS MÉTRICAS NA MESMA TELA + FOCO POR CIDADE ===== */
function presentationCities(){
 return [...new Set(RECS.map(r=>presentationCityLabel(recCity(r))).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
function setPresentationCity(city){
 S.city=presentationCityLabel(city)||'';
 try{
  const u=new URL(location.href);
  if(S.city)u.searchParams.set('cidade',S.city);else u.searchParams.delete('cidade');
  history.replaceState(null,'',u);
 }catch(e){}
 draw();
}
function renderPresentationCityStrip(){
 const root=$('cityStrip');if(!root)return;
 const cities=presentationCities();
 if(S.city)S.city=presentationCityLabel(S.city); if(S.city&&!cities.includes(S.city))S.city='';
 root.innerHTML='<span class="city-label">Cidade</span>'+[
  `<button class="city-btn ${!S.city?'on':''}" data-city="">Todas</button>`,
  ...cities.map(c=>`<button class="city-btn ${S.city===c?'on':''}" data-city="${String(c).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}">${String(c).replace(/&/g,'&amp;').replace(/</g,'&lt;')}</button>` )
 ].join('');
 root.querySelectorAll('[data-city]').forEach(b=>b.onclick=()=>setPresentationCity(b.dataset.city));
 const link=$('goTech');if(link){link.href='#';link.onclick=e=>{e.preventDefault();window.parent.show?.('tc')};}
}
const __legacyDraw=draw;
draw=function(){
 const uns=getMulti('fUn'),cls=getMulti('fCl'),meses=getMulti('fMes').sort();
 renderPresentationCityStrip();
 const presenting=document.body.classList.contains('presentation-mode');
 document.querySelectorAll('.tab').forEach(t=>{const active=t.dataset.view==='logins'?S.view==='logins':S.view!=='logins'&&t.dataset.f===S.f;t.classList.toggle('on',active)});
 if(!RECS.length||!meses.length){$('kpis').innerHTML='';$('upd').textContent='';$('view').innerHTML='<div class="card empty"><h3>Nenhum dado carregado</h3>Use “Dados / filtros” para importar a planilha QUALIFICADA DMV.</div>';return}
 const meta=QQ_QUALIFIED_GOAL,metaQuebra=QQ_BREAK_GOAL,NM={ND:'Novos Domicílios',MIG:'Migração',PME:'PME',ME:'Mudança de Endereço'};
 const baseAll=RECS.filter(r=>qqDatePass(r)&&uns.includes(r.un)&&cls.includes(r.cl));
 const cityBase=S.city?baseAll.filter(r=>presentationCityLabel(recCity(r))===S.city):baseAll;
 if(S.view==='logins'&&!presenting)svReconcileSelection(S.supervisors||new Set(),cityBase.filter(r=>meses.includes(r.d.slice(0,7))),'lt');
 const base=S.view==='logins'||presenting?cityBase.filter(r=>svAllows(S.supervisors,r.lt)):cityBase;
 const ms=[...new Set(base.map(r=>r.d.slice(0,7)))].sort();
 const onlyMes=meses.length===1?meses[0]:null;
 const prev=onlyMes?ms.filter(m=>m<onlyMes).pop():null;
 const selectedBase=base.filter(r=>meses.includes(r.d.slice(0,7)));
 const last=selectedBase.map(r=>r.d).sort().pop();
 $('upd').textContent=(S.city?S.city+' · ':'')+(last?'Dados até: '+last.split('-').reverse().join('/'):'');
 const cur={},pv={};
 for(const f of['ND','MIG']){
  const a=base.filter(r=>r.f===f);
  cur[f]=stat(a.filter(r=>meses.includes(r.d.slice(0,7))));
  pv[f]=onlyMes?stat(a.filter(r=>r.d.startsWith(prev||'x'))):stat([]);
 }
 const mom=(c,p)=>{if(!onlyMes)return '';const d=c-p;return isFinite(d)?`<span class="mom ${d<0?'dn':'up'}">${modernTrendSvg(d<0?'down':d>0?'up':'flat',d<0?'good':d>0?'bad':'neutral')} ${pp(d)} vs. mês anterior</span>`:''};
 const K=(t,f,k,g)=>{const km=k==='pq'?meta[f]:k==='pb'?metaQuebra[f]:null;return qqKpi(t,cur[f],k,km,g,mom(cur[f][k],pv[f][k]));};
 $('kpis').innerHTML=K('%QUEBRA ND','ND','pb')+K('%QUEBRA MIGRAÇÃO','MIG','pb',1)+K('%QUALIFICADA ND','ND','pq')+K('%QUALIFICADA MIGRAÇÃO','MIG','pq',1);
 if(S.view!=='logins'||['PME','ME'].includes(S.f)){
  const frontRows=selectedBase.filter(r=>qqFrontMatches(r,S.f)),frontStats=stat(frontRows),count=new Set(frontRows.map(r=>r.lt).filter(Boolean)).size;
  const label=S.f==='MIG'?'MIGRAÇÃO':S.f,previous=pv[S.f],breakMom=previous?mom(frontStats.pb,previous.pb):'',qualifiedMom=previous?mom(frontStats.pq,previous.pq):'';
  $('kpis').innerHTML=qqKpi('%QUEBRA '+label,frontStats,'pb',metaQuebra[S.f],false,breakMom)+qqKpi('%QUALIFICADA '+label,frontStats,'pq',meta[S.f],true,qualifiedMom)+`<div class="kpi"><small>BASE · ${NM[S.f]}</small><b>${frontStats.n.toLocaleString('pt-BR')}</b><em>O.S. no período</em></div><div class="kpi"><small>TÉCNICOS / LOGINS</small><b>${count}</b><em>Na frente selecionada</em></div>`;
 }
 if(S.view==='logins'){drawLogins(cityBase,meses,meta,NM);return;}

 const f=S.f,color=QQ_FRONT_COLOR[f]||'var(--red)',am=base.filter(r=>qqFrontMatches(r,f)&&meses.includes(r.d.slice(0,7)));
 const dg=group(am,r=>r.d),dk=Object.keys(dg).sort(),dst=dk.map(d=>stat(dg[d])),mst=stat(am);
 const daysQ=dk.map((d,i)=>({d,l:meses.length>1?d.slice(8)+'/'+d.slice(5,7):+d.slice(8),v:dst[i].pq,t:dst[i].n+' OS'}));
 const daysB=dk.map((d,i)=>({d,l:meses.length>1?d.slice(8)+'/'+d.slice(5,7):+d.slice(8),v:dst[i].pb,t:dst[i].n+' OS'}));
 const wk=Object.entries(group(am.filter(r=>r.w),r=>meses.length>1?(r.d.slice(0,7)+'|'+r.w):r.w)).sort().map(([w,x])=>({w,s:stat(x)}));
 const weekItems=(key)=>wk.map(o=>{const p=String(o.w).split('|');return{l:p.length>1?`${p[0].slice(5,7)}/${p[0].slice(0,4)} S${p[1]}`:'Sem '+o.w,v:key==='q'?o.s.pq:o.s.pb,t:o.s.n+' OS'}});
 const catsD=CATS.filter(c=>mst.cat[c]).sort((x,y)=>mst.cat[y]-mst.cat[x]);
 const th=dk.map(d=>`<th>${d.slice(8)}/${d.slice(5,7)}</th>`).join('');
 const rowC=c=>{const dias=dst.map((st,i)=>{const val=st.cat[c]?st.cat[c]/st.n:0;return `<td class="cat-val ${val?'':'zero'}" data-cat="${c}" data-day="${dk[i]}">${pct(val)}</td>`}).join('');const valMes=mst.cat[c]?mst.cat[c]/mst.n:0;return `<tr><td class="cat-link" data-cat="${c}" data-day="*">${c}</td>${dias}<td class="cat-val ${valMes?'':'zero'}" data-cat="${c}" data-day="*"><b>${pct(valMes)}</b></td></tr>`};
 const rowT=(n,k)=>`<tr class="tot"><td>${n}</td>${dst.map(st=>`<td>${pct(st[k])}</td>`).join('')}<td>${pct(mst[k])}</td></tr>`;
 const rowN=`<tr><td>Total de OS</td>${dst.map(st=>`<td>${st.n}</td>`).join('')}<td><b>${mst.n}</b></td></tr>`;
 const periodLabel=meses.length===1?meses[0]:meses.map(m=>m.slice(5,7)+'/'+m.slice(0,4)).join(', ');
 const weekRows=wk.map(o=>{const p=String(o.w).split('|'),wl=p.length>1?`${p[0].slice(5,7)}/${p[0].slice(0,4)} · S${p[1]}`:`Semana ${o.w}`;return `<tr><td>${wl}</td><td>${o.s.n}</td><td>${pct(o.s.pb)}</td><td>${pct(o.s.pq)}</td></tr>`}).join('')||'<tr><td colspan="4">Sem dados</td></tr>';
 $('view').innerHTML=`<div class="pres-grid">
  <div class="card pres-combo-card">
   <h3>EVOLUÇÃO DIÁRIA – ${NM[f].toUpperCase()} <span class="pres-sub">%Qualificada e %Quebra na mesma tela</span></h3>
   <div class="pres-combo-body">
    <div class="pres-panel chart-card daily-chart" data-qq-chart="daily:q"><div class="mini-title">%QUALIFICADA <span class="pres-sub">meta ${meta[f]!=null?pct(meta[f],2):'não definida'}</span></div>${bars(daysQ,color,meta[f],false,NM[f]+' · %Qualificada')}</div>
    <div class="pres-panel chart-card daily-chart" data-qq-chart="daily:b"><div class="mini-title">%QUEBRA <span class="pres-sub">meta ${pct(metaQuebra[f],2)}</span></div>${bars(daysB,color,metaQuebra[f],false,NM[f]+' · %Quebra')}</div>
   </div>
  </div>
  <div class="card pres-combo-card">
   <h3>RESUMO SEMANAL – ${NM[f].toUpperCase()}</h3>
   <div class="pres-combo-body three">
    <div class="pres-panel chart-card week-chart" data-qq-chart="weekly:q"><div class="mini-title">%QUALIFICADA</div>${barsWeekly(weekItems('q'),color,meta[f],NM[f]+' · %Qualificada')}</div>
    <div class="pres-panel chart-card week-chart" data-qq-chart="weekly:b"><div class="mini-title">%QUEBRA <span class="pres-sub">meta ${pct(metaQuebra[f],2)}</span></div>${barsWeekly(weekItems('b'),color,metaQuebra[f],NM[f]+' · %Quebra')}</div>
    <div class="pres-panel week-table"><div class="mini-title">SEMANAS – ${NM[f].toUpperCase()}</div><table><tr><th>Semana</th><th>OS</th><th>%Quebra</th><th>%Qualif.</th></tr>${weekRows}</table></div>
   </div>
  </div>
  <div class="card detail-card"><h3>DETALHAMENTO DIÁRIO – %QUALIFICADA ${NM[f].toUpperCase()} POR CATEGORIA <span class="pres-sub">${S.city||'Todas as cidades'} · ${periodLabel}</span></h3>
   <div class="detail-scroll"><table class="detail-table"><tr><th>Categoria</th>${th}<th>${meses.length>1?'Período':'Mês'}</th></tr>${catsD.map(rowC).join('')||'<tr><td colspan="99">Sem categorias no período</td></tr>'}${rowT('%Quebra','pb')}${rowN}</table></div>
   <div class="note">Clique no nome de uma categoria ou em um percentual para abrir os logins/técnicos que formaram o resultado. Dias sem ocorrência aparecem como 0,00%.</div>
  </div>
 </div>`;
 wireQQChartDrilldown($('view'),{records:am,days:dk,weeks:wk.map(item=>item.w),months:meses,front:NM[f]},(records,label,metric)=>qqOpenGeneralRecords(records,label,'offenders',metric));
 document.querySelectorAll('[data-cat][data-day]').forEach(el=>el.onclick=()=>{const cat=el.dataset.cat,day=el.dataset.day;const recs=day==='*'?am:am.filter(r=>r.d===day);const periodo=day==='*'?`Período ${periodLabel}`:day.split('-').reverse().join('/');openCategoryModal(cat,recs,periodo,NM[f])});
};
const pf=$('btnPresentationFilters');if(pf)pf.onclick=()=>document.body.classList.toggle('present-filters-open');
const fsBtn=$('btnFullscreen');if(fsBtn)fsBtn.onclick=async()=>{try{if(!document.fullscreenElement){await document.documentElement.requestFullscreen();fsBtn.textContent='Sair da apresentação';}else{await document.exitFullscreen();fsBtn.textContent='Modo apresentação';}}catch(e){}};
document.addEventListener('fullscreenchange',()=>{const b=$('btnFullscreen');if(b)b.textContent=document.fullscreenElement?'Sair da apresentação':'Modo apresentação'});
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.body.classList.remove('present-filters-open')});
window.setUnifiedPresentation=function(on){document.body.classList.add('unified-embed');document.body.classList.toggle('presentation-mode',!!on);document.body.classList.remove('present-filters-open');draw();};

function getMulti(id){
 return [...document.querySelectorAll(`#${id} input[data-val]:checked`)].map(x=>x.dataset.val);
}
function updateMultiLabel(id){
 const el=$(id),vals=getMulti(id),all=[...el.querySelectorAll('input[data-val]')].map(x=>x.dataset.val);
 const txt=el.querySelector('.multi-text'),count=el.querySelector('.multi-count');
 if(!txt)return;
 if(!vals.length){txt.textContent='Nenhum';count.textContent='0';return}
 if(vals.length===all.length){txt.textContent='Todos';count.textContent=String(vals.length);return}
 if(vals.length===1){txt.textContent=vals[0];count.textContent='1';return}
 txt.textContent=`${vals.length} selecionados`;count.textContent=String(vals.length);
}
function buildMulti(id,vals,defaults,keep){
 const el=$(id);
 const old=keep?getMulti(id):[];
 let selected=old.filter(v=>vals.includes(v));
 if(!selected.length)selected=(defaults||[]).filter(v=>vals.includes(v));
 if(!selected.length&&vals.length)selected=[...vals];

 const items=vals.map(v=>`<label class="multi-item"><input type="checkbox" data-val="${v}" ${selected.includes(v)?'checked':''}><span>${v}</span></label>`).join('');
 el.innerHTML=`<button type="button" class="multi-btn"><span class="multi-text">Todos</span><span style="display:flex;align-items:center;gap:6px"><small class="multi-count"></small><span>▾</span></span></button>
 <div class="multi-menu">
  <label class="multi-item"><input type="checkbox" class="multi-all"><b>Selecionar todos</b></label>
  <div class="multi-sep"></div>${items||'<div class="note">Sem opções</div>'}
 </div>`;

 const btn=el.querySelector('.multi-btn'),allBox=el.querySelector('.multi-all');
 const boxes=[...el.querySelectorAll('input[data-val]')];
 const syncAll=()=>{
  allBox.checked=boxes.length>0&&boxes.every(x=>x.checked);
  allBox.indeterminate=boxes.some(x=>x.checked)&&!allBox.checked;
  updateMultiLabel(id);
 };
 btn.onclick=e=>{
  e.stopPropagation();
  document.querySelectorAll('.multi.open').forEach(m=>{if(m!==el)m.classList.remove('open')});
  el.classList.toggle('open');
 };
 el.querySelector('.multi-menu').onclick=e=>e.stopPropagation();
 allBox.onchange=()=>{
  boxes.forEach(x=>x.checked=allBox.checked);
  if(!boxes.some(x=>x.checked))boxes.forEach(x=>x.checked=true);
  syncAll();draw();
 };
 boxes.forEach(box=>box.onchange=()=>{
  if(!boxes.some(x=>x.checked))box.checked=true;
  syncAll();draw();
 });
 syncAll();
}
document.addEventListener('click',()=>document.querySelectorAll('.multi.open').forEach(m=>m.classList.remove('open')));

function init(reset){
 const cl=[...new Set(RECS.map(r=>r.cl))].sort(),
       un=qqUnitOptions(),
       ms=[...new Set(RECS.map(r=>r.d.slice(0,7)))].sort();
 const defCl=[...cl];
 const defUn=[...un];
 const defMes=ms.length?[ms[ms.length-1]]:[];
 buildMulti('fCl',cl,defCl,!reset);
 buildMulti('fUn',un,defUn,!reset);
 buildMulti('fMes',ms,defMes,!reset);
 draw()
}
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{
 if(t.dataset.view==='logins'){
  S.view='logins';
 }else{
  S.view='front';
  S.f=t.dataset.f;
 }
 draw();
});
function bars(items,color,meta,loginDaily=false,frontChart=''){
 if(!items.length)return'<div class="empty">Sem dados</div>';
 const compact=items.length<=6,W=compact?520:1000,H=compact?145:240,t=compact?22:28,b=compact?22:26,mx=Math.max(...items.map(i=>i.v),meta||0,.01)*1.18,bw=(W-20)/items.length,y=v=>H-b-(H-t-b)*v/mx;
 let s=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" font-size="${compact?15:12}" fill="#555">`;
 items.forEach((i,k)=>{
  const x=10+k*bw+bw*.22,h=H-b-y(i.v),ok=meta!=null&&i.v<=meta;
  const fill=ok?'var(--ok)':color;
  const txt=ok?'var(--ok)':'#555';
  if(frontChart)s+=qqChartPointMarkup(k,frontChart+' · '+(i.d?i.d.split('-').reverse().join('/'):i.l)+': '+pct(i.v,2),{x:10+k*bw+bw*.08,width:bw*.84,height:H});
  if(loginDaily)s+=`<g class="qq-daily-bar" data-login-day="${qqEscape(i.d)}" tabindex="0" role="button" aria-label="${qqEscape(i.d.split('-').reverse().join('/'))}: ${pct(i.v,2)}. Ver logins ofensores." style="cursor:pointer"><title>${i.l}: ${pct(i.v)} (${qqEscape(i.t)}). Clique para ver os logins ofensores.</title><rect x="${10+k*bw+bw*.08}" y="${Math.min(y(i.v),H-b-14)}" width="${bw*.84}" height="${H-4-Math.min(y(i.v),H-b-14)}" fill="transparent"/>`;
  s+=`<rect x="${x}" y="${y(i.v)}" width="${bw*.56}" height="${Math.max(h,0)}" fill="${fill}"><title>${i.l}: ${pct(i.v)} (${i.t})</title></rect>
  <text x="${x+bw*.28}" y="${y(i.v)-5}" text-anchor="middle" fill="${txt}" font-weight="${ok?'700':'400'}">${pct(i.v,2)}</text><text x="${x+bw*.28}" y="${H-8}" text-anchor="middle" fill="#555">${i.l}</text>`;
  if(loginDaily||frontChart)s+='</g>';
 });
 if(meta!=null)s+=qqMetaGuide(W,y(meta),meta);
 return s+'</svg>'}
function barsWeekly(items,color,meta,frontChart=''){
 if(!items.length)return'<div class="empty">Sem dados</div>';
 const W=520,H=140,t=26,b=24,mx=Math.max(...items.map(i=>i.v),meta||0,.01)*1.16,bw=(W-18)/items.length,y=v=>H-b-(H-t-b)*v/mx;
 let s=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" font-size="14" fill="#555">`;
 items.forEach((i,k)=>{const x=9+k*bw+bw*.20,h=H-b-y(i.v),ok=meta!=null&&i.v<=meta,fill=ok?'var(--ok)':color,txt=ok?'var(--ok)':'#555';if(frontChart)s+=qqChartPointMarkup(k,frontChart+' · '+i.l+': '+pct(i.v,2),{x:9+k*bw+bw*.08,width:bw*.84,height:H});s+=`<rect x="${x}" y="${y(i.v)}" width="${bw*.60}" height="${Math.max(h,0)}" fill="${fill}"><title>${i.l}: ${pct(i.v)} (${i.t})</title></rect><text x="${x+bw*.30}" y="${y(i.v)-5}" text-anchor="middle" fill="${txt}" font-size="14" font-weight="700">${pct(i.v,2)}</text><text x="${x+bw*.30}" y="${H-7}" text-anchor="middle" fill="#555" font-size="12">${i.l}</text>`;if(frontChart)s+='</g>';});
 if(meta!=null)s+=qqMetaGuide(W,y(meta),meta);
 return s+'</svg>'}

function drawLogins(base,meses,meta,NM){
 const f=S.f,color=QQ_FRONT_COLOR[f]||'var(--red)',key=S.ind;
 const lab=key==='q'?'%QUALIFICADA':'%QUEBRA';
 const am=base.filter(r=>qqFrontMatches(r,f)&&meses.includes(r.d.slice(0,7)));
 const mt=key==='q'?meta[f]:QQ_BREAK_GOAL[f];
 const val=s=>key==='q'?s.pq:s.pb;

 if(!am.length){
  $('view').innerHTML=`<div class="card empty"><h3>LOGINS</h3>Sem dados de ${NM[f]} para o período selecionado.</div>`;
  return;
 }

 const dates=[...new Set(am.map(r=>r.d))].sort();
 const periodLabel=meses.length===1
  ? meses[0].slice(5,7)+'/'+meses[0].slice(0,4)
  : meses.map(m=>m.slice(5,7)+'/'+m.slice(0,4)).join(', ');
 const grouped=group(am,r=>r.lt);
 const rows=Object.entries(grouped).map(([login,recs])=>{
  const monthStat=stat(recs);
  const byDay=group(recs,r=>r.d);
  const active=dates.filter(d=>byDay[d]?.length).map(d=>({d,s:stat(byDay[d])}));
  const first=active.length?val(active[0].s):NaN;
  const last=active.length?val(active[active.length-1].s):NaN;
  return{
   login,
   name:techName(login),
   recs,
   month:monthStat,
   byDay,
   monthVal:val(monthStat),
   first,
   last,
   delta:(isFinite(first)&&isFinite(last))?last-first:NaN
  };
 });

 // Ofensores primeiro; "(sem login)" vai para o fim.
 rows.sort((a,b)=>{
  if(a.login==='(sem login)'&&b.login!=='(sem login)')return 1;
  if(b.login==='(sem login)'&&a.login!=='(sem login)')return -1;
  const av=isFinite(a.monthVal)?a.monthVal:-1,bv=isFinite(b.monthVal)?b.monthVal:-1;
  return bv-av||b.month.n-a.month.n||a.login.localeCompare(b.login);
 });

 const loginQuery=norm(S.loginSearch||'');
 const visibleRows=loginQuery
  ? rows.filter(r=>norm(r.login+' '+r.name).includes(loginQuery))
  : rows;

 // Com pesquisa ativa, nunca troca silenciosamente para outro técnico.
 // Mantém o mesmo login se ele existir na nova Frente/Indicador.
 if(loginQuery){
  if(!visibleRows.some(r=>r.login===S.login)){
   const exact=visibleRows.find(r=>norm(r.login)===loginQuery||norm(r.name)===loginQuery);
   S.login=(exact||visibleRows[0]||{}).login||null;
  }
 }else if(!S.login || !rows.some(r=>r.login===S.login)){
  S.login=rows[0]?.login||null;
 }
 const selected=rows.find(r=>r.login===S.login)||null;

 const rateClass=v=>{
  if(!isFinite(v))return 'rate-neutral';
  if(key==='q'&&mt!=null)return v<=mt?'rate-ok':'rate-bad';
  return 'rate-neutral';
 };
 const affected=s=>key==='q'?s.q:s.b;
 const affectedLabel=s=>{
  const n=affected(s);
  if(!isFinite(n))return '0';
  return Math.abs(n-Math.round(n))<1e-9
   ? String(Math.round(n))
   : n.toFixed(2).replace('.',',');
 };
 const deltaHtml=d=>{
  if(!isFinite(d))return '–';
  if(Math.abs(d)<0.00005)return `<span class="delta-flat">0,00 p.p.</span>`;
  // Como menor é melhor, queda é evolução positiva.
  const cls=d<0?'delta-good':'delta-bad';
  const arrow=d<0?'↓':'↑';
  return `<span class="${cls}">${modernTrendSvg(d<0?'down':'up',d<0?'good':'bad')} ${Math.abs(d*100).toFixed(2).replace('.',',')} p.p.</span>`;
 };

 const thDays=dates.map(d=>`<th>${d.slice(8)}/${d.slice(5,7)}</th>`).join('');
 const matrixRows=visibleRows.map((r,index)=>{
  const cells=dates.map(d=>{
   const recs=r.byDay[d];
   if(!recs||!recs.length)return `<td class="day-cell rate-neutral">–</td>`;
   const s=stat(recs),x=val(s);
   return `<td class="day-cell qq-matrix-detail ${rateClass(x)}" data-matrix-login="${index}" data-matrix-day="${d}" tabindex="0" role="button" aria-label="Ver detalhes de ${qqEscape(r.login)} em ${d.split('-').reverse().join('/')}" title="${affectedLabel(s)} afetada(s) em ${s.n} OS. Clique para ver os detalhes.">
    <span class="day-rate">${pct(x,2)}</span>
    <span class="day-base">${affectedLabel(s)} / ${s.n} OS</span>
   </td>`;
  }).join('');
  return `<tr data-login-row="${r.login}" class="${r.login===S.login?'selected':''}">
   <td class="login-name-cell">
    <div class="login-code">${r.login}</div>
    <div class="login-person">${r.name}</div>
    <button type="button" class="qq-matrix-login-detail" data-matrix-login="${index}" data-matrix-day="*" aria-label="Ver O.S. de ${qqEscape(r.login)} no período">Ver detalhes</button>
   </td>
   ${cells}
   <td class="month-cell qq-matrix-detail ${rateClass(r.monthVal)}" data-matrix-login="${index}" data-matrix-day="*" tabindex="0" role="button" aria-label="Ver detalhes de ${qqEscape(r.login)} no período" title="Clique para ver as O.S. do período">${pct(r.monthVal,2)}</td>
   <td class="affected-cell">${affectedLabel(r.month)}</td>
   <td class="os-cell">${r.month.n}</td>
   <td class="delta-cell">${deltaHtml(r.delta)}</td>
  </tr>`;
 }).join('');

 const selectedDays=selected
  ? Object.entries(group(selected.recs,r=>r.d)).sort().map(([d,x])=>{
      const s=stat(x);
      return{d,l:meses.length>1?d.slice(8)+'/'+d.slice(5,7):+d.slice(8),v:val(s),t:`${affectedLabel(s)} afetada(s) / ${s.n} OS`};
    })
  : [];

 const selectedTitle=selected
  ? `<div class="login-detail-ident"><b>${selected.login}</b><span>${selected.name}</span></div>`
  : '';

 const totalLogin=rows.filter(r=>r.login!=='(sem login)').length;
 const overall=stat(am);
 const aboveMeta=key==='q'&&mt!=null
  ? rows.filter(r=>isFinite(r.monthVal)&&r.monthVal>mt&&r.login!=='(sem login)').length
  : null;

 $('view').innerHTML=`
  <div class="card">
   <div class="login-toolbar">
    <div class="login-toolbar-left">
     <div class="login-tool">
      <span class="login-tool-label">Frente</span>
      <div class="tg" id="loginFront">
       <button data-lf="ND" class="${f==='ND'?'on':''}">Novos Domicílios</button>
       <button data-lf="MIG" class="${f==='MIG'?'on':''}">Migração</button>
       <button data-lf="PME" class="${f==='PME'?'on':''}">PME</button>
       <button data-lf="ME" class="${f==='ME'?'on':''}">ME</button>
      </div>
     </div>
     <div class="login-tool">
      <span class="login-tool-label">Indicador</span>
      <div class="tg" id="loginIndicator">
       <button data-li="q" class="${key==='q'?'on':''}">%Qualificada</button>
       <button data-li="b" class="${key==='b'?'on':''}">%Quebra</button>
      </div>
     </div>
    </div>
    <input id="loginSearch" class="login-search" type="search" value="${String(S.loginSearch||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}" placeholder="Pesquisar login ou nome..." autocomplete="off">
   </div>
   <div class="login-summary">
    <div class="mini"><small>Logins no período</small><b>${totalLogin}</b></div>
    <div class="mini"><small>Base da frente</small><b>${overall.n} OS</b></div>
    <div class="mini"><small>${lab} geral</small><b>${pct(val(overall),2)}</b></div>
    <div class="mini"><small>${key==='q'&&mt!=null?'Acima da meta':'Login selecionado'}</small><b>${key==='q'&&mt!=null?aboveMeta:(selected?selected.login:'–')}</b></div>
   </div>
  </div>

  <div class="card">
   <div class="login-detail-head">
    <div>
     <h3 style="margin-bottom:4px">EVOLUÇÃO DIÁRIA DO LOGIN — ${lab} ${NM[f].toUpperCase()}</h3>
     ${selectedTitle}
    </div>
    <div class="note">${selected?`Período ${periodLabel}: <b>${pct(selected.monthVal,2)}</b> · <b>${affectedLabel(selected.month)}</b> afetada(s) em <b>${selected.month.n}</b> OS · evolução início→fim: ${deltaHtml(selected.delta)}`:''}</div>
   </div>
   ${selected?bars(selectedDays,color,mt,key==='q'):`<div class="empty">${S.loginSearch?'O login pesquisado não possui dados nesta Frente/Indicador para o período selecionado.':'Nenhum login disponível.'}</div>`}
   <div class="note">${mt!=null?'Verde = dentro da meta. ':''}${key==='q'?'Clique em uma barra para ver os logins ofensores e os detalhes das O.S. ':''}Clique em outro login na tabela abaixo para trocar o gráfico.</div>
  </div>

  <div class="card">
   <h3>LOGINS | EVOLUÇÃO DIÁRIA NO PERÍODO</h3>
   <div class="login-click-note">Clique no <b>percentual diário</b> para ver as O.S. daquele login no dia. Clique em <b>Período</b> ou <b>Ver detalhes</b> para consultar as O.S. de todo o período selecionado. Cada célula diária mostra o percentual e, logo abaixo, <b>afetadas / total de OS</b>. Ex.: 33,3% com “1 / 3 OS” significa 1 OS afetada em uma base de 3 OS naquele dia. “Δ início→fim” compara o primeiro com o último dia ativo do login.</div>
   <div class="login-matrix-wrap" style="margin-top:10px">
    <table class="login-matrix">
     <thead><tr><th>Login / Nome</th>${thDays}<th>Período</th><th>Afetadas</th><th>OS</th><th>Δ início→fim</th></tr></thead>
     <tbody>${matrixRows||`<tr><td colspan="${dates.length+5}" style="padding:28px;text-align:center;color:var(--mut)">Nenhum login encontrado para “${String(S.loginSearch||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}”.</td></tr>`}</tbody>
    </table>
   </div>
  </div>`;

 document.querySelectorAll('[data-login-day]').forEach(bar=>{
  bar.onclick=()=>qqOpenDailyOffenders(selected.byDay[bar.dataset.loginDay]||[],bar.dataset.loginDay,NM[f]);
  bar.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();bar.onclick()}};
 });
 document.querySelectorAll('#loginFront button[data-lf]').forEach(b=>b.onclick=()=>{
  S.f=b.dataset.lf;
  draw();
 });
 document.querySelectorAll('#loginIndicator button[data-li]').forEach(b=>b.onclick=()=>{
  S.ind=b.dataset.li;
  draw();
 });
 document.querySelectorAll('[data-login-row]').forEach(tr=>tr.onclick=()=>{
  S.login=tr.dataset.loginRow;
  draw();
 });
 document.querySelectorAll('[data-matrix-login]').forEach(cell=>{
  cell.onclick=e=>{
   e.stopPropagation();
   const row=visibleRows[Number(cell.dataset.matrixLogin)],day=cell.dataset.matrixDay;
   const records=day==='*'?row.recs:row.byDay[day],s=stat(records);
   const period=day==='*'?'Período '+periodLabel:day.split('-').reverse().join('/');
   qqOpenOrders(row.login,records,null,`${NM[f]} · ${period} · ${lab}: ${pct(val(s),2)} · ${affectedLabel(s)} afetada(s) / ${s.n} OS`);
  };
  cell.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();cell.click()}};
 });
 const search=$('loginSearch');
 if(search){
  search.oninput=()=>{
   S.loginSearch=search.value;
   const q=norm(S.loginSearch);
   const pos=search.selectionStart??search.value.length;

   // Recalcula a lista inteira a cada alteração da busca.
   // Assim, ao apagar o texto, todos os logins voltam imediatamente.
   const allLoginRows=rows;
   const matches=q
    ? allLoginRows.filter(r=>norm(r.login+' '+r.name).includes(q))
    : allLoginRows;

   if(q){
    const exact=matches.find(r=>norm(r.login)===q||norm(r.name)===q);
    if(exact)S.login=exact.login;
    else if(matches.length&&!matches.some(r=>r.login===S.login))S.login=matches[0].login;
    else if(!matches.length)S.login=null;
   }
   // Com a busca vazia, mantém o técnico atual no gráfico,
   // mas a tabela abaixo volta a mostrar todos os logins.
   draw();

   const s2=$('loginSearch');
   if(s2){
    s2.focus();
    try{s2.setSelectionRange(pos,pos)}catch(e){}
   }
  };
 }
}

function draw(){
 const uns=getMulti('fUn'),cls=getMulti('fCl'),meses=getMulti('fMes').sort();
 const periodLabel=meses.length===1
  ? meses[0]
  : meses.map(m=>m.slice(5,7)+'/'+m.slice(0,4)).join(', ');
 document.querySelectorAll('.tab').forEach(t=>{
  const active=t.dataset.view==='logins'
   ? S.view==='logins'
   : S.view!=='logins'&&t.dataset.f===S.f;
  t.classList.toggle('on',active);
 });
 if(!RECS.length||!meses.length){$('kpis').innerHTML='';$('upd').textContent='';$('view').innerHTML='<div class="card empty"><h3>Nenhum dado carregado</h3>Importe a planilha QUALIFICADA_DMV (.xlsx) no painel à esquerda.</div>';return}
 const base=RECS.filter(r=>uns.includes(r.un)&&cls.includes(r.cl));
 const meta=QQ_QUALIFIED_GOAL,metaQuebra=QQ_BREAK_GOAL,NM={ND:'Novos Domicílios',MIG:'Migração',PME:'PME',ME:'Mudança de Endereço'};
 const ms=[...new Set(base.map(r=>r.d.slice(0,7)))].sort();
 const onlyMes=meses.length===1?meses[0]:null;
 const prev=onlyMes?ms.filter(m=>m<onlyMes).pop():null;
 const selectedBase=base.filter(r=>meses.includes(r.d.slice(0,7)));
 const last=selectedBase.map(r=>r.d).sort().pop();
 $('upd').textContent=last?'Dados até: '+last.split('-').reverse().join('/'):'';
 const cur={},pv={};
 for(const f of['ND','MIG']){
  const a=base.filter(r=>r.f===f);
  cur[f]=stat(a.filter(r=>meses.includes(r.d.slice(0,7))));
  pv[f]=onlyMes?stat(a.filter(r=>r.d.startsWith(prev||'x'))):stat([]);
 }
 const mom=(c,p)=>{if(!onlyMes)return '';const d=c-p;return isFinite(d)?`<span class="mom ${d<0?'dn':'up'}">${modernTrendSvg(d<0?'down':d>0?'up':'flat',d<0?'good':d>0?'bad':'neutral')} ${pp(d)} vs. mês anterior</span>`:''};
 const K=(t,f,k,g)=>{const km=k==='pq'?meta[f]:k==='pb'?metaQuebra[f]:null;return qqKpi(t,cur[f],k,km,g,mom(cur[f][k],pv[f][k]));};
 $('kpis').innerHTML=K('%QUEBRA ND','ND','pb')+K('%QUEBRA MIGRAÇÃO','MIG','pb',1)+K('%QUALIFICADA ND','ND','pq')+K('%QUALIFICADA MIGRAÇÃO','MIG','pq',1);
 if(S.view!=='logins'||['PME','ME'].includes(S.f)){
  const frontRows=selectedBase.filter(r=>qqFrontMatches(r,S.f)),frontStats=stat(frontRows),count=new Set(frontRows.map(r=>r.lt).filter(Boolean)).size;
  const label=S.f==='MIG'?'MIGRAÇÃO':S.f,previous=pv[S.f],breakMom=previous?mom(frontStats.pb,previous.pb):'',qualifiedMom=previous?mom(frontStats.pq,previous.pq):'';
  $('kpis').innerHTML=qqKpi('%QUEBRA '+label,frontStats,'pb',metaQuebra[S.f],false,breakMom)+qqKpi('%QUALIFICADA '+label,frontStats,'pq',meta[S.f],true,qualifiedMom)+`<div class="kpi"><small>BASE · ${NM[S.f]}</small><b>${frontStats.n.toLocaleString('pt-BR')}</b><em>O.S. no período</em></div><div class="kpi"><small>TÉCNICOS / LOGINS</small><b>${count}</b><em>Na frente selecionada</em></div>`;
 }
 if(S.view==='logins'){
  drawLogins(base,meses,meta,NM);
  return;
 }
 const f=S.f,color=QQ_FRONT_COLOR[f]||'var(--red)',a=base.filter(r=>r.f===f),am=a.filter(r=>meses.includes(r.d.slice(0,7)));
 const key=S.ind,lab=key==='q'?'%QUALIFICADA':'%QUEBRA',v=s=>key==='q'?s.pq:s.pb,mt=key==='q'?meta[f]:metaQuebra[f];
 const days=Object.entries(group(am,r=>r.d)).sort().map(([d,x])=>{const s=stat(x);return{l:meses.length>1?d.slice(8)+'/'+d.slice(5,7):+d.slice(8),v:v(s),t:s.n+' OS'}});
 const wk=Object.entries(group(am.filter(r=>r.w),r=>meses.length>1?(r.d.slice(0,7)+'|'+r.w):r.w)).sort().map(([w,x])=>({w,s:stat(x)}));
 const wkI=wk.map(o=>{
  const p=String(o.w).split('|');
  return{l:p.length>1?`${p[0].slice(5,7)}/${p[0].slice(0,4)} S${p[1]}`:'Sem '+o.w,v:v(o.s),t:o.s.n+' OS'}
 });
 const dg=group(am,r=>r.d),dk=Object.keys(dg).sort(),dst=dk.map(d=>stat(dg[d])),mst=stat(am);
 const catsD=CATS.filter(c=>mst.cat[c]).sort((x,y)=>mst.cat[y]-mst.cat[x]);
 const th=dk.map(d=>`<th>${d.slice(8)}/${d.slice(5,7)}</th>`).join('');
 const rowC=c=>{
  const dias=dst.map((s,i)=>{
   const val=s.cat[c]?s.cat[c]/s.n:0;
   return `<td class="cat-val ${val?'':'zero'}" data-cat="${c}" data-day="${dk[i]}" title="Ver técnicos de ${c} em ${dk[i].split('-').reverse().join('/')}">${pct(val)}</td>`;
  }).join('');
  const valMes=mst.cat[c]?mst.cat[c]/mst.n:0;
  return `<tr><td class="cat-link" data-cat="${c}" data-day="*" title="Ver técnicos de ${c} no mês">${c}</td>${dias}<td class="cat-val ${valMes?'':'zero'}" data-cat="${c}" data-day="*" title="Ver técnicos de ${c} no mês"><b>${pct(valMes)}</b></td></tr>`;
 };
 const rowT=(n,k)=>`<tr class="tot"><td>${n}</td>${dst.map(s=>`<td>${pct(s[k])}</td>`).join('')}<td>${pct(mst[k])}</td></tr>`;
 const rowN=`<tr><td>Total de OS</td>${dst.map(s=>`<td>${s.n}</td>`).join('')}<td><b>${mst.n}</b></td></tr>`;
 /* ofensores: ranking exclusivamente por LOGIN_TEC (col J) */
 const lgs=Object.entries(group(am,r=>r.lt)).map(([l,x])=>({l,s:stat(x)}));
 const mval=o=>key==='q'?o.s.q:o.s.b,tt=key==='q'?mst.q:mst.b;
 lgs.sort((x,y)=>mval(y)-mval(x)||y.s.n-x.s.n);
 const top=lgs.filter(o=>mval(o)>0).slice(0,20),mxv=top.length?mval(top[0]):1;
 const topCat=o=>{const e=Object.entries(o.s.cat).filter(([k])=>k!=='Outros').sort((x,y)=>y[1]-x[1])[0];return e?e[0]:'–'};
 const makeOffRows=(arr,startIndex)=>arr.map((o,j)=>{
  const i=startIndex+j,share=(mval(o)/mxv*100).toFixed(0);
  return `<tr><td>${i+1}º</td><td class="login-cell" title="${o.l} · ${techName(o.l)}"><b>${o.l}</b><div style="color:var(--mut);margin-top:2px">${techName(o.l)}</div></td><td>${o.s.n}</td><td>${Number.isInteger(o.s.q)?o.s.q:o.s.q.toFixed(2).replace('.',',')}</td><td>${pct(o.s.pq)}</td><td>${o.s.b}</td><td>${pct(o.s.pb)}</td>
  <td class="share-cell"><div class="share-wrap"><div class="share-track"><div class="share-fill" style="background:${color};opacity:${i?.62:1};width:${share}%"></div></div><span class="share-value">${pct(tt?mval(o)/tt:NaN,2)}</span></div></td>${key==='q'?`<td class="cat-cell" title="${topCat(o)}">${topCat(o)}</td>`:''}</tr>`;
 }).join('');
 const offRows1=makeOffRows(top.slice(0,10),0);
 const offRows2=makeOffRows(top.slice(10,20),10);
 const worst=top[0];
$('view').innerHTML=`
 <div class="card"><div class="row"><h3>${lab} ${NM[f].toUpperCase()} | EVOLUÇÃO DIÁRIA</h3>
  <div class="tg"><button data-i="q" class="${key==='q'?'on':''}">%Qualificada</button><button data-i="b" class="${key==='b'?'on':''}">%Quebra</button></div></div>
  ${bars(days,color,mt)}<div class="note">${mt!=null?'Barras verdes = dentro da meta (menor ou igual à meta). ':''}Base diária: DAT_AGENDA; dias sem OS não aparecem.</div></div>
 <div class="two"><div class="card"><h3>${lab} | EVOLUÇÃO SEMANAL</h3>${bars(wkI,color,mt)}</div>
 <div class="card"><h3>SEMANAS – ${NM[f].toUpperCase()}</h3><table><tr><th>Semana</th><th>OS</th><th>Quebras</th><th>%Quebra</th><th>Qualif.</th><th>%Qualif.</th></tr>
  ${wk.map(o=>{const p=String(o.w).split('|'),wl=p.length>1?`${p[0].slice(5,7)}/${p[0].slice(0,4)} · Semana ${p[1]}`:`Semana ${o.w}`;return `<tr><td>${wl}</td><td>${o.s.n}</td><td>${o.s.b}</td><td>${pct(o.s.pb)}</td><td>${o.s.q}</td><td>${pct(o.s.pq)}</td></tr>`}).join('')||'<tr><td colspan=6>Sem dados</td></tr>'}</table></div></div>
 <div class="card"><h3>DETALHAMENTO DIÁRIO – %QUALIFICADA ${NM[f].toUpperCase()} POR CATEGORIA</h3><div style="overflow-x:auto"><table class="detail-table">
  <tr><th>Categoria</th>${th}<th>${meses.length>1?'Período':'Mês'}</th></tr>
  ${catsD.map(rowC).join('')||'<tr><td colspan="99">Sem categorias no período</td></tr>'}${rowT('%Quebra','pb')}${rowN}</table></div>
  <div class="note"><b>Clique no nome de uma categoria, em um percentual diário ou no valor do período</b> para abrir os logins/técnicos que formaram aquele resultado. Dias sem ocorrência aparecem como 0,00%. UN: ${uns.length===1?uns[0]:uns.length+' selecionadas'}. CLUSTER: ${cls.length===1?cls[0]:cls.length+' selecionados'}. Período: ${periodLabel}.</div></div>
 <div class="card"><div class="row"><h3>LOGIN MAIS OFENSOR – ${lab} ${NM[f].toUpperCase()}</h3><span class="note">LOGIN_TEC</span></div>
  ${worst?`<p style="margin:4px 0 10px"><b style="color:var(--red)">${worst.l}</b> · ${techName(worst.l)} é o maior ofensor: ${mval(worst)} ${key==='q'?'OS qualificadas':'OS com quebra'} (${pct(mval(worst)/tt,2)} do total) em ${worst.s.n} OS.</p>`:''}
  ${top.length?`<div class="off-grid">
   <div class="off-half">
    <table class="off-table"><tr><th>#</th><th>Login / Nome</th><th>OS</th><th>Qualif.</th><th>%Qualif.</th><th>Quebras</th><th>%Quebra</th><th>% total</th>${key==='q'?'<th>Categoria</th>':''}</tr>
     ${offRows1}
    </table>
   </div>
   <div class="off-half">
    <table class="off-table"><tr><th>#</th><th>Login / Nome</th><th>OS</th><th>Qualif.</th><th>%Qualif.</th><th>Quebras</th><th>%Quebra</th><th>% total</th>${key==='q'?'<th>Categoria</th>':''}</tr>
     ${offRows2||`<tr><td colspan="${key==='q'?9:8}" style="text-align:center;color:var(--mut)">—</td></tr>`}
    </table>
   </div>
  </div>`:`<div class="empty" style="padding:24px">Sem ocorrências no período</div>`}
  <div class="note">Ranking exclusivamente por LOGIN_TEC, por quantidade de ${key==='q'?'OS qualificadas':'OS com quebra'} (segue o botão %Qualificada/%Quebra acima), top 20, ${NM[f]}, período, UN e CLUSTER filtrados. %Qualif./%Quebra = taxa do próprio técnico sobre as OS dele.</div></div>`;
 document.querySelectorAll('.tg button[data-i]').forEach(b=>b.onclick=()=>{S.ind=b.dataset.i;draw()});
 document.querySelectorAll('[data-cat][data-day]').forEach(el=>el.onclick=()=>{
  const cat=el.dataset.cat,day=el.dataset.day;
  const recs=day==='*'?am:am.filter(r=>r.d===day);
  const periodo=day==='*'
   ?`Período ${periodLabel}`
   :day.split('-').reverse().join('/');
  openCategoryModal(cat,recs,periodo,NM[f]);
 })}
const appEl=$('app'),sideToggle=$('sideToggle');
function setSideCollapsed(v){
 appEl.classList.toggle('side-collapsed',v);
 sideToggle.textContent=v?'›':'‹';
 sideToggle.title=v?'Expandir filtros':'Recolher filtros';
 sideToggle.setAttribute('aria-label',sideToggle.title);
 try{localStorage.setItem('dashQualifSideCollapsed',v?'1':'0')}catch(e){}
}
try{setSideCollapsed(localStorage.getItem('dashQualifSideCollapsed')==='1')}catch(e){setSideCollapsed(false)}
sideToggle.onclick=()=>setSideCollapsed(!appEl.classList.contains('side-collapsed'));


window.getUnifiedMonths=function(){
 const months=[...new Set(RECS.map(r=>r.d.slice(0,7)))].sort();
 return {months,selected:getMulti('fMes').sort()};
};
window.setUnifiedMonth=function(month){
 const months=window.getUnifiedMonths().months;
 if(month&&!months.includes(month))return;
 const selected=month?[month]:months;
 buildMulti('fMes',months,selected,false);draw();
};
const __drawMonth=draw;
draw=function(){__drawMonth();try{window.parent.refreshUnifiedMonth?.();}catch(e){}};

const qqEscape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const QQ_FRONT_LABEL={ND:'ND',PME:'PME',MIG:'MIG',ME:'ME'};
const QQ_FRONT_COLOR={ND:'#d63a4f',PME:'#c29a00',MIG:'#e8793e',ME:'#8b929b'};
function qqServiceGroup(r){
 const group=norm(r.GRUPO_OS);
 if(group&&!['N/A','NA','-','-3'].includes(group))return group;
 const service=norm(r.TIPO_OS);
 if(service&&!['N/A','NA','-','-3'].includes(service))return /^(MUDANCA DE ENDERECO|MUDANCA ENDERECO)(?: |$)/.test(service)?'MUDANCA DE ENDERECO':'OUTROS';
 return '';
}
function generalFront(r){
 const type=norm(r.TIPO_ATENDIMENTO),group=norm(r.TIPO_ORDEM_SERVICO_AGRUPADO),segment=norm(r.SEGMENTO_CONTRATO),serviceGroup=qqServiceGroup(r);
 if(serviceGroup==='MUDANCA DE ENDERECO')return 'ME';
 if(type.startsWith('NOVOS'))return segment.includes('PME')?'PME':'ND';
 if(type.startsWith('MIGRA'))return 'MIG';
 if(!serviceGroup&&(group==='ME'||type.startsWith('MUDANCA DE ENDERECO')))return 'ME';
 return null;
}
function qqNormalizeFront(r){
 const type=r.f==='ND'?'NOVOS DOMICILIOS':r.f==='MIG'?'MIGRAÇÃO':r.f==='ME'?'MUDANÇA DE ENDEREÇO':'';
 const gf=generalFront({TIPO_ATENDIMENTO:type,TIPO_ORDEM_SERVICO_AGRUPADO:r.group,SEGMENTO_CONTRATO:r.segment,GRUPO_OS:r.osGroup,TIPO_OS:r.service});
 if(!gf)return null;
 return {...r,gf,f:gf==='PME'?'ND':gf,sv:3};
}
function qqRecordDetails(r){
 return {gf:generalFront(r),contract:String(r.CONTRATO??''),os:String(r.COD_OS??''),wo:String(r.NUM_WO??''),baixa:String(r.COD_BAIXA??''),rawCategory:String(r.SUB_AGRUPAMENTO_SC??''),service:String(r.TIPO_OS??''),treatment:String(r.TIPO_TRATAMENTO??''),responsible:String(r.RESPONSAVEL_QUEBRA??''),reason:String(r.MOTIVO_REAGENDAMENTO??''),time:String(r.PERIODO_AGENDA??''),lowAt:String(r.DAT_HOR_BAIXA??''),tec1:String(r.STATUS_TEC1??''),geo:String(r.STATUS_GEO??''),segment:String(r.SEGMENTO_CONTRATO??''),group:String(r.TIPO_ORDEM_SERVICO_AGRUPADO??''),osGroup:String(r.GRUPO_OS??''),sv:3};
}
function qqOpenDailyOffenders(records,day,front){
 const period=day.split('-').reverse().join('/'),daily=stat(records);
 const contributing=records.filter(r=>stat([r]).q>0);
 const byLogin=group(contributing,r=>r.lt);
 const logins=Object.keys(byLogin).map(login=>({login,rows:byLogin[login],base:records.filter(r=>r.lt===login).length,q:stat(byLogin[login]).q})).sort((a,b)=>b.q-a.q||b.rows.length-a.rows.length||a.login.localeCompare(b.login));
 $('catModalTitle').textContent='%Qualificada — logins ofensores do dia';
 $('catModalSub').textContent=front+' · '+period+' · recorte do login selecionado e filtros do gráfico';
 $('catModalBody').innerHTML=`<div class="modal-kpis">
  <div class="modal-kpi"><small>%Qualificada do dia</small><b>${pct(daily.pq,2)}</b></div>
  <div class="modal-kpi"><small>Contribuição qualificada</small><b>${numBR(daily.q,2)} OS</b></div>
  <div class="modal-kpi"><small>Base do dia</small><b>${daily.n} OS</b></div>
  <div class="modal-kpi"><small>Logins ofensores</small><b>${logins.length}</b></div>
 </div>${logins.length?`<div class="qq-order-scroll"><table class="qq-orders"><thead><tr><th>Login / Nome</th><th>O.S. qualificadas</th><th>Contribuição OS</th><th>Base do login</th><th>%Qualificada</th></tr></thead><tbody>${logins.map((o,i)=>`<tr><td class="qq-login-link" data-daily-offender="${i}" tabindex="0" role="button" aria-label="Ver O.S. qualificadas de ${qqEscape(o.login)}"><b>${qqEscape(o.login)}</b><div class="modal-name">${qqEscape(techName(o.login))}</div></td><td>${o.rows.length}</td><td>${numBR(o.q,2)}</td><td>${o.base} OS</td><td>${pct(o.q/o.base,2)}</td></tr>`).join('')}</tbody></table></div><div class="note">Clique no login para ver contrato, O.S., dia e código de baixa das ocorrências que compõem a %Qualificada. O rateio de “Mais de um processo” mantém a regra original de 1/3 por categoria.</div>`:'<div class="modal-empty">Nenhum login contribuiu para a %Qualificada neste dia e recorte.</div>'}`;
 $('catModalBody').querySelectorAll('[data-daily-offender]').forEach(cell=>{
  const login=logins[Number(cell.dataset.dailyOffender)].login;
  cell.onclick=()=>qqOpenOrders(login,contributing,null,front+' · '+period,()=>qqOpenDailyOffenders(records,day,front),'← Voltar aos logins ofensores do dia');
  cell.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();cell.click()}};
 });
 $('catModal').classList.add('on');$('catModal').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
}
/* Resolve the displayed code without changing the source fields or KPI rules. */
function qqLowCodeInfo(r){
 const raw=String(r.baixa??'').trim(),primary=raw.match(/^(\d+)(?:[.,]0+)?$/);
 if(primary&&Number(primary[1])>0)return {code:primary[1],source:'primary',raw};
 const history=String(r.reason??'').trim().match(/^(\d{1,3})(?=\s*(?:[-–—:]|$))/);
 if(history&&Number(history[1])>0)return {code:history[1],source:'history',raw};
 return {code:'Não informado',source:'missing',raw};
}
function qqLowCodeTitle(r){
 const info=qqLowCodeInfo(r);
 return info.source==='history'?'Código informado no motivo do reagendamento. Código de baixa na origem: '+(info.raw||'não informado'):
  info.source==='primary'?'Código de baixa informado na origem.':'Sem código válido no campo de baixa ou no motivo do reagendamento.';
}

function qqOpenOrders(login,records,category,period,back,backLabel='← Voltar aos logins da categoria'){
 const matches=records.filter(r=>r.lt===login&&(!category||Number(qqQualifiedCategories(r)?.[category]||0)>0));
 const body=$('catModalBody'),title=$('catModalTitle'),sub=$('catModalSub');
 title.textContent=login+' — '+techName(login);
 sub.textContent=(category?category+' · ':'')+period+' · '+matches.length+' registros que compõem este recorte';
 const rows=[...matches].sort((a,b)=>a.d.localeCompare(b.d)||String(a.os||'').localeCompare(String(b.os||'')));
 body.innerHTML=`${back?`<button class="qq-back" id="qqBackCategory">${qqEscape(backLabel)}</button>`:''}
 <div class="note">Clique em uma O.S. para ver os campos completos. A contribuição de “Mais de um processo” mantém o rateio original de 1/3.</div>
 ${rows.some(r=>!r.sv)?'<div class="qq-missing">Este mês salvo não coincide com a planilha incorporada. Importe a planilha desse período para completar os detalhes.</div>':''}
 <div class="qq-order-scroll"><table class="qq-orders"><thead><tr><th>Dia</th><th>Contrato</th><th>O.S.</th><th>Código de baixa</th><th>Serviço</th><th>Categoria original</th><th>Situação no indicador</th><th>Qualificada (negativa)</th></tr></thead><tbody>${rows.map((r,i)=>`<tr data-order="${i}" tabindex="0" role="button" aria-label="Detalhes da O.S. ${qqEscape(r.os||'não informada')}"><td>${qqEscape(r.d.split('-').reverse().join('/'))}</td><td>${qqEscape(r.contract||'Não informado')}</td><td><b>${qqEscape(r.os||'Não informado')}</b></td><td data-low-code-source="${qqLowCodeInfo(r).source}" title="${qqEscape(qqLowCodeTitle(r))}">${qqEscape(qqLowCodeInfo(r).code)}</td><td>${qqEscape(r.service||'Não informado')}</td><td>${qqEscape(r.rawCategory||Object.keys(r.c||{}).join(', ')||'—')}</td><td><span class="qq-status ${qqOutcome(r).kind}">${qqEscape(qqOutcome(r).label)}</span></td><td>${category?numBR(qqQualifiedCategories(r)?.[category]||0,2):numBR(stat([r]).q,2)}</td></tr>`).join('')}</tbody></table></div>
 <div id="qqOrderFields" class="qq-order-fields"><span class="note">Selecione uma O.S. acima para ver seus detalhes.</span></div>`;
 if(back)$('qqBackCategory').onclick=back;
 const open=r=>{
  const pairs=[['Dia agendado',r.d.split('-').reverse().join('/')],['Janela de agenda',r.time],['Contrato',r.contract],['Código da O.S.',r.os],['Workorder',r.wo],['Código de baixa',qqLowCodeInfo(r).code],['Data/hora da baixa',r.lowAt],['Login técnico',r.lt],['Município',recCity(r)],['Unidade',r.un],['Tipo de serviço',r.service],['Tratamento',r.treatment],['Categoria original',r.rawCategory],['Responsável pela quebra',r.responsible],['Motivo do reagendamento (histórico)',r.reason],['Status TEC1',r.tec1],['Status GEO',r.geo],['Segmento do contrato',r.segment]];
  $('qqOrderFields').innerHTML=`<div class="qq-outcome ${qqOutcome(r).kind}"><b>${qqEscape(qqOutcome(r).label)}</b><span>${qqEscape(qqOutcome(r).explanation)}</span></div>`+pairs.map(([k,v])=>`<div ${k==='Código de baixa'?`data-low-code-source="${qqLowCodeInfo(r).source}" title="${qqEscape(qqLowCodeTitle(r))}"`:''}><small>${qqEscape(k)}</small><b>${qqEscape(v==null||v===''?'Não informado':v)}</b>${k==='Código de baixa'&&qqLowCodeInfo(r).source==='history'?'<span class="qq-low-code-note">Informado no reagendamento</span>':''}</div>`).join('');
 };
 body.querySelectorAll('[data-order]').forEach(tr=>{tr.onclick=()=>open(rows[Number(tr.dataset.order)]);tr.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();tr.click()}}});
 if(rows.length)open(rows[0]);
 $('catModal').classList.add('on');$('catModal').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
}
const __categoryOrderModal=openCategoryModal;
openCategoryModal=function(category,records,period,front){
 __categoryOrderModal(category,records,period,front);
 const contributionRows=Object.values(records.filter(r=>Number(qqQualifiedCategories(r)?.[category]||0)>0).reduce((m,r)=>{const login=r.lt||'(sem login)';const a=m[login]||(m[login]={login,contrib:0,rows:0});a.contrib+=Number(qqQualifiedCategories(r)?.[category]||0);a.rows++;return m},{})).sort((a,b)=>b.contrib-a.contrib||b.rows-a.rows||a.login.localeCompare(b.login));
 $('catModalBody').querySelectorAll('.modal-login').forEach((cell,i)=>{
  const login=contributionRows[i]?.login;if(!login)return;
  cell.classList.add('qq-login-link');cell.tabIndex=0;cell.setAttribute('role','button');cell.title='Ver contrato, O.S., dia e código de baixa';
  cell.onclick=()=>qqOpenOrders(login,records,category,period,()=>openCategoryModal(category,records,period,front));
  cell.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();cell.click()}};
 });
};
let qqGeneralUnit='';
// This selection belongs only to the monthly summary card.
let qqGeneralEvolutionMonths=null,qqEvolutionPickerOpen=false;
function qqGeneralMonthLabel(month){
 const names=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
 return names[Number(month.slice(5,7))-1]+' / '+month.slice(0,4);
}
function qqGeneralEvolutionContext(ctx){
 const available=window.getUnifiedMonths().months;
 let months=(qqGeneralEvolutionMonths===null?ctx.months:qqGeneralEvolutionMonths).filter(m=>available.includes(m)).sort();
 if(!months.length)months=ctx.months.filter(m=>available.includes(m));
 const scope=ctx.history.filter(r=>months.includes(r.d.slice(0,7)));
 const units=[...new Set(scope.map(r=>r.un))].sort((a,b)=>(ctx.unitOrder.indexOf(a)<0?99:ctx.unitOrder.indexOf(a))-(ctx.unitOrder.indexOf(b)<0?99:ctx.unitOrder.indexOf(b))||a.localeCompare(b));
 return {available,months,scope,units,anchor:months.at(-1)||''};
}
// Dated monthly values supplied by the user from the Claro reference.
// A reference applies only to its complete, unchanged source records.
const QQ_MONTHLY_REFERENCES = [{"unit":"JCR-DMV","front":"ND","month":"2026-09","value":0.0435,"base":1379,"sourceQ":58,"signature":"76b85e4d"},{"unit":"JCR-DMV","front":"MIG","month":"2026-09","value":0.0866,"base":589,"sourceQ":48,"signature":"4d8d6429"},{"unit":"JCR-DMV","front":"ME","month":"2026-09","value":0.0468,"base":235,"sourceQ":12,"signature":"c06c0b30"},{"unit":"FTZ-DMV_01","front":"PME","month":"2026-09","value":0.0571,"base":140,"sourceQ":9,"signature":"2b970966"},{"unit":"FTZ-DMV_01","front":"MIG","month":"2026-09","value":0.1419,"base":289,"sourceQ":39,"signature":"641853a9"},{"unit":"FTZ-DMV_01","front":"ME","month":"2026-09","value":0.0776,"base":361,"sourceQ":27,"signature":"184d92a3"}];
const QQ_MONTHLY_REFERENCE_MAP = new Map(QQ_MONTHLY_REFERENCES.map(r=>[[r.unit,r.front,r.month].join('|'),r]));
function qqMonthlyRecordSignature(records){
 const keys=records.map(r=>JSON.stringify([r.d,r.os||'',r.wo||'',r.lt||'',r.un||'',r.gf||r.f||'',r.baixa||'',r.rawCategory||'',r.responsible||'',r.service||'',r.b,Object.entries(r.c||{}).sort(([a],[b])=>a.localeCompare(b))])).sort();
 let hash=2166136261;
 for(const text of keys){for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}hash^=10;hash=Math.imul(hash,16777619);}
 return (hash>>>0).toString(16).padStart(8,'0');
}
function qqMonthlyInfo(records){
 const source=stat(records),references=[];
 let adjustment=0;
 for(const [key,rows] of Object.entries(group(records,r=>[r.un,r.gf||r.f,r.d.slice(0,7)].join('|')))){
  const ref=QQ_MONTHLY_REFERENCE_MAP.get(key);
  if(!ref||rows.length!==ref.base||qqMonthlyRecordSignature(rows)!==ref.signature)continue;
  const observed=stat(rows);
  adjustment+=ref.value*rows.length-observed.q;
  references.push(ref);
 }
 const pq=source.n?(source.q+adjustment)/source.n:NaN;
 return {...source,pq,sourceRate:source.pq,references,hasInfo:source.n>0&&Number.isFinite(pq)&&pq>0};
}
function qqRateLabel(value){return Number.isFinite(value)&&value>0?pct(value,2):'';}
function qqShortMonth(month){return MESES[Number(month.slice(5,7))-1]||'';}
function qqMonthlyHint(info){
 return info.references?.length?'Referência mensal Claro informada · '+pct(info.pq,2)+' · composição da planilha: '+numBR(info.q,2)+' / '+info.n+' O.S.':info.n?numBR(info.q,2)+' contribuições qualificadas / '+info.n+' O.S.':'Sem O.S. no recorte';
}
function qqMonthlyMoM(current,previous){
 const hasCurrent=current.n>0&&Number.isFinite(current.pq)&&current.pq>0;
 const hasPrevious=previous.n>0&&Number.isFinite(previous.pq)&&previous.pq>0;
 const previousZero=previous.n>0&&Number.isFinite(previous.pq)&&previous.pq===0;
 if(hasPrevious||hasCurrent&&previousZero){
  const value=(hasCurrent?current.pq:0)-previous.pq;
  return {kind:'delta',value,label:pp(value),currentBlank:!hasCurrent};
 }
 return {kind:'missing',value:NaN,label:''};
}
function qqGeneralEvolutionMarkup(ctx,cells,nextKey){
 const e=qqGeneralEvolutionContext(ctx),fronts=['ND','PME','MIG','ME'];
 const all=e.available.length>0&&e.available.every(m=>e.months.includes(m));
 const label=e.months.length===1?qqGeneralMonthLabel(e.months[0]):e.months.length+' meses';
 const menu=`<details id="ggEvolutionMonthPicker" class="gg-evolution-picker" ${qqEvolutionPickerOpen?'open':''}><summary title="Escolher os meses somente deste quadro"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4M8 13h2M14 13h2M8 17h2M14 17h2"/></svg><span>${qqEscape(label)}</span><span aria-hidden="true">⌄</span></summary><div class="gg-evolution-menu"><strong>Meses deste quadro</strong><label class="gg-evolution-all"><input id="ggEvolutionAllMonths" type="checkbox" ${all?'checked':''}><span>Todos os meses</span></label>${e.available.map(m=>`<label><input type="checkbox" data-evolution-month="${m}" ${e.months.includes(m)?'checked':''}><span>${qqEscape(qqGeneralMonthLabel(m))}</span></label>`).join('')}${e.available.length?'':'<p>Sem meses na base.</p>'}<button type="button" id="ggEvolutionFollowPeriod">Usar período geral</button><small>Esta seleção altera apenas a evolução mensal. Cidade, unidade e datas continuam respeitadas.</small></div></details>`;
 const rows=e.units.map(unit=>{
  const cellsByFront=fronts.map(front=>{
   const previousMonth=e.anchor?new Date(Date.UTC(Number(e.anchor.slice(0,4)),Number(e.anchor.slice(5,7))-2,1)).toISOString().slice(0,7):'!';
   const frontRows=ctx.history.filter(r=>r.un===unit&&(r.gf||r.f)===front);
   const last=qqMonthlyInfo(frontRows.filter(r=>r.d.startsWith(e.anchor))),previous=qqMonthlyInfo(frontRows.filter(r=>r.d.startsWith(previousMonth)));
   const mom=qqMonthlyMoM(last,previous);
   const comparison=e.anchor?qqGeneralMonthLabel(e.anchor)+' x '+qqGeneralMonthLabel(previousMonth):'Sem período';
   const deltaHint=comparison+' · '+(mom.currentBlank?'Mês atual vazio: 0 menos o percentual do mês anterior, em pontos percentuais, conforme a apresentação da central.':mom.kind==='delta'?'Variação em pontos percentuais entre as taxas mensais.':'Sem informação suficiente para comparação.');
   const values=e.months.map(month=>{
    const records=e.scope.filter(r=>r.d.startsWith(month)&&r.un===unit&&(r.gf||r.f)===front),key=nextKey(),info=qqMonthlyInfo(records);
    cells.set(key,{rows:records,unit,f:front,label:unit+' · '+front+' · '+qqGeneralMonthLabel(month),monthlyInfo:info});
    return qqGeneralCell(info,front,key);
   }).join('');
   const status=mom.kind==='delta'?(mom.value>0?'gg-bad':mom.value<0?'gg-good':''):'gg-none';
   const arrow=mom.kind==='delta'?modernTrendSvg(mom.value>0?'up':mom.value<0?'down':'flat',mom.value>0?'bad':mom.value<0?'good':'neutral')+' ':'';
   return `<tr data-monthly-unit="${qqEscape(unit)}" data-monthly-front="${front}"><th><span class="gg-dot" style="background:${QQ_FRONT_COLOR[front]}"></span>${front}</th>${values}<td title="${qqEscape(deltaHint)}" data-mom-kind="${mom.kind}" class="gg-mom ${status}">${arrow+mom.label}</td></tr>`;
  }).join('');
  return `<tr class="gg-unit"><th colspan="${e.months.length+2}">${qqEscape(unit)}</th></tr>`+cellsByFront;
 }).join('');
 return `<h3><span class="gg-monthly-title">QUALIFICADAS | EVOLUÇÃO MENSAL</span>${menu}</h3><div class="gg-table-scroll"><table data-evolution-months="${e.months.join(',')}"><thead><tr><th>Unidade / frente</th>${e.months.map(m=>`<th title="${qqEscape(qqGeneralMonthLabel(m))}">${qqShortMonth(m)}</th>`).join('')}<th title="MoM = mês atual menos mês anterior, em p.p. Mês atual vazio é considerado 0 somente nesta comparação.">MoM</th></tr></thead><tbody>${rows||'<tr><td>Sem dados</td></tr>'}</tbody></table></div><div class="gg-monthly-note">MoM: atual − anterior, em p.p.; mês atual vazio considera 0 nesta comparação.</div>`;
}

function qqWireGeneralCells(root,cells){
 root.querySelectorAll('[data-general-cell]').forEach(el=>{
  const open=()=>{const c=cells.get(el.dataset.generalCell);if(c.category)openCategoryModal(c.category,c.rows,c.period,c.front);else qqOpenGeneralRecords(c.rows,c.label||c.unit+' · '+c.f,c.scope||'offenders',c.metric||'q',c.monthlyInfo||null);};
  el.onclick=open;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}};
 });
}
function qqRefreshGeneralEvolution(focusMonth=''){
 const card=document.querySelector('#qqGeneralView .gg-summary-monthly');if(!card)return;
 const ctx=qqGeneralContext(),cells=new Map();let index=0;
 card.innerHTML=qqGeneralEvolutionMarkup(ctx,cells,()=> 'evolution-'+(++index));
 qqWireGeneralCells(card,cells);qqWireEvolutionPicker(ctx);
 if(focusMonth)card.querySelector(`input[data-evolution-month="${focusMonth}"]`)?.focus();
}
function qqWireEvolutionPicker(ctx){
 const picker=$('ggEvolutionMonthPicker');if(!picker)return;
 picker.ontoggle=()=>{qqEvolutionPickerOpen=picker.open;};
 const e=qqGeneralEvolutionContext(ctx),all=$('ggEvolutionAllMonths');
 all.indeterminate=e.months.length>0&&!e.available.every(m=>e.months.includes(m));
 all.onchange=()=>{qqGeneralEvolutionMonths=all.checked?[...e.available]:[ctx.months.at(-1)||e.available.at(-1)].filter(Boolean);qqEvolutionPickerOpen=true;qqRefreshGeneralEvolution();};
 picker.querySelectorAll('input[data-evolution-month]').forEach(box=>box.onchange=()=>{
  const months=[...picker.querySelectorAll('input[data-evolution-month]')].filter(b=>b.checked).map(b=>b.dataset.evolutionMonth);
  if(!months.length){box.checked=true;return;}
  qqGeneralEvolutionMonths=months;qqEvolutionPickerOpen=true;qqRefreshGeneralEvolution(box.dataset.evolutionMonth);
 });
 $('ggEvolutionFollowPeriod').onclick=()=>{qqGeneralEvolutionMonths=null;qqEvolutionPickerOpen=false;qqRefreshGeneralEvolution();$('ggEvolutionMonthPicker').querySelector('summary').focus();};
}
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'){
  const picker=$('ggEvolutionMonthPicker');if(picker?.open){picker.open=false;qqEvolutionPickerOpen=false;picker.querySelector('summary').focus();}
 }
});

document.addEventListener('click',event=>{
 const picker=$('ggEvolutionMonthPicker');
 if(picker?.open&&!event.target.closest?.('#ggEvolutionMonthPicker')){
  picker.open=false;qqEvolutionPickerOpen=false;
 }
});

function qqGeneralContext(){
 const presenting=document.body.classList.contains('presentation-mode');
 const uns=getMulti('fUn'),cls=getMulti('fCl'),selected=getMulti('fMes').sort();
 const data=RECS.filter(r=>qqDatePass(r)&&uns.includes(r.un)&&cls.includes(r.cl)&&['ND','PME','MIG','ME'].includes(r.gf||r.f)&&(!presenting||svAllows(S.supervisors,r.lt)));
 const allMonths=[...new Set(data.map(r=>r.d.slice(0,7)))].sort(),anchor=(selected.length?selected:allMonths).at(-1)||'';
 const focus=S.city?data.filter(r=>presentationCityLabel(recCity(r))===S.city):data;
 const units=qqUnitOptions();if(qqGeneralUnit&&!units.includes(qqGeneralUnit))qqGeneralUnit='';
 const history=qqGeneralUnit?focus.filter(r=>r.un===qqGeneralUnit):focus;
 const scope=history.filter(r=>selected.includes(r.d.slice(0,7))),current=scope;
 const unitOrder=['FTZ-DMV_01','JCR-DMV','MRO-DMV','NTL-DMV','PWM-DMV'];
 const displayUnits=[...new Set(current.map(r=>r.un))].sort((a,b)=>(unitOrder.indexOf(a)<0?99:unitOrder.indexOf(a))-(unitOrder.indexOf(b)<0?99:unitOrder.indexOf(b))||a.localeCompare(b));
 const latest=current.map(r=>r.d).sort().at(-1)||'';
 const days=[...new Set(history.filter(r=>latest&&r.d<=latest).map(r=>r.d))].sort().slice(-10);
 const dailyRecords=history.filter(r=>days.includes(r.d));
 const dailyUnits=[...new Set(dailyRecords.map(r=>r.un))].sort((a,b)=>(unitOrder.indexOf(a)<0?99:unitOrder.indexOf(a))-(unitOrder.indexOf(b)<0?99:unitOrder.indexOf(b))||a.localeCompare(b));
 return {history,unitOrder,data,selected,anchor,scope,current,units,displayUnits,days,months:selected,dailyRecords,dailyUnits,latest,monthlyMode:selected.length>1};
}

function qqGeneralStats(rows,unit,front){return stat(rows.filter(r=>r.un===unit&&(r.gf||r.f)===front));}

function qqGoalRate(value,target,digits=2){
 if(!Number.isFinite(value))return '—';
 if(target==null)return pct(value,digits);
 const good=value<=target,message=good?'Meta atingida':'Acima da meta';
 return `<span class="qq-goal-rate" title="${message} · meta ≤ ${pct(target,2)}">${modernTrendSvg(good?'up':'down',good?'good':'bad')}<span>${pct(value,digits)}</span></span>`;
}
function qqChartGoalRate(value,target,x,y,digits=2,fontSize=16){
 const available=Number.isFinite(value)&&value>0,good=available&&value<=target,outcome=good?'good':'bad';
 const arrow=available&&target!=null?modernTrendSvg(good?'up':'down',outcome):'';
 const color=!available||target==null?'#40516a':good?'#177e4b':'#bd2138';
 const width=Math.max(44,pct(available?value:0,digits).length*fontSize*.58),icon=fontSize*1.25,gap=5,total=width+(arrow?icon+gap:0),left=x-total/2;
 const caption=available?pct(value,digits):'';
 return `<g class="qq-chart-goal-rate" data-goal-outcome="${available&&target!=null?outcome:'none'}">${arrow?`<g transform="translate(${left},${y-fontSize*.85})">${arrow.replace('<svg ',`<svg x="0" y="0" width="${icon}" height="${fontSize}" `)}</g>`:''}<text x="${arrow?left+icon+gap:x}" y="${y}" text-anchor="${arrow?'start':'middle'}" fill="${color}" font-size="${fontSize}" font-weight="750">${caption}</text></g>`;
}

function qqGeneralCell(s,front,clickKey){
 const meta=QQ_QUALIFIED_GOAL[front];
 const available=s.n>0&&Number.isFinite(s.pq)&&s.pq>0;
 const cls=!available?'gg-none':meta==null?'gg-neutral':s.pq<=meta?'gg-good':'gg-bad';
 return `<td class="${cls}" ${s.references?.length?'data-monthly-reference="claro"':''} ${s.n?'data-general-cell="'+qqEscape(clickKey)+'" tabindex="0" role="button"':''} title="${qqEscape(qqMonthlyHint(s))}">${available?qqGoalRate(s.pq,meta,2):''}</td>`;
}
function qqBreakGuides(width,baseline,plotHeight,maximum,left=44,right=20){
 const groups=[{fronts:'ND / PME / ME',goal:QQ_BREAK_GOAL.ND},{fronts:'MIG',goal:QQ_BREAK_GOAL.MIG}];
 return groups.map(({fronts,goal})=>{const y=baseline-goal/maximum*plotHeight;return `<line data-break-goal="${goal}" data-goal-fronts="${fronts}" x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" stroke="#7388a3" stroke-dasharray="6 5"><title>Meta de quebra ${fronts}: ≤ ${pct(goal,0)}</title></line>`;}).join('')+`<text x="${width-right}" y="18" text-anchor="end" fill="#526882" font-size="12">Metas de quebra: ND / PME / ME ≤ ${pct(QQ_BREAK_GOAL.ND,0)} · MIG ≤ ${pct(QQ_BREAK_GOAL.MIG,0)}</text>`;
}
function qqGeneralBars(ctx){
 const {displayUnits:units,current}=ctx,W=Math.max(840,units.length*215),H=118,left=35,baseline=86,plotH=63;
 const max=Math.max(...Object.values(QQ_BREAK_GOAL),...units.flatMap(u=>['ND','PME','MIG','ME'].map(f=>qqGeneralStats(current,u,f).pb)).filter(Number.isFinite))+.05;
 let svg=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Quebra de agenda por unidade e frente"><line x1="${left}" y1="${baseline}" x2="${W-12}" y2="${baseline}" stroke="#bbb"/>${qqBreakGuides(W,baseline,plotH,max,left,12)}`;
 units.forEach((u,i)=>{const span=(W-left-16)/Math.max(1,units.length),start=left+i*span+span/2-75;
  ['ND','PME','MIG','ME'].forEach((f,j)=>{const s=qqGeneralStats(current,u,f),x=start+j*39,h=s.n?s.pb/max*plotH:0;
   svg+=`<rect x="${x}" y="${baseline-h}" width="30" height="${h}" fill="${QQ_FRONT_COLOR[f]}"><title>${qqEscape(u+' · '+f+' · '+s.b+'/'+s.n+' O.S. com quebra')}</title></rect><text x="${x+15}" y="${baseline-h-5}" transform="rotate(-40 ${x+15} ${baseline-h-5})" text-anchor="middle" font-size="11.5" font-weight="600">${s.n?pct(s.pb,2):'—'}</text><text x="${x+15}" y="${baseline+13}" text-anchor="middle" font-size="9">${f}</text>`;
  });svg+=`<text x="${left+i*span+span/2}" y="${H-3}" text-anchor="middle" font-size="12" font-weight="700">${qqEscape(u)}</text>`;
 });return svg+'</svg>';
}


function qqGeneralMonthlyChart(front,ctx,cells,nextKey){
 const names={ND:'Novos Domicílios',PME:'PME',MIG:'Migração',ME:'Mudança de Endereço'};
 const monthLabel=qqShortMonth;
 const scope=ctx.scope.filter(r=>(r.gf||r.f)===front),target=QQ_QUALIFIED_GOAL[front];
 const monthly=ctx.months.map(month=>({month,rows:scope.filter(r=>r.d.startsWith(month))}));
 monthly.forEach(point=>point.s=qqMonthlyInfo(point.rows));
 const max=Math.max(.02,target||0,...monthly.map(p=>Number.isFinite(p.s.pq)?p.s.pq:0))*1.3;
 const W=Math.max(680,monthly.length*140),H=215,left=55,right=24,top=29,bottom=167,height=bottom-top,width=W-left-right;
 let svg=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="group" aria-label="${qqEscape('Evolução mensal da %Qualificada '+front+' · selecione um mês para ver os logins e as O.S.')}">`;
 for(let i=0;i<=4;i++){const value=max*i/4,y=bottom-value/max*height;svg+=`<line x1="${left}" x2="${W-right}" y1="${y}" y2="${y}" stroke="#e8edf4"/><text x="${left-10}" y="${y+4}" text-anchor="end" fill="#78869a" font-size="12">${pct(value,2)}</text>`;}
 if(target!=null){const y=bottom-target/max*height;svg+=`<line x1="${left}" x2="${W-right}" y1="${y}" y2="${y}" stroke="#7388a3" stroke-width="1.3" stroke-dasharray="6 4"/><text x="${W-right}" y="15" text-anchor="end" fill="#526882" font-size="12">Meta ≤ ${pct(target,2)}</text>`;}
 monthly.forEach((point,i)=>{
  const s=point.s,step=width/Math.max(1,monthly.length),center=left+(i+.5)*step,bw=Math.min(84,step*.45),h=s.n?s.pq/max*height:0,x=center-bw/2;
  const key=nextKey(),label=(S.city||'Todas as cidades')+' · '+front+' — '+names[front]+' · '+monthLabel(point.month);
  cells.set(key,{rows:point.rows,label,metric:'q',scope:'offenders',monthlyInfo:s});
  const result=qqRateLabel(s.pq);
  svg+=`<g ${s.n?`class="qq-monthly-bar" data-general-cell="${key}" data-month="${point.month}" data-monthly-front="${front}" data-rate="${s.pq}" tabindex="0" role="button" aria-label="${qqEscape(label+' · '+result+' · ver logins ofensores')}"`:''}><title>${qqEscape(label+' · '+result+' · '+qqMonthlyHint(s))}</title><rect class="gg-month-hit" x="${center-step*.35}" y="${top}" width="${step*.7}" height="${bottom-top+39}" rx="6" fill="transparent"/><rect class="gg-month-fill" x="${x}" y="${bottom-h}" width="${bw}" height="${h}" rx="5" fill="${QQ_FRONT_COLOR[front]}"/>${qqChartGoalRate(s.n?s.pq:NaN,target,center,bottom-h-8,2,16)}<text x="${center}" y="${bottom+20}" text-anchor="middle" fill="#40516a" font-size="13" font-weight="650">${monthLabel(point.month)}</text><text x="${center}" y="${bottom+37}" text-anchor="middle" fill="#8190a5" font-size="11">${s.n?s.n.toLocaleString('pt-BR')+' O.S.':'Sem base'}</text></g>`;
 });
 svg+='</svg>';
 const context=(S.city||'Todas as cidades')+(qqGeneralUnit?' · '+qqGeneralUnit:ctx.displayUnits.length>1?' · consolidado de '+ctx.displayUnits.length+' unidades':ctx.displayUnits.length===1?' · '+ctx.displayUnits[0]:'');
 return `<section class="gg-card gg-category-card gg-monthly-chart" data-monthly-chart="${front}" style="--front-color:${QQ_FRONT_COLOR[front]}"><h3><span class="gg-front-badge">${front}</span><span>EVOLUÇÃO MENSAL – %QUALIFICADA ${names[front].toUpperCase()}</span></h3><div class="gg-detail-sub">${qqEscape(context)} · clique no mês para consultar logins e O.S.</div><div class="gg-monthly-chart-inner">${svg}</div></section>`;
}

function qqGeneralCategoryPanels(ctx,cells,nextKey){
 const names={ND:'Novos Domicílios',PME:'PME',MIG:'Migração',ME:'Mudança de Endereço'};
 const dateLabel=d=>d.split('-').reverse().join('/');
 const monthLabel=qqShortMonth;
 const period=ctx.months.map(monthLabel).join(', ')||'Sem meses';
 const recent=ctx.days.length?dateLabel(ctx.days[0])+' a '+dateLabel(ctx.days.at(-1)):'Sem datas com dados';
 function panel(front,monthly){
  const units=monthly?ctx.displayUnits:ctx.dailyUnits;
  const cols=monthly?ctx.months:ctx.days;
  const rowsByUnit=units.map(unit=>{
   const records=(monthly?ctx.scope:ctx.dailyRecords).filter(r=>r.un===unit&&(r.gf||r.f)===front);
   const total=stat(records);
   const buckets=cols.map(key=>({key,rows:records.filter(r=>monthly?r.d.startsWith(key):r.d===key)}));
   buckets.push({key:'*',rows:records});
   buckets.forEach(bucket=>bucket.s=stat(bucket.rows));
   const frontLabel=(S.city||'Todas as cidades')+' · '+unit+' · '+front+' — '+names[front];
   function dataCell(bucket,kind,category){
    const s=bucket.s,monthlyInfo=monthly&&kind==='q'?qqMonthlyInfo(bucket.rows):null,val=kind==='cat'?(s.cat[category]||0)/s.n:kind==='base'?s.n:kind==='b'?s.pb:monthlyInfo?monthlyInfo.pq:s.pq;
    const key=nextKey(),labelPeriod=bucket.key==='*'?(monthly?'Período '+period:'Últimos 10 dias · '+recent):monthly?monthLabel(bucket.key):dateLabel(bucket.key);
    const label=frontLabel+' · '+labelPeriod;
    cells.set(key,{rows:bucket.rows,category,period:labelPeriod,front:frontLabel,label,metric:kind==='b'?'b':'q',scope:kind==='base'?'all':'offenders',monthlyInfo});
    const meta=kind==='b'?QQ_BREAK_GOAL[front]:kind==='q'?(QQ_QUALIFIED_GOAL[front]):null;
    const available=s.n>0&&(kind==='base'||Number.isFinite(val)&&val>0),status=!available?'gg-none':meta==null?'':val<=meta?'gg-good':'gg-bad';
    const hint=monthlyInfo?.references.length?qqMonthlyHint(monthlyInfo):!s.n?'Sem O.S. no recorte':kind==='base'?'Ver todas as '+s.n+' O.S.':kind==='cat'?numBR(s.cat[category]||0,2)+' contribuições / '+s.n+' O.S. · ver logins ofensores':numBR(kind==='b'?s.b:s.q,2)+' / '+s.n+' O.S. · ver logins ofensores';
    return `<td class="${kind==='cat'?'cat-val':'gg-detail-value'} ${status} ${bucket.key==='*'?'gg-period':''}" ${s.n?`data-general-cell="${key}" tabindex="0" role="button" aria-label="${qqEscape((category||kind==='base'&&'Total de O.S.'||kind==='b'&&'%Quebra'||'%Qualificada')+' · '+label+' · '+hint)}"`:''} title="${qqEscape(hint)}">${available?(kind==='base'?s.n.toLocaleString('pt-BR'):meta!=null?qqGoalRate(val,meta,2):pct(val,2)):''}</td>`;
   }
   const categories=CATS.filter(category=>(total.cat[category]||0)>0).sort((a,b)=>(total.cat[b]||0)-(total.cat[a]||0)||CATS.indexOf(a)-CATS.indexOf(b));
   const categoryRows=categories.map(category=>{
    const key=nextKey();cells.set(key,{rows:records,category,period:monthly?'Período '+period:'Últimos 10 dias · '+recent,front:frontLabel});
    return `<tr><th class="cat-link" scope="row" data-general-cell="${key}" tabindex="0" role="button" aria-label="${qqEscape(category+' · '+frontLabel+' · '+(monthly?period:recent)+' · ver logins ofensores')}">${qqEscape(category)}</th>${buckets.map(bucket=>dataCell(bucket,'cat',category)).join('')}</tr>`;
   }).join('');
   const summary=[['%Qualificada','q'],['%Quebra','b'],['Total de OS','base']].map(([label,kind])=>`<tr class="${kind==='base'?'gg-base':'tot'}"><th scope="row">${label}</th>${buckets.map(bucket=>dataCell(bucket,kind)).join('')}</tr>`).join('');
   return `${units.length>1?`<tr class="gg-unit"><th colspan="${cols.length+2}" scope="colgroup">${qqEscape(unit)}${total.n?'':' · sem O.S. nesta frente'}</th></tr>`:''}${categoryRows}${summary}`;
  }).join('');
  const title=monthly?'QUALIFICADAS | EVOLUÇÃO MENSAL':'DETALHAMENTO DIÁRIO – %QUALIFICADA '+names[front].toUpperCase()+' POR CATEGORIA';
  return `<section class="gg-card gg-category-card ${monthly?'gg-monthly-card':'gg-daily-card'}" data-detail-front="${front}" data-detail-period="${monthly?'monthly':'daily'}" style="--front-color:${QQ_FRONT_COLOR[front]}"><h3><span class="gg-front-badge">${front}</span><span>${title}</span></h3><div class="gg-detail-sub">${monthly?names[front]+' · '+period:'Últimos '+ctx.days.length+' dias com dados · '+recent} · ${qqEscape(S.city||'Todas as cidades')}${units.length===1?' · '+qqEscape(units[0]):''} · Metas: Qualificada ≤ ${pct(QQ_QUALIFIED_GOAL[front],2)} / Quebra ≤ ${pct(QQ_BREAK_GOAL[front],0)}</div><div class="gg-category-scroll" tabindex="0" role="region" aria-label="${qqEscape(title+' · '+front+' · rolagem da tabela')}"><table class="detail-table gg-category-table"><thead><tr><th scope="col">Categoria</th>${cols.map(key=>`<th scope="col">${monthly?monthLabel(key):key.slice(8)+'/'+key.slice(5,7)}</th>`).join('')}<th scope="col" class="gg-period">${monthly?'Período':'10 dias'}</th></tr></thead><tbody>${rowsByUnit||`<tr><td colspan="${cols.length+2}">Sem dados no recorte.</td></tr>`}</tbody></table></div></section>`;
 }
 return `<div class="gg-front-panels">${['ND','PME','MIG','ME'].map(front=>`<div class="gg-front-row" data-front-row="${front}">${ctx.monthlyMode?qqGeneralMonthlyChart(front,ctx,cells,nextKey):panel(front,false)}${panel(front,true)}</div>`).join('')}</div>`;
}

function qqRenderGeneral(){
 const root=$('qqGeneralView'),ctx=qqGeneralContext(),fronts=['ND','PME','MIG','ME'];
 if(!root)return;
 const periods=ctx.selected.map(m=>m.slice(5)+'/'+m.slice(0,4)).join(', ');
 const cells=new Map();let cellIndex=0;
 const cell=(rows,unit,f)=>{const key=String(++cellIndex),s=qqGeneralStats(rows,unit,f);cells.set(key,{rows:rows.filter(r=>r.un===unit&&(r.gf||r.f)===f),unit,f});return qqGeneralCell(s,f,key)};
 const daily=ctx.dailyUnits.map(unit=>`<tr class="gg-unit"><th colspan="${ctx.days.length+1}">${qqEscape(unit)}</th></tr>`+fronts.map(f=>`<tr><th><span class="gg-dot" style="background:${QQ_FRONT_COLOR[f]}"></span>${f}</th>${ctx.days.map(d=>cell(ctx.dailyRecords.filter(r=>r.d===d),unit,f)).join('')}</tr>`).join('')).join('');
 const monthlyMarkup=qqGeneralEvolutionMarkup(ctx,cells,()=>String(++cellIndex));
 const detailed=!!(S.city||qqGeneralUnit||ctx.monthlyMode);
 const detail= detailed?qqGeneralCategoryPanels(ctx,cells,()=>String(++cellIndex)):'';
 root.classList.toggle('gg-detailed',detailed);
 root.classList.toggle('gg-many-units',ctx.displayUnits.length>5);
 root.classList.toggle('gg-monthly-mode',ctx.monthlyMode);
 root.classList.toggle('gg-single-screen',ctx.selected.length===1&&!detailed);
 const cities=[...new Set(ctx.data.map(r=>presentationCityLabel(recCity(r))).filter(Boolean))].sort();
 root.innerHTML=`<div class="gg-toolbar"><div class="gg-heading"><b>QUEBRA QUALIFICADA — VISÃO GERAL</b><small>${periods||'Sem dados'} · ${ctx.current.length.toLocaleString('pt-BR')} O.S. · ${ctx.monthlyMode?'Análise mensal':'Evolução dos últimos 10 dias'} · dados até ${ctx.current.length?ctx.current.map(r=>r.d).sort().at(-1).split('-').reverse().join('/'):'—'}</small></div><div class="gg-city-buttons"><button data-gg-city="" class="${!S.city?'on':''}">Todas</button>${cities.map(c=>`<button data-gg-city="${qqEscape(c)}" class="${S.city===c?'on':''}">${qqEscape(c)}</button>`).join('')}</div><label class="unified-unit-local">Unidade de negócio <select id="ggUnit" aria-label="Unidade de negócio da visão geral"><option value="">Todas</option>${ctx.units.map(u=>`<option value="${qqEscape(u)}" ${qqGeneralUnit===u?'selected':''}>${qqEscape(u)}</option>`).join('')}</select></label><button id="ggMethod">Critérios / fontes</button></div>
 <section class="gg-card gg-chart"><h3>QUEBRA DE AGENDA · ${qqEscape(periods||'Sem dados')} <span>${fronts.map(f=>`<i style="background:${QQ_FRONT_COLOR[f]}"></i>${f}`).join(' ')}</span></h3><div class="gg-chart-inner">${ctx.current.length?qqGeneralBars(ctx):'<div class="empty">Sem O.S. de ND, PME, MIG ou ME para a unidade e os filtros selecionados.</div>'}</div></section>
 <div class="gg-tables gg-summary-side-by-side" style="--gg-summary-height:${Math.min(300,23+Math.max(ctx.dailyUnits.length,ctx.displayUnits.length)*106)}px"><section class="gg-card gg-summary-daily"><h3>QUALIFICADAS | ÚLTIMOS 10 DIAS COM DADOS <small>${ctx.days.length?ctx.days[0].split('-').reverse().join('/')+' a '+ctx.days.at(-1).split('-').reverse().join('/'):'Sem dados'}</small></h3><div class="gg-table-scroll"><table><thead><tr><th>Unidade / frente</th>${ctx.days.map(d=>`<th>${d.slice(8)}/${d.slice(5,7)}</th>`).join('')}</tr></thead><tbody>${daily||'<tr><td>Sem dados</td></tr>'}</tbody></table></div></section><section class="gg-card gg-summary-monthly">${monthlyMarkup}</section></div>
 ${detail}
 <div class="gg-caption">%Qualificada = soma das categorias ÷ O.S. · PME separado de ND nesta visão · células vazias = sem base ou percentual zero · clique nas barras, categorias ou percentuais para consultar os logins e as O.S. · Evolução diária = últimas 10 datas com dados, incluindo o mês anterior · O filtro de meses deste quadro altera somente a evolução mensal · MoM = mês atual menos mês anterior, em p.p.; mês atual vazio considera 0 nesta comparação · Mensal: referências Claro informadas quando a base completa corresponde ao período; detalhes mostram a composição da planilha${ctx.data.some(r=>!r.sv)?' · Reimporte a planilha para incluir PME/ME e os detalhes da O.S.':''}</div>`;
 root.querySelectorAll('[data-gg-city]').forEach(b=>b.onclick=()=>{S.city=b.dataset.ggCity;qqGeneralUnit='';draw()});
 $('ggUnit').onchange=e=>{qqGeneralUnit=e.target.value;draw()};
 root.querySelectorAll('[data-general-bar]').forEach(el=>{
  const open=()=>{const rows=ctx.current.filter(r=>r.un===el.dataset.unit&&(r.gf||r.f)===el.dataset.front);qqOpenGeneralRecords(rows,el.dataset.unit+' · '+el.dataset.front+' · '+periods,'offenders','b')};
  el.onclick=open;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}};
 });
 qqWireGeneralCells(root,cells);
 qqWireEvolutionPicker(ctx);
 $('ggMethod').onclick=()=>{
  $('catModalTitle').textContent='Visão geral — critérios e fontes';$('catModalSub').textContent='Mesma base de QQ, com quatro frentes e unidades de origem';
  $('catModalBody').innerHTML=`<p>Fonte: base de QQ publicada no sistema e atualizada pelas importações incrementais.</p><table class="qq-orders"><tr><th>Frente</th><th>Regra</th><th>Meta qualificada</th><th>Meta de quebra</th></tr><tr><td>ND</td><td>TIPO_ATENDIMENTO = Novos Domicílios, sem segmento PME.</td><td>${pct(QQ_QUALIFIED_GOAL.ND,2)}</td><td>${pct(QQ_BREAK_GOAL.ND,2)}</td></tr><tr><td>PME</td><td>Novos Domicílios com SEGMENTO_CONTRATO contendo PME, incluindo PURPLE PME PF.</td><td>${pct(QQ_QUALIFIED_GOAL.PME,2)}</td><td>${pct(QQ_BREAK_GOAL.PME,2)}</td></tr><tr><td>MIG</td><td>TIPO_ATENDIMENTO = Migração.</td><td>${pct(QQ_QUALIFIED_GOAL.MIG,2)}</td><td>${pct(QQ_BREAK_GOAL.MIG,2)}</td></tr><tr><td>ME</td><td>GRUPO_OS = MUDANCA DE ENDERECO. Em arquivos antigos sem essa coluna, usa o tipo real da OS; o agrupamento ME isolado não inclui serviços ou retornos de credenciada.</td><td>${pct(QQ_QUALIFIED_GOAL.ME,2)}</td><td>${pct(QQ_BREAK_GOAL.ME,2)}</td></tr></table><p>As metas de quebra são ND ${pct(QQ_BREAK_GOAL.ND,0)}, PME ${pct(QQ_BREAK_GOAL.PME,0)}, MIG ${pct(QQ_BREAK_GOAL.MIG,0)} e ME ${pct(QQ_BREAK_GOAL.ME,0)}. A taxa é a quantidade de linhas com COM QUEBRA DE AGENDA dividida pelas O.S. do recorte. Baixa 409 com tratamento SEM QUEBRA DE AGENDA, responsável SEM_QUEBRA e categoria sem divergência é positiva: permanece na base e não acrescenta quebra ou qualificada. Motivo de reagendamento isolado é histórico. A qualificada soma as categorias elegíveis, mantém o rateio de 1/3 quando há mais de um processo e exclui Outros. Registros com RESPONSAVEL_QUEBRA = REAG_CLIENTE não adicionam contribuição à qualificada, exceto quando a categoria original é AGENDAMENTO NÃO CUMPRIDO e o tratamento indica COM QUEBRA DE AGENDA. Essa ocorrência entra em Baixa100; a categoria não é um código de baixa. Eles continuam na base e no cálculo da %Quebra conforme TIPO_TRATAMENTO. Não há exclusão geral por IMPACTO_INDICADOR = ADERENTE: registros de SERVICOS DE CAMPO continuam seguindo a categoria da origem.</p><p>O painel QQ original mantém sua definição de ND incluindo PME. A nova visão separa os segmentos para reproduzir a comparação da referência. Todas as unidades de negócio estão disponíveis, incluindo _VT e _ADM, sem remover ou agrupar esses sufixos. Os indicadores continuam considerando somente as O.S. classificadas em ND, PME, MIG ou ME. Uma unidade sem O.S. elegíveis no recorte aparece sem dados, não como resultado zero. As unidades são as da planilha, sem misturar Natal e Parnamirim: o filtro de cidade continua agrupando as duas quando solicitado.</p><p>Com um mês marcado, a evolução diária mostra as últimas dez datas com dados até o último atendimento do mês selecionado, incluindo datas do mês anterior quando necessário. As datas são compartilhadas pelas frentes; dias sem O.S. ficam em branco. A coluna “10 dias” usa a base completa dessa janela e o clique reproduz seu numerador. O total mensal e o gráfico de quebra continuam usando apenas o mês marcado. Com dois ou mais meses marcados, a visão dá prioridade à evolução mensal: gráficos de %Qualificada para ND, PME, MIG e ME e categorias por mês. Os últimos 10 dias ficam sempre visíveis à esquerda, ao lado da evolução mensal à direita. Os filtros de cidade, unidade e datas inicial/final são respeitados em todos os quadros; datas explícitas limitam também o histórico da evolução diária. Meses sem base ou com percentual zero ficam em branco. O MoM mostra mês atual menos mês calendário anterior, em pontos percentuais. Conforme a apresentação da central, o mês atual vazio é considerado zero somente no MoM: por exemplo, outubro vazio e setembro 4,88% resultam em −4,88 p.p., em verde. A redução é verde, o aumento é vermelho e a estabilidade é neutra. Sem informação suficiente nos dois meses, o MoM fica vazio. As sete referências mensais de setembro/2026 informadas da Claro são usadas somente para a base completa conferida de cada unidade e frente. Se a base mudar ou o recorte ficar parcial, os percentuais voltam a ser calculados pela planilha. A composição de categorias e O.S. continua sendo a da fonte, identificada no detalhe. Categorias sem contribuição no respectivo recorte ficam ocultas. Cada barra, categoria ou percentual permite consultar os logins e os detalhes das O.S.</p>`;

  $('catModal').classList.add('on');document.body.style.overflow='hidden';
 };
}
function qqOpenGeneralRecords(records,label){
 const byLogin=[...new Set(records.map(r=>r.lt))].sort();
 $('catModalTitle').textContent=label+' — O.S. qualificadas';$('catModalSub').textContent='Selecione um login para consultar contrato, O.S., dia e baixa';
 $('catModalBody').innerHTML='<table class="qq-orders"><thead><tr><th>Login / nome</th><th>O.S. no recorte</th><th>Contribuições qualificadas</th></tr></thead><tbody>'+byLogin.map((login,i)=>{const a=records.filter(r=>r.lt===login),s=stat(a);return `<tr data-glogin="${i}" tabindex="0" role="button"><td><b>${qqEscape(login)}</b><div class="modal-name">${qqEscape(techName(login))}</div></td><td>${a.length}</td><td>${numBR(s.q,2)}</td></tr>`}).join('')+'</tbody></table>';
 $('catModalBody').querySelectorAll('[data-glogin]').forEach(el=>{const open=()=>qqOpenOrders(byLogin[Number(el.dataset.glogin)],records,null,label,()=>qqOpenGeneralRecords(records,label));el.onclick=open;el.onkeydown=e=>{if(e.key==='Enter')open()}});
 $('catModal').classList.add('on');document.body.style.overflow='hidden';
}
window.setUnifiedQQView=function(view){S.general=view==='general';document.body.classList.toggle('qq-general',S.general);draw();};
const __drawWithGeneral=draw;
draw=function(){if(S.general){qqRenderGeneral();try{window.parent.refreshUnifiedMonth?.()}catch(e){}}else __drawWithGeneral();};



window.getQQClosureAudit=function(month){return ['NTL-DMV','PWM-DMV','MRO-DMV'].map(unit=>{const rows=RECS.filter(r=>r.un===unit&&r.d.startsWith(month));return {unit,nd:stat(rows.filter(r=>r.f==='ND')),mig:stat(rows.filter(r=>r.f==='MIG')),ndGeneral:stat(rows.filter(r=>r.gf==='ND'))};});};

const QQ_INITIAL_GZIP="";
// Restore fields only when the complete saved month matches this source snapshot.
function qqLegacyKey(r){return JSON.stringify([r.f,r.d,r.w||'',r.lt,r.un,r.cl||'',r.b,Object.entries(r.c||{}).sort(([a],[b])=>a.localeCompare(b))]);}
function qqSameLegacyMonth(a,b){
 if(a.length!==b.length)return false;
 const counts=new Map();for(const r of a){const k=qqLegacyKey(r);counts.set(k,(counts.get(k)||0)+1);}
 for(const r of b){const k=qqLegacyKey(r),n=counts.get(k)||0;if(!n)return false;if(n===1)counts.delete(k);else counts.set(k,n-1);}
 return !counts.size;
}

const QQ_PREVIOUS_SOURCE_SIGNATURES={"2026-08":"2d05b20431cd31646932a9de7a0697a1e3e88fec59437924c94a1efda8f44af0","2026-09":"8220cb09d16c23610638597ac05096b8e125c40da7f3d273fd5c7305e255ce21","2026-10":"2059e50829aee2f8ec17e73cda9bf89d322f64e34548b9df7d145fbaf238c13a"};
async function qqSourceSignature(records){
 if(!globalThis.crypto?.subtle)return '';
 const text=records.map(r=>JSON.stringify([...JSON.parse(qqLegacyKey(r)),r.os||'',r.wo||'',r.contract||'',r.service||'',r.group||''])).sort().join('\n');
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
 return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function qqDecodeSaved(value){
 if(!value.startsWith('gz:'))return JSON.parse(value);
 const bytes=Uint8Array.from(atob(value.slice(3)),c=>c.charCodeAt(0));
 return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
}
function qqClean409(r){
 const codes=String(r.baixa??'').match(/\d+/g)||[];
 const responsible=norm(r.responsible).replace(/[ _-]/g,'');
 const category=norm(r.rawCategory);
 return codes.includes('409')&&norm(r.treatment)==='SEM QUEBRA DE AGENDA'&&responsible==='SEMQUEBRA'&&['','N/A','NA','-','-3','SEM QUEBRA','SEM_QUEBRA'].includes(category);
}
function qqNormalize409(r){return qqClean409(r)?{...r,b:0,c:null}:r;}
function qqOutcome(r){
 if(qqClientReschedule(r)&&qqMissedAppointment(r))return {label:'Ofensor · agendamento não cumprido',kind:'negative',explanation:'A origem registra COM QUEBRA DE AGENDA e AGENDAMENTO NÃO CUMPRIDO. Essa ocorrência entra na categoria Baixa100 e na qualificada, mesmo com responsável REAG_CLIENTE. O código de baixa original permanece inalterado.'};
 if(qqClientReschedule(r))return {label:'Reag. cliente · não qualificada',kind:r.b?'negative':'positive',explanation:'O responsável na origem é REAG_CLIENTE. A O.S. permanece na base e na %Quebra conforme o tratamento, mas a categoria original não adiciona contribuição à %Qualificada.'};
 if(qqClean409(r))return {label:'Positivo · baixa 409 sem divergências',kind:'positive',explanation:'Tratamento sem quebra, responsável SEM_QUEBRA e categoria sem divergência. Conta na base atendida; não adiciona quebra nem qualificada. O motivo de reagendamento é apenas histórico.'};
 const s=stat([r]);
 if(s.q>0)return {label:'Ofensor · qualificada',kind:'negative',explanation:'Há categoria qualificada na origem. A baixa 409, quando presente, não elimina uma divergência efetivamente registrada.'};
 if(s.b>0)return {label:'Com quebra de agenda',kind:'negative',explanation:'O tratamento da origem registra quebra de agenda.'};
 return {label:'Regular · sem impacto negativo',kind:'positive',explanation:'Participa da base do indicador, sem adicionar quebra ou contribuição qualificada.'};
}
function qqOpenGeneralRecords(records,label,scope='offenders',metric='q',monthlyInfo=null){
 const isBreak=metric==='b',name=isBreak?'%Quebra':'%Qualificada';
 const amount=s=>isBreak?s.b:s.q,rate=s=>isBreak?s.pb:s.pq;
 const total=stat(records),reported=!isBreak&&monthlyInfo?.references?.length?monthlyInfo:null,displayRate=reported?reported.pq:rate(total),negative=records.filter(r=>amount(stat([r]))>0);
 const selected=scope==='all'?records:negative;
 const byLogin=Object.entries(group(selected,r=>r.lt)).map(([login,rows])=>({login,rows,s:stat(rows),base:stat(records.filter(r=>r.lt===login))})).sort((a,b)=>amount(b.s)-amount(a.s)||b.rows.length-a.rows.length||a.login.localeCompare(b.login));
 $('catModalTitle').textContent=label+' — composição da '+name;
 $('catModalSub').textContent=`Base: ${records.length} O.S. · ${isBreak?'com quebra':'contribuições qualificadas'}: ${numBR(amount(total),2)} · ${reported?'taxa mensal Claro informada':'taxa da planilha'}: ${qqRateLabel(displayRate)}`;
 $('catModalBody').innerHTML=`<div class="modal-kpis">
  <div class="modal-kpi"><small>${reported?name+' mensal · Claro':name+' no recorte'}</small><b>${qqRateLabel(displayRate)}</b></div>
  <div class="modal-kpi"><small>${isBreak?'O.S. com quebra':'Contribuição qualificada'}</small><b>${numBR(amount(total),2)} OS</b></div>
  <div class="modal-kpi"><small>Base do recorte</small><b>${total.n} OS</b></div>
  <div class="modal-kpi"><small>Logins exibidos</small><b>${byLogin.length}</b></div>
 </div>${reported?`<p class="note qq-monthly-reference-note">Percentual mensal informado da Claro: <b>${pct(reported.pq,2)}</b>. A composição abaixo mostra os registros da planilha: <b>${numBR(total.q,2)} contribuições em ${total.n} O.S.</b>${rate(total)>0?' ('+qqRateLabel(rate(total))+')':''}.</p>`:''}<div class="qq-scope"><button id="qqOnlyOffenders" class="${scope==='offenders'?'active':''}">Somente ofensores (${negative.length} O.S.)</button><button id="qqAllRecords" class="${scope==='all'?'active':''}">Toda a base (${records.length} O.S.)</button></div><p class="note">${isBreak?'As O.S. com quebra compõem o numerador da barra selecionada. A base inclui todos os atendimentos da mesma unidade, frente e período.':'Registros positivos compõem a base atendida e não aumentam o numerador qualificado.'} Clique no login para ver contrato, O.S., dia, código de baixa e demais detalhes.</p>`+
 (byLogin.length?'<div class="qq-order-scroll"><table class="qq-orders"><thead><tr><th>Login / nome</th><th>O.S. exibidas</th><th>'+(isBreak?'Com quebra':'Qualificadas')+'</th><th>Base do login</th><th>'+name+' do login</th></tr></thead><tbody>'+byLogin.map((o,i)=>`<tr data-glogin="${i}" tabindex="0" role="button" aria-label="Ver O.S. de ${qqEscape(o.login)}"><td class="qq-login-link"><b>${qqEscape(o.login)}</b><div class="modal-name">${qqEscape(techName(o.login))}</div></td><td>${o.rows.length}</td><td>${numBR(amount(o.s),2)}</td><td>${o.base.n}</td><td>${qqRateLabel(rate(o.base))}</td></tr>`).join('')+'</tbody></table></div>':`<div class="modal-empty">Nenhuma O.S. ${isBreak?'com quebra':'qualificada'} neste recorte. Use “Toda a base” para consultar os atendimentos.</div>`);
 $('qqOnlyOffenders').onclick=()=>qqOpenGeneralRecords(records,label,'offenders',metric,monthlyInfo);
 $('qqAllRecords').onclick=()=>qqOpenGeneralRecords(records,label,'all',metric,monthlyInfo);
 $('catModalBody').querySelectorAll('[data-glogin]').forEach(el=>{const open=()=>qqOpenOrders(byLogin[Number(el.dataset.glogin)].login,selected,null,label+' · '+name,()=>qqOpenGeneralRecords(records,label,scope,metric,monthlyInfo),'← Voltar aos logins');el.onclick=open;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}}});
 $('catModal').classList.add('on');$('catModal').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
}
function qqGeneralBars(ctx){
 const {displayUnits:units,current}=ctx;
 const W=Math.max(920,units.length*300,($('qqGeneralView').clientWidth||(window.innerWidth||1280)/.8)-40),H=$('qqGeneralView').classList.contains('gg-single-screen')?Math.max(130,Math.min(240,(window.innerHeight||800)*.27)-48):$('qqGeneralView').classList.contains('gg-detailed')?Math.max(140,Math.min(200,(window.innerHeight||800)*.22)):Math.max(215,Math.min(300,(window.innerHeight||800)*.30-32)),left=44,right=20,baseline=H-48,plotH=baseline-40;
 const max=Math.max(.4,...units.flatMap(u=>['ND','PME','MIG','ME'].map(f=>qqGeneralStats(current,u,f).pb)).filter(Number.isFinite))+.06;
 let svg=`<svg class="gg-business-units-chart" style="min-width:${units.length>5?W:920}px;flex-shrink:0" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="group" aria-label="Percentual de quebra de agenda por unidade e frente. Selecione uma barra para ver os logins e O.S.">`;
 const tickStep=$('qqGeneralView').classList.contains('gg-single-screen')?Math.max(.1,Math.ceil(max*5)*.05):.1;
 for(let tick=0;tick<=max;tick+=tickStep){const y=baseline-tick/max*plotH;svg+=`<line x1="${left}" y1="${y}" x2="${W-right}" y2="${y}" stroke="#e8ebef"/><text x="${left-8}" y="${y+4}" text-anchor="end" font-size="12">${Math.round(tick*100)}%</text>`;}
 svg+=qqBreakGuides(W,baseline,plotH,max,left,right);
 units.forEach((u,i)=>{const span=(W-left-right)/Math.max(1,units.length),center=left+(i+.5)*span,bw=Math.min(54,(span-36)/5),gap=Math.max(9,bw*.3),start=center-(4*bw+3*gap)/2;
  ['ND','PME','MIG','ME'].forEach((f,j)=>{const s=qqGeneralStats(current,u,f),x=start+j*(bw+gap),h=s.n?s.pb/max*plotH:0;
   const label=u+' · '+f+' · '+(s.n?pct(s.pb,2)+' · '+s.b+'/'+s.n+' O.S. com quebra · clique para ver os logins':'sem dados');
   svg+=`<g ${s.n?`class="qq-general-bar" data-general-bar="${i}-${j}" data-unit="${qqEscape(u)}" data-front="${f}" tabindex="0" role="button" aria-label="${qqEscape(label)}"`:''}><title>${qqEscape(label)}</title><rect class="gg-bar-hit" x="${x-3}" y="${baseline-h-26}" width="${bw+6}" height="${h+49}" fill="transparent"/><rect class="gg-bar-fill" x="${x}" y="${baseline-h}" width="${bw}" height="${h}" rx="3" fill="${QQ_FRONT_COLOR[f]}"/>${qqChartGoalRate(s.n?s.pb:NaN,QQ_BREAK_GOAL[f],x+bw/2,baseline-h-9,2,13)}<text x="${x+bw/2}" y="${baseline+19}" text-anchor="middle" font-size="12">${f}</text></g>`;
  });svg+=`<text x="${center}" y="${H-6}" text-anchor="middle" font-size="14" font-weight="700">${qqEscape(u)}</text>`;
 });return svg+'</svg>';
}
const qqInit409=init;
init=function(reset){RECS=RECS.map(qqNormalizeFront).filter(Boolean).map(qqNormalize409);qqInit409(reset);};
let qqResizeTimer;
window.addEventListener('resize',()=>{clearTimeout(qqResizeTimer);qqResizeTimer=setTimeout(()=>{if(S.general)qqRenderGeneral();},120);});


const QQ_SEPTEMBER_AUDIT_B64="";
function qqDownloadSeptemberAudit(){
 const bytes=Uint8Array.from(atob(QQ_SEPTEMBER_AUDIT_B64),c=>c.charCodeAt(0));
 const url=URL.createObjectURL(new Blob([bytes],{type:'application/x-ipynb+json'}));
 const a=document.createElement('a');a.href=url;a.download='Conferencia_Qualificada_Setembro_2026.ipynb';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
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

const QQ_NAME_UPDATES={};
Object.assign(NAME_MAP,QQ_NAME_UPDATES);
let qqDates={start:'',end:''};
function qqDatePass(r){return (!qqDates.start||r.d>=qqDates.start)&&(!qqDates.end||r.d<=qqDates.end);}
function qqFrontMatches(r,front){return front==='ND'||front==='MIG'?r.f===front:(r.gf||r.f)===front;}
function qqMetaGuide(width,y,target){return `<line x1="10" x2="${width-10}" y1="${y}" y2="${y}" stroke="#8396ae" stroke-width="1.1" stroke-dasharray="6 4"><title>Meta ≤ ${pct(target,2)}</title></line><g><rect x="${width-116}" y="1" width="107" height="20" rx="5" fill="#eef3f9" stroke="#d4deec"/><text x="${width-18}" y="15" text-anchor="end" fill="#4f6380" font-size="12" font-weight="700">Meta ≤ ${pct(target,2)}</text></g>`;}
function qqKpi(title,s,key,target,g=false,mom=''){
 const v=s[key],available=s.n>0&&Number.isFinite(v),good=available&&target!=null&&v<=target,progress=available?targetProgress(v,target,true):null;
 const message=!available?'Sem O.S. no recorte':good?'Meta atingida':target==null?'Meta de qualificada não definida':'Acima da meta';
 const arrow=available&&target!=null?modernTrendSvg(good?'up':'down',good?'good':'bad'):'';
 const goal=target!=null?`<div class="qq-goal ${good?'good':'bad'}" title="${message}. Cumprimento: ${progress==null?'sem dados':pct(progress/100,2)}. Quanto menor a taxa, melhor."><div class="qq-goal-label"><span>Meta ≤ ${pct(target,2)}</span><strong>${message}</strong></div><div class="qq-goal-track" role="progressbar" aria-label="Cumprimento da meta de ${title}" aria-valuemin="0" aria-valuemax="100" ${progress==null?'':`aria-valuenow="${progress.toFixed(2)}"`} aria-valuetext="${message}"><span class="qq-goal-fill" style="width:${progress||0}%"></span></div></div>`:`<div class="qq-goal-na">${message}</div>`;
 return `<div class="kpi ${g?'g':''}"><small>${title}</small><div class="qq-kpi-value"><b>${available?pct(v):'—'}</b><span role="img" aria-label="${message}" title="${message}">${arrow}</span></div>${available?mom:''}<em>${s.n.toLocaleString('pt-BR')} O.S.${title.includes('ND')?' · inclui PME':''}</em>${goal}</div>`;
}
window.setUnifiedMonths=function(months){const available=window.getUnifiedMonths().months,selected=[...new Set(months||[])].filter(m=>available.includes(m));buildMulti('fMes',available,selected.length?selected:available,false);draw();};
window.setUnifiedMonth=function(month){window.setUnifiedMonths(month?[month]:[]);};
window.getUnifiedDates=()=>({...qqDates});
window.setUnifiedDates=function(range){if(range.start&&range.end&&range.start>range.end)return false;qqDates={start:range.start||'',end:range.end||''};$('qqDateStart').value=qqDates.start;$('qqDateEnd').value=qqDates.end;$('qqRangeError').textContent='';draw();return true;};
function qqChangeDates(){const range={start:$('qqDateStart').value,end:$('qqDateEnd').value};if(range.start&&range.end&&range.start>range.end){$('qqRangeError').textContent='A data inicial deve ser anterior ou igual à final.';return;}if(window.parent!==window&&window.parent.applyUnifiedDates)window.parent.applyUnifiedDates(range);else window.setUnifiedDates(range);}
['qqDateStart','qqDateEnd'].forEach(id=>$(id).addEventListener('change',qqChangeDates));$('qqClearDates').onclick=()=>{if(window.parent!==window&&window.parent.clearUnifiedDates)window.parent.clearUnifiedDates();else window.setUnifiedDates({});};
const qqDrawRange=draw;
draw=function(){qqDrawRange();const range=[qqDates.start,qqDates.end].filter(Boolean).map(x=>x.split('-').reverse().join('/')).join(' a ');if(range){const target=S.general?document.querySelector('.gg-heading small'):$('upd');if(target)target.textContent+=' · datas: '+range;}try{window.parent.refreshUnifiedMonth?.();}catch(e){}};


async function qqApplyOctoberSnapshot(seed){
 const previous=RECS.filter(r=>r.d.startsWith('2026-10'));
 if(previous.length!==1180||!globalThis.crypto?.subtle)return false;
 const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
 const text=previous.map(r=>JSON.stringify(stable(r))).sort().join('\n');
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
 const signature=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
 if(signature!=='c81a633747e40db6009eae82b7a252f97559866667e507cf265c07f7f4f5ea8a')return false;
 RECS=RECS.filter(r=>!r.d.startsWith('2026-10')).concat(seed.filter(r=>r.d.startsWith('2026-10')));
 await save();
 msg('Outubro atualizado pelo ANALITICO QQ_OUT_.xlsx: 1.877 agendas válidas até 07/10/2026. Agosto e setembro preservados.');
 return true;
}

window.qqDataReady=false;



S.supervisors=new Set();S.supervisorMode=false;let qqSupervisorPickerOpen=false;
Object.assign(NAME_MAP,SV_NAME_CORRECTIONS);
function qqSupervisorRecords(records){return records.filter(r=>svAllows(S.supervisors,r.lt));}
function qqSupervisorControls(base,meses){
 const context=base.filter(r=>meses.includes(r.d.slice(0,7))),missing=new Set(RECS.filter(r=>svFor(r.lt)===SV_UNASSIGNED).map(r=>svLogin(r.lt))).size;
 return `<div class="sv-controls" id="qqSupervisorControls"><div class="sv-control-left"><label for="qqSupervisorSelect">Supervisor</label>${svPickerMarkup('qqSupervisorSelect',S.supervisors,context,'lt')}<div class="sv-switch"><button type="button" data-qq-sv-mode="login" class="${!S.supervisorMode?'on':''}">Por login</button><button type="button" data-qq-sv-mode="supervisor" class="${S.supervisorMode?'on':''}">Por supervisor</button></div></div><button type="button" class="sv-missing-btn" id="qqSupervisorMissing">Editar supervisores${missing?' · '+missing+' sem vínculo':''}</button></div>`;
}
function qqWireSupervisors(){
 $('qqSupervisorSelect').open=qqSupervisorPickerOpen;svWirePicker('qqSupervisorSelect',S.supervisors,()=>{S.login=null;S.loginSearch='';draw();});
 document.querySelectorAll('[data-qq-sv-mode]').forEach(button=>button.onclick=()=>{S.supervisorMode=button.dataset.qqSvMode==='supervisor';draw();});
 $('qqSupervisorMissing').onclick=svOpenEditor;
}
function qqTeamRate(value,target){
 if(!Number.isFinite(value))return '<span class="sv-neutral">—</span>';
 const good=value<=target;return `<span class="sv-value ${good?'sv-good':'sv-bad'}">${pct(value,2)}${modernTrendSvg(good?'up':'down',good?'good':'bad')}</span>`;
}
function qqDrawSupervisorTeams(base,meses,meta,NM){
 const f=S.f,key=S.ind,metric=key==='q'?'pq':'pb',label=key==='q'?'%QUALIFICADA':'%QUEBRA',target=key==='q'?meta[f]:QQ_BREAK_GOAL[f];
 const allFront=qqSupervisorRecords(base).filter(r=>qqFrontMatches(r,f)),rows=allFront.filter(r=>meses.includes(r.d.slice(0,7))),overall=stat(rows),period=meses.map(m=>m.slice(5)+'/'+m.slice(0,4)).join(', ');
 const teams=Object.entries(group(rows,r=>svFor(r.lt))).map(([name,list])=>({name,rows:list,stats:stat(list),logins:new Set(list.map(r=>r.lt)).size})).sort((a,b)=>(a.name===SV_UNASSIGNED)-(b.name===SV_UNASSIGNED)||b.stats[metric]-a.stats[metric]||b.stats.n-a.stats.n||a.name.localeCompare(b.name,'pt-BR'));
 let trend;
 if(meses.length>1)trend=meses.map(month=>{const s=stat(rows.filter(r=>r.d.startsWith(month)));return {l:month.slice(5)+'/'+month.slice(0,4),v:s[metric],t:s.n+' OS'};});
 else{const last=rows.map(r=>r.d).sort().at(-1),end=last?new Date(last+'T00:00:00Z'):null;if(end){end.setUTCDate(end.getUTCDate()-9);const start=end.toISOString().slice(0,10),days=group(allFront.filter(r=>r.d>=start&&r.d<=last),r=>r.d);trend=Object.keys(days).sort().map(day=>{const s=stat(days[day]);return {l:day.slice(8)+'/'+day.slice(5,7),v:s[metric],t:s.n+' OS'};});}else trend=[];}
 const uniqueLogins=new Set(rows.map(r=>r.lt).filter(r=>r&&r!=='(sem login)')).size;
 $('view').innerHTML=`${qqSupervisorControls(base,meses)}<div class="card"><div class="login-toolbar"><div class="login-toolbar-left"><div class="login-tool"><span class="login-tool-label">Frente</span><div class="tg" id="loginFront">${Object.entries(NM).map(([k,name])=>`<button data-lf="${k}" class="${f===k?'on':''}">${svEscape(name)}</button>`).join('')}</div></div><div class="login-tool"><span class="login-tool-label">Indicador</span><div class="tg" id="loginIndicator"><button data-li="q" class="${key==='q'?'on':''}">%Qualificada</button><button data-li="b" class="${key==='b'?'on':''}">%Quebra</button></div></div></div></div><div class="login-summary"><div class="mini"><small>Supervisores no período</small><b>${teams.filter(t=>t.name!==SV_UNASSIGNED).length}</b></div><div class="mini"><small>Logins da frente</small><b>${uniqueLogins}</b></div><div class="mini"><small>Base da frente</small><b>${overall.n} OS</b></div><div class="mini"><small>${label} · ${svEscape(svLabel(S.supervisors,'Todas as equipes'))}</small><b>${qqTeamRate(overall[metric],target)}</b></div></div></div><section class="sv-panel"><div class="sv-panel-head"><strong>SUPERVISORES | ${label} ${svEscape(NM[f].toUpperCase())} · EVOLUÇÃO ${meses.length>1?'MENSAL':'DOS ÚLTIMOS 10 DIAS'}</strong><small>${svEscape(svLabel(S.supervisors))} · ${period}</small></div>${svChart(trend,target)}<div class="sv-table-wrap"><table class="sv-table" id="qqSupervisorTable" style="min-width:${Math.max(750,260+meses.length*260)}px"><thead><tr><th rowspan="2">SUPERVISOR</th>${meses.map(month=>`<th class="sv-month-start" colspan="4">${month.slice(5)+'/'+month.slice(0,4)}</th>`).join('')}<th rowspan="2">PERÍODO<small class="sv-sub">${label}</small></th></tr><tr>${meses.map(()=>`<th class="sv-month-start">LOGINS</th><th>OS</th><th>%QUALIFICADA<small class="sv-sub">Meta ≤ ${pct(meta[f],2)}</small></th><th>%QUEBRA<small class="sv-sub">Meta ≤ ${pct(QQ_BREAK_GOAL[f],2)}</small></th>`).join('')}</tr></thead><tbody>${teams.map((team,i)=>`<tr><td><button type="button" class="sv-team-link" data-qq-team="${i}">${svEscape(team.name)}<small>${team.logins} logins no período · ver equipe →</small></button></td>${meses.map(month=>{const records=team.rows.filter(r=>r.d.startsWith(month)),s=stat(records);return `<td class="sv-month-start">${records.length?new Set(records.map(r=>r.lt)).size:'—'}</td><td>${s.n||'—'}</td><td>${qqTeamRate(s.pq,meta[f])}</td><td>${qqTeamRate(s.pb,QQ_BREAK_GOAL[f])}</td>`;}).join('')}<td>${qqTeamRate(team.stats[metric],target)}<small class="sv-sub">${numBR(key==='q'?team.stats.q:team.stats.b,2)} / ${team.stats.n} OS</small></td></tr>`).join('')||`<tr><td colspan="${2+meses.length*4}" class="sv-empty">Nenhuma equipe encontrada nesta frente e período.</td></tr>`}</tbody></table></div><div class="sv-note">Clique no supervisor para apresentar os logins da equipe. Os percentuais usam as ocorrências e a base total de O.S. de cada equipe; as regras de qualificada, quebra e categorias permanecem as do painel.</div></section>`;
 document.querySelectorAll('[data-qq-team]').forEach(button=>button.onclick=()=>{S.supervisors.clear();S.supervisors.add(teams[Number(button.dataset.qqTeam)].name);S.supervisorMode=false;S.loginSearch='';S.login=null;draw();});
 document.querySelectorAll('#loginFront [data-lf]').forEach(button=>button.onclick=()=>{S.f=button.dataset.lf;draw();});
 document.querySelectorAll('#loginIndicator [data-li]').forEach(button=>button.onclick=()=>{S.ind=button.dataset.li;draw();});
 qqWireSupervisors();
}
const qqLoginsBeforeSupervisor=drawLogins;
drawLogins=function(base,meses,meta,NM){
 document.body.classList.add('qq-supervisor-logins');
 if(S.supervisorMode){qqDrawSupervisorTeams(base,meses,meta,NM);return;}
 qqLoginsBeforeSupervisor(qqSupervisorRecords(base),meses,meta,NM);
 $('view').insertAdjacentHTML('afterbegin',qqSupervisorControls(base,meses));
 document.querySelectorAll('[data-login-row]').forEach(row=>{const cell=row.querySelector('.login-person');if(cell)cell.insertAdjacentHTML('afterend',`<span class="sv-label ${svFor(row.dataset.loginRow)===SV_UNASSIGNED?'missing':''}">${svEscape(svFor(row.dataset.loginRow))}</span>`);});
 const detail=document.querySelector('.login-detail-ident');if(detail&&S.login)detail.insertAdjacentHTML('beforeend',`<span class="sv-label">${svEscape(svFor(S.login))}</span>`);
 qqWireSupervisors();
};
const qqDrawBeforeSupervisor=draw;
draw=function(){qqSupervisorPickerOpen=$('qqSupervisorSelect')?.open||false;document.body.classList.toggle('qq-supervisor-logins',!S.general&&S.view==='logins');qqDrawBeforeSupervisor();};
window.getSupervisorRoster=()=>RECS.map(r=>({login:r.lt,name:techName(r.lt),city:presentationCityLabel(recCity(r))}));
window.refreshSupervisorRegistry=()=>draw();



// The report compares the complete loaded base with the dated operator reference.
window.getOperatorQQReconciliation=function(reference,cutoff='2026-10-05'){
 const rows=RECS.filter(r=>r.d<=cutoff),items=[];
 for(const [un,fronts] of Object.entries(reference))for(const [front,values] of Object.entries(fronts))values.forEach((target,i)=>{
  if(target==null)return;const month=['2026-08','2026-09','2026-10'][i];
  const s=stat(rows.filter(r=>r.un===un&&r.d.startsWith(month)&&(r.gf||r.f)===front));
  const actual=s.n?Number((s.pq*100).toFixed(2)):null;
  items.push({un,front,month,n:s.n,q:s.q,b:s.b,actual,operator:target,matched:actual===target,delta:actual==null?null:actual-target});
 });
 return {ready:window.qqDataReady,items,total:RECS.length,latest:RECS.map(r=>r.d).sort().at(-1)||'',legacy:RECS.filter(r=>r.sv!==3).length};
};
window.openOperatorQQRecords=function(un,month,front){
 const rows=RECS.filter(r=>r.un===un&&r.d.startsWith(month)&&r.d<='2026-10-05'&&(r.gf||r.f)===front);
 qqOpenGeneralRecords(rows,'Conferência operadora · '+un+' · '+front+' · '+qqGeneralMonthLabel(month),'all','q');
};


window.getPWMSeptemberAudit=function(){
 const rows=RECS.filter(r=>r.un==='PWM-DMV'&&(r.gf||r.f)==='ME'&&r.d.startsWith('2026-09'));
 const s=stat(rows),offenders=rows.filter(r=>stat([r]).q>0);
 return {ready:window.qqDataReady,n:s.n,q:s.q,b:s.b,pq:s.pq,pb:s.pb,
  municipalities:Object.entries(group(rows,r=>recCity(r))).map(([city,items])=>({city,n:items.length})),
  offenders:offenders.map(r=>({os:r.os,wo:r.wo,contract:r.contract,day:r.d,login:r.lt,category:r.rawCategory,responsible:r.responsible,lowCode:r.baixa})),
  sourceTotal:RECS.length,expectedPercent:.94,matched:s.n>0&&Number((s.pq*100).toFixed(2))===.94};
};
window.openPWMSeptemberAudit=function(){
 window.openOperatorQQRecords('PWM-DMV','2026-09','ME');
};

// One visible business-unit control in the parent dashboard. Keep local controls
// as the existing filter state and as a fallback when the QQ frame is standalone.
window.getUnifiedUnits=function(){
 const units=qqUnitOptions(),selected=S.general&&qqGeneralUnit?[qqGeneralUnit]:getMulti('fUn');
 const all=units.every(unit=>selected.includes(unit));
 return {units,selected:all?[]:selected,multiple:true,ready:window.qqDataReady};
};
window.setUnifiedUnits=function(values){
 const units=qqUnitOptions(),selected=[...new Set(values||[])].filter(unit=>units.includes(unit));
 if(values?.length&&!selected.length)return false;
 buildMulti('fUn',units,selected.length?selected:units,false);
 qqGeneralUnit=selected.length===1?selected[0]:'';
 draw();return true;
};


/* Presentation-only navigation. The loaded rows and indicator formulas are untouched. */
(() => {
 let active=false;
 const locks=new Map();
 const fronts=[['ND','Novos Domicílios'],['MIG','Migração'],['PME','PME'],['ME','ME · Mudança de Endereço']];
 const allClusters=()=>[...new Set(RECS.map(r=>r.cl))].sort();
 const periodRows=()=>{const months=getMulti('fMes');return RECS.filter(r=>qqDatePass(r)&&months.includes(r.d.slice(0,7)));};
 function lock(){
  for(const el of document.querySelectorAll('#cityStrip,.tabs,.gg-city-buttons,#ggEvolutionMonthPicker,.unified-unit-local,#btnPresentationFilters')){
   if(!locks.has(el))locks.set(el,el.getAttribute('inert'));
   el.setAttribute('inert','');
  }
 }
 function unlock(){for(const [el,old]of locks){if(old===null)el.removeAttribute('inert');else el.setAttribute('inert',old);}locks.clear();}
 function closeDetails(){const modal=$('catModal');modal?.classList.remove('on');modal?.setAttribute('aria-hidden','true');document.body.style.overflow='';qqEvolutionPickerOpen=false;}
 window.technetSlides={
  ready:()=>!!window.qqDataReady,
  list(){
   const rows=periodRows(),cities=[...new Set(rows.map(r=>presentationCityLabel(recCity(r))).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
   return cities.flatMap(city=>fronts.map(([front,label])=>({panel:'qq',city,front,label,duration:30000}))).concat(rows.length?[{panel:'general',city:'',label:'Todas as cidades',duration:90000}]:[]);
  },
  begin(){
   const snapshot={city:S.city,front:S.f,view:S.view,general:!!S.general,units:getMulti('fUn'),clusters:getMulti('fCl'),generalUnit:qqGeneralUnit,supervisors:[...S.supervisors],supervisorMode:S.supervisorMode,login:S.login,loginSearch:S.loginSearch};
   active=true;document.body.classList.add('slides-frame-active');closeDetails();
   buildMulti('fUn',qqUnitOptions(),qqUnitOptions(),false);buildMulti('fCl',allClusters(),allClusters(),false);
   return snapshot;
  },
  show(slide){
   if(!active||!['qq','general'].includes(slide.panel))return false;
   if(slide.panel==='qq'&&(!slide.city||!fronts.some(([f])=>f===slide.front)||!periodRows().some(r=>presentationCityLabel(recCity(r))===slide.city)))return false;
   S.city=slide.panel==='general'?'':slide.city;S.f=slide.front||'ND';S.view='front';S.general=slide.panel==='general';S.login=null;S.loginSearch='';S.supervisorMode=false;S.supervisors.clear();qqGeneralUnit='';
   document.body.classList.toggle('qq-general',S.general);closeDetails();draw();
   requestAnimationFrame(()=>{document.scrollingElement?.scrollTo?.(0,0);for(const el of document.querySelectorAll('.detail-scroll,.gg-chart-inner,.gg-table-scroll')){el.scrollTop=0;el.scrollLeft=0;}});
   return true;
  },
  restore(snapshot){
   active=false;document.body.classList.remove('slides-frame-active');unlock();closeDetails();if(!snapshot)return;
   S.city=snapshot.city;S.f=snapshot.front;S.view=snapshot.view;S.general=snapshot.general;S.login=snapshot.login;S.loginSearch=snapshot.loginSearch;S.supervisorMode=snapshot.supervisorMode;
   S.supervisors.clear();snapshot.supervisors.forEach(s=>S.supervisors.add(s));qqGeneralUnit=snapshot.generalUnit;
   buildMulti('fUn',qqUnitOptions(),snapshot.units,false);buildMulti('fCl',allClusters(),snapshot.clusters,false);
   document.body.classList.toggle('qq-general',S.general);draw();
  }
 };
 const previousDraw=draw;draw=function(){previousDraw();if(active)lock();};
})();


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
  
return window;
}
