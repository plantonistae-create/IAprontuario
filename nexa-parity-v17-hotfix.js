/* NEXA parity v17 hotfix · recorder state + top profile · 2026-09-04 */
(()=>{
'use strict';
if(window.__NEXA_PARITY_V17_HOTFIX__)return;window.__NEXA_PARITY_V17_HOTFIX__=true;
const $=id=>document.getElementById(id);
function ensureProfile(){
  const top=$('n14Top');if(!top)return;
  let p=$('n17Profile');
  if(!p){p=document.createElement('div');p.id='n17Profile';p.innerHTML='<span class="n17-avatar">P</span><span class="n17-profile-copy"><strong id="n17ProfileName">Peri</strong><small>Médico</small></span><b>⌄</b>';top.appendChild(p)}
  const name=$('loggedProfName')?.textContent?.trim();if(name){$('n17ProfileName').textContent=name;p.querySelector('.n17-avatar').textContent=(name[0]||'P').toUpperCase()}
}
function style(){if($('n17ParityHotfixStyle'))return;const s=document.createElement('style');s.id='n17ParityHotfixStyle';s.textContent=`
#n17RecActions #n15Start[style*="display: none"]{display:none!important}
#n17Profile{height:44px;display:flex;align-items:center;gap:8px;padding:0 8px;margin-left:2px;color:var(--n17-text);white-space:nowrap}.n17-avatar{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:#635bdc;color:#fff;font-weight:900;font-size:14px}.n17-profile-copy{display:flex;flex-direction:column;line-height:1.12}.n17-profile-copy strong{font-size:11px}.n17-profile-copy small{font-size:9px;color:var(--n17-muted)}#n17Profile b{font-size:12px;font-weight:700}
@media(min-width:821px) and (max-width:1180px){#n17Profile .n17-profile-copy,#n17Profile b{display:none}#n17Profile{padding:0 2px}.n17-avatar{width:32px;height:32px}}
`;document.head.appendChild(s)}
function init(){style();ensureProfile();setInterval(ensureProfile,1800)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();