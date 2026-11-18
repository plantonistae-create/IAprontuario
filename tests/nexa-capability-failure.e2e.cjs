'use strict';
// Offline, synthetic E2E (Chromium). A failed get_my_capabilities lookup must never sign the physician out, stop a
// recording or wipe the draft / retained audio. It is classified (transient / denied / inconclusive); until the
// server confirms again, NEW authorization-dependent clinical actions are blocked. Fake mic, local supabase-js stub,
// every non-local request aborted except the stubbed transcription endpoint.
const {chromium}=require('playwright');
const http=require('http');
const fs=require('fs');
const path=require('path');

const root=path.resolve(process.env.NEXA_E2E_ROOT||path.join(__dirname,'..'));
const MIME={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const watchdog=setTimeout(()=>{console.error('capability-failure E2E exceeded 240s');process.exit(1)},240000);watchdog.unref();

// window.__capMode: ok | network | http503 | denied401 | denied403 | inconclusive | throw   (__capFail=true == network)
const STUB=`(function(){const U={id:'11111111-1111-4111-8111-111111111111',email:'synthetic@invalid.test',user_metadata:{display_name:'Synthetic'}};
const S={access_token:'synthetic.fake.token',refresh_token:'x',expires_at:9999999999,user:U};
const ok=async()=>({data:{session:S,user:U},error:null});
const chain=()=>new Proxy(function(){},{get:(t,k)=>k==='then'?(res=>res({data:[],error:null})):chain(),apply:()=>chain()});
const ACTIVE=[{display_name:'Synthetic',access_status:'active',is_admin:false,is_reviewer:false,clinical_access:true}];
const MODES={network:{data:null,error:{message:'TypeError: Failed to fetch',details:'',hint:'',code:''},status:0},
 http503:{data:null,error:{message:'Service Unavailable',code:''},status:503},
 denied401:{data:null,error:{message:'JWT expired',code:'PGRST301'},status:401},
 denied403:{data:null,error:{message:'permission denied for function get_my_capabilities',code:'42501'},status:403},
 inconclusive:{data:null,error:{message:'unexpected server answer',code:'XX000'},status:400}};
window.supabase={createClient:()=>({auth:{getSession:ok,getUser:ok,refreshSession:ok,signOut:async()=>{window.__signOuts=(window.__signOuts||0)+1;return{error:null}},onAuthStateChange:cb=>{window.__authCb=cb;return{data:{subscription:{unsubscribe(){}}}}}},
from:()=>chain(),rpc:async n=>{if(n!=='get_my_capabilities')return{data:null,error:null};window.__capCalls=(window.__capCalls||0)+1;
  const m=window.__capMode||(window.__capFail?'network':'ok');if(m==='throw')throw new TypeError('Failed to fetch');return MODES[m]||{data:ACTIVE,error:null,status:200}},
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
  const external=[];let fnCalls=0;
  const ctx=await browser.newContext({permissions:['microphone'],serviceWorkers:'block'});
  await ctx.route('**/*',route=>{const u=route.request().url();
    if(u.startsWith(base)||u.startsWith('data:')||u.startsWith('blob:'))return route.continue();
    if(/supabase\.min\.js/.test(u))return route.fulfill({status:200,contentType:'application/javascript',body:STUB});
    if(/\/functions\/v1\//.test(u)){fnCalls++;
      if(/process-consultation/.test(u))return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({fields:{queixa_principal:'TESTE SINTETICO',hda:'Paciente sintetico.'},provider:'synthetic'})});}
    external.push(u);return route.abort();});
  const st=pg=>pg.evaluate(()=>({rs:document.getElementById('recBtn').dataset.recordingState||null,
    gate:getComputedStyle(document.getElementById('loginGate')).display,main:getComputedStyle(document.getElementById('mainApp')).display,
    loginBanner:document.getElementById('loginBanner')?.textContent||'',banner:document.getElementById('bannerArea')?.textContent||'',
    cap:document.body.dataset.nexaCapability||'',signOuts:window.__signOuts||0,capCalls:window.__capCalls||0,timer:document.getElementById('timer').textContent,
    proc:document.getElementById('processBtn').disabled,queixa:document.querySelector('.field[data-key="queixa_principal"] textarea')?.value||''}));
  const waitMain=pg=>pg.waitForFunction(()=>getComputedStyle(document.getElementById('mainApp')).display!=='none',null,{timeout:20000});
  const open=async(init='')=>{const pg=await ctx.newPage();await pg.addInitScript(INIT+init);await pg.goto(base+'/index.html');return pg};
  const signedIn=pg=>pg.evaluate(u=>window.__authCb('SIGNED_IN',{user:u,access_token:'synthetic'}),USER_A);
  const recheck=pg=>pg.evaluate(()=>window.dispatchEvent(new Event('focus')));
  const consentRec=pg=>pg.evaluate(()=>{const c=document.getElementById('consent');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('recBtn').click()});

  // 0: classifier matrix (pure function, no network)
  let page=await open();await waitMain(page);await page.waitForTimeout(1200);
  const m=await page.evaluate(()=>[{status:0,message:'TypeError: Failed to fetch'},{status:503},{status:429},{status:401,code:'PGRST301',message:'JWT expired'},{status:403,code:'42501'},{status:400,code:'XX000',message:'x'},{status:0,message:'weird'},new TypeError('Failed to fetch')].map(nexaClassifyCapabilityError).join(','));
  check('C0 classifier: network/503/429=transient, 401/403=denied, unknown=inconclusive, thrown fetch error=transient',m==='transient,transient,transient,denied,denied,inconclusive,inconclusive,transient',m);
  let s=await st(page);check('C1 successful lookup marks the session verified',s.cap==='verified',s.cap);

  // K: transient failure while RECORDING -> recording continues, no sign-out, new actions blocked, unlock after re-check
  await consentRec(page);await page.waitForFunction(()=>document.getElementById('recBtn').dataset.recordingState==='recording',null,{timeout:15000});await page.waitForTimeout(1500);
  const t0=(await st(page)).timer;
  await page.evaluate(()=>{window.__capMode='network'});await signedIn(page);await page.waitForTimeout(2200);s=await st(page);
  check('K1 lookup really failed (network) during the active session',s.capCalls>=2,JSON.stringify({capCalls:s.capCalls}));
  check('K2 no sign-out; clinical UI stays open',s.signOuts===0&&s.main!=='none'&&s.gate==='none',JSON.stringify({signOuts:s.signOuts,main:s.main,gate:s.gate}));
  check('K3 ongoing recording keeps running (timer advanced)',s.rs==='recording'&&s.timer!==t0,JSON.stringify({rs:s.rs,t0,t:s.timer}));
  check('K4 state = unverified, banner states what is blocked and that draft/audio are preserved',s.cap==='unverified'&&/falha de conex/i.test(s.banner)&&/bloquead[oa]s/i.test(s.banner)&&/preservados/i.test(s.banner)&&!/aguardando ativa/i.test(s.banner),s.banner.slice(0,160));
  const fn0=fnCalls;await page.evaluate(()=>document.getElementById('processBtn').click());await page.waitForTimeout(800);s=await st(page);
  check('K5 "Transcrever" during unverified state is blocked: recording NOT stopped, no backend call',s.rs==='recording'&&fnCalls===fn0,JSON.stringify({rs:s.rs,calls:fnCalls-fn0}));
  await page.evaluate(()=>document.getElementById('nfFinish')?.click());await page.waitForFunction(()=>document.getElementById('recBtn').dataset.recordingState==='stopped',null,{timeout:10000});
  await page.evaluate(()=>document.getElementById('processBtn').click());await page.waitForTimeout(800);s=await st(page);
  check('K6 finishing is allowed; transcription still blocked; retained audio kept (Transcrever enabled, nothing sent)',s.rs==='stopped'&&!s.proc&&fnCalls===fn0&&s.queixa==='',JSON.stringify({rs:s.rs,proc:s.proc,calls:fnCalls-fn0}));
  await page.evaluate(()=>{window.__capMode='ok'});await recheck(page);await page.waitForFunction(()=>document.body.dataset.nexaCapability==='verified',null,{timeout:10000}).catch(()=>{});s=await st(page);
  check('K7 re-check succeeds -> verified, explicit "liberadas" message',s.cap==='verified'&&/liberadas/i.test(s.banner),JSON.stringify({cap:s.cap,b:s.banner.slice(0,80)}));
  await page.evaluate(()=>document.getElementById('processBtn').click());await page.waitForFunction(()=>(document.querySelector('.field[data-key="queixa_principal"] textarea')?.value||'')==='TESTE SINTETICO',null,{timeout:20000}).catch(()=>{});s=await st(page);
  check('K8 after verification the retained audio is transcribed (text appears only now)',s.queixa==='TESTE SINTETICO'&&fnCalls>fn0,JSON.stringify({q:s.queixa,calls:fnCalls-fn0}));
  await page.close();

  // D: explicit denial (401 JWT / 403 42501) on an active session with a typed draft
  for(const mode of ['denied401','denied403']){
    page=await open();await waitMain(page);await page.waitForTimeout(1200);
    const typed='RASCUNHO SINTETICO '+mode;
    await page.evaluate(t=>{const ta=document.querySelector('.field[data-key="hda"] textarea')||document.querySelector('.field textarea');ta.value=t;ta.dispatchEvent(new Event('input',{bubbles:true}))},typed);
    await page.evaluate(m=>{window.__capMode=m},mode);await signedIn(page);await page.waitForTimeout(1500);s=await st(page);
    const kept=await page.evaluate(t=>[...document.querySelectorAll('.field textarea')].some(x=>x.value===t),typed);
    check(`D1 ${mode}: state denied, NO sign-out, typed draft still on screen`,s.cap==='denied'&&s.signOuts===0&&kept&&s.main!=='none',JSON.stringify({cap:s.cap,signOuts:s.signOuts,kept}));
    check(`D2 ${mode}: banner asks to sign in again and states nothing was lost`,/n[ãa]o confirmou sua autoriza/i.test(s.banner)&&/preservados/i.test(s.banner)&&/Entre novamente/i.test(s.banner),s.banner.slice(0,160));
    const f0=fnCalls;await consentRec(page);await page.evaluate(()=>{document.getElementById('generateExamsBtn')?.click();document.getElementById('submitAuditBtn')?.click()});await page.waitForTimeout(1200);s=await st(page);
    check(`D3 ${mode}: new recording, exam generation and audit submission are blocked`,s.rs!=='recording'&&fnCalls===f0,JSON.stringify({rs:s.rs,calls:fnCalls-f0}));
    await page.evaluate(()=>{window.__capMode='ok'});await recheck(page);await page.waitForFunction(()=>document.body.dataset.nexaCapability==='verified',null,{timeout:10000}).catch(()=>{});
    await consentRec(page);await page.waitForFunction(()=>document.getElementById('recBtn').dataset.recordingState==='recording',null,{timeout:10000}).catch(()=>{});s=await st(page);
    check(`D4 ${mode}: once the server confirms again, recording is allowed`,s.cap==='verified'&&s.rs==='recording',JSON.stringify({cap:s.cap,rs:s.rs}));
    await page.evaluate(()=>document.getElementById('nfFinish')?.click());await page.waitForTimeout(500);await page.close();
  }

  // I / T: inconclusive answer and a thrown exception on an active session
  for(const [mode,kind] of [['inconclusive','inconclusiva'],['throw','falha de conex']]){
    page=await open();await waitMain(page);await page.waitForTimeout(1200);
    await page.evaluate(m=>{window.__capMode=m},mode);await signedIn(page);await page.waitForTimeout(1500);s=await st(page);
    await consentRec(page);await page.waitForTimeout(1000);const s2=await st(page);
    check(`I ${mode}: treated as UNverified (never as verified), no sign-out, new recording blocked`,s.cap==='unverified'&&s.signOuts===0&&new RegExp(kind,'i').test(s.banner)&&s2.rs!=='recording',JSON.stringify({cap:s.cap,signOuts:s.signOuts,rs:s2.rs,b:s.banner.slice(0,90)}));
    await page.close();
  }

  // L: fresh start while the lookup fails -> honest message, no sign-out, automatic recovery
  page=await open("window.__capMode='network';");await page.waitForTimeout(3500);s=await st(page);
  check('L1 fresh start, network failure: login gate with the real reason, not "pending"',s.gate!=='none'&&/confirmar seu acesso/i.test(s.loginBanner)&&/falha de conex/i.test(s.loginBanner)&&/Nada foi apagado/i.test(s.loginBanner)&&!/aguardando ativa/i.test(s.loginBanner),s.loginBanner.slice(0,120));
  check('L2 no sign-out on fresh-start failure',s.signOuts===0,JSON.stringify({signOuts:s.signOuts}));
  await page.evaluate(()=>{window.__capMode='ok'});await waitMain(page).catch(()=>{});s=await st(page);
  check('L3 automatic retry enters once the lookup answers again, verified',s.main!=='none'&&s.gate==='none'&&s.cap==='verified',JSON.stringify({main:s.main,gate:s.gate,cap:s.cap}));
  await page.close();
  page=await open("window.__capMode='denied401';");await page.waitForTimeout(3500);s=await st(page);
  check('L4 fresh start, explicit denial: asks to sign in again, no automatic sign-out, nothing deleted',s.gate!=='none'&&/n[ãa]o confirmou a autoriza/i.test(s.loginBanner)&&/Nada foi apagado/i.test(s.loginBanner)&&s.signOuts===0,s.loginBanner.slice(0,120));
  await page.close();

  await browser.close();server.close();
  const bad=external.filter(u=>!/fonts\.(googleapis|gstatic)|supabase|cdn|openai/i.test(u));
  console.log('aborted external requests:',external.length,bad.length?('(other: '+bad.length+')'):'');
  const failed=results.filter(r=>r.ok!==true);
  console.log(failed.length?`FAILED ${failed.length}/${results.length}`:`ALL ${results.length} PASSED`);
  process.exit(failed.length?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
