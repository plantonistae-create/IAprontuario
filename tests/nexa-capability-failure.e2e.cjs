'use strict';
// Offline, synthetic E2E (Chromium): a failed get_my_capabilities RPC (network/RPC error) must never sign the
// physician out, stop a recording or wipe anything. Fake microphone, local supabase-js stub, external requests aborted.
// (Draft survival after hidden/crash was probed separately: recovery works; see the frontend report.)
const {chromium}=require('playwright');
const http=require('http');
const fs=require('fs');
const path=require('path');

const root=path.resolve(process.env.NEXA_E2E_ROOT||path.join(__dirname,'..'));
const MIME={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const watchdog=setTimeout(()=>{console.error('capability-failure E2E exceeded 150s');process.exit(1)},150000);watchdog.unref();

const STUB=`(function(){const U={id:'11111111-1111-4111-8111-111111111111',email:'synthetic@invalid.test',user_metadata:{display_name:'Synthetic'}};
const S={access_token:'synthetic.fake.token',refresh_token:'x',expires_at:9999999999,user:U};
const ok=async()=>({data:{session:S,user:U},error:null});
const chain=()=>new Proxy(function(){},{get:(t,k)=>k==='then'?(res=>res({data:[],error:null})):chain(),apply:()=>chain()});
window.supabase={createClient:()=>({auth:{getSession:ok,getUser:ok,refreshSession:ok,signOut:async()=>{window.__signOuts=(window.__signOuts||0)+1;return{error:null}},onAuthStateChange:cb=>{window.__authCb=cb;return{data:{subscription:{unsubscribe(){}}}}}},
from:()=>chain(),rpc:async n=>{if(n==='get_my_capabilities'){window.__capCalls=(window.__capCalls||0)+1;if(window.__capFail)return{data:null,error:{message:'synthetic network failure'}};return{data:[{display_name:'Synthetic',access_status:'active',is_admin:false,is_reviewer:false,clinical_access:true}],error:null}}return{data:null,error:null}},
functions:{invoke:async()=>({data:null,error:{message:'blocked'}})},channel:()=>chain(),removeChannel(){}})}})();`;
const INIT=`window.__confirms=[];window.confirm=m=>{window.__confirms.push(String(m));return true};window.alert=()=>{};`;
const USER_A={id:'11111111-1111-4111-8111-111111111111',email:'synthetic@invalid.test',user_metadata:{display_name:'Synthetic'}};

const results=[];
function check(name,ok,detail){results.push({name,ok});console.log((ok===true?'PASS':'FAIL').padEnd(6)+name+(ok===true?'':'  | '+detail));}

(async()=>{
  const server=http.createServer((req,res)=>{
    let f=decodeURIComponent(req.url.split('?')[0]);if(f==='/')f='/index.html';
    const full=path.join(root,f);
    if(!full.startsWith(root+path.sep)||!fs.existsSync(full)||fs.statSync(full).isDirectory()){res.writeHead(404).end();return}
    res.writeHead(200,{'content-type':MIME[path.extname(full)]||'application/octet-stream','cache-control':'no-store'});res.end(fs.readFileSync(full));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
  const external=[];
  const ctx=await browser.newContext({permissions:['microphone'],serviceWorkers:'block'});
  await ctx.route('**/*',route=>{const u=route.request().url();
    if(u.startsWith(base)||u.startsWith('data:')||u.startsWith('blob:'))return route.continue();
    if(/supabase\.min\.js/.test(u))return route.fulfill({status:200,contentType:'application/javascript',body:STUB});
    external.push(u);return route.abort();});
  const st=pg=>pg.evaluate(()=>({rs:document.getElementById('recBtn').dataset.recordingState||null,
    gate:getComputedStyle(document.getElementById('loginGate')).display,main:getComputedStyle(document.getElementById('mainApp')).display,
    loginBanner:document.getElementById('loginBanner')?.textContent||'',signOuts:window.__signOuts||0,capCalls:window.__capCalls||0,timer:document.getElementById('timer').textContent}));
  const waitMain=pg=>pg.waitForFunction(()=>getComputedStyle(document.getElementById('mainApp')).display!=='none',null,{timeout:20000});
  const open=async(init='')=>{const pg=await ctx.newPage();await pg.addInitScript(INIT+init);await pg.goto(base+'/index.html');return pg};

  // K: active clinical session, recording; capability RPC fails on a repeated SIGNED_IN (supabase-js refocus/refresh)
  let page=await open();await waitMain(page);await page.waitForTimeout(1500);
  await page.evaluate(()=>{const c=document.getElementById('consent');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('recBtn').click()});
  await page.waitForFunction(()=>document.getElementById('recBtn').dataset.recordingState==='recording',null,{timeout:15000});await page.waitForTimeout(1500);
  const t0=(await st(page)).timer;
  await page.evaluate(()=>{window.__capFail=true});
  await page.evaluate(u=>window.__authCb('SIGNED_IN',{user:u,access_token:'synthetic'}),USER_A);
  await page.waitForTimeout(2500);let s=await st(page);
  check('K1 capability RPC was actually called and failed during the active session',s.capCalls>=2,JSON.stringify({capCalls:s.capCalls}));
  check('K2 no sign-out on a transient capability failure',s.signOuts===0,JSON.stringify({signOuts:s.signOuts}));
  check('K3 recording continues (not stopped, timer advanced), clinical UI stays open',s.rs==='recording'&&s.main!=='none'&&s.gate==='none'&&s.timer!==t0,JSON.stringify({rs:s.rs,main:s.main,gate:s.gate,t0,t:s.timer}));
  check('K4 no misleading "aguardando ativação" message',!/aguardando ativa/i.test(s.loginBanner),s.loginBanner.slice(0,100));
  await page.evaluate(()=>{window.__capFail=false;document.getElementById('nfFinish')?.click()});await page.waitForTimeout(800);await page.close();

  // L: fresh start while the capability RPC fails: honest message, no sign-out, automatic recovery once it works
  page=await open('window.__capFail=true;');await page.waitForTimeout(3500);s=await st(page);
  check('L1 fresh start with failing capabilities: login gate with the real reason (connection), not "pending"',s.gate!=='none'&&/confirmar seu acesso/i.test(s.loginBanner)&&/Nada foi apagado/i.test(s.loginBanner)&&!/aguardando ativa/i.test(s.loginBanner),s.loginBanner.slice(0,120));
  check('L2 no sign-out on fresh-start capability failure (session kept for retry)',s.signOuts===0,JSON.stringify({signOuts:s.signOuts}));
  await page.evaluate(()=>{window.__capFail=false});
  await waitMain(page).catch(()=>{});s=await st(page);
  check('L3 automatic retry enters the app once capabilities answer again',s.main!=='none'&&s.gate==='none',JSON.stringify({main:s.main,gate:s.gate,capCalls:s.capCalls}));
  await page.close();

  await browser.close();server.close();
  const bad=external.filter(u=>!/fonts\.(googleapis|gstatic)|supabase|cdn|openai/i.test(u));
  console.log('aborted external requests:',external.length,bad.length?('(other: '+bad.length+')'):'');
  const failed=results.filter(r=>r.ok!==true);
  console.log(failed.length?`FAILED ${failed.length}/${results.length}`:`ALL ${results.length} PASSED`);
  process.exit(failed.length?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
