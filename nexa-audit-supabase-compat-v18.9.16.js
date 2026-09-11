/* NEXA v18.9.16 — Supabase compatibility bridge for external modules */
(()=>{
'use strict';
if(window.__NEXA_AUDIT_SUPABASE_COMPAT_V18_9_16__)return;
window.__NEXA_AUDIT_SUPABASE_COMPAT_V18_9_16__=true;
const URL='https://fmkrcieubrlltiggyauc.supabase.co';
const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6ImZta3JjaWV1YnJsbHRpZ2d5YXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMTQzNjQsImV4cCI6MjEwMDU5MDM2NH0.lueZ5Czs3oHGXmQKNhw1egzuSBUOaMWpm3VoZucvIR4';
const guardedRpc=window.sb?.rpc?.bind(window.sb);
if(!guardedRpc||!window.supabase?.createClient)return;
function accessToken(){
  try{
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i)||'';if(!k.includes('auth-token'))continue;
      const p=JSON.parse(localStorage.getItem(k)||'{}');const s=p?.currentSession||p?.session||p;
      if(s?.access_token)return s.access_token;
    }
  }catch{}
  return'';
}
const nativeFetch=window.fetch.bind(window);
const bridgeFetch=(input,init={})=>{
  const headers=new Headers(init.headers||{});const token=accessToken();
  if(token)headers.set('Authorization',`Bearer ${token}`);
  return nativeFetch(input,{...init,headers});
};
const client=window.supabase.createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:bridgeFetch}});
const nativeRpc=client.rpc.bind(client);
client.rpc=(name,args)=>{
  if(['get_audit_queue','get_core_dataset_summary','submit_audit_review','get_my_capabilities'].includes(String(name||'')))return guardedRpc(name,args);
  return nativeRpc(name,args);
};
window.sb=client;
window.nexaAuditSupabaseCompat18916={client,accessToken};
})();
