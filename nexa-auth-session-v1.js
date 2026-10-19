/* NEXA auth persistence v1 — opt-in persistent login.
 * Session tokens are never persisted for opt-out logins. Supabase keeps them
 * in this tab's memory until the page is reloaded or closed.
 */
(function(){
  'use strict';
  if(window.nexaAuthSession)return;
  const REMEMBER_KEY='nexa.auth.remember.v1';
  const AUTH_KEY='sb-fmkrcieubrlltiggyauc-auth-token';
  const ephemeral=new Map();
  let remember=false;

  try{
    remember=localStorage.getItem(REMEMBER_KEY)==='1';
    // Upgrade from the previous always-persistent client to explicit opt-in.
    if(!remember)localStorage.removeItem(AUTH_KEY);
  }catch{remember=false}

  const storage={
    getItem(key){
      if(ephemeral.has(key))return ephemeral.get(key);
      if(!remember)return null;
      try{return localStorage.getItem(key)}catch{return null}
    },
    setItem(key,value){
      if(!remember){ephemeral.set(key,value);return}
      ephemeral.delete(key);
      try{localStorage.setItem(key,value)}catch{ephemeral.set(key,value)}
    },
    removeItem(key){
      ephemeral.delete(key);
      try{localStorage.removeItem(key)}catch{}
    }
  };
  function setRemembered(value){
    remember=value===true;
    if(remember){
      try{localStorage.setItem(REMEMBER_KEY,'1')}catch{}
      for(const [key,val] of ephemeral) {
        try{localStorage.setItem(key,val);ephemeral.delete(key)}catch{}
      }
    }else{
      try{
        localStorage.removeItem(REMEMBER_KEY);
        const saved=localStorage.getItem(AUTH_KEY);
        if(saved!==null)ephemeral.set(AUTH_KEY,saved);
        localStorage.removeItem(AUTH_KEY);
      }catch{}
    }
    return remember;
  }
  function clear(){
    remember=false;
    ephemeral.clear();
    try{
      localStorage.removeItem(REMEMBER_KEY);
      localStorage.removeItem(AUTH_KEY);
    }catch{}
  }
  window.nexaAuthSession={
    storage,setRemembered,clear,
    get remembered(){return remember}
  };
})();
