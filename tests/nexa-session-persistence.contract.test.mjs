import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync(new URL('../nexa-auth-session-v1.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const onboarding=fs.readFileSync(new URL('../nexa-password-onboarding-v1.js',import.meta.url),'utf8');
const authKey='sb-fmkrcieubrlltiggyauc-auth-token';
const keepKey='nexa.auth.remember.v1';

function browser(initial={}){
  const items=new Map(Object.entries(initial));
  const localStorage={
    getItem:k=>items.has(k)?items.get(k):null,
    setItem:(k,v)=>items.set(k,String(v)),
    removeItem:k=>items.delete(k),
  };
  function load(){
    const window={};
    vm.runInNewContext(src,{window,localStorage}, {timeout:1500});
    return window.nexaAuthSession;
  }
  return {load,localStorage,items};
}

test('legacy localStorage session is not silently remembered after upgrade',()=>{
  const b=browser({[authKey]:'old-supabase-session'});
  const auth=b.load();
  assert.equal(auth.remembered,false);
  assert.equal(auth.storage.getItem(authKey),null);
  assert.equal(b.localStorage.getItem(authKey),null);
});
test('default unchecked: sign-in token survives in-page but not page reload',()=>{
  const b=browser(),app=b.load();
  app.storage.setItem(authKey,'session-1');
  assert.equal(app.storage.getItem(authKey),'session-1');
  assert.equal(b.localStorage.getItem(authKey),null);
  assert.equal(b.load().storage.getItem(authKey),null);
});
test('checked option persists token across reload and user remains logged in',()=>{
  const b=browser(),app=b.load();
  app.setRemembered(true);
  app.storage.setItem(authKey,'session-2');
  assert.equal(b.localStorage.getItem(keepKey),'1');
  assert.equal(b.load().storage.getItem(authKey),'session-2');
});
test('turning on remember after invitation moves in-memory session into durable storage',()=>{
  const b=browser(),app=b.load();
  app.storage.setItem(authKey,'invitation-session');
  app.setRemembered(true);
  assert.equal(b.load().storage.getItem(authKey),'invitation-session');
});
test('turning off remember moves token to memory and clears persistent credentials',()=>{
  const b=browser(),app=b.load();
  app.setRemembered(true);
  app.storage.setItem(authKey,'session-3');
  app.setRemembered(false);
  assert.equal(app.storage.getItem(authKey),'session-3');
  assert.equal(b.localStorage.getItem(authKey),null);
  assert.equal(b.load().storage.getItem(authKey),null);
});
test('explicit logout clears local remember flag, memory and any persistent tokens',()=>{
  const b=browser(),app=b.load();
  app.setRemembered(true);app.storage.setItem(authKey,'session');
  app.clear();
  assert.equal(b.localStorage.getItem(keepKey),null);
  assert.equal(b.localStorage.getItem(authKey),null);
  assert.equal(app.storage.getItem(authKey),null);
  assert.equal(b.load().storage.getItem(authKey),null);
});
test('login and logout user controls are wired in all major UI modes',()=>{
  for(const id of ['authRememberMe','nexaLogoutHeaderBtn','nexaLogoutSidebarBtn','nexaLogoutMoreBtn'])assert.match(index,new RegExp('id="'+id+'"'));
  assert.match(index,/nexa-auth-session-v1\.js\?v=20261019/);
  assert.match(index,/auth:\{persistSession:!!window\.nexaAuthSession/);
  assert.match(index,/storage:window\.nexaAuthSession\.storage/);
  assert.match(index,/setRemembered\(\$\('authRememberMe'\)\?\.checked===true\)/);
  assert.match(index,/if\(event==='SIGNED_OUT'\)\{clearClinicalSession\(\{preserveDraft:true\}\)/);
  assert.match(index,/if\(!preserveDraft\)nexaClearPersistedSession\(\)/);
  assert.match(index,/await sb\.auth\.signOut\(\{scope:'local'\}\)/);
  assert.match(index,/location\.replace\(location\.pathname\+location\.search\)/);
  assert.match(index,/if\(recording\|\|audioBlob\)\{alert/);
  assert.match(onboarding,/id="nexaPasswordRemember"/);
  assert.match(onboarding,/nexaAuthSession\?\.setRemembered/);
});
