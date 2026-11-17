'use strict';
// Offline, fictitious end-to-end: recorder -> structured note -> REAL autosave
// module -> synthetic in-memory table -> REAL readback contract module
// (supabase/functions/_shared/nexa-clinical-text-readback.mjs) -> REAL readback
// client (nexa-text-readback-v1.js) -> UI state.
// NOT proven here: the Deno endpoint (index.ts), real Supabase auth, RLS/ACL.
// The "RLS" below is a few lines of this test file, not the database policy.
const {chromium}=require('playwright');
const http=require('http');
const fs=require('fs');
const path=require('path');
const {createHash}=require('crypto');

const root=path.resolve(__dirname,'..');
const MIME={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const watchdog=setTimeout(()=>{console.error('text-readback E2E exceeded 420s');process.exit(1)},420000);watchdog.unref();

const A={id:'11111111-1111-4111-8111-111111111111',email:'a@invalid.test',user_metadata:{display_name:'Medico A'}};
const B={id:'22222222-2222-4222-8222-222222222222',email:'b@invalid.test',user_metadata:{display_name:'Medico B'}};
const FN='nexa-clinical-text-readback';
const hashCanonical=async t=>createHash('sha256').update(t,'utf8').digest('hex');

// ---- synthetic server side (node) ------------------------------------------
const S={db:new Map(),session:null,invokes:[],inject:{},delay:0};
const iso=d=>d.toISOString().replace('Z','+00:00');
const clone=x=>JSON.parse(JSON.stringify(x));
const project=(r,cols)=>{if(!cols||cols==='*')return clone(r);const o={};for(const c of String(cols).split(',').map(x=>x.trim()).filter(Boolean))o[c]=clone(r[c]??null);return o};
function dbExec(s){
  const uid=S.session&&S.session.id;
  if(!uid)return{data:null,error:{code:'401',message:'no session'}};
  if(s.table!=='consultation_history')return{data:s.single?null:[],error:null};
  const mine=[...S.db.values()].filter(r=>r.user_id===uid); // test-local owner filter, NOT the real RLS
  const match=r=>s.filters.every(([m,c,v])=>m==='eq'?String(r[c])===String(v):m==='neq'?String(r[c])!==String(v):m==='in'?(v||[]).includes(r[c]):m==='is'?(r[c]??null)===v:true);
  let rows;
  if(s.op==='insert'){
    const p=s.payload;
    if(p.user_id!==uid)return{data:null,error:{code:'42501',message:'row violates policy'}};
    if(S.db.has(p.id))return{data:null,error:{code:'23505',message:'duplicate'}};
    const now=new Date();
    const row={status:'draft',encounter_state:'draft',audit_priority:0,protocol_usage:[],processing_meta:{},...clone(p),sync_version:0,created_at:iso(now),updated_at:iso(now)};
    S.db.set(row.id,row);rows=[row];
  }else if(s.op==='update'){
    rows=mine.filter(match);
    for(const r of rows){const old=r.sync_version;Object.assign(r,clone(s.payload));r.user_id=r.user_id;r.sync_version=old+1;r.updated_at=iso(new Date())}
  }else if(s.op==='delete'){
    rows=mine.filter(match);for(const r of rows)S.db.delete(r.id);
  }else{
    rows=mine.filter(match);
    if(s.order){const[c,d]=s.order;rows.sort((x,y)=>String(x[c]).localeCompare(String(y[c]))*(d==='desc'?-1:1))}
    if(s.lim)rows=rows.slice(0,s.lim);
  }
  if(s.op!=='select'&&!s.ret&&s.op!=='insert')return{data:null,error:null};
  const out=rows.map(r=>project(r,s.cols));
  if(s.single==='maybe')return out.length>1?{data:null,error:{code:'PGRST116'}}:{data:out[0]||null,error:null};
  if(s.single==='one')return out.length===1?{data:out[0],error:null}:{data:null,error:{code:'PGRST116'}};
  return{data:out,error:null};
}
let mod;
async function invoke(name,body){
  S.invokes.push({name,body,as:S.session&&S.session.id});
  if(S.delay)await new Promise(r=>setTimeout(r,S.delay));
  const uid=S.session&&S.session.id;
  if(name!==FN)return{error:{code:'NOT_FOUND',status:404}};
  if(!uid)return{error:{code:'UNAUTHORIZED',status:401}};
  if(S.inject.fail)return{error:{code:'READBACK_UNAVAILABLE',status:503}};
  if(S.inject.beforeLookup)S.inject.beforeLookup(body);
  try{
    const out=await mod.readVerifiedTextPackage({actor:uid,capability:{access_status:'active',clinical_access:true},request:body,hashCanonical,
      lookup:async({encounter_id})=>{const r=[...S.db.values()].find(x=>x.encounter_id===encounter_id&&(S.inject.leakRls||x.user_id===uid));return r?clone(r):null}});
    if(S.inject.tamperSha)out.canonical_sha256=(out.canonical_sha256[0]==='a'?'b':'a')+out.canonical_sha256.slice(1);
    return{data:out};
  }catch(e){
    if(e&&e.name==='TextReadbackError')return{error:{code:e.code,status:e.status}};
    return{error:{code:'READBACK_UNAVAILABLE',status:503}};
  }
}
const independentSha=async(encId,uid)=>{const r=[...S.db.values()].find(x=>x.encounter_id===encId);
  return (await mod.readVerifiedTextPackage({actor:uid,capability:{access_status:'active',clinical_access:true},request:{encounter_id:encId,expected_sync_version:r.sync_version},hashCanonical,lookup:async()=>clone(r)})).canonical_sha256};

// ---- page-side stub ---------------------------------------------------------
const STUB=`(function(){
const mkSession=u=>({access_token:'synthetic.'+u.id,refresh_token:'x',expires_at:9999999999,user:u});
const chain=()=>new Proxy(function(){},{get:(t,k)=>k==='then'?(res=>res({data:[],error:null})):chain(),apply:()=>chain()});
const mk=table=>{const s={table,op:'select',cols:'*',filters:[],order:null,lim:null,single:null,payload:null,ret:false};const api={};
  api.select=c=>{s.cols=c||'*';if(s.op!=='select')s.ret=true;return api};
  api.insert=p=>{s.op='insert';s.payload=p;return api};api.upsert=api.insert;
  api.update=p=>{s.op='update';s.payload=p;return api};api.delete=()=>{s.op='delete';return api};
  for(const m of ['eq','neq','in','is','gt','gte','lt','lte','not','or','ilike','like','contains','filter','match'])api[m]=(...a)=>{s.filters.push([m,...a]);return api};
  api.order=(c,o)=>{s.order=[c,o&&o.ascending===false?'desc':'asc'];return api};api.limit=n=>{s.lim=n;return api};api.range=()=>api;
  api.maybeSingle=()=>{s.single='maybe';return api};api.single=()=>{s.single='one';return api};
  api.then=(res,rej)=>window.__dbExec(JSON.parse(JSON.stringify(s))).then(res,rej);return api};
window.supabase={createClient:()=>({auth:{
  getSession:async()=>{const u=await window.__whoami();return{data:{session:u?mkSession(u):null},error:null}},
  getUser:async()=>{const u=await window.__whoami();return{data:{user:u||null},error:u?null:new Error('no session')}},
  refreshSession:async()=>{const u=await window.__whoami();return{data:{session:u?mkSession(u):null},error:null}},
  signOut:async()=>({error:null}),
  onAuthStateChange:cb=>{window.__authCb=cb;return{data:{subscription:{unsubscribe(){}}}}}},
 from:mk,
 rpc:async n=>n==='get_my_capabilities'?({data:[{display_name:'Sintetico',access_status:'active',is_admin:false,is_reviewer:false,clinical_access:true}],error:null}):({data:null,error:null}),
 functions:{invoke:async(name,opts)=>{const r=await window.__invoke(name,opts&&opts.body);
   if(r.error)return{data:null,error:{message:r.error.code,context:{status:r.error.status,json:async()=>({error:r.error.code})}}};return{data:r.data,error:null}}},
 channel:()=>chain(),removeChannel(){}})}})();`;
const INIT=`window.__confirms=[];window.__ans=true;window.confirm=m=>{window.__confirms.push(String(m));return window.__ans};window.alert=()=>{};`;
const FLAG=`window.__NEXA_TEXT_READBACK__={enabled:true,mode:'synthetic-review-v1'};`;

const results=[];
function check(name,ok,detail){results.push({name,ok});console.log((ok===true?'PASS':'FAIL').padEnd(6)+name+(ok===true?'':'  | '+detail));}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  mod=await import(path.join(root,'supabase/functions/_shared/nexa-clinical-text-readback.mjs'));
  let marker=1;
  const server=http.createServer((req,res)=>{
    let f=decodeURIComponent(req.url.split('?')[0]);if(f==='/')f='/index.html';
    const full=path.join(root,f);
    if(!full.startsWith(root+path.sep)||!fs.existsSync(full)||fs.statSync(full).isDirectory()){res.writeHead(404).end();return}
    let body=fs.readFileSync(full);
    if(f==='/nexa-text-readback-v1.js')body=Buffer.concat([body,Buffer.from('\n;window.__RB_MARK='+marker+';')]);
    res.writeHead(200,{'content-type':MIME[path.extname(full)]||'application/octet-stream','cache-control':'no-store'});res.end(body);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
  const external=[];
  const newCtx=async({flag,sw})=>{
    const ctx=await browser.newContext({permissions:['microphone'],serviceWorkers:sw?'allow':'block'});
    await ctx.exposeFunction('__dbExec',s=>dbExec(s));
    await ctx.exposeFunction('__invoke',(n,b)=>invoke(n,b));
    await ctx.exposeFunction('__whoami',()=>S.session);
    await ctx.addInitScript(INIT+(flag?FLAG:''));
    await ctx.route('**/*',route=>{
      const u=route.request().url();
      if(u.startsWith(base)||u.startsWith('data:')||u.startsWith('blob:'))return route.continue();
      if(/supabase\.min\.js/.test(u))return route.fulfill({status:200,contentType:'application/javascript',body:STUB});
      if(/\/functions\/v1\/process-consultation/.test(u))return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({fields:{queixa_principal:S.session&&S.session.id===B.id?'QUEIXA SINTETICA DO MEDICO B':'TESTE SINTETICO',hda:'Paciente ficticio, texto sintetico.'},provider:'synthetic'})});
      external.push(u);return route.abort();
    });
    return ctx;
  };
  const H=page=>{
    const ev=(f,a)=>page.evaluate(f,a);
    const until=(f,a,t=15000)=>page.waitForFunction(f,a,{timeout:t,polling:100});
    const boot=async()=>{await page.goto(base+'/index.html');await until(()=>getComputedStyle(document.getElementById('mainApp')).display!=='none',null,20000);await page.waitForTimeout(1500)};
    const waitMain=async()=>{await until(()=>getComputedStyle(document.getElementById('mainApp')).display!=='none',null,20000);await page.waitForTimeout(1200)};
    const consent=()=>ev(()=>{const c=document.getElementById('consent');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}))});
    const record=async(ms=1500)=>{await consent();await ev(()=>document.getElementById('recBtn').click());await until(()=>document.getElementById('recBtn').dataset.recordingState==='recording');await page.waitForTimeout(ms)};
    const finish=async()=>{await ev(()=>document.getElementById('nfFinish').click());await until(()=>document.getElementById('recBtn').dataset.recordingState==='stopped'&&!document.getElementById('processBtn').disabled)};
    const transcribe=async()=>{await ev(()=>document.getElementById('processBtn').click());await until(()=>document.querySelector('[data-audio-archive]')?.dataset.audioArchive==='session_only',null,20000)};
    const rb=()=>ev(()=>({...(window.nexaTextReadback?.state()||{state:'absent'}),text:document.getElementById('nexaReadbackStatus')?.textContent||'',shown:!!document.getElementById('nexaReadbackStatus')&&!document.getElementById('nexaReadbackStatus').hidden}));
    const waitRb=async(pred,t=20000)=>{const end=Date.now()+t;let s;while(Date.now()<end){s=await rb();if(pred(s))return s;await sleep(150)}return s};
    const edit=txt=>ev(t=>{const e=document.querySelector('.field[data-key="hda"] textarea');e.value=t;e.dispatchEvent(new Event('input',{bubbles:true}))},txt);
    const field=k=>ev(k=>document.querySelector('.field[data-key="'+k+'"] textarea')?.value||'',k);
    const auth=(e,u)=>ev(([e,u])=>window.__authCb(e,u?{user:u,access_token:'synthetic.'+u.id}:null),[e,u]);
    return{ev,until,boot,waitMain,record,finish,transcribe,rb,waitRb,edit,field,auth};
  };
  const rowFor=uid=>[...S.db.values()].find(r=>r.user_id===uid);

  // ===== 0. flag absent: nothing runs, nothing requested ======================
  {
    const ctx=await newCtx({flag:false});const page=await ctx.newPage();const h=H(page);
    S.session=A;await h.boot();await h.record(1500);await h.finish();await h.transcribe();await page.waitForTimeout(3000);
    const absent=await h.ev(()=>({el:!!document.getElementById('nexaReadbackStatus'),api:!!window.nexaTextReadback,st:window.nexaTextReadback?.state()?.state}));
    const row=rowFor(A.id);
    check('Z1 flag absent: note still autosaves and syncs to the synthetic table',!!row&&row.fields.queixa_principal==='TESTE SINTETICO',JSON.stringify(row&&row.fields));
    check('Z2 flag absent: readback client is inert (no UI, no endpoint call)',!absent.el&&S.invokes.length===0&&(absent.st==='idle'||!absent.api),JSON.stringify({absent,calls:S.invokes.length}));
    await ctx.close();S.db.clear();S.invokes.length=0;
  }

  // ===== main: flag on, services blocked for determinism ======================
  const ctx=await newCtx({flag:true});const page=await ctx.newPage();const h=H(page);
  S.session=A;await h.boot();
  await h.record(1500);
  const mid=await h.field('queixa_principal');
  check('A0 during recording the note text is not shown (text only at the end)',mid==='',mid);
  await h.finish();await h.transcribe();
  let r=await h.waitRb(s=>s.state==='verified');
  const rowA=rowFor(A.id);const encA=rowA&&rowA.encounter_id;
  check('A1 recorder -> structured note -> autosave: row exists for doctor A with the transcribed text',!!rowA&&rowA.user_id===A.id&&rowA.fields.queixa_principal==='TESTE SINTETICO',JSON.stringify(rowA&&rowA.fields));
  check('A2 readback verified: UI shows server version and SHA-256, text-only wording',r.state==='verified'&&r.sync_version===rowA.sync_version&&r.sha256&&r.text.includes(r.sha256.slice(0,12))&&/somente texto/i.test(r.text)&&!/arquivad/i.test(r.text),JSON.stringify(r));
  const sha1=await independentSha(encA,A.id);
  check('A3 displayed SHA-256 equals an independent hash of the server row',r.sha256===sha1,r.sha256+' vs '+sha1);
  check('A4 readback request carries only encounter id + version (no clinical text, no audio)',S.invokes.length>0&&S.invokes.every(i=>Object.keys(i.body).sort().join()==='encounter_id,expected_sync_version'),JSON.stringify(S.invokes.slice(-1)));

  const v1=rowA.sync_version;
  await h.edit('Paciente ficticio, texto sintetico EDITADO 1.');
  r=await h.waitRb(s=>s.state==='verified'&&s.sha256!==sha1);
  const row2=rowFor(A.id);
  check('A5 autosave edit: server version advanced and readback re-verified with a NEW hash',row2.sync_version>v1&&r.state==='verified'&&r.sync_version===row2.sync_version&&r.sha256===await independentSha(encA,A.id),JSON.stringify({v1,v2:row2.sync_version,r}));
  const sha2=r.sha256;

  // ---- reload + recovery ----
  await page.reload();await h.waitMain();await page.waitForTimeout(2500);
  const rec=await h.ev(()=>({banner:!document.getElementById('nexaRestoreBanner')?.hidden,notice:document.querySelector('[data-audio-archive]')?.dataset.audioArchive||null,q:document.querySelector('.field[data-key="queixa_principal"] textarea')?.value||''}));
  check('R1 after reload the draft is offered for recovery, form not silently refilled, audio reported as NOT recovered',rec.banner&&rec.q===''&&rec.notice==='lost',JSON.stringify(rec));
  await h.ev(()=>document.getElementById('nexaRestoreSessionBtn').click());
  r=await h.waitRb(s=>s.state==='verified'&&s.sync_version>=row2.sync_version);
  const q2=await h.field('hda');const rowR=rowFor(A.id);
  check('R2 recovered note equals the last saved text and the server readback is verified again',q2==='Paciente ficticio, texto sintetico EDITADO 1.'&&r.state==='verified'&&r.sha256===await independentSha(encA,A.id),JSON.stringify({q2,r}));

  // ---- failures must never read as success ----
  const noSuccess=s=>s.state!=='verified'&&!/Releitura textual confirmada/.test(s.text);
  // wait for a readback that happens AFTER the edit (never reuse a stale state)
  const fresh=async(n,pred,t=25000)=>{const end=Date.now()+t;while(S.invokes.length<=n&&Date.now()<end)await sleep(100);return h.waitRb(pred,t)};
  let n0=S.invokes.length;S.inject={tamperSha:true};await h.edit('EDITADO 2 (hash adulterado na resposta).');
  r=await fresh(n0,s=>s.state==='mismatch');
  check('F1 tampered response hash: mismatch, never "confirmada"',r.state==='mismatch'&&r.code==='HASH_MISMATCH'&&noSuccess(r)&&/NÃO confirmada/.test(r.text),JSON.stringify(r));
  n0=S.invokes.length;S.inject={beforeLookup:()=>{const x=rowFor(A.id);x.fields={...x.fields,hda:'ALTERADO NO SERVIDOR sem mudar a versao'}}};
  await h.edit('EDITADO 3 (conteudo divergente no servidor).');
  r=await fresh(n0,s=>s.state==='mismatch');
  check('F2 server content diverges at the same version: CONTENT_MISMATCH, not verified',r.state==='mismatch'&&r.code==='CONTENT_MISMATCH'&&noSuccess(r),JSON.stringify(r));
  n0=S.invokes.length;S.inject={fail:true};await h.edit('EDITADO 5 (leitura falha).');
  r=await fresh(n0,s=>s.state==='pending'&&s.code==='READBACK_UNAVAILABLE');
  check('F4 readback unavailable (503): PENDING with explicit text, not verified',r.state==='pending'&&noSuccess(r)&&/PENDENTE/.test(r.text),JSON.stringify(r));
  n0=S.invokes.length;S.inject={};await h.edit('EDITADO 6 (servico restabelecido).');
  r=await fresh(n0,s=>s.state==='verified');
  const rowF=rowFor(A.id);
  check('F5 after failures clear, a later edit verifies again against the CURRENT server row',r.state==='verified'&&r.sha256===await independentSha(encA,A.id)&&rowF.fields.hda==='EDITADO 6 (servico restabelecido).',JSON.stringify(r));
  // edit while a readback is in flight: old content must not be confirmed for the new note
  n0=S.invokes.length;S.delay=1200;await h.edit('EDITADO 7a (em voo).');
  await h.waitRb(s=>s.state==='checking',8000);
  await h.edit('EDITADO 7b (final).');
  r=await fresh(n0+1,s=>s.state==='verified',25000);S.delay=0;
  const finalRow=rowFor(A.id);
  check('F6 edit during an in-flight readback: final confirmation matches the FINAL text only',r.state==='verified'&&finalRow.fields.hda==='EDITADO 7b (final).'&&r.sha256===await independentSha(encA,A.id),JSON.stringify({r,hda:finalRow.fields.hda}));

  n0=S.invokes.length;S.inject={beforeLookup:()=>{rowFor(A.id).sync_version+=1}};
  await h.edit('EDITADO 4 (versao alterada por outro escritor).');
  r=await fresh(n0,s=>s.state==='mismatch');
  check('F3 version changed between sync and readback: SOURCE_VERSION_CHANGED, not verified',r.state==='mismatch'&&r.code==='SOURCE_VERSION_CHANGED'&&noSuccess(r),JSON.stringify(r));
  S.inject={};
  // (F3 left A's encounter in a version conflict on purpose; B must still be isolated)
  // ---- doctor B isolation ----
  const aBefore=rowFor(A.id).fields.hda;const callsBefore=S.invokes.length;
  await h.auth('SIGNED_OUT',null);S.session=B;await page.waitForTimeout(800);await h.auth('SIGNED_IN',B);await h.waitMain();await page.waitForTimeout(1500);
  const sB=await h.ev(()=>({q:document.querySelector('.field[data-key="queixa_principal"] textarea')?.value||'',hda:document.querySelector('.field[data-key="hda"] textarea')?.value||'',
    banner:!document.getElementById('nexaRestoreBanner')?.hidden,body:document.body.innerText.includes('TESTE SINTETICO')||document.body.innerText.includes('EDITADO'),rb:window.nexaTextReadback.state().state}));
  check('B1 doctor B after A: empty form, no recovery offer, none of A\'s text in the page',sB.q===''&&sB.hda===''&&!sB.banner&&!sB.body,JSON.stringify(sB));
  const rv=await h.ev(async([id,v])=>{const c=window.nexaClinicalSupabase18101;const x=await c.functions.invoke('nexa-clinical-text-readback',{body:{encounter_id:id,expected_sync_version:v}});
    return{data:!!x.data,err:x.error?.message||null,leak:JSON.stringify(x).includes('EDITADO')||JSON.stringify(x).includes('TESTE SINTETICO')}},[encA,rowFor(A.id).sync_version]);
  check('B2 doctor B asks the readback for A\'s encounter: not found, no text returned',!rv.data&&rv.err==='SOURCE_NOT_FOUND'&&!rv.leak,JSON.stringify(rv));
  S.inject={leakRls:true};
  const rv2=await h.ev(async([id,v])=>{const x=await window.nexaClinicalSupabase18101.functions.invoke('nexa-clinical-text-readback',{body:{encounter_id:id,expected_sync_version:v}});
    return{data:!!x.data,err:x.error?.message||null,leak:JSON.stringify(x).includes('EDITADO')}},[encA,rowFor(A.id).sync_version]);S.inject={};
  check('B3 even if the (simulated) RLS layer failed, the contract itself refuses cross-owner text',!rv2.data&&rv2.err==='OWNER_SCOPE_VIOLATION'&&!rv2.leak,JSON.stringify(rv2));
  const ver=await h.ev(async id=>{await window.nexaTextReadback.verify(id);return window.nexaTextReadback.state()},encA);
  check('B4 B\'s client refuses to verify A\'s encounter id (owner scope) without calling the endpoint',ver.state==='error'&&ver.code==='OWNER_SCOPE'&&S.invokes.length===callsBefore+2,JSON.stringify({ver,calls:S.invokes.length-callsBefore}));
  await h.record(1200);await h.finish();await h.transcribe();
  r=await h.waitRb(s=>s.state==='verified');const rowB=rowFor(B.id);
  const aStill=rowFor(A.id);
  check('B5 doctor B has an own verified encounter; A\'s row untouched by B',r.state==='verified'&&rowB&&rowB.encounter_id!==encA&&r.sha256===await independentSha(rowB.encounter_id,B.id)&&aStill.fields.hda===aBefore,JSON.stringify({r,b:rowB&&rowB.fields}));
  // back to A
  await h.ev(()=>{window.__ans=true});
  await h.auth('SIGNED_OUT',null);S.session=A;await page.waitForTimeout(800);await h.auth('SIGNED_IN',A);await h.waitMain();await page.waitForTimeout(2500);
  const back=await h.ev(()=>({hda:document.querySelector('.field[data-key="hda"] textarea')?.value||'',txt:document.body.innerText.includes('MEDICO B')}));
  check('B6 switching back to A: form is not prefilled with B\'s note',back.hda===''&&!back.txt,JSON.stringify(back));
  const recov=await h.ev(async uid=>{const c=window.nexaClinicalSupabase18101;const {data}=await c.from('consultation_history').select('*').eq('user_id',uid).maybeSingle();
    if(!data)return{row:false};const ok=await window.nexaRecoverSavedEncounter(data);return{row:true,ok,hda:document.querySelector('.field[data-key="hda"] textarea')?.value||''}},A.id);
  check('B7 A reopens A\'s own encounter from server history (A\'s text only, never B\'s)',recov.row&&recov.ok===true&&recov.hda.length>0&&recov.hda!==rowFor(B.id).fields.hda,JSON.stringify(recov));
  await ctx.close();

  // ===== service worker, safe isolated profile ================================
  {
    S.db.clear();S.invokes.length=0;S.inject={};S.session=A;marker=1;
    const c2=await newCtx({flag:true,sw:true});const p=await c2.newPage();const k=H(p);
    await k.boot();
    await p.waitForFunction(()=>navigator.serviceWorker&&navigator.serviceWorker.controller,null,{timeout:15000}).catch(async()=>{await p.reload();await k.waitMain()});
    const ctrl=await k.ev(()=>!!navigator.serviceWorker.controller);
    const m1=await k.ev(()=>window.__RB_MARK);
    await k.record(1200);await k.finish();await k.transcribe();
    r=await k.waitRb(s=>s.state==='verified');
    const cacheInfo=await k.ev(async()=>{const keys=await caches.keys();let n=0;for(const key of keys){n+=(await (await caches.open(key)).keys()).length}return{keys,entries:n}});
    check('S1 service worker active and controlling; note synced and readback verified under it',ctrl&&r.state==='verified',JSON.stringify({ctrl,r:r.state}));
    check('S2 service worker stores no responses: Cache Storage holds 0 entries after the full clinical flow',cacheInfo.entries===0,JSON.stringify(cacheInfo));
    marker=2;await p.reload();await k.waitMain();
    const m2=await k.ev(()=>window.__RB_MARK);
    check('S3 updated readback module is served fresh through the service worker (no stale copy)',m1===1&&m2===2,JSON.stringify({m1,m2}));
    await c2.setOffline(true);
    const off=await p.reload({timeout:8000}).then(()=>'loaded').catch(()=>'failed');
    await c2.setOffline(false);
    const info=await p.evaluate(async()=>{const keys=await caches.keys();let n=0;for(const key of keys)n+=(await (await caches.open(key)).keys()).length;return n}).catch(()=>-1);
    check('S4 offline reload does not serve a cached clinical page (no offline shell is claimed)',off==='failed'||info===0,JSON.stringify({off,info}));
    await c2.close();
  }

  console.log('aborted external requests:',external.length,'hosts:',[...new Set(external.map(u=>new URL(u).host))].join(', '));
  await browser.close();server.close();
  const failed=results.filter(x=>x.ok!==true);
  console.log(failed.length?`FAILED ${failed.length}/${results.length}`:`ALL ${results.length} PASSED`);
  process.exit(failed.length?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
