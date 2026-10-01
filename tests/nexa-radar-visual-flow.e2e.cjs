const {chromium,webkit}=require('playwright');
const fs=require('fs');
const http=require('http');
const path=require('path');
const assert=require('node:assert/strict');

const watchdog=setTimeout(()=>{console.error('Radar visual flow E2E exceeded 210 seconds');process.exit(1);},210000);watchdog.unref();
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
async function openNewCase(page){
  await page.waitForFunction(()=>window.currentProf?.clinical_access&&window.nexaRadar&&window.nexaRadarVisualFlow18130&&window.nexaRadarAutoReview1812&&window.nexaRadarPsMode18131&&document.getElementById('nfStart'));
  if(await page.locator('#nexaNewCaseBtn').isVisible())await page.locator('#nexaNewCaseBtn').click();
  await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult'&&document.getElementById('nexaRadarOpsHeader18130')&&document.getElementById('nexaRadarVisualGrid18130'));
}
async function chromiumFlow(browser,port,viewport){
  const page=await browser.newPage({viewport,permissions:['microphone']});page.setDefaultTimeout(24000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.addInitScript(()=>{
    window.__nexaVisualScrolls=[];
    const nativeScroll=window.scrollTo.bind(window);
    window.scrollTo=function(...args){window.__nexaVisualScrolls.push({kind:'window',value:args[0]});return nativeScroll(...args)};
    const nativeInto=Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView=function(options){window.__nexaVisualScrolls.push({kind:'element',id:this.id||'',value:options});return nativeInto?.call(this,options)};
  });
  await page.goto('http://127.0.0.1:'+port,{waitUntil:'domcontentloaded'});
  await openNewCase(page);
  await page.locator('#nexaRadarModeComplete18131').click();

  assert.equal(await page.locator('#nexaRadarOpsHeader18130').isVisible(),true,'Radar operational header must be visible');
  assert.equal(await page.locator('#nexaRadarVisualQuestions18130').isVisible(),true,'Suggested questions must have a high-visibility panel');
  assert.equal(await page.locator('#nexaRadarCoverageProgress18130').getAttribute('role'),'progressbar');
  assert.match(await page.locator('#nexaRadarCoverageProgress18130').getAttribute('aria-label'),/Cobertura/i);

  if(viewport.width<=820){
    const positions=await page.evaluate(()=>({
      q:document.getElementById('nexaRadarVisualQuestions18130').getBoundingClientRect().top,
      a:document.getElementById('nexaRadarVisualAttention18130').getBoundingClientRect().top,
      p:document.getElementById('nexaRadarVisualPending18130').getBoundingClientRect().top,
      c:document.getElementById('nexaRadarVisualCovered18130').getBoundingClientRect().top
    }));
    assert.ok(positions.q<positions.a&&positions.a<positions.p&&positions.p<positions.c,'Mobile Radar order must prioritize questions before secondary panels');
  }

  if(!(await page.locator('#consent').isChecked()))await page.locator('#consent').check();
  const radarWasVisible=await page.evaluate(()=>{
    const el=document.getElementById('realtimeRadarCard'),r=el.getBoundingClientRect();
    return r.top>=0&&r.top<innerHeight&&r.bottom>0;
  });
  await page.evaluate(()=>window.__nexaVisualScrolls.length=0);
  await page.locator('#nfStart').click();
  await page.waitForFunction(()=>document.getElementById('recBtn')?.dataset.recordingState==='recording');
  await page.waitForFunction(()=>document.body.dataset.nexaStage==='radar'&&!document.body.classList.contains('doctor-home-open'));
  await page.waitForFunction(()=>/AO VIVO/i.test(document.getElementById('nexaRadarLiveSuffix18130')?.textContent||'')&&/GRAVANDO/i.test(document.getElementById('nexaRadarRecordingState18130')?.textContent||''));
  await page.waitForFunction(()=>/Gravação contínua ativa/i.test(document.getElementById('nexaRadarOpsSubtitle18131')?.textContent||''));
  await page.waitForFunction(()=>document.getElementById('nexaRadarRecordingTimer18130')?.textContent===document.getElementById('timer')?.textContent);

  await page.waitForFunction(()=>{
    const el=document.getElementById('realtimeRadarCard');if(!el)return false;
    const r=el.getBoundingClientRect(),offset=innerWidth<=820?82:88;
    return r.bottom>offset&&r.top<innerHeight;
  });
  const radarNowVisible=await page.evaluate(()=>{
    const el=document.getElementById('realtimeRadarCard'),r=el.getBoundingClientRect(),offset=innerWidth<=820?82:88;
    return r.bottom>offset&&r.top<innerHeight;
  });
  assert.equal(radarNowVisible,true,'Recording start must leave the Radar in a comfortable visible area after the smooth scroll settles');
  if(!radarWasVisible){
    assert.equal(await page.evaluate(()=>window.__nexaVisualScrolls.some(x=>x.kind==='window'&&x.value?.behavior==='smooth')),true,'Off-screen Radar must receive smooth auto-scroll');
  }

  await page.locator('#nexaRadarLivePause18130').click();
  await page.waitForFunction(()=>document.getElementById('recBtn')?.dataset.recordingState==='paused'&&/PAUSADO/i.test(document.getElementById('nexaRadarRecordingState18130')?.textContent||''));
  assert.match(await page.locator('#nexaRadarLivePause18130').getAttribute('aria-label'),/Retomar/i);
  await page.locator('#nexaRadarLivePause18130').click();
  await page.waitForFunction(()=>document.getElementById('recBtn')?.dataset.recordingState==='recording');

  await page.waitForFunction(()=>window.__qa.channels.length>0&&window.nexaRadar.state.transcriptStatus==='live');
  await page.evaluate(()=>window.__qa.speak('visual-flow-1','Cefaleia desde hoje.'));
  await page.waitForFunction(()=>document.querySelectorAll('#nexaRadarQuestionGroups18130 .nexa-radar-question-link18130').length>0);
  assert.match(await page.locator('#nexaRadarUpdated18130').innerText(),/Atualizado agora/i);
  assert.equal(await page.locator('#nexaRadarVisualQuestions18130').isVisible(),true);
  const explicitPriority=await page.locator('#nexaRadarQuestionGroups18130 [data-priority="critical"],#nexaRadarQuestionGroups18130 [data-priority="high"]').count();
  assert.ok(explicitPriority>=1,'Existing Radar priority must be represented when the engine supplies it');

  const coverageLabel=await page.locator('#nexaRadarCoverageText18130').innerText();
  assert.ok(coverageLabel==='—'||/^\d{1,3}%$/.test(coverageLabel),'Coverage must be derived or explicitly unavailable');

  await page.locator('#nexaRadarLiveFinish18130').click();
  await page.waitForFunction(()=>!document.getElementById('processBtn')?.disabled&&document.getElementById('recBtn')?.dataset.recordingState==='stopped');
  assert.equal(await page.locator('#nexaRadarPost18130').count(),0,'Floating post-recording CTA must not exist');
  await page.waitForFunction(()=>{
    const process=document.getElementById('processBtn'),reset=document.getElementById('resetBtn');
    if(!process||!reset)return false;
    const pr=process.getBoundingClientRect(),rr=reset.getBoundingClientRect();
    return pr.top>=0&&pr.bottom<=innerHeight&&rr.top>=0&&rr.bottom<=innerHeight;
  });
  assert.equal(await page.locator('#processBtn').isVisible(),true,'Canonical Transcrever e estruturar action must be visible after finalization');
  assert.equal(await page.locator('#resetBtn').isVisible(),true,'Canonical Limpar e começar nova consulta action must be visible after finalization');

  await page.locator('#processBtn').click();
  await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='processing');
  await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='review'&&/cefaleia/i.test(document.querySelector('.field[data-key="hda"] textarea')?.value||''));
  assert.equal(await page.locator('#nexaFlowHistory').isVisible(),true,'Existing structured review must remain the destination');
  const reviewVisible=await page.evaluate(()=>{
    const el=document.getElementById('nexaReviewHeader')||document.getElementById('nexaFlowHistory'),r=el.getBoundingClientRect();
    return r.bottom>0&&r.top<innerHeight;
  });
  assert.equal(reviewVisible,true,'Structured completion must guide the viewport to review');

  await page.screenshot({path:path.join(root,'test-results',`radar-visual-flow-${viewport.width}.png`),fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.ok(overflow<=1,`No horizontal overflow at ${viewport.width}px`);
  assert.deepEqual(errors,[],`No unhandled JavaScript errors at ${viewport.width}px`);
  console.log('Radar visual flow Chromium '+viewport.width+'px: PASS');
  await page.close();
}

async function webkitSmoke(browser,port,viewport){
  const page=await browser.newPage({viewport});page.setDefaultTimeout(22000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port,{waitUntil:'domcontentloaded'});
  await openNewCase(page);
  await page.locator('#nexaRadarModeComplete18131').click();
  assert.equal(await page.locator('#nexaRadarOpsHeader18130').isVisible(),true);
  assert.equal(await page.locator('#nexaRadarVisualQuestions18130').isVisible(),true);
  assert.equal(await page.locator('#nexaRadarLivePause18130').evaluate(el=>el.tagName),'BUTTON');
  assert.equal(await page.locator('#nexaRadarLiveFinish18130').evaluate(el=>el.tagName),'BUTTON');
  if(viewport.width<=820){
    assert.equal(await page.locator('#nexaRadarVisualGrid18130').evaluate(el=>getComputedStyle(el).flexDirection),'column');
  }
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.ok(overflow<=1,`WebKit must not overflow at ${viewport.width}px`);
  assert.deepEqual(errors,[],`WebKit must have no unhandled errors at ${viewport.width}px`);
  console.log('Radar visual flow WebKit '+viewport.width+'px: PASS');
  await page.close();
}

(async()=>{
  const server=serve();
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const port=server.address().port;
  let chromiumBrowser,webkitBrowser;
  try{
    chromiumBrowser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
    for(const viewport of [{width:1440,height:1000},{width:390,height:844}])await chromiumFlow(chromiumBrowser,port,viewport);
    await chromiumBrowser.close();chromiumBrowser=null;

    webkitBrowser=await webkit.launch({headless:true});
    for(const viewport of [{width:1280,height:900},{width:390,height:844}])await webkitSmoke(webkitBrowser,port,viewport);
  }finally{
    await chromiumBrowser?.close().catch(()=>{});
    await webkitBrowser?.close().catch(()=>{});
    server.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
