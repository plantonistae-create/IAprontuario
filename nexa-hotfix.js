/* NEXA production loader · desktop layout v12 + auth recovery + recording compatibility · 2026-09-04 */
(()=>{
  if(typeof window.paused==='undefined') window.paused=false;
  if(typeof window.Pause!=='function'){
    window.Pause=function(){
      const candidates=['nexaDesktopPause','nexaRadarPauseProxy','recBtn'];
      for(const id of candidates){const el=document.getElementById(id);if(el&&el.offsetParent!==null&&typeof el.click==='function'){el.click();return true}}
      for(const id of candidates){const el=document.getElementById(id);if(el&&typeof el.click==='function'){el.click();return true}}
      return false;
    };
  }

  function installAuthRecovery(){
    const btn=document.getElementById('authSubmitBtn');
    const emailEl=document.getElementById('authEmail');
    const passEl=document.getElementById('authPassword');
    const banner=document.getElementById('loginBanner');
    if(!btn||!emailEl||!passEl||btn.dataset.nexaAuthRecovery==='1') return;
    btn.dataset.nexaAuthRecovery='1';
    const paint=(msg,isError=false)=>{
      if(!banner)return;
      banner.innerHTML='';
      if(!msg)return;
      const d=document.createElement('div');
      d.className='banner'+(isError?' error':'');
      d.textContent=msg;
      banner.appendChild(d);
    };
    const recover=async ev=>{
      if(ev){ev.preventDefault();ev.stopPropagation()}
      const email=emailEl.value.trim().toLowerCase();
      const password=passEl.value;
      if(!email.includes('@')){paint('Informe um e-mail válido.',true);return}
      if(password.length<8){paint('Use senha com pelo menos 8 caracteres.',true);return}
      btn.disabled=true;btn.textContent='Entrando…';paint('Conectando ao NEXA…');
      try{
        if(typeof sb==='undefined'||!sb?.auth?.signInWithPassword) throw new Error('Autenticação ainda não carregou. Atualize a página e tente novamente.');
        const timeout=new Promise((_,rej)=>setTimeout(()=>rej(new Error('A autenticação demorou além do esperado. Verifique a conexão e tente novamente.')),15000));
        const login=sb.auth.signInWithPassword({email,password});
        const {data,error}=await Promise.race([login,timeout]);
        if(error)throw error;
        if(!data?.session)throw new Error('Sessão não retornada pelo servidor.');
        paint('Acesso confirmado. Abrindo o NEXA…');
        if(typeof enter==='function') await enter(data.session);
        else{const gate=document.getElementById('loginGate'),app=document.getElementById('mainApp');if(gate)gate.style.display='none';if(app)app.style.display='flex'}
      }catch(e){
        const m=String(e?.message||e||'Falha ao entrar.');
        paint(/invalid login|invalid credentials/i.test(m)?'E-mail ou senha incorretos.':m,true);
      }finally{btn.disabled=false;btn.textContent='Entrar'}
    };
    btn.onclick=recover;
    passEl.addEventListener('keydown',ev=>{if(ev.key==='Enter')recover(ev)});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installAuthRecovery,{once:true});else installAuthRecovery();
  setTimeout(installAuthRecovery,500);setTimeout(installAuthRecovery,1800);

  const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.async=false;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)});
  load('./nexa-hotfix-v1.js?v=20260904-auth13').catch(console.error)
  .finally(()=>load('./nexa-ui-v3.js?v=20260904-auth13').catch(console.error)
  .finally(()=>load('./nexa-radar-v4.js?v=20260904-auth13').catch(console.error)
  .finally(()=>load('./nexa-clean-ui-v7.js?v=20260904-auth13').catch(console.error)
  .finally(()=>load('./nexa-mobile-viewport-fix-v8.js?v=20260904-auth13').catch(console.error)
  .finally(()=>load('./nexa-auditor-mobile-guard-v9.js?v=20260904-auth13').catch(console.error)
  .finally(()=>load('./nexa-desktop-stability-v10.js?v=20260904-auth13').catch(console.error)
  .finally(()=>load('./nexa-desktop-mockup-v11.js?v=20260904-auth13').catch(console.error)
  .finally(()=>load('./nexa-desktop-layout-v12.js?v=20260904-auth13').catch(console.error)))))))));
})();