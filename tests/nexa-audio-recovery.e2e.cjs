'use strict';
// Offline, synthetic audio-retention/recovery E2E (Chromium).
// Fake microphone, local supabase-js stub, every non-local request aborted.
// Audio is NEVER persisted by the frontend; this suite proves the page tells
// the truth about it (expiry, account switch, reload, SW update).
const {chromium}=require('playwright');
const http=require('http');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const MIME={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const watchdog=setTimeout(()=>{console.error('audio-recovery E2E exceeded 280s');process.exit(1)},280000);watchdog.unref();

const STUB=`(function(){const U={id:'11111111-1111-4111-8111-111111111111',email:'synthetic@invalid.test',user_metadata:{display_name:'Synthetic'}};
const S={access_token:'synthetic.fake.token',refresh_token:'x',expires_at:9999999999,user:U};
const ok=async()=>({data:{session:S,user:U},error:null});
const chain=()=>new Proxy(function(){},{get:(t,k)=>k==='then'?(res=>res({data:[],error:null})):chain(),apply:()=>chain()});
window.supabase={createClient:()=>({auth:{getSession:ok,getUser:ok,refreshSession:ok,signOut:async()=>({error:null}),onAuthStateChange:cb=>{window.__authCb=cb;return{data:{subscription:{unsubscribe(){}}}}}},
from:()=>chain(),rpc:async n=>n==='get_my_capabilities'?({data:[{display_name:'Synthetic',access_status:'active',is_admin:false,is_reviewer:false,clinical_access:true}],error:null}):({data:null,error:null}),
functions:{invoke:async()=>({data:null,error:{message:'blocked'}})},channel:()=>chain(),removeChannel(){}})}})();`;

const INIT=`window.__confirms=[];window.__ans=true;window.confirm=m=>{window.__confirms.push(String(m));return window.__ans};window.alert=()=>{};`;
const USER_A={id:'11111111-1111-4111-8111-111111111111',email:'synthetic@invalid.test',user_metadata:{display_name:'Synthetic'}};
const USER_B={id:'22222222-2222-4222-8222-222222222222',email:'other@invalid.test',user_metadata:{display_name:'Other'}};

const results=[];
function check(name,ok,detail){results.push({name,ok});console.log((ok===true?'PASS':'FAIL').padEnd(6)+name+(ok===true?'':'  | '+detail));}

(async()=>{
  let swVersion=0;
  const server=http.createServer((req,res)=>{
    let f=decodeURIComponent(req.url.split('?')[0]);if(f==='/')f='/index.html';
    const full=path.join(root,f);
    if(!full.startsWith(root+path.sep)||!fs.existsSync(full)||fs.statSync(full).isDirectory()){res.writeHead(404).end();return}
    let body=fs.readFileSync(full);
    if(f==='/sw.js')body=Buffer.concat([body,Buffer.from('\n// synthetic update '+swVersion)]);
    res.writeHead(200,{'content-type':MIME[path.extname(full)]||'application/octet-stream','cache-control':'no-store'});res.end(body);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
  const external=[];
  const wire=async ctx=>{
    await ctx.route('**/*',route=>{
      const u=route.request().url();
      if(u.startsWith(base)||u.startsWith('data:')||u.startsWith('blob:'))return route.continue();
      if(/supabase\.min\.js/.test(u))return route.fulfill({status:200,contentType:'application/javascript',body:STUB});
      if(/\/functions\/v1\/process-consultation/.test(u))return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({fields:{queixa_principal:'TESTE SINTETICO',hda:'Paciente sintetico.'},provider:'synthetic'})});
      external.push(u);return route.abort();
    });
  };
  const ctx=await browser.newContext({permissions:['microphone'],serviceWorkers:'block'});
  await wire(ctx);
  const page=await ctx.newPage();
  await page.addInitScript(INIT);
  const ev=(f,a)=>page.evaluate(f,a);
  const until=(f,a,t=15000)=>page.waitForFunction(f,a,{timeout:t,polling:100});
  const boot=async pg=>{pg=pg||page;await pg.goto(base+'/index.html');await pg.waitForFunction(()=>getComputedStyle(document.getElementById('mainApp')).display!=='none',null,{timeout:20000});await pg.waitForTimeout(1500)};
  const waitMain=async pg=>{await (pg||page).waitForFunction(()=>getComputedStyle(document.getElementById('mainApp')).display!=='none',null,{timeout:20000});await (pg||page).waitForTimeout(800)};
  const st=pg=>(pg||page).evaluate(()=>{const r=document.getElementById('recBtn'),n=document.getElementById('audioArchiveNotice');
    return{rs:r.dataset.recordingState||null,proc:document.getElementById('processBtn').disabled,
      notice:n&&!n.hidden?n.dataset.audioArchive:null,noticeText:n&&!n.hidden?n.textContent:'',
      loginBanner:document.getElementById('loginBanner')?.textContent||'',banner:document.getElementById('bannerArea').textContent,
      gate:getComputedStyle(document.getElementById('loginGate')).display,main:getComputedStyle(document.getElementById('mainApp')).display,
      queixa:document.querySelector('.field[data-key="queixa_principal"] textarea')?.value||'',
      marker:localStorage.getItem('nexa-audio-loss-marker-v1')}});
  const consent=pg=>(pg||page).evaluate(()=>{const c=document.getElementById('consent');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}))});
  const record=async(ms=1500,pg)=>{pg=pg||page;await consent(pg);await pg.evaluate(()=>document.getElementById('recBtn').click());
    await pg.waitForFunction(()=>document.getElementById('recBtn').dataset.recordingState==='recording',null,{timeout:15000});await pg.waitForTimeout(ms)};
  const finish=async()=>{await ev(()=>document.getElementById('nfFinish').click());await until(()=>document.getElementById('recBtn').dataset.recordingState==='stopped'&&!document.getElementById('processBtn').disabled)};
  const transcribe=async()=>{await ev(()=>document.getElementById('processBtn').click());await until(()=>document.querySelector('[data-audio-archive]')?.dataset.audioArchive==='session_only',null,20000)};
  const authEvent=(e,u)=>ev(([e,u])=>window.__authCb(e,u?{user:u,access_token:'synthetic'}:null),[e,u]);

  await boot();

  // A: session ends (token expiry) WHILE recording -> audio kept, user told, same-account recovery
  await record(2200);
  const radarDuring=await ev(()=>document.getElementById('radarLiveText')?.textContent||'');
  let s=await st();
  check('A0 during recording the transcript fields stay empty (text only at the end)',s.rs==='recording'&&s.queixa==='',JSON.stringify({rs:s.rs,q:s.queixa}));
  await authEvent('SIGNED_OUT',null);await page.waitForTimeout(1200);s=await st();
  check('A1 SIGNED_OUT while recording: login gate shown, recording finalized, audio NOT cleared',s.gate!=='none'&&s.main==='none'&&s.rs==='stopped'&&!s.proc,JSON.stringify({gate:s.gate,main:s.main,rs:s.rs,proc:s.proc}));
  check('A2 login banner states the audio is memory-only and asks for the SAME account',/mem[oó]ria/i.test(s.loginBanner)&&/mesma conta/i.test(s.loginBanner),s.loginBanner.slice(0,120));
  check('A3 no "Nova consulta iniciada" wipe message (nothing silently cleared)',!/Nova consulta iniciada/i.test(s.banner),s.banner.slice(0,80));
  await authEvent('SIGNED_IN',USER_A);await waitMain();s=await st();
  check('A4 same account signs in again: audio still held, Transcrever enabled',s.rs==='stopped'&&!s.proc,JSON.stringify({rs:s.rs,proc:s.proc}));
  await transcribe();s=await st();
  check('A5 transcription after recovery works; text appears only now; still NOT archived',s.queixa==='TESTE SINTETICO'&&s.notice==='session_only'&&/N[ÃA]O/i.test(s.noticeText),JSON.stringify({q:s.queixa,n:s.notice}));
  check('A6 radar was live during recording (indicator present)',typeof radarDuring==='string'&&radarDuring.length>0,radarDuring);

  // B: session ends with finished, UNtranscribed audio; another account signs in
  await boot();await record(1500);await finish();
  await authEvent('SIGNED_OUT',null);await page.waitForTimeout(900);s=await st();
  check('B1 SIGNED_OUT with untranscribed audio keeps it (no silent wipe)',s.rs==='stopped'&&!s.proc&&s.gate!=='none',JSON.stringify({rs:s.rs,proc:s.proc}));
  await authEvent('SIGNED_IN',USER_B);await waitMain();await until(()=>document.getElementById('recBtn').dataset.recordingState==='idle',null,8000).catch(()=>{});s=await st();
  check('B2 DIFFERENT account: audio not transferred (idle, Transcrever disabled)',s.rs==='idle'&&s.proc,JSON.stringify({rs:s.rs,proc:s.proc}));
  check('B3 DIFFERENT account: discard is stated, not silent',/outra conta/i.test(s.banner)&&/descartado/i.test(s.banner),s.banner.slice(0,120));
  check('B4 loss marker cleared after intentional discard',s.marker===null,String(s.marker));

  // C: reload / close honesty (audio is never persisted; the page must say so)
  await boot();await record(6200);
  await page.reload();await waitMain();await page.waitForTimeout(1500);s=await st();
  check('C1 reload DURING recording: lost-audio notice with duration, nothing claimed recovered',s.notice==='lost'&&/interrompida/i.test(s.noticeText)&&/N[ÃA]O foi preservado/i.test(s.noticeText)&&s.rs==='idle'&&s.proc,JSON.stringify({n:s.notice,t:s.noticeText.slice(0,110),rs:s.rs}));
  check('C1b notice reports elapsed time (>= 5 s tick)',/0:0[5-9]|0:1\d/.test(s.noticeText),s.noticeText.slice(0,110));
  await record(1500);s=await st();
  check('C2 starting a new recording clears the lost-audio notice',s.notice===null&&s.rs==='recording',JSON.stringify({n:s.notice,rs:s.rs}));
  await finish();await page.reload();await waitMain();await page.waitForTimeout(1500);s=await st();
  check('C3 reload with UNtranscribed audio: notice says it was lost',s.notice==='lost'&&/N[ÃA]O transcrito/i.test(s.noticeText)&&/perdido/i.test(s.noticeText),JSON.stringify({n:s.notice,t:s.noticeText.slice(0,100)}));
  await record(1200);await finish();await transcribe();
  await page.reload();await waitMain();await page.waitForTimeout(1500);s=await st();
  check('C4 reload after transcription: says audio gone, note preserved',s.notice==='lost'&&/n[ãa]o existe mais/i.test(s.noticeText)&&/prontu[áa]rio/i.test(s.noticeText),JSON.stringify({n:s.notice,t:s.noticeText.slice(0,100)}));
  await ev(()=>document.getElementById('resetBtn').click());await page.waitForTimeout(2200);s=await st();
  check('C5 explicit clear removes notice and marker',s.notice===null&&s.marker===null,JSON.stringify({n:s.notice,m:s.marker}));
  await boot();s=await st();
  check('C6 clean idle page: no notice, no marker',s.notice===null&&s.marker===null,JSON.stringify({n:s.notice,m:s.marker}));

  // D: second tab while the first is recording must NOT report a false loss
  await record(1800);
  const page2=await ctx.newPage();await page2.addInitScript(INIT);await boot(page2);await page2.waitForTimeout(1500);
  const s2=await st(page2);s=await st();
  check('D1 second tab beside an active recording shows no lost-audio notice; first tab keeps recording',s2.notice===null&&s.rs==='recording',JSON.stringify({n2:s2.notice,rs:s.rs}));
  await page2.close();await ev(()=>document.getElementById('nfFinish').click());await page.waitForTimeout(800);

  // E: service-worker update while recording must not reload or stop the page
  const ctx2=await browser.newContext({permissions:['microphone'],serviceWorkers:'allow'});
  await wire(ctx2);
  const p3=await ctx2.newPage();await p3.addInitScript(INIT);await boot(p3);
  await p3.waitForFunction(()=>navigator.serviceWorker.controller||true,null,{timeout:5000}).catch(()=>{});
  await p3.evaluate(async()=>{const r=await navigator.serviceWorker.ready;window.__regOk=!!r;window.__noReloadMark=Math.random()});
  const mark=await p3.evaluate(()=>window.__noReloadMark);
  await record(1200,p3);
  swVersion=1;
  await p3.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update()});
  await p3.waitForTimeout(3500);
  const e=await p3.evaluate(()=>({mark:window.__noReloadMark,rs:document.getElementById('recBtn').dataset.recordingState,timer:document.getElementById('timer').textContent,reg:!!window.__regOk}));
  check('E1 SW update during recording: no reload, still recording, timer advancing',e.reg&&e.mark===mark&&e.rs==='recording'&&e.timer!=='00:00',JSON.stringify(e));
  await ctx2.close();

  const bad=external.filter(u=>!/fonts\.(googleapis|gstatic)|supabase|cdn|openai/i.test(u));
  console.log('aborted external requests:',external.length,bad.length?('(other: '+bad.length+')'):'');
  await browser.close();server.close();
  const failed=results.filter(r=>r.ok!==true);
  console.log(failed.length?`FAILED ${failed.length}/${results.length}`:`ALL ${results.length} PASSED`);
  process.exit(failed.length?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
