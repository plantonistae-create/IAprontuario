/* NEXA auth rescue v13 · resilient iOS login · 2026-09-04 */
(()=>{
'use strict';
if(window.__NEXA_AUTH_RESCUE_V13__) return;
window.__NEXA_AUTH_RESCUE_V13__=true;
const SUPABASE_URL='https://fmkrcieubrlltiggyauc.supabase.co';
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlIiwicmVmIjoiZm1rcmNpZXVicmxsdGlnZ3lhdWMiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc4NTAxNDM2NCwiZXhwIjoyMTAwNTkwMzY0fQ.lueZ5Czs3oHGXmQKNhw1egzuSBUOaMWpm3VoZucvIR4';
const $=id=>document.getElementById(id);
function banner(msg,error=false){const box=$('loginBanner');if(!box)return;box.replaceChildren();if(!msg)return;const d=document.createElement('div');d.className='banner'+(error?' error':'');d.textContent=msg;box.appendChild(d)}
function loadSupabase(){return new Promise((resolve,reject)=>{
  if(window.supabase?.createClient)return resolve(window.supabase);
  const existing=[...document.scripts].find(s=>/supabase.*\.min\.js/i.test(s.src||''));
  if(existing){let n=0;const t=setInterval(()=>{if(window.supabase?.createClient){clearInterval(t);resolve(window.supabase)}else if(++n>40){clearInterval(t);reject(new Error('Não foi possível carregar a autenticação.'))}},100);return}
  const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0/dist/umd/supabase.min.js';s.onload=()=>window.supabase?.createClient?resolve(window.supabase):reject(new Error('Autenticação não iniciou.'));s.onerror=()=>reject(new Error('Falha ao carregar a autenticação.'));document.head.appendChild(s)
})}
async function withTimeout(p,ms){let t;try{return await Promise.race([p,new Promise((_,rej)=>t=setTimeout(()=>rej(new Error('A autenticação demorou demais. Tente novamente.')),ms))])}finally{clearTimeout(t)}}
async function rescueLogin(ev){
  const gate=$('loginGate'),btn=$('authSubmitBtn');
  if(!gate||getComputedStyle(gate).display==='none'||!btn)return;
  if(ev){ev.preventDefault();ev.stopImmediatePropagation()}
  const email=($('authEmail')?.value||'').trim().toLowerCase(),password=$('authPassword')?.value||'';
  if(!email.includes('@'))return banner('Informe um e-mail válido.',true);
  if(password.length<8)return banner('Use senha com pelo menos 8 caracteres.',true);
  btn.disabled=true;const old=btn.textContent;btn.textContent='Entrando…';banner('Conectando ao NEXA…');
  try{
    const lib=await loadSupabase();
    const client=window.__NEXA_AUTH_RESCUE_CLIENT__||(window.__NEXA_AUTH_RESCUE_CLIENT__=lib.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}));
    const {data,error}=await withTimeout(client.auth.signInWithPassword({email,password}),15000);
    if(error)throw error;
    if(!data?.session)throw new Error('Sessão não foi criada.');
    banner('Acesso autorizado. Abrindo NEXA…');
    // Give the original app a chance to react to the persisted session. If it
    // was interrupted earlier, a clean reload will recover through getSession().
    setTimeout(()=>location.replace(location.pathname+'?auth='+Date.now()),180);
  }catch(e){
    console.error('[NEXA auth rescue]',e);
    const m=String(e?.message||e||'Falha ao entrar.');
    banner(/invalid login|invalid.*credentials/i.test(m)?'E-mail ou senha incorretos.':m,true);
    btn.disabled=false;btn.textContent=old||'Entrar';
  }
}
function install(){
  const btn=$('authSubmitBtn'),pwd=$('authPassword');if(!btn)return;
  if(btn.dataset.nexaAuthRescue==='1')return;btn.dataset.nexaAuthRescue='1';
  btn.addEventListener('click',rescueLogin,true);
  pwd?.addEventListener('keydown',e=>{if(e.key==='Enter')rescueLogin(e)},true);
  // Clear stale disabled state left by an interrupted previous attempt.
  if($('loginGate')&&getComputedStyle($('loginGate')).display!=='none'){btn.disabled=false;if(btn.textContent.trim()==='Entrando…')btn.textContent='Entrar'}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
setTimeout(install,250);setTimeout(install,1000);
})();