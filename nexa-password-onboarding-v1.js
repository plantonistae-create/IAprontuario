/* NEXA · invitation and recovery password setup.
 * The invited user's first session may be a Supabase magic-link session.
 * Always check password presence on the server; do not rely on editable user_metadata.
 */
(function(){
  'use strict';
  if(window.nexaPasswordSetup)return;
  const params=new URLSearchParams((location.hash||'').replace(/^#/, ''));
  let linkFlow=['invite','recovery'].includes(params.get('type'));
  let modal=null,submitting=false,completedUserId=null;

  function hide(){
    if(modal){modal.remove();modal=null;}
  }
  function errorText(e){return String(e?.message||e?.error_description||'Não foi possível definir a senha.');}
  async function requiresSetup(session,client){
    if(!session?.user)return false;
    if(completedUserId===session.user.id)return false;
    if(linkFlow)return true;
    // For previously accepted invitations with no password (including a reopened tab).
    // This RPC returns a single boolean for auth.uid(), not password hashes.
    const {data,error}=await client.rpc('nexa_password_setup_required');
    if(error){
      console.warn('[NEXA] Não foi possível conferir configuração de senha.',error.code||'RPC_ERROR');
      // Do not block longstanding password accounts during an independent RPC outage.
      return false;
    }
    return data===true;
  }
  function show(session,client,onSuccess){
    if(modal||submitting)return;
    const gate=document.getElementById('loginGate');
    const main=document.getElementById('mainApp');
    if(gate)gate.style.display='none';
    if(main)main.style.display='none';
    const root=document.createElement('div');
    root.id='nexaPasswordSetupGate';
    root.setAttribute('role','dialog');
    root.setAttribute('aria-modal','true');
    root.setAttribute('aria-labelledby','nexaPasswordSetupTitle');
    root.style.cssText='position:fixed;inset:0;z-index:2147483640;background:#0d1620;display:flex;align-items:center;justify-content:center;padding:18px;overflow:auto;color:#f4f9fc';
    root.innerHTML='<form id="nexaPasswordSetupForm" style="width:min(100%,440px);padding:28px;border:1px solid #305062;background:#152631;border-radius:18px;box-shadow:0 20px 70px #0006;font:inherit">'+
      '<div style="color:#58d7e7;font-weight:800;letter-spacing:.12em;font-size:12px">NEXA CLINICAL</div>'+
      '<h2 id="nexaPasswordSetupTitle" style="margin:12px 0 8px;color:#fff;font-size:23px">Defina sua senha de acesso</h2>'+
      '<p style="margin:0 0 19px;color:#c1d1da;font-size:14px">Por segurança, escolha uma senha antes de abrir o prontuário. Use-a nos próximos acessos.</p>'+
      '<label for="nexaNewPassword" style="display:block;margin-bottom:6px">Nova senha</label>'+
      '<input id="nexaNewPassword" type="password" required minlength="8" autocomplete="new-password" placeholder="Mínimo 8 caracteres" style="width:100%;padding:12px;border-radius:9px;border:1px solid #628393;background:#0e1a24;color:#fff;box-sizing:border-box;margin-bottom:15px"/>'+
      '<label for="nexaConfirmPassword" style="display:block;margin-bottom:6px">Confirmar nova senha</label>'+
      '<input id="nexaConfirmPassword" type="password" required minlength="8" autocomplete="new-password" style="width:100%;padding:12px;border-radius:9px;border:1px solid #628393;background:#0e1a24;color:#fff;box-sizing:border-box;margin-bottom:13px"/>'+
      '<p id="nexaPasswordSetupError" role="alert" aria-live="polite" style="color:#ffb9b9;min-height:20px;font-size:13px"></p>'+
      '<button id="nexaPasswordSetupSubmit" type="submit" style="width:100%;padding:13px 16px;border:0;border-radius:9px;background:#2aafc6;color:#071923;font-weight:800;cursor:pointer">Salvar senha e acessar</button>'+
      '<button id="nexaPasswordSetupExit" type="button" style="width:100%;padding:11px;margin-top:8px;border:1px solid #628393;border-radius:9px;background:transparent;color:#cbdbe3;cursor:pointer">Sair</button>'+
      '</form>';
    document.body.appendChild(root);
    modal=root;
    const form=root.querySelector('form');
    const error=root.querySelector('#nexaPasswordSetupError');
    const submit=root.querySelector('#nexaPasswordSetupSubmit');
    root.querySelector('#nexaPasswordSetupExit').onclick=async()=>{
      linkFlow=false;
      if(location.hash && /(?:access_token|refresh_token|type=invite|type=recovery)/.test(location.hash)) history.replaceState(null,'',location.pathname+location.search);
      hide();
      await client.auth.signOut();
      if(gate)gate.style.display='flex';
      if(main)main.style.display='none';
    };
    form.addEventListener('submit',async ev=>{
      ev.preventDefault();
      if(submitting)return;
      const pwd=root.querySelector('#nexaNewPassword').value;
      const confirmPwd=root.querySelector('#nexaConfirmPassword').value;
      if(pwd.length<8){error.textContent='A senha deve ter pelo menos 8 caracteres.';return;}
      if(pwd!==confirmPwd){error.textContent='As senhas não coincidem.';return;}
      submitting=true;submit.disabled=true;submit.textContent='Salvando senha…';error.textContent='';
      try{
        const {error:saveError}=await client.auth.updateUser({password:pwd});
        if(saveError)throw saveError;
        completedUserId=session.user.id;linkFlow=false;hide();
        // Never leave invitation/recovery tokens in the address bar or browser history.
        if(location.hash && /(?:access_token|refresh_token|type=invite|type=recovery)/.test(location.hash)){
          history.replaceState(null,'',location.pathname+location.search);
        }
        await onSuccess();
      }catch(e){error.textContent=errorText(e);}
      finally{submitting=false;submit.disabled=false;submit.textContent='Salvar senha e acessar';}
    });
    root.querySelector('#nexaNewPassword').focus();
  }
  window.nexaPasswordSetup={requiresSetup,show,get isOpen(){return !!modal}};
})();
