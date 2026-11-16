'use strict';
// Offline, synthetic recorder-session E2E (Chromium).
// - Fake microphone (Chromium fake device) and a local supabase-js stub.
// - ALL non-local network is aborted and counted; nothing leaves the machine.
// - No tokens, no paid calls, no clinical data. Transcription is a local route.
const {chromium}=require('playwright');
const http=require('http');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const MIME={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const watchdog=setTimeout(()=>{console.error('recorder-session E2E exceeded 240s');process.exit(1)},240000);watchdog.unref();

const STUB=`(function(){const U={id:'11111111-1111-4111-8111-111111111111',email:'synthetic@invalid.test',user_metadata:{display_name:'Synthetic'}};
const S={access_token:'synthetic.fake.token',refresh_token:'x',expires_at:9999999999,user:U};
const ok=async()=>({data:{session:S,user:U},error:null});
const chain=()=>new Proxy(function(){},{get:(t,k)=>k==='then'?(res=>res({data:[],error:null})):chain(),apply:()=>chain()});
window.supabase={createClient:()=>({auth:{getSession:ok,getUser:ok,refreshSession:ok,signOut:async()=>({error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
from:()=>chain(),rpc:async n=>n==='get_my_capabilities'?({data:[{display_name:'Synthetic',access_status:'active',is_admin:false,is_reviewer:false,clinical_access:true}],error:null}):({data:null,error:null}),
functions:{invoke:async()=>({data:null,error:{message:'blocked'}})},channel:()=>chain(),removeChannel(){}})}})();`;

const INIT=`window.__confirms=[];window.__ans=true;window.confirm=m=>{window.__confirms.push(String(m));return window.__ans};
window.alert=()=>{};window.__mr=[];const _MR=window.MediaRecorder;
window.MediaRecorder=class extends _MR{constructor(s,o){super(s,o);this.__bytes=0;window.__mr.push(this);this.addEventListener('dataavailable',e=>this.__bytes+=e.data.size)}};
window.MediaRecorder.isTypeSupported=_MR.isTypeSupported.bind(_MR);
window.__gum=0;window.__gumFail=false;const _g=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia=async c=>{window.__gum++;if(window.__gumFail)throw new DOMException('denied','NotAllowedError');return _g(c)};`;

const results=[];
function check(name,ok,detail){results.push({name,ok,detail});console.log((ok===true?'PASS':ok==='NOT_RUN'?'NOT_RUN':'FAIL').padEnd(8)+name+(ok===true?'':'  | '+detail));}

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
  const ctx=await browser.newContext({permissions:['microphone'],serviceWorkers:'block'});
  const external=[];
  await ctx.route('**/*',route=>{
    const u=route.request().url();
    if(u.startsWith(base)||u.startsWith('data:')||u.startsWith('blob:'))return route.continue();
    if(/supabase\.min\.js/.test(u))return route.fulfill({status:200,contentType:'application/javascript',body:STUB});
    if(/\/functions\/v1\/process-consultation/.test(u))return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({fields:{queixa_principal:'TESTE SINTETICO',hda:'Paciente sintetico.'},provider:'synthetic',model:'none',stages:[],pipeline_version:'synthetic'})});
    external.push(u);return route.abort();
  });
  const page=await ctx.newPage();
  const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e).slice(0,160)));
  await page.addInitScript(INIT);
  const ev=(f,a)=>page.evaluate(f,a);
  const until=(f,a,t=15000)=>page.waitForFunction(f,a,{timeout:t,polling:100});
  const st=()=>ev(()=>{const r=document.getElementById('recBtn');const n=document.querySelector('[data-audio-archive]');
    return{rs:r.dataset.recordingState||null,tr:r.dataset.audioTranscribed||null,rdis:r.disabled,proc:document.getElementById('processBtn').disabled,
      notice:n?n.dataset.audioArchive:null,noticeText:n?n.textContent:'',confirms:window.__confirms.slice(),
      toast:(document.getElementById('nexaAuditOutboxToast')||{}).textContent||'',banner:document.getElementById('bannerArea').textContent,
      status:document.getElementById('status').textContent,gum:window.__gum,mr:window.__mr.length}});
  const consent=()=>ev(()=>{const c=document.getElementById('consent');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}))});
  const record=async(ms=1800)=>{await consent();await ev(()=>{window.__take=window.__mr.length;document.getElementById('recBtn').click()});
    await until(()=>document.getElementById('recBtn').dataset.recordingState==='recording');await page.waitForTimeout(ms);};
  const finish=async()=>{await ev(()=>document.getElementById('nfFinish').click());await until(()=>document.getElementById('recBtn').dataset.recordingState==='stopped'&&!document.getElementById('processBtn').disabled)};
  const transcribe=async()=>{await ev(()=>document.getElementById('processBtn').click());await until(()=>document.querySelector('[data-audio-archive]')?.dataset.audioArchive==='session_only',null,20000)};
  const click=async(id,ans,settle)=>{await ev(a=>{window.__confirms.length=0;window.__ans=a},ans);await ev(i=>document.getElementById(i).click(),id);await page.waitForTimeout(settle||1500);return st()};
  const BUTTONS=['nfTopClear','nexaNewCaseBtn','nexaTopReset','resetBtn'];

  await page.goto(base+'/index.html');
  await until(()=>getComputedStyle(document.getElementById('mainApp')).display!=='none',null,20000);
  await page.waitForTimeout(1500);

  // A: structure / D1
  const d1=await ev(()=>({flag:window.__NEXA_RADAR_REC_HOTFIX__,globalStart:typeof startRec,bound:!!document.getElementById('nexaDesktopPause')?.dataset.nexaRecoveryBound}));
  check('A1 hotfix-v1 loaded and exposes no recorder globals',!!d1.flag&&d1.globalStart==='undefined'&&!d1.bound,JSON.stringify(d1));
  const src=fs.readFileSync(path.join(root,'nexa-hotfix-v1.js'),'utf8');
  check('A2 hotfix-v1 carries no unreachable recorder wrapper',!/installRecorderRecovery|recoveredStart|releaseStaleRecorder/.test(src),'dead wrapper still present');

  // B: record / stop / retain (untranscribed)
  await record();let s=await st();
  check('B1 start recording with fake mic',s.rs==='recording'&&s.gum===1,JSON.stringify({rs:s.rs,gum:s.gum}));
  await finish();s=await st();
  const bytes=await ev(()=>window.__mr[window.__take].__bytes);
  check('B2 stop keeps audio in memory, Transcrever enabled, status says memory only',s.rs==='stopped'&&!s.proc&&bytes>0&&/mem[oó]ria/i.test(s.status)&&s.tr===null,JSON.stringify({rs:s.rs,proc:s.proc,bytes,status:s.status.slice(0,60),tr:s.tr}));
  await ev(()=>{window.__confirms.length=0});await ev(()=>document.getElementById('recBtn').click());await page.waitForTimeout(600);s=await st();
  check('B3 untranscribed audio: new take blocked (no mic request, no confirm)',s.gum===1&&s.confirms.length===0,JSON.stringify({gum:s.gum,c:s.confirms.length}));
  for(const id of BUTTONS){
    s=await click(id,true);
    check('B4 '+id+' with UNtranscribed audio: blocked, no confirm, audio kept',s.rs==='stopped'&&!s.proc&&s.confirms.length===0&&/N[ÃA]O foi limpa/i.test(s.toast),JSON.stringify({rs:s.rs,proc:s.proc,c:s.confirms.length,toast:s.toast.slice(0,60)}));
  }

  // C: transcription (simulated), session-only notice, never claims archived
  await transcribe();s=await st();
  check('C1 transcription: local checkpoint, flag set, notice says NOT archived',s.tr==='1'&&s.notice==='session_only'&&/N[ÃA]O/i.test(s.noticeText)&&s.proc,JSON.stringify({tr:s.tr,notice:s.notice,text:s.noticeText.slice(0,60)}));
  check('C2 new take blocked while transcribed audio is held',s.rdis===true,JSON.stringify({rdis:s.rdis}));

  // D: four clear buttons, declined then accepted, exactly one audio confirm
  for(let i=0;i<BUTTONS.length;i++){
    const id=BUTTONS[i];
    s=await click(id,false);
    check('D1 '+id+' DECLINED: exactly 1 audio-discard confirm, audio kept',s.confirms.length===1&&/N[ÃA]O foi arquivado/i.test(s.confirms[0])&&s.notice==='session_only'&&s.tr==='1',JSON.stringify({c:s.confirms.map(x=>x.slice(0,40)),notice:s.notice,tr:s.tr}));
    s=await click(id,true,2500);
    check('D2 '+id+' ACCEPTED: exactly 1 confirm, cleared, idle, flag removed',s.confirms.length===1&&s.rs==='idle'&&s.notice!=='session_only'&&s.tr===null,JSON.stringify({c:s.confirms.length,rs:s.rs,notice:s.notice,tr:s.tr}));
    if(i<BUTTONS.length-1){await record(1200);await finish();await transcribe()}
  }

  // E: microphone failure and recovery
  await consent();await ev(()=>{window.__gumFail=true;window.__confirms.length=0});
  const gum0=(await st()).gum;await ev(()=>document.getElementById('recBtn').click());await page.waitForTimeout(1200);s=await st();
  check('E1 mic failure: error shown, no recorder started, UI idle',/microfone/i.test(s.banner)&&s.rs==='idle'&&s.gum===gum0+1,JSON.stringify({banner:s.banner.slice(0,50),rs:s.rs}));
  await ev(()=>{window.__gumFail=false});await record(1200);s=await st();
  check('E2 recovery: retry after mic failure records normally',s.rs==='recording',JSON.stringify({rs:s.rs}));

  // F: recorder error mid-recording (device/encoder failure) must not strand the UI
  await ev(()=>{const mr=window.__mr[window.__take];mr.dispatchEvent(new Event('error'))});
  let stuck=false;try{await until(()=>document.getElementById('recBtn').dataset.recordingState!=='recording',null,4000)}catch{stuck=true}
  s=await st();
  check('F1 MediaRecorder error: recording ends, captured audio retained, user warned',!stuck&&s.rs==='stopped'&&!s.proc&&/interromp|erro|falh/i.test(s.banner),JSON.stringify({stuck,rs:s.rs,proc:s.proc,banner:s.banner.slice(0,70)}));
  if(stuck){await ev(()=>document.getElementById('nfFinish').click());await page.waitForTimeout(1500)}

  // G: microphone track lost
  s=await st();
  if(s.rs==='stopped'){if(!s.tr)await transcribe();await click('nfTopClear',true,2500)}
  await record(1200);
  await ev(()=>{window.__mr[window.__take].stream.getTracks().forEach(t=>{t.stop();t.dispatchEvent(new Event('ended'))})});
  let g=true;try{await until(()=>document.getElementById('recBtn').dataset.recordingState==='stopped',null,5000)}catch{g=false}
  s=await st();
  check('G1 mic track lost: recording finalizes, audio retained, Transcrever enabled',g&&!s.proc,JSON.stringify({rs:s.rs,proc:s.proc}));

  // H: local checkpoint failure keeps the consultation
  await transcribe();
  await ev(()=>{const a=window.nexaEncounterAutosave18101;window.__origPreserve=a.preserve;a.preserve=async()=>{throw new Error('SYNTHETIC_CHECKPOINT_FAIL')}});
  s=await click('nfTopClear',true,2000);
  const hasText=await ev(()=>[...document.querySelectorAll('textarea')].some(t=>t.value.trim()));
  check('H1 local checkpoint FAILS: consultation NOT cleared, audio kept, single confirm',s.rs==='stopped'&&s.notice==='session_only'&&/N[ÃA]O foi limpa/i.test(s.toast)&&s.confirms.length===1&&hasText,JSON.stringify({rs:s.rs,notice:s.notice,c:s.confirms.length,hasText,toast:s.toast.slice(0,70)}));
  await ev(()=>{window.nexaEncounterAutosave18101.preserve=window.__origPreserve});
  s=await click('nfTopClear',true,2500);
  check('H2 checkpoint restored: clear succeeds',s.rs==='idle'&&s.confirms.length===1,JSON.stringify({rs:s.rs,c:s.confirms.length}));

  // I: isolation
  check('I1 only the known Supabase host was attempted, and every attempt was aborted locally',external.every(u=>new URL(u).host==='fmkrcieubrlltiggyauc.supabase.co'),JSON.stringify([...new Set(external.map(u=>new URL(u).host))]));
  console.log('INFO     external requests attempted and aborted: '+external.length+' '+JSON.stringify([...new Set(external.map(u=>new URL(u).host))]));
  check('I2 no uncaught page errors',pageErrors.length===0,JSON.stringify(pageErrors.slice(0,3)));
  check('NOT_RUN service worker cache behaviour (serviceWorkers blocked for determinism)','NOT_RUN','');

  await browser.close();server.close();
  const fails=results.filter(r=>r.ok===false||(r.ok!==true&&r.ok!=='NOT_RUN'));
  console.log('\nTOTAL pass='+results.filter(r=>r.ok===true).length+' fail='+fails.length+' not_run='+results.filter(r=>r.ok==='NOT_RUN').length);
  process.exit(fails.length?1:0);
})().catch(e=>{console.error('FATAL',e);process.exit(2)});
