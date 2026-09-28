/* NEXA v18.12.4 — recorder consent/tip layout hotfix */
(()=>{
'use strict';
if(window.__NEXA_RECORDER_LAYOUT_18124__)return;
window.__NEXA_RECORDER_LAYOUT_18124__=true;

function injectStyle(){
  if(document.getElementById('nexaRecorderLayout18124Style'))return;
  const s=document.createElement('style');
  s.id='nexaRecorderLayout18124Style';
  s.textContent=`
  .nexa-consent-legacy-orphan{display:none!important}

  #nexaFlowLive .card.rec-zone.nexa-rec-layout-fixed{
    display:block!important;
    width:100%!important;
    max-width:none!important;
    box-sizing:border-box!important;
    padding:16px 18px 18px!important;
    text-align:center!important;
    overflow:visible!important;
  }

  #nexaFlowLive .nexa-rec-layout-fixed .nexa-recording-kicker{
    display:flex!important;
    width:100%!important;
    align-items:center!important;
    justify-content:flex-start!important;
    margin:0 0 10px!important;
    text-align:left!important;
  }

  #nexaFlowLive .nexa-rec-layout-fixed #nexaUnifiedConsent{
    display:grid!important;
    grid-template-columns:22px minmax(0,1fr)!important;
    align-items:center!important;
    gap:10px!important;
    width:100%!important;
    max-width:none!important;
    box-sizing:border-box!important;
    margin:0 0 14px!important;
    padding:10px 12px!important;
    border-radius:12px!important;
    text-align:left!important;
    background:color-mix(in srgb,var(--nexa-brand) 4%,var(--nexa-surface))!important;
  }
  #nexaFlowLive .nexa-rec-layout-fixed #nexaUnifiedConsent input{
    width:20px!important;height:20px!important;min-width:20px!important;margin:0!important;
    align-self:center!important;
  }
  #nexaFlowLive .nexa-rec-layout-fixed #nexaUnifiedConsent span{
    display:flex!important;flex-direction:column!important;gap:2px!important;min-width:0!important;
  }
  #nexaFlowLive .nexa-rec-layout-fixed #nexaUnifiedConsent strong{
    font-size:11.5px!important;line-height:1.25!important;margin:0!important;color:var(--nexa-text)!important;
  }
  #nexaFlowLive .nexa-rec-layout-fixed #nexaUnifiedConsent small{
    font-size:10px!important;line-height:1.35!important;margin:0!important;color:var(--nexa-muted)!important;
  }

  #nexaFlowLive .nexa-rec-layout-fixed .nexa-recording-tip{
    display:flex!important;
    align-items:center!important;
    gap:8px!important;
    width:100%!important;
    max-width:none!important;
    box-sizing:border-box!important;
    margin:12px 0 0!important;
    padding:9px 11px!important;
    border-radius:11px!important;
    text-align:left!important;
    position:static!important;
    transform:none!important;
    inset:auto!important;
    background:color-mix(in srgb,var(--nexa-brand) 5%,var(--nexa-surface))!important;
  }
  #nexaFlowLive .nexa-rec-layout-fixed .nexa-recording-tip strong{
    display:inline-flex!important;
    flex:0 0 auto!important;
    margin:0!important;
    font-size:10.5px!important;
    line-height:1.35!important;
    white-space:nowrap!important;
    color:var(--nexa-brand)!important;
  }
  #nexaFlowLive .nexa-rec-layout-fixed .nexa-recording-tip span{
    display:block!important;
    min-width:0!important;
    margin:0!important;
    font-size:10.5px!important;
    line-height:1.35!important;
    color:var(--nexa-muted)!important;
  }

  #nexaFlowLive .nexa-rec-layout-fixed .rec-btn{
    margin-top:2px!important;
  }
  #nexaFlowLive .nexa-rec-layout-fixed .timer{
    margin-top:6px!important;
  }
  #nexaFlowLive .nexa-rec-layout-fixed .status{
    margin-top:2px!important;
  }

  @media(max-width:820px){
    #nexaFlowLive .card.rec-zone.nexa-rec-layout-fixed{padding:13px!important}
    #nexaFlowLive .nexa-rec-layout-fixed #nexaUnifiedConsent{
      grid-template-columns:20px minmax(0,1fr)!important;
      gap:9px!important;padding:9px 10px!important;margin-bottom:11px!important;
    }
    #nexaFlowLive .nexa-rec-layout-fixed .nexa-recording-tip{
      align-items:flex-start!important;
      padding:9px 10px!important;
    }
    #nexaFlowLive .nexa-rec-layout-fixed .nexa-recording-tip strong{
      white-space:normal!important;
    }
  }
  `;
  document.head.appendChild(s);
}

function normalize(){
  injectStyle();
  const consent=document.getElementById('consent');
  const recZone=document.querySelector('#nexaFlowLive .card.rec-zone')||document.querySelector('.card.rec-zone');
  const unified=document.getElementById('nexaUnifiedConsent');
  const tip=document.getElementById('nexaRecordingTip');
  const kicker=document.getElementById('nexaRecordingKicker');

  document.querySelectorAll('.consent-row').forEach(row=>{
    if(consent && row.contains(consent))return;
    const card=row.closest('.card');
    if(card && !card.classList.contains('rec-zone')){
      card.classList.add('nexa-consent-legacy-orphan');
      card.setAttribute('aria-hidden','true');
    }
  });

  if(!recZone)return;
  recZone.classList.add('nexa-rec-layout-fixed');

  if(unified && unified.parentElement===recZone && kicker){
    kicker.insertAdjacentElement('afterend',unified);
  }
  if(tip && tip.parentElement===recZone){
    recZone.appendChild(tip);
  }
}

function boot(){
  normalize();
  let ticks=0;
  const timer=setInterval(()=>{
    normalize();
    if(++ticks>=20)clearInterval(timer);
  },250);
  const observer=new MutationObserver(()=>normalize());
  observer.observe(document.documentElement,{subtree:true,childList:true});
  setTimeout(()=>observer.disconnect(),8000);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
})();