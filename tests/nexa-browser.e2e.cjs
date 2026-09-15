const {chromium}=require('playwright');const fs=require('fs');const http=require('http');const path=require('path');const assert=require('node:assert/strict');
const watchdog=setTimeout(()=>{console.error('Browser regression exceeded 180 seconds');process.exit(1);},180000);watchdog.unref();
const root=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(path.join(__dirname,'browser-fixture.js'),'utf8');
(async()=>{
 const server=http.createServer((req,res)=>{let file=decodeURIComponent(req.url.split('?')[0]);if(file==='/')file='/index.html';const full=path.join(root,file);if(!full.startsWith(root+'/')){res.writeHead(403).end();return;}try{let content=fs.readFileSync(full);if(file==='/index.html')content=content.toString().replace(/<script[^>]+src="https:\/\/[^"]*supabase[^"]*"[^>]*><\/script>/g,'').replace('<head>','<head><script>'+fixture+'</script>');res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(content)}catch{res.writeHead(404).end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser,activePage;try{
 browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport,permissions:['microphone']});page.setDefaultTimeout(15000);activePage=page;console.log('Opening browser regression',viewport.width);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser runtime:',e.message);});
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.nexaRadar&&window.nexaDestinationFlow18915&&window.currentProf?.clinical_access&&document.getElementById('nfStart'));
  if(await page.locator('#nexaNewCaseBtn').isVisible())await page.locator('#nexaNewCaseBtn').click();
  // Drive the real fields and the rendered Radar; external services alone are synthetic.
  await page.locator('.field[data-key="hda"] textarea').evaluate(el=>{el.value='Dor torácica, nega dispneia, síncope e sudorese.';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>window.radarState?.facts?.dyspnea?.state==='known_absent');
  assert.equal(await page.locator('[data-item="dyspnea"]').count(),0);
  assert.equal(await page.locator('[data-item="syncope"]').count(),0);
  await page.locator('.field[data-key="hda"] textarea').evaluate(el=>{el.value='Dor no tornozelo esquerdo há dois dias.';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>window.radarState?.items?.some(i=>i.id==='trauma'));
  console.log('Fields and local Radar initialized',viewport.width);
  // Navigation is through production controls, not a mocked view.
  await page.evaluate(()=>document.querySelector('.nexa-session-tab[data-stage="radar"]')?.click());
  const trauma=page.locator('[data-item="trauma"]');await trauma.locator('.ng-manual summary').click();
  await trauma.locator('textarea').fill('Sim, queda da própria altura ontem.');await trauma.getByRole('button',{name:'Registrar resposta',exact:true}).click();
  await page.waitForFunction(()=>!window.radarState.items.some(i=>i.id==='trauma'));
  assert.match(await page.locator('.field[data-key="hda"] textarea').inputValue(),/queda da própria altura/);
  assert.ok(await page.evaluate(()=>window.radarState.items.some(i=>i.id==='fourSteps')));
  assert.ok(await page.locator('#radarQuestions .ng-item').count()<=5);
  await page.locator('#nexaRadarMore').click();assert.ok(await page.locator('#radarQuestions .ng-item').count()>5);
  const neuro=page.locator('[data-item="neurovascular"]');await neuro.locator('.ng-manual summary').click();await neuro.locator('textarea').fill('Pulsos presentes, sensibilidade e motricidade preservadas');await neuro.getByRole('button',{name:'Registrar resposta',exact:true}).click();
  assert.match(await page.locator('.field[data-key="exame_fisico"] textarea').inputValue(),/sensibilidade e motricidade/);
  await page.evaluate(()=>window.nexaDestinationFlow18915.setPhysicianFinal('internacao'));
  // Cancelling reset preserves both the clinical record and destination.
  page.once('dialog',d=>d.dismiss());await page.locator('#resetBtn').evaluate(el=>el.click());
  assert.match(await page.locator('.field[data-key="hda"] textarea').inputValue(),/queda/);
  assert.equal(await page.evaluate(()=>window.nexaDestinationFlow18915.state.final),'internacao');
  page.once('dialog',d=>d.accept());await page.locator('#resetBtn').evaluate(el=>el.click());
  await page.waitForFunction(()=>window.radarState.items.length===0);
  for(const key of ['hda','exame_fisico','sinais_vitais','hipotese_diagnostica','conduta'])for(const el of await page.locator(`.field[data-key="${key}"] textarea`).all())assert.equal(await el.inputValue(),'');
  assert.equal(await page.evaluate(()=>window.nexaDestinationFlow18915.state.final),'');
  assert.deepEqual(await page.evaluate(()=>window.nexaRadar.snapshot().ledger),{});

  console.log('Manual responses and encounter reset checked',viewport.width);
  // Real browser + real MediaRecorder with Chromium's synthetic audio device. ASR/AI/auth services are test doubles.
  assert.equal(await page.locator('#nfRadarTabs [role="tab"]').count(),2);
  assert.equal(await page.evaluate(()=>window.__qa.requests.some(r=>r.url.includes('realtime-call'))),false);
  await page.locator('#nfStart').click();assert.equal(await page.evaluate(()=>window.__qa.channels.length),0,'No capture/session before consent');
  await page.locator('#consent').check();await page.locator('#nfStart').click();
  await page.waitForFunction(()=>window.__qa.channels.length===1&&window.nexaRadar.state.transcriptStatus==='live');
  await page.evaluate(()=>window.__qa.speak('1','Cefaleia desde hoje. Médico: Teve febre?'));
  await page.waitForFunction(()=>window.radarState.items.some(i=>i.concept==='fever'&&i.status==='asked'));
  await page.evaluate(()=>window.__qa.speak('2','Paciente: Não.'));
  await page.waitForFunction(()=>window.radarState.facts.fever.state==='known_absent');
  assert.equal(await page.locator('.field[data-key="hda"] textarea').inputValue(),'','Live Radar must not write transcript or questions into the record');
  await page.locator('#nfPause').click();assert.equal(await page.evaluate(()=>window.__qa.track.enabled),false);assert.equal(await page.evaluate(()=>window.nexaRadar.state.transcriptStatus),'paused');
  await page.locator('#nfPause').click();assert.equal(await page.evaluate(()=>window.__qa.track.enabled),true);
  await page.evaluate(()=>window.__qa.speak('3','A dor começou de repente.'));
  await page.waitForFunction(()=>window.radarState.alerts.some(a=>a.concept==='sudden'));
  const total=await page.evaluate(()=>window.radarState.clarified.length);
  await page.evaluate(()=>window.__qa.speak('3','A dor começou de repente.'));
  assert.equal(await page.evaluate(()=>window.radarState.clarified.length),total);
  const widths=await page.evaluate(()=>({radar:document.getElementById('realtimeRadarCard').getBoundingClientRect().width,recorder:document.querySelector('.card.rec-zone').getBoundingClientRect().width}));
  assert.ok(Math.abs(widths.radar-widths.recorder)<4,'Radar occupies the same available width as the recorder');
  fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
  await page.locator('#realtimeRadarCard').screenshot({path:path.join(root,`test-results/radar-questions-${viewport.width}.png`)});
  await page.getByRole('tab',{name:'Riscos e alertas',exact:true}).click();
  assert.equal(await page.locator('#ngAlertBanner').isVisible(),true);assert.match(await page.locator('#ngFindings').innerText(),/de repente/);
  await page.locator('#realtimeRadarCard').screenshot({path:path.join(root,`test-results/radar-risks-${viewport.width}.png`)});
  await page.evaluate(()=>{window.__qa.failRadar=true;});await page.evaluate(()=>window.nexaRadar.analyzeRemote());
  assert.match(await page.locator('#ngAnalysisStatus').innerText(),/indisponível/);assert.equal(await page.evaluate(()=>window.__qa.track.readyState),'live');
  console.log('Recording and Radar views checked',viewport.width);
  await page.locator('#nfFinish').click();await page.waitForFunction(()=>!document.getElementById('processBtn').disabled);
  await page.locator('#processBtn').click();await page.waitForFunction(()=>document.querySelector('.field[data-key="hda"] textarea').value.includes('Cefaleia'));
  assert.match(await page.locator('.field[data-key="hipotese_diagnostica"] textarea').inputValue(),/Cefaleia/);
  assert.equal(await page.locator('.field[data-key="hda"] textarea').inputValue().then(v=>v.includes('Teve febre?')),false);
  // Summary, reviewed hypothesis, plan generation and all copy contracts stay in the existing flow.
  const copied=async(id)=>{await page.locator('#'+id).evaluate(el=>el.click());return page.evaluate(()=>window.__qa.clipboard);};
  assert.match(await copied('copyFieldHdaBtn'),/cefaleia/i);
  assert.match(await copied('copyHdaBtn'),/ALERGIAS/i);
  await page.evaluate(()=>document.querySelector('.nexa-session-tab[data-stage="hypothesis"]')?.click());
  await page.locator('#confirmHypothesisBtn').evaluate(el=>el.click());
  await page.waitForFunction(()=>!document.getElementById('generateBothPlanBtn').disabled);
  await page.evaluate(()=>document.querySelector('.nexa-session-tab[data-stage="plan"]')?.click());
  await page.locator('#generateBothPlanBtn').evaluate(el=>el.click());
  await page.waitForFunction(()=>document.getElementById('suggestedExams').value.includes('Exame de teste')&&document.getElementById('rxOptions').textContent.includes('Medicamento QA'));
  assert.match(await copied('copySuggestedExamsBtn'),/Exame de teste/);
  await page.locator('#selectSuggestedRxBtn').evaluate(el=>el.click());
  assert.match(await copied('copyPrescriptionBtn'),/MEDICAMENTO QA/);
  assert.match(await copied('copyPrescriptionGuidanceBtn'),/Orientação de teste/);
  // The nested template editor is not the patient's clinical conduct field.
  await page.locator('#conductContentInput').evaluate(el=>{el.value='RASCUNHO DE MODELO NÃO INCORPORADO';});
  await page.locator('#conductRecordText').evaluate(el=>{el.value='Conduta revisada do caso sintético.';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await copied('copyConductBtn'),'Conduta revisada do caso sintético.');
  const note=await copied('copyBtn');assert.match(note,/CONDUTAS:[\s\S]*Conduta revisada/);assert.doesNotMatch(note,/RASCUNHO DE MODELO/);
  for(const section of ['QUEIXA PRINCIPAL','HISTÓRIA DA DOENÇA ATUAL','ALERGIAS','COMORBIDADES','MEDICAÇÕES','ANTECEDENTES','EXAME FÍSICO','HIPÓTESE DIAGNÓSTICA','CONDUTAS'])assert.ok(note.includes(section),section);
  console.log('Summary, hypothesis, plan and copies checked',viewport.width);
  await page.evaluate(()=>window.__qa.switchUser('qa-physician-b'));
  await page.waitForFunction(()=>window.currentProf.id==='qa-physician-b');
  await page.evaluate(()=>window.__qa.speak('late','Dor torácica com síncope.',0));
  assert.equal(await page.locator('.field[data-key="hda"] textarea').inputValue(),'');
  assert.equal(await page.evaluate(()=>window.radarState.hasContext),false);
  assert.deepEqual(await page.evaluate(()=>window.nexaRadar.snapshot().ledger),{});
  for(const id of ['suggestedExams','suggestedPrescription','conductRecordText'])assert.equal(await page.locator('#'+id).inputValue(),'');
  // A capabilities failure must remove access, never inherit the previous physician's permission.
  await page.evaluate(()=>{window.__qa.denyCapabilities=true;window.__qa.switchUser('qa-permission-failure');});
  await page.waitForFunction(()=>!window.currentProf?.clinical_access&&document.getElementById('mainApp').style.display==='none');
  assert.deepEqual(errors,[],'Browser runtime errors');
  console.log(`Browser regression (synthetic external services) ${viewport.width}px: PASS`);await page.close();
 }
 }catch(error){fs.mkdirSync(path.join(root,'test-results'),{recursive:true});await activePage?.screenshot({path:path.join(root,'test-results/failure.png'),fullPage:true}).catch(()=>{});throw error;}finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
