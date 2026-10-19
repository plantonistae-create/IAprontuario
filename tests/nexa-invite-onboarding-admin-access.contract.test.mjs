import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync(new URL('../nexa-password-onboarding-v1.js',import.meta.url),'utf8');
const page=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const guard=fs.readFileSync(new URL('../nexa-admin-users-slots-functional-guard-v18.9.18.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/migrations/20261019121500_nexa_password_setup_required.sql',import.meta.url),'utf8');

function setup(hash=''){
  const window={};
  const location={hash};
  vm.runInNewContext(src,{window,location,URLSearchParams,console});
  return window.nexaPasswordSetup;
}
const session={user:{id:'doctor-1'}};

test('invite link requires password enrollment even before database query',async()=>{
  const flow=setup('#type=invite&access_token=one-time-token');
  assert.equal(await flow.requiresSetup(session,{rpc:()=>{throw new Error('should not query')}}),true);
});
test('recovery link requires password enrollment',async()=>{
  const flow=setup('#type=recovery&access_token=one-time-token');
  assert.equal(await flow.requiresSetup(session,{rpc:()=>{throw new Error('should not query')}}),true);
});
test('already confirmed invitation with absent password still triggers setup',async()=>{
  const flow=setup('');
  assert.equal(await flow.requiresSetup(session,{rpc:async(name)=>{assert.equal(name,'nexa_password_setup_required');return{data:true,error:null}}}),true);
});
test('ordinary password accounts are not redirected to onboarding',async()=>{
  const flow=setup('');
  assert.equal(await flow.requiresSetup(session,{rpc:async()=>({data:false,error:null})}),false);
});
test('onboarding never embeds password into link or logs and requires explicit confirmation',()=>{
  assert.match(src,/updateUser\(\{password:pwd\}\)/);
  assert.match(src,/pwd!==confirmPwd/);
  assert.match(src,/autocomplete="new-password"/);
  assert.match(src,/history\.replaceState/);
  assert.doesNotMatch(src,/console\.(log|info)\(pwd/);
});
test('login and reviewer path use new guarded admin endpoint',()=>{
  assert.match(page,/nexa-password-onboarding-v1\.js/);
  assert.match(page,/await window\.nexaPasswordSetup\?\.requiresSetup\(session,sb\)/);
  assert.match(page,/event==='PASSWORD_RECOVERY'/);
  assert.match(page,/window\.nexaAdminApplyAccess=async/);
  assert.doesNotMatch(page,/sb\.rpc\('admin_manage_profile'/);
  assert.match(guard,/window\.nexaAdminApplyAccess\(args\)/);
  assert.match(page,/action:'set_access'/);
  assert.match(sql,/auth\.users u/);
  assert.match(sql,/grant execute on function public\.nexa_password_setup_required\(\) to authenticated/);
});
