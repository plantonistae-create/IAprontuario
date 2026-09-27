const {chromium}=require('playwright');
const fs=require('fs');
const http=require('http');
const path=require('path');
const assert=require('node:assert/strict');

const watchdog=setTimeout(()=>{console.error('Radar auto-review E2E exceeded 180 seconds');process.exit(1);},180000);watchdog.unref();
const root=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(path.join(__dirname,'browser-fixture.js'),'utf8');
fs.mkdirSync(path.join(root,'test-results'),{recursive:true});

(async()=>{
 const server=http.createServer((req,res)=>{
  let file=decodeURIComponent(req.url.split('?')[0]);if(file==='/')file='/index.html';
  const full=path.join(root,file);if(!full.startsWith(root+'/')){res.writeHead(403).end();return;}
  try{
   let body=fs.readFileSync(full);
   if(file==='/index.html')body=body.toString().replace(/<script[^>]+src="https:\/\/[^"]*supabase[^"]*"[^>]*><\/script>/g,'').replace('<head>','<head><script>'+fixture+'</script>');
   res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(body);
  }catch{res.writeHead(404).end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   const page=await browser.newPage({viewport,permissions:['microphone']});page.setDefaultTimeout(20000);
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.currentProf?.clinical_access&&window.nexaRadar&&window.nexaContinuousSoap1811&&window.nexaRadarAutoReview1812&&document.getElementById('nfStart'));
   if(await page.locator('#nexaNewCaseBtn').isVisible())await page.locator('#nexaNewCaseBtn').click();
   await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult'&&document.getElementById('nexaAutoRadarWorkspace'));

   assert.equal(await page.locator('#nexaFlowHistory').isVisible(),false,'Structured review must stay out of the primary consultation flow');
   assert.equal(await page.locator('#nexaFlowAssessment').isVisible(),false);
   assert.equal(await page.locator('#nexaFlowPlan').isVisible(),false);
   assert.equal(await page.locator('#nexaNextBest').isVisible(),true,'Next-best-question block must be visible during consultation');

   await page.locator('#consent').check();
   await page.locator('#nfStart').click();
   await page.waitForFunction(()=>window.__qa.channels.length>0&&window.nexaRadar.state.transcriptStatus==='live');

   await page.evaluate(()=>window.__qa.speak('auto-1','Dor torácica.'));
   await page.waitForFunction(()=>window.radarState.items.some(i=>i.concept==='dyspnea')&&/falta de ar|dispneia/i.test(document.getElementById('nexaNextBest')?.innerText||''));
   assert.match(await page.locator('#nexaNextBest').innerText(),/Forma sugerida/i,'Next question must include practical phrasing');

   const clarifiedBefore=await page.evaluate(()=>window.radarState.clarified.length);
   await page.evaluate(()=>window.__qa.speak('auto-2','Paciente: Nega falta de ar.'));
   await page.waitForFunction(()=>window.radarState.facts.dyspnea.state==='known_absent');
   assert.ok(await page.evaluate(n=>window.radarState.clarified.length>n,clarifiedBefore),'Spontaneous answer must move an item to clarified');
   assert.doesNotMatch(await page.locator('#nexaNextBest').innerText(),/falta de ar/i,'Resolved item must no longer be the next-best question');

   await page.evaluate(()=>window.__qa.speak('auto-3','Médico: Teve síncope? Paciente: Talvez.'));
   await page.waitForFunction(()=>window.radarState.confirm.some(i=>i.concept==='syncope'));
   assert.ok(+await page.locator('#nexaAutoStatus .nexa-auto-metric.confirm strong').innerText()>=1,'Ambiguous answer must be summarized as confirmation needed');

   await page.evaluate(()=>window.__qa.speak('auto-4','Saturação talvez 97 ou 94.'));
   await page.waitForFunction(()=>window.nexaRadarAutoReview1812.vitals().confirm.spo2);
   assert.doesNotMatch(await page.locator('#nexaVitalSigns').inputValue(),/SpO2\s*:/i,'Ambiguous saturation must not be silently written');

   await page.evaluate(()=>window.__qa.speak('auto-5','Corrigindo, saturação 97. Pressão 120 por 80. Frequência cardíaca 88. Frequência respiratória 20. Temperatura 37 e meio.'));
   await page.waitForFunction(()=>{
    const v=document.getElementById('nexaVitalSigns')?.value||'';
    return /PA:\s*120\/80/.test(v)&&/FC:\s*88/.test(v)&&/SpO2:\s*97%/.test(v)&&/FR:\s*20/.test(v)&&/T:\s*37,5/.test(v);
   });
   const spokenVitals=await page.locator('#nexaVitalSigns').inputValue();
   for(const expected of ['PA: 120/80','FC: 88','SpO2: 97%','FR: 20','T: 37,5'])assert.match(spokenVitals,new RegExp(expected.replace('/','\\/')));

   await page.screenshot({path:path.join(root,'test-results',`radar-auto-${viewport.width}.png`),fullPage:true});

   await page.locator('#nfFinish').click();
   await page.waitForFunction(()=>!document.getElementById('processBtn').disabled);
   await page.locator('#processBtn').click();
   await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='review'&&/cefaleia/i.test(document.querySelector('.field[data-key="hda"] textarea')?.value||''));
   await page.waitForFunction(()=>/PA:\s*120\/80/.test(document.getElementById('nexaVitalSigns')?.value||'')&&/SpO2:\s*97%/.test(document.getElementById('nexaVitalSigns')?.value||''));

   assert.equal(await page.locator('#nexaFlowHistory').isVisible(),true,'Structured content must become visible after transcription');
   assert.equal(await page.locator('#nexaFlowAssessment').isVisible(),true);
   assert.equal(await page.locator('#nexaFlowPlan').isVisible(),true);
   assert.equal(await page.locator('#nexaFinalPending').isVisible(),true,'Final pending review must be present');
   assert.equal(await page.locator('#nexaExamOptional').isVisible(),true,'Physical-exam quick composer remains optional in review');

   const copy=async locator=>{await locator.click();return page.evaluate(()=>window.__qa.clipboard);};
   await page.locator('[data-flow-mode="soap"]').click();
   await page.waitForFunction(()=>document.body.dataset.nexaFlow==='soap');
   for(const key of ['S','O','A','P']){
    const text=await copy(page.locator(`.nexa-flow-copy[data-copy="${key}"]`));
    assert.ok(text.trim().length>0,`SOAP block ${key} must be copyable`);
   }
   const soap=await copy(page.locator('#nexaFlowCopyAll'));assert.match(soap,/S — SUBJETIVO/);assert.match(soap,/O — OBJETIVO/);assert.match(soap,/A — AVALIAÇÃO/);assert.match(soap,/P — PLANO/);

   await page.locator('[data-flow-mode="continuous"]').click();
   await page.waitForFunction(()=>document.body.dataset.nexaFlow==='continuous');
   const continuous=await copy(page.locator('#nexaFlowCopyAll'));assert.match(continuous,/HISTÓRIA DA DOENÇA ATUAL/);assert.match(continuous,/SINAIS VITAIS/);assert.match(continuous,/PA: 120\/80/);

   await page.screenshot({path:path.join(root,'test-results',`post-consult-review-${viewport.width}.png`),fullPage:true});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   assert.ok(overflow<=1,`No global horizontal overflow at ${viewport.width}px`);
   assert.deepEqual(errors,[],`No unhandled JavaScript errors at ${viewport.width}px`);
   console.log('Radar auto-review '+viewport.width+'px: PASS');
   await page.close();
  }
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
