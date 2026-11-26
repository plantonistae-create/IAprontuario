/* NEXA V5.24 (CANDIDATE, NOT DEPLOYED) — explicit physician review of the transcript, with a SEPARATE versioned record (`transcript_corrected`).
 * The server/provider transcript (`transcript_final`) is never altered. Each registered correction is a new capture record that names the final transcript it is based on
 * (base_digest), the correction it replaces (previous_digest) and its own digest. Nothing is autosaved: a correction exists only after the physician presses "Registrar correção".
 * A correction is evidence of what the physician approved; it is NOT a training label and NOT a Core review. */
(()=>{
'use strict';
if(window.nexaTranscriptV524)return;
const MAX=150000;let st=null,panel=null,record=null,encOf=()=>window.nexaEncounterAutosave18101?.currentEncounterId?.()||null,editing=false,timer=null;
const sha=async t=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t))),n=>n.toString(16).padStart(2,'0')).join('');
function mount(){
  const host=document.querySelector('#nexaFlowHistory .nexa-flow-body')||document.querySelector('.nexa-flow-body');if(!host)return false;
  if(panel&&panel.isConnected&&panel.parentElement===host)return true;
  if(!panel){panel=document.createElement('details');panel.id='nexaTranscriptPanel';panel.className='card nexa-transcript-panel';
    panel.innerHTML='<summary style="cursor:pointer;font-weight:700">Transcrição da consulta · revisão opcional</summary><p style="font-size:13px;opacity:.8;margin:8px 0">A transcrição original é preservada. Uma correção é registrada à parte, só quando você pedir, e não altera o original.</p><textarea id="nexaTranscriptText" rows="8" readonly style="width:100%;box-sizing:border-box" aria-label="Transcrição"></textarea><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button type="button" id="nexaTranscriptEdit" class="btn ghost">Editar transcrição</button><button type="button" id="nexaTranscriptSave" class="btn" hidden>Registrar correção</button><button type="button" id="nexaTranscriptCancel" class="btn ghost" hidden>Cancelar edição</button></div><div id="nexaTranscriptState" role="status" aria-live="polite" style="font-size:13px;margin-top:6px"></div>';
    panel.querySelector('#nexaTranscriptEdit').onclick=()=>{if(!st)return;editing=true;sync()};
    panel.querySelector('#nexaTranscriptCancel').onclick=()=>{editing=false;sync()};
    panel.querySelector('#nexaTranscriptSave').onclick=save;}
  host.append(panel);return true;
}
function sync(){
  if(!st||st.enc!==encOf()){if(panel)panel.hidden=true;return}
  if(!mount())return;panel.hidden=false;const ta=panel.querySelector('#nexaTranscriptText'),e=panel.querySelector('#nexaTranscriptEdit'),s=panel.querySelector('#nexaTranscriptSave'),c=panel.querySelector('#nexaTranscriptCancel'),m=panel.querySelector('#nexaTranscriptState');
  if(!editing)ta.value=st.current.text;ta.readOnly=!editing;e.hidden=editing;s.hidden=!editing;c.hidden=!editing;
  m.textContent=st.version?`Correção ${st.version} registrada (original preservado).`:'Transcrição original do servidor.';
}
async function save(){
  const ta=panel.querySelector('#nexaTranscriptText'),m=panel.querySelector('#nexaTranscriptState'),text=String(ta.value||'');
  if(!st||st.enc!==encOf())return;
  if(!text.trim()||text.length>MAX){m.textContent='Texto inválido: vazio ou acima do limite.';return}
  if(text===st.current.text){m.textContent='Nenhuma alteração para registrar.';return}
  const digest=await sha(text);
  const ok=await record('transcript_corrected',{text,base_digest:st.base.digest,previous_digest:st.current.digest,corrected_digest:digest,version:st.version+1,edited_at:new Date().toISOString(),editor:'physician',source:'physician_edit',training_label:false},st.enc);
  if(ok!==true){m.textContent='Não foi possível guardar a correção neste aparelho. O texto continua aberto para você tentar de novo.';return}
  st.current={text,digest};st.version+=1;editing=false;sync();
}
async function setFinal(enc,text,rec){
  if(typeof text!=='string'||!text||typeof rec!=='function'||!enc)return false;
  record=rec;const digest=await sha(text);st={enc,base:{text,digest},current:{text,digest},version:0};editing=false;sync();
  if(!timer)timer=setInterval(()=>{if(!st)return;if(st.enc!==encOf()){st=null;editing=false}sync()},1000);return true;
}
function clear(){st=null;editing=false;if(panel)panel.hidden=true}
window.nexaTranscriptV524=Object.freeze({setFinal,clear,state:()=>st?{enc:st.enc,version:st.version,baseDigest:st.base.digest,currentDigest:st.current.digest,editing}:null,mode:'candidate_not_deployed',trainingAuthorized:false});
})();
