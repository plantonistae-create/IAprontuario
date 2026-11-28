/* S7.1 synthetic browser-only evidence panel. No microphone override, no upload, no purge.
   The served vault wrapper reports original append inputs after its durable readback. */
(()=>{
'use strict';
const A='aaaaaaaa-0000-4000-8000-0000000000a1',B='bbbbbbbb-0000-4000-8000-0000000000b1';
const KEY='nexa-s71-ack-ledger-v1';
const owner=()=>sessionStorage.getItem('nexa-s71-owner')==='B'?B:A;
const read=()=>JSON.parse(localStorage.getItem(KEY)||'{}');
const hash=async buffer=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('');
const evidence=[];let busy=false;
window.__s71RecordAck=async(args,result)=>{
 if(![A,B].includes(args.ownerId)||!result?.readback)throw Error('S71_ACK_SCOPE');
 const digest=await hash(await args.blob.arrayBuffer());
 if(digest!==result.sha256||result.sequence!==args.sequence)throw Error('S71_ACK_DIGEST');
 const ledger=read(),old=ledger[args.sessionId]||{ownerId:args.ownerId,encounterId:args.encounterId,hashes:{}};
 if(old.ownerId!==args.ownerId||old.encounterId!==args.encounterId)throw Error('S71_ACK_SCOPE');
 if(old.hashes[args.sequence]&&old.hashes[args.sequence]!==digest)throw Error('S71_ACK_CONFLICT');
 old.hashes[args.sequence]=digest;ledger[args.sessionId]=old;
 localStorage.setItem(KEY,JSON.stringify(ledger));
};
const details=document.createElement('details');details.style.cssText='position:fixed;top:env(safe-area-inset-top,0px);left:0;right:0;z-index:2147483647;background:#fff5cc;color:#2b2300;border-bottom:2px solid #b08000;padding:8px;font:14px system-ui;max-height:70vh;overflow:auto;';
const summary=document.createElement('summary');summary.textContent='S7.1 LAB — SOMENTE FALA FICTÍCIA · '+(owner()===A?'A':'B');details.append(summary);
const instructions=document.createElement('p');instructions.textContent='Use a interface normal abaixo. Grave apenas “teste fictício A/B, sequência um, dois, três”. Aguarde pelo menos 15 segundos. Não use paciente, credenciais reais nem nomes. Abra este painel para verificar; feche-o para operar o NEXA.';details.append(instructions);
const output=document.createElement('pre');output.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font:12px monospace;';
const buttons=document.createElement('div');buttons.style.cssText='display:flex;flex-wrap:wrap;gap:6px;';details.append(buttons,output);
const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='padding:8px;color:#111;background:#fff;border:1px solid #555;border-radius:6px;';b.onclick=async()=>{if(busy)return;busy=true;try{await fn()}catch(e){output.textContent='FAIL / INCONCLUSIVO: '+String(e?.message||e).slice(0,160)}finally{busy=false}};buttons.append(b)};
const vault=()=>{if(!isSecureContext||!navigator.mediaDevices?.getUserMedia||!window.nexaAudioCheckpointP0)throw Error('S71_SECURE_MIC_OR_VAULT_UNAVAILABLE');return window.nexaAudioCheckpointP0};
const checkOwner=()=>{if(window.currentProf?.id!==owner())throw Error('S71_FIXTURE_OWNER_NOT_READY')};
const recordState=()=>!!document.getElementById('recBtn')?.classList.contains('recording');
button('Verificar cofre',async()=>{
 checkOwner();const V=vault(),who=owner(),ledger=read(),rows=await V.listOwned(who),results=[];
 for(const row of rows){
  const entry=ledger[row.sessionId];let result={finalized:row.finalized===true,acked:entry?Object.keys(entry.hashes).length:0};
  try{
   const data=await V.chunkBuffers({ownerId:who,encounterId:row.encounterId,sessionId:row.sessionId});
   const acked=entry?Object.keys(entry.hashes).map(Number).sort((a,b)=>a-b):[];
   const matches=!!entry&&entry.ownerId===who&&entry.encounterId===row.encounterId&&acked.length>0
    &&acked.every((n,i)=>n===i&&n<data.buffers.length);
   let hashesMatch=matches;
   if(matches)for(const n of acked)if(await hash(data.buffers[n])!==entry.hashes[n])hashesMatch=false;
   result={...result,recovered:data.buffers.length,bytes:data.buffers.reduce((n,b)=>n+b.byteLength,0),
    hashesMatch,allFinalizedBytesMatch:!!(data.finalized&&hashesMatch&&acked.length===data.buffers.length),
    partial:!data.finalized};
  }catch(e){result.error=String(e?.message||e).slice(0,100)}
  results.push(result);
 }
 const snapshot={utc:new Date().toISOString(),owner:who===A?'A':'B',secureContext:isSecureContext,
  realMicrophoneAPI:!!navigator.mediaDevices?.getUserMedia,evidenceFailed:!!window.__s71EvidenceFailed,
  recording:recordState(),sessions:results};
 evidence.push(snapshot);output.textContent=JSON.stringify(snapshot,null,2);
});
button('Trocar A/B e recarregar',async()=>{
 if(recordState())throw Error('Pare a gravação antes de trocar usuário');
 sessionStorage.setItem('nexa-s71-owner',owner()===A?'B':'A');
 location.reload();
});
button('Isolamento negativo (B)',async()=>{
 checkOwner();if(owner()!==B)throw Error('Troque para B primeiro');
 const V=vault(),entry=Object.entries(read()).find(([,e])=>e.ownerId===A);
 if(!entry)throw Error('Grave um trecho de A primeiro');
 const [sessionId,e]=entry;
 let denied=false;try{await V.recover({ownerId:B,encounterId:e.encounterId,sessionId})}catch(err){denied=err.message==='AUDIO_SESSION_NOT_OWNED'}
 const visible=!!document.getElementById('nexaAudioCheckpointRestoreBtn')?.offsetParent;
 const rows=await V.listOwned(B);
 const result={B_recovery_denied:denied,A_session_in_B_list:rows.some(x=>x.sessionId===sessionId),restoreOfferVisible:visible,
  note:'Restore offer may belong to B if B already recorded; run this negative before any B recording.'};
 evidence.push(result);output.textContent=JSON.stringify(result,null,2);
});
button('Copiar evidência desta página',async()=>{
 // The existing fixture replaces navigator.clipboard: use selectable text instead of claiming OS clipboard success.
 output.textContent=JSON.stringify(evidence,null,2);
 const range=document.createRange();range.selectNodeContents(output);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
});
document.body.append(details);
})();