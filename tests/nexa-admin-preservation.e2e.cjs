/* V5.25 — admin panel on the real page (EMULATED browsers; the RPC is the fixture). Non-admin: no button. Admin: aggregates, stale-pending alert, tariff inputs, text-only rendering. Usage: node tests/nexa-admin-preservation.e2e.cjs [chromium|webkit|both] */
const {chromium,webkit}=require('playwright');const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),fixture=fs.readFileSync(path.join(__dirname,'browser-fixture.js'),'utf8');const which=process.argv[2]||'both',sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ADMIN=false;
const DATA={audio:{sessions_protected:12,physicians_with_backup:3,sessions_last_24h:4,sessions_last_7d:11,chunks_total:2160,audio_bytes:123456789,stored_bytes:2147483648,session_keys_v2:5,envelope_v1_chunks:500,envelope_v2_chunks:1660,pending_backups:2,pending_backups_stale:1},capture:{encounters_with_capture:9,records_total:70,last_record_at:'2026-11-26T10:00:00Z',records_by_kind:{radar:40,transcript_final:9,clinical_fields:9},candidates_asr:9,candidates_radar:9,candidates_documentation:9},eligibility_note:'Elegibilidade exige direitos assinados <img src=x onerror="window.__xss=1">'};
async function run(kind,port){
  const browser=await (kind==='webkit'?webkit:chromium).launch({headless:true});
  try{
    ADMIN=false;{const p=await (await browser.newContext({viewport:{width:1280,height:900}})).newPage();p.setDefaultTimeout(30000);await p.goto('http://127.0.0.1:'+port,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.currentProf?.clinical_access&&window.nexaAdminPreservationV525);await sleep(2600);
      assert.equal(await p.evaluate(()=>{const b=document.getElementById('nexaOpenPreservationAdminBtn');return !!b&&!b.hidden&&b.offsetParent!==null}),false,kind+': non-admin never sees the button');await p.context().close()}
    ADMIN=true;const ctx=await browser.newContext({viewport:{width:1280,height:900}}),p=await ctx.newPage();p.setDefaultTimeout(30000);p.on('dialog',d=>d.accept());await p.goto('http://127.0.0.1:'+port,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.currentProf?.is_admin===true&&document.getElementById('nexaOpenPreservationAdminBtn'));
    await p.evaluate(d=>{window.__qa.adminPreservation=d},DATA);await p.waitForFunction(()=>{const b=document.getElementById('nexaOpenPreservationAdminBtn');return b&&!b.hidden});
    await p.evaluate(()=>document.getElementById('nexaOpenPreservationAdminBtn').click());await p.waitForFunction(()=>document.getElementById('nexaAdminPreservationBody')?.querySelector('table'));
    const txt=await p.locator('#nexaAdminPreservationBody').innerText();
    for(const must of ['2.00 GB','117.7 MB','2160','12','Backups pendentes','500 / 1660 / 5','9 / 9 / 9','radar: 40'])assert.ok(txt.includes(must),kind+': panel shows '+must+'\n'+txt);
    assert.match(txt,/Atenção: 1 backup\(s\) pendente\(s\) há mais de 30 minutos/);assert.match(txt,/Informe as tarifas/,kind+': no tariff assumed');
    assert.equal(await p.evaluate(()=>window.__xss||0),0,kind+': server text is rendered as text, never as HTML');assert.ok(txt.includes('<img src=x'),kind+': the markup is displayed literally');
    await p.locator('#nexaTariffStorage').fill('0.021');await p.locator('#nexaTariffKms').fill('0.03');await p.waitForFunction(()=>/Custo estimado de armazenamento[\s\S]*0.042/.test(document.getElementById('nexaAdminPreservationBody').innerText));
    const t2=await p.locator('#nexaAdminPreservationBody').innerText();assert.match(t2,/Custo estimado de KMS \(mês\)\s*\d/);assert.ok(!/Informe as tarifas/.test(t2));
    // the server decides: a non-admin answer renders as restricted, with no numbers
    await p.evaluate(()=>{window.__qa.capabilities.is_admin=false;document.getElementById('nexaOpenPreservationAdminBtn').click()});await p.waitForFunction(()=>/restrito a administradores/.test(document.getElementById('nexaAdminPreservationBody').innerText));
    assert.ok(!/2\.00 GB/.test(await p.locator('#nexaAdminPreservationBody').innerText()),kind+': ADMIN_REQUIRED shows no numbers');
    await ctx.close();console.log('PASS',kind,'admin panel');
  }finally{await browser.close().catch(()=>{})}
}
(async()=>{const server=http.createServer((req,res)=>{let file=decodeURIComponent(req.url.split('?')[0]);if(file==='/')file='/index.html';const full=path.join(root,file);if(!full.startsWith(root+path.sep)){res.writeHead(403).end();return}
  try{let body=fs.readFileSync(full);if(file==='/index.html')body=body.toString().replace(/<script[^>]+src="https:\/\/[^"]*supabase[^"]*"[^>]*><\/script>/g,'').replace('<head>','<head><script>'+(ADMIN?fixture.replace('is_admin:false','is_admin:true'):fixture)+'</script>');
    res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(body)}catch{res.writeHead(404).end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  try{if(which!=='webkit')await run('chromium',port);if(which!=='chromium')await run('webkit',port);console.log('ADMIN_PRESERVATION_PASS (emulated; RPC is the fixture)')}catch(e){console.error('ADMIN_PRESERVATION_FAIL',e&&e.stack||e);process.exitCode=1}finally{server.close()}})();
