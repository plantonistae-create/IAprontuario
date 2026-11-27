/* NEXA V5.25 (CANDIDATE, NOT DEPLOYED) — administrator panel "Preservação clínica": stored volume, protected sessions, pending backups, estimated costs, Core export candidates.
 * Read-only. Data comes from public.nexa_admin_preservation_summary() (admin-checked on the SERVER; aggregate numbers only). The button is shown only to administrators, but the server decides.
 * Costs are ESTIMATES from the numbers above and tariffs the administrator types in (kept in this browser only); no tariff is assumed, so nothing is shown until one is entered.
 * All values are written with textContent (never innerHTML). */
(()=>{
'use strict';
if(window.nexaAdminPreservationV525)return;
const num=v=>Number.isFinite(Number(v))?Number(v):0,fmtBytes=b=>{b=num(b);const u=['B','KB','MB','GB','TB'];let i=0;while(b>=1024&&i<u.length-1){b/=1024;i++}return(i?b.toFixed(b<10?2:1):String(Math.round(b)))+' '+u[i]};
const KMS_CALLS_PER_CHUNK={v1:3,v2:0.05};   // MEASURED with the real handler (v1: wrap+verify+one read; v2: per-session key, warm isolate); v2 value is a conservative allowance for cold isolates
function costs(a,t){
  const out={storage:null,kms:null,note:null};
  if(t&&Number.isFinite(t.storagePerGbMonth)&&t.storagePerGbMonth>=0)out.storage=+(num(a.stored_bytes)/1073741824*t.storagePerGbMonth).toFixed(4);
  if(t&&Number.isFinite(t.kmsPer10k)&&t.kmsPer10k>=0){const calls=num(a.envelope_v1_chunks)*KMS_CALLS_PER_CHUNK.v1+num(a.envelope_v2_chunks)*KMS_CALLS_PER_CHUNK.v2+num(a.session_keys_v2);out.kms=+(calls/1e4*t.kmsPer10k).toFixed(4);out.kmsCalls=Math.round(calls)}
  if(out.storage===null&&out.kms===null)out.note='Informe as tarifas para estimar custos (nenhuma tarifa é assumida).';return out;
}
function rows(d,t){
  const a=d.audio||{},c=d.capture||{},k=costs(a,t),kinds=c.records_by_kind||{};
  return[
    ['Volume armazenado (envelopes cifrados)',fmtBytes(a.stored_bytes)],['Áudio protegido (bytes originais)',fmtBytes(a.audio_bytes)],['Trechos',String(num(a.chunks_total))],
    ['Sessões protegidas (backup finalizado)',String(num(a.sessions_protected))],['Médicos com backup',String(num(a.physicians_with_backup))],['Sessões nas últimas 24 h / 7 dias',num(a.sessions_last_24h)+' / '+num(a.sessions_last_7d)],
    ['Backups pendentes (iniciados, não finalizados)',String(num(a.pending_backups))],['Pendentes parados há mais de 30 min (atenção)',String(num(a.pending_backups_stale))],
    ['Envelopes v1 / v2 / chaves de sessão',num(a.envelope_v1_chunks)+' / '+num(a.envelope_v2_chunks)+' / '+num(a.session_keys_v2)],
    ['Atendimentos com captura versionada',String(num(c.encounters_with_capture))],['Registros de captura',String(num(c.records_total))+(Object.keys(kinds).length?' ('+Object.entries(kinds).map(([x,n])=>x+': '+n).join(', ')+')':'')],
    ['Candidatos a exportação — ASR / Radar / documentação',num(c.candidates_asr)+' / '+num(c.candidates_radar)+' / '+num(c.candidates_documentation)],
    ['Custo estimado de armazenamento (mês)',k.storage===null?'—':String(k.storage)],['Custo estimado de KMS (mês)',k.kms===null?'—':String(k.kms)+' ('+k.kmsCalls+' chamadas estimadas)'],
  ].concat(k.note?[['Custos',k.note]]:[]);
}
let modal=null,btn=null,last=null,tariffs=null;
const store={get(){try{return JSON.parse(localStorage.getItem('nexaAdminPreservationTariffs')||'null')}catch{return null}},set(v){try{localStorage.setItem('nexaAdminPreservationTariffs',JSON.stringify(v))}catch{}}};
function ensureModal(){
  if(modal)return modal;
  modal=document.createElement('div');modal.className='modal';modal.id='nexaAdminPreservationModal';
  const dlg=document.createElement('div');dlg.className='dialog';
  const head=document.createElement('div');head.className='modal-head';const hw=document.createElement('div');const h=document.createElement('h3');h.textContent='Preservação clínica';const p=document.createElement('p');p.textContent='Somente leitura · números agregados, sem dados de pacientes.';hw.append(h,p);
  const close=document.createElement('button');close.className='btn ghost';close.id='nexaAdminPreservationClose';close.textContent='Fechar';close.onclick=()=>modal.classList.remove('open');head.append(hw,close);
  const form=document.createElement('div');form.id='nexaAdminPreservationTariffs';form.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin:8px 0';
  const mk=(id,label)=>{const l=document.createElement('label');l.style.cssText='font-size:13px;display:flex;flex-direction:column;gap:2px';l.textContent=label;const i=document.createElement('input');i.id=id;i.type='number';i.min='0';i.step='any';i.inputMode='decimal';l.append(i);return[l,i]};
  const [l1,i1]=mk('nexaTariffStorage','Armazenamento: tarifa por GB-mês');const [l2,i2]=mk('nexaTariffKms','KMS: tarifa por 10 mil chamadas');tariffs=store.get()||{};if(Number.isFinite(tariffs.storagePerGbMonth))i1.value=tariffs.storagePerGbMonth;if(Number.isFinite(tariffs.kmsPer10k))i2.value=tariffs.kmsPer10k;
  const apply=()=>{tariffs={storagePerGbMonth:i1.value===''?null:Number(i1.value),kmsPer10k:i2.value===''?null:Number(i2.value)};store.set(tariffs);if(last)paint()};i1.oninput=apply;i2.oninput=apply;form.append(l1,l2);
  const body=document.createElement('div');body.id='nexaAdminPreservationBody';body.setAttribute('role','status');body.setAttribute('aria-live','polite');
  dlg.append(head,form,body);modal.append(dlg);document.body.append(modal);return modal;
}
function paint(){
  const body=document.getElementById('nexaAdminPreservationBody');if(!body)return;body.replaceChildren();
  if(!last){body.textContent='Consultando…';return}
  if(last.error){body.textContent=last.error==='ADMIN_REQUIRED'?'Acesso restrito a administradores.':'Não foi possível consultar o resumo.';return}
  const t=document.createElement('table');t.style.cssText='width:100%;border-collapse:collapse';
  for(const [k,v] of rows(last,tariffs)){const tr=document.createElement('tr');const th=document.createElement('th');th.scope='row';th.style.cssText='text-align:left;padding:4px 6px;font-weight:600';th.textContent=k;const td=document.createElement('td');td.style.cssText='padding:4px 6px';td.textContent=v;tr.append(th,td);t.append(tr)}
  const stale=num(last.audio?.pending_backups_stale);if(stale>0){const w=document.createElement('p');w.id='nexaAdminPreservationAlert';w.style.cssText='font-weight:700;margin:8px 0';w.textContent=`Atenção: ${stale} backup(s) pendente(s) há mais de 30 minutos.`;body.append(w)}
  body.append(t);const n=document.createElement('p');n.style.cssText='font-size:12px;opacity:.75';n.textContent=String(last.eligibility_note||'');body.append(n);
}
async function open(sb){ensureModal().classList.add('open');last=null;paint();try{const {data,error}=await sb.rpc('nexa_admin_preservation_summary');last=error?{error:'FAILED'}:(Array.isArray(data)?data[0]:data)||{error:'FAILED'}}catch{last={error:'FAILED'}}paint()}
function start({sb,isAdmin,host=document.querySelector('.header-user')}){
  const sync=()=>{const show=!!isAdmin();if(show&&!btn&&host){btn=document.createElement('button');btn.id='nexaOpenPreservationAdminBtn';btn.type='button';btn.textContent='Preservação';btn.onclick=()=>void open(sb);host.append(btn)}
    if(btn)btn.hidden=!show;if(!show&&modal)modal.classList.remove('open')};
  sync();return setInterval(sync,2000);
}
window.nexaAdminPreservationV525=Object.freeze({rows,costs,start,KMS_CALLS_PER_CHUNK,mode:'candidate_not_deployed'});
})();
