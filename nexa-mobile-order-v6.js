/* NEXA mobile order v6 · gravação no início */
(()=>{
'use strict';
if(window.__NEXA_MOBILE_ORDER_V6__)return;window.__NEXA_MOBILE_ORDER_V6__=true;
const id='nexaMobileOrderV6Style';if(document.getElementById(id))return;
const s=document.createElement('style');s.id=id;s.textContent=`
@media(max-width:820px){
 body.nexa-shell-v5 .nexa-stage-view[data-stage="radar"].active{display:flex!important;flex-direction:column!important;gap:10px!important}
 body.nexa-shell-v5 .nexa-stage-view[data-stage="radar"]>.card.rec-zone{order:1!important;width:100%!important;margin:0!important;position:relative!important;top:auto!important}
 body.nexa-shell-v5 .nexa-stage-view[data-stage="radar"]>#realtimeRadarCard{order:2!important;width:100%!important;margin:0!important}
 body.nexa-shell-v5 #nexaDispositionCard{order:3!important;width:100%!important;margin:0!important}
 body.nexa-shell-v5 #nexaRadarAlertsDock{order:4!important;width:100%!important;margin:0!important}
 body.nexa-shell-v5 .n5-quick{order:5!important;width:100%!important}
 body.nexa-shell-v5 .n5-away{order:6!important;width:100%!important}
}
`;document.head.appendChild(s);
})();
