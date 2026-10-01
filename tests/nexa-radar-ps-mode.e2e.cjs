const {chromium,webkit}=require('playwright');
const fs=require('fs');
const http=require('http');
const path=require('path');
const assert=require('node:assert/strict');

const watchdog=setTimeout(()=>{console.error('Radar PS E2E exceeded 240 seconds');process.exit(1);},240000);watchdog.unref();
const root=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(path.join(__dirname,'browser-fixture.js'),'utf8');
fs.mkdirSync(path.join(root,'test-results'),{recursive:true});

function serve(){
  return http.createServer((req,res)=>{
    let file=decodeURIComponent(req.url.split('?')[0]);if(file==='/')file='/index.html';
    const full=path.join(root,file);
    if(!full.startsWith(root+path.sep)){res.writeHead(403).end();return}
    try{
      let body=fs.readFileSync(full);
      if(file==='/index.html')body=body.toString()
        .replace(/<script[^>]+src="https:\/\/[^"]*supabase[^"]*"[^>]*><\/script>/g,'')
        .replace('<head>','<head><script>'+fixture+'</script>');
      res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');
      res.end(body);
    }catch{res.writeHead(404).end()}
  });
}
async function openCase(page){
  await page.waitForFunction(()=>window.currentProf?.clinical_access&&window.nexaRadar&&window.nexaRadarVisualFlow18130&&window.nexaRadarAutoReview1812&&window.nexaRadarPsMode18131&&document.getElementById('nfStart'));
  if(await page.evaluate(()=>document.body.dataset.nexaClinicalPhase!=='consult')){
    // Test setup only: invoke the product's real Novo atendimento click handler.
    // Home-button visibility is covered by the general browser regression; this avoids a WebKit responsive actionability race.
    await page.evaluate(()=>document.getElementById('nexaNewCaseBtn')?.click());
  }
  await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult'&&document.getElementById('nexaRadarPsView18131')&&document.getElementById('nexaRadarModePs18131')&&document.body.dataset.nexaRadarViewMode);
}
function seconds(value){
  const parts=String(value||'0:0').split(':').map(Number);
  return (parts[0]||0)*60+(parts[1]||0);
}
async function assertNoOverflow(page,label){
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.ok(overflow<=1,label+' must not overflow horizontally');
}
async function chromiumFlow(browser,port,viewport){
  const page=await browser.newPage({viewport,permissions:['microphone']});page.setDefaultTimeout(26000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto('http://127.0.0.1:'+port,{waitUntil:'domcontentloaded'});
  await openCase(page);

  assert.equal(await page.locator('#nexaRadarModePs18131').evaluate(el=>el.tagName),'BUTTON');
  assert.equal(await page.locator('#nexaRadarModeComplete18131').evaluate(el=>el.tagName),'BUTTON');
  assert.equal(await page.locator('#nexaRadarModePs18131').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#nexaRadarPsView18131').isVisible(),true);
  assert.equal(await page.locator('#nexaRadarVisualQuestions18130').isVisible(),false);
  assert.equal(await page.locator('#nexaPsCoverageProgress').getAttribute('role'),'progressbar');

  const state0=await page.evaluate(()=>JSON.stringify(window.nexaRadar.state));
  const requests0=await page.evaluate(()=>window.__qa.requests.length);
  await page.locator('#nexaRadarModeComplete18131').click();
  assert.equal(await page.locator('#nexaRadarModeComplete18131').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#nexaRadarVisualQuestions18130').isVisible(),true);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.nexaRadar.state)),state0);
  assert.equal(await page.evaluate(()=>window.__qa.requests.length),requests0);
  await page.locator('#nexaRadarModePs18131').click();
  assert.equal(await page.locator('#nexaRadarPsView18131').isVisible(),true);

  if(viewport.width===1440){
    await page.locator('#nexaRadarModeComplete18131').click();
    await page.reload({waitUntil:'domcontentloaded'});
    await openCase(page);
    assert.equal(await page.locator('#nexaRadarModeComplete18131').getAttribute('aria-pressed'),'true');
    assert.equal(await page.evaluate(()=>localStorage.getItem('radar_view_mode')),'complete');
    await page.locator('#nexaRadarModePs18131').click();
    await page.reload({waitUntil:'domcontentloaded'});
    await openCase(page);
    assert.equal(await page.locator('#nexaRadarModePs18131').getAttribute('aria-pressed'),'true');
    assert.equal(await page.evaluate(()=>localStorage.getItem('radar_view_mode')),'ps');
    assert.equal(await page.evaluate(()=>JSON.stringify(window.nexaRadar.state).includes('radar_view_mode')),false);
  }

  if(viewport.width<=820){
    const order=await page.evaluate(()=>({
      title:document.querySelector('.nexa-radar-ops-title').getBoundingClientRect().top,
      toggle:document.getElementById('nexaRadarViewToggle18131').getBoundingClientRect().top,
      controls:document.querySelector('.nexa-radar-ops-controls').getBoundingClientRect().top,
      next:document.querySelector('.nexa-ps-next18131').getBoundingClientRect().top,
      pending:document.querySelector('.nexa-ps-pending18131').getBoundingClientRect().top,
      attention:document.querySelector('.nexa-ps-att18131').getBoundingClientRect().top,
      vitals:document.getElementById('nexaRadarPsVitals18131').closest('.nexa-ps-section18131').getBoundingClientRect().top,
      covered:document.getElementById('nexaRadarPsCoveredList18131').closest('.nexa-ps-section18131').getBoundingClientRect().top
    }));
    assert.ok(order.title<=order.toggle&&order.toggle<=order.controls&&order.controls<order.next,'mobile order must start title, selector, recorder, next question');
    assert.ok(order.next<order.pending&&order.pending<order.attention&&order.attention<order.vitals&&order.vitals<order.covered,'mobile PS content order must preserve priority');
  }
  await assertNoOverflow(page,'Chromium '+viewport.width+' initial PS');

  await page.locator('#nexaRadarPsCoveredToggle18131').click();
  assert.equal(await page.locator('#nexaRadarPsCoveredToggle18131').getAttribute('aria-expanded'),'true');
  await page.locator('#nexaRadarPsCoveredToggle18131').click();

  if(!(await page.locator('#consent').isChecked()))await page.locator('#consent').check();
  await page.locator('#nfStart').click();
  await page.waitForFunction(()=>document.getElementById('recBtn')?.dataset.recordingState==='recording'&&document.body.dataset.nexaStage==='radar');
  await page.waitForFunction(()=>document.getElementById('nexaRadarRecordingTimer18130')?.textContent===document.getElementById('timer')?.textContent);
  await page.locator('#nexaRadarLivePause18130').click();
  await page.waitForFunction(()=>document.getElementById('recBtn')?.dataset.recordingState==='paused');
  await page.locator('#nexaRadarLivePause18130').click();
  await page.waitForFunction(()=>document.getElementById('recBtn')?.dataset.recordingState==='recording');

  await page.waitForFunction(()=>window.__qa.channels.length>0&&window.nexaRadar.state.transcriptStatus==='live');
  await page.evaluate(()=>window.__qa.speak('ps-mode-1','Cefaleia desde hoje.'));
  await page.waitForFunction(()=>document.getElementById('nexaRadarPsUse18131')&&!document.getElementById('nexaRadarPsUse18131').disabled);

  const hero=await page.locator('#nexaRadarPsQuestion18131').innerText();
  const engineHero=await page.evaluate(()=>window.nexaRadar.state.items?.[0]?.question||window.nexaRadar.state.questions?.[0]||'');
  assert.equal(hero,engineHero,'PS hero must reuse the real first Radar question');

  const counts=await page.evaluate(()=>{
    const m=window.nexaRadarVisualFlow18130.derive();
    return{alerts:m.attentionCount,pending:m.pendingCount,covered:m.coveredCount};
  });
  assert.equal(Number(await page.locator('#nexaPsAttCount').innerText()),counts.alerts);
  assert.equal(Number(await page.locator('#nexaPsPendCount').innerText()),counts.pending);
  assert.equal(Number(await page.locator('#nexaPsCovCount').innerText()),counts.covered);

  const before=await page.evaluate(()=>({
    state:JSON.stringify(window.nexaRadar.state),
    recorder:document.getElementById('recBtn')?.dataset.recordingState,
    timer:document.getElementById('timer')?.textContent,
    question:document.getElementById('nexaRadarPsQuestion18131')?.textContent,
    requests:window.__qa.requests.length
  }));
  await page.locator('#nexaRadarModeComplete18131').click();
  assert.equal(await page.locator('#nexaRadarVisualQuestions18130').isVisible(),true);
  await page.locator('#nexaRadarModePs18131').click();
  const after=await page.evaluate(()=>({
    state:JSON.stringify(window.nexaRadar.state),
    recorder:document.getElementById('recBtn')?.dataset.recordingState,
    timer:document.getElementById('timer')?.textContent,
    question:document.getElementById('nexaRadarPsQuestion18131')?.textContent,
    requests:window.__qa.requests.length
  }));
  assert.equal(after.state,before.state,'mode switch must preserve clinical Radar state');
  assert.equal(after.recorder,'recording','mode switch must preserve recorder state');
  assert.equal(after.question,before.question,'mode switch must preserve the active question');
  assert.equal(after.requests,before.requests,'mode switch must not call a clinical backend');
  assert.ok(seconds(after.timer)>=seconds(before.timer),'mode switch must keep the real timer running');

  const nextDisabled=await page.locator('#nexaRadarPsNext18131').isDisabled();
  if(!nextDisabled){
    const clinicalBefore=await page.evaluate(()=>JSON.stringify(window.nexaRadar.state));
    await page.locator('#nexaRadarPsNext18131').click();
    assert.equal(await page.evaluate(()=>JSON.stringify(window.nexaRadar.state)),clinicalBefore,'next question navigation must not discard or reorder clinical state');
  }

  await page.screenshot({path:path.join(root,'test-results','radar-ps-live-'+viewport.width+'.png'),fullPage:true});
  await page.locator('#nexaRadarModeComplete18131').click();
  await page.screenshot({path:path.join(root,'test-results','radar-complete-live-'+viewport.width+'.png'),fullPage:true});
  await page.locator('#nexaRadarModePs18131').click();

  await page.locator('#nexaRadarLiveFinish18130').click();
  await page.waitForFunction(()=>!document.getElementById('processBtn')?.disabled&&document.getElementById('recBtn')?.dataset.recordingState==='stopped');
  assert.equal(await page.locator('#nexaRadarPost18130').count(),0);
  assert.equal(await page.locator('#processBtn').isVisible(),true);
  assert.equal(await page.locator('#resetBtn').isVisible(),true);
  await page.locator('#processBtn').click();
  await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='processing');
  await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='review'&&/cefaleia/i.test(document.querySelector('.field[data-key="hda"] textarea')?.value||''));
  assert.equal(await page.locator('#nexaFlowHistory').isVisible(),true);
  await assertNoOverflow(page,'Chromium '+viewport.width+' final');
  assert.deepEqual(errors,[],'Chromium '+viewport.width+' must have no page errors');
  console.log('Radar PS Chromium '+viewport.width+'px: PASS');
  await page.close();
}
async function webkitSmoke(browser,port,viewport){
  const page=await browser.newPage({viewport});page.setDefaultTimeout(24000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port,{waitUntil:'domcontentloaded'});
  await openCase(page);
  assert.equal(await page.locator('#nexaRadarModePs18131').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#nexaRadarPsView18131').isVisible(),true);
  await page.locator('#nexaRadarModeComplete18131').click();
  assert.equal(await page.locator('#nexaRadarVisualQuestions18130').isVisible(),true);
  await page.locator('#nexaRadarModePs18131').click();
  assert.equal(await page.locator('#nexaRadarPsView18131').isVisible(),true);
  if(viewport.width<=820)assert.equal(await page.locator('.nexa-ps-grid18131').evaluate(el=>getComputedStyle(el).flexDirection),'column');
  await assertNoOverflow(page,'WebKit '+viewport.width);
  assert.deepEqual(errors,[],'WebKit '+viewport.width+' must have no page errors');
  console.log('Radar PS WebKit '+viewport.width+'px: PASS');
  await page.close();
}

(async()=>{
  const server=serve();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  let chromiumBrowser,webkitBrowser;
  try{
    chromiumBrowser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
    for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:393,height:852},{width:414,height:896},{width:430,height:932}])await chromiumFlow(chromiumBrowser,port,viewport);
    await chromiumBrowser.close();chromiumBrowser=null;
    webkitBrowser=await webkit.launch({headless:true});
    for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:430,height:932}])await webkitSmoke(webkitBrowser,port,viewport);
  }finally{
    await chromiumBrowser?.close().catch(()=>{});
    await webkitBrowser?.close().catch(()=>{});
    server.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
