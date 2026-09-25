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
  const page=await browser.newPage({viewport,permissions:['microphone']});page.setDefaultTimeout(15000);activePage=page;console.log('Opening browser regression',viewport.width);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser runtime:',e.stack||e.message);});
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.nexaRadar&&window.nexaDestinationFlow18915&&window.currentProf?.clinical_access&&document.getElementById('nfStart'));
  if(await page.locator('#nexaNewCaseBtn').isVisible())await page.locator('#nexaNewCaseBtn').click();
  await page.waitForFunction(()=>document.querySelector('.nexa-stage-view[data-stage="radar"]')?.classList.contains('active')&&!document.querySelector('.nexa-stage-view[data-stage="radar"]')?.hidden);
  await page.waitForFunction(()=>!!window.nexaEncounterAutosave18101?.currentEncounterId?.());
  const encounterId=await page.evaluate(()=>window.nexaEncounterAutosave18101.currentEncounterId());
  assert.match(encounterId,/^[0-9a-f-]{36}$/i,'New encounter receives a persistent UUID');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('doctor-home-open')),false,'New encounter must leave home and reveal Radar');
  const historyControl=viewport.width<=820?'#nexaMobileBottomNav [data-mobile-stage="history"]':'#nfQuickHistory';
  const radarControl=viewport.width<=820?'#nexaMobileBottomNav [data-mobile-stage="radar"]':'#nfShell [data-go="radar"]';
  await page.locator(historyControl).click();
  await page.waitForFunction(()=>document.getElementById('nexaCommandWorkspace')?.classList.contains('workspace-open')&&document.querySelector('.nexa-stage-view[data-stage="summary"]')?.classList.contains('active'));
  await page.waitForFunction(()=>document.getElementById('nexa197History')&&document.getElementById('n197Status'));
  assert.equal(await page.evaluate(()=>document.querySelector('.nexa-stage-view[data-stage="summary"]').hidden),false,'History must not hide the real summary stage');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('nexa-workspace-only')),true,'History must open the existing workspace');
  await page.locator(radarControl).click();
  await page.waitForFunction(()=>document.querySelector('.nexa-stage-view[data-stage="radar"]')?.classList.contains('active')&&!document.querySelector('.nexa-stage-view[data-stage="radar"]')?.hidden);
  assert.equal(await page.evaluate(()=>document.body.classList.contains('nexa-workspace-only')),false,'Returning to a clinical stage must leave history-only mode');
  console.log('New encounter and history navigation checked',viewport.width);
  // Drive the real fields and the rendered Radar; external services alone are synthetic.
  await page.locator('.field[data-key="hda"] textarea').evaluate(el=>{el.value='Dor torácica, nega dispneia, síncope e sudorese.';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>window.radarState?.facts?.dyspnea?.state==='known_absent');
  await page.waitForTimeout(450);
  const localEncounter=await page.evaluate(id=>window.nexaEncounterAutosave18101.get(id),encounterId);
  assert.equal(localEncounter.encounter_id,encounterId,'Autosave keeps the same encounter identity');
  assert.match(localEncounter.fields.hda,/Dor torácica/);
  assert.equal(await page.evaluate(async id=>{const rows=await window.nexaEncounterAutosave18101.all();return rows.filter(x=>x.encounter_id===id).length},encounterId),1,'Autosave must keep one local record per encounter_id');
  await page.waitForFunction(()=>{try{const p=JSON.parse(localStorage.getItem('nexa-active-clinical-session-v370')||'{}');return !!p.encounter_id&&!('fields' in p)}catch{return false}});
  const pointerBeforeReload=await page.evaluate(()=>JSON.parse(localStorage.getItem('nexa-active-clinical-session-v370')));
  assert.equal(pointerBeforeReload.encounter_id,encounterId);
  assert.equal('fields' in pointerBeforeReload,false,'New autosave must not keep the clinical record in localStorage');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.nexaEncounterAutosave18101&&window.currentProf?.clinical_access&&document.getElementById('nexaRestoreBanner')&&!document.getElementById('nexaRestoreBanner').hidden);
  await page.locator('#nexaRestoreSessionBtn').click();
  await page.waitForFunction(id=>window.nexaEncounterAutosave18101.currentEncounterId()===id&&/Dor torácica/i.test(document.querySelector('.field[data-key="hda"] textarea')?.value||''),encounterId);
  assert.equal(await page.evaluate(()=>window.nexaEncounterAutosave18101.currentEncounterId()),encounterId,'Reload must restore the same encounter_id');
  console.log('IndexedDB encounter reload recovery checked',viewport.width);
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
  await page.evaluate(()=>window.__qa.speak('3b','Paciente de 40 anos. Lúcido. PA 80/50. Médico: Teve rigidez de nuca? Paciente: Não entendi.'));
  await page.waitForFunction(()=>window.radarState.alerts.some(a=>a.concept==='bp')&&window.radarState.confirm.some(i=>i.concept==='meningism'));
  assert.equal(await page.evaluate(()=>window.radarState.facts.consciousness.state),'known_absent');
  await page.evaluate(()=>window.__qa.speak('3c','Corrigindo, PA 120/80.'));
  await page.waitForFunction(()=>!window.radarState.alerts.some(a=>a.concept==='bp'));
  const widths=await page.evaluate(()=>({radar:document.getElementById('realtimeRadarCard').getBoundingClientRect().width,recorder:document.querySelector('.card.rec-zone').getBoundingClientRect().width}));
  assert.ok(Math.abs(widths.radar-widths.recorder)<4,'Radar occupies the same available width as the recorder');
  fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
  // Capture the rendered card without clipping it inside the application's scrolling stage.
  // Resize the real viewport, wait for transient notifications to expire, then restore the test viewport.
  const captureHeight=await page.evaluate(()=>Math.ceil(document.getElementById('realtimeRadarCard').getBoundingClientRect().height+document.querySelector('.card.rec-zone').getBoundingClientRect().height+500));
  await page.setViewportSize({width:viewport.width,height:Math.max(viewport.height,captureHeight)});
  await page.locator('#nexaAuditOutboxToast').waitFor({state:'hidden'});
  await page.locator('#realtimeRadarCard').screenshot({path:path.join(root,`test-results/radar-questions-${viewport.width}.png`)});
  await page.getByRole('tab',{name:'Riscos e alertas',exact:true}).click();
  assert.equal(await page.locator('#ngAlertBanner').isVisible(),true);assert.match(await page.locator('#ngFindings').innerText(),/de repente/);
  await page.locator('#realtimeRadarCard').screenshot({path:path.join(root,`test-results/radar-risks-${viewport.width}.png`)});
  const related=await page.locator('#ngFindings [data-question]').first().getAttribute('data-question');
  await page.locator('#ngFindings [data-question]').first().click();
  assert.equal(await page.getByRole('tab',{name:'Perguntas da consulta',exact:true}).getAttribute('aria-selected'),'true');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.item),related);
  assert.equal(await page.locator('#ngAlertBanner').isVisible(),true,'Clarified findings remain visible in the question tab');
  await page.setViewportSize(viewport);
  await page.evaluate(()=>{window.__qa.failRadar=true;});await page.evaluate(()=>window.nexaRadar.analyzeRemote());
  assert.match(await page.locator('#ngAnalysisStatus').innerText(),/indisponível/);assert.equal(await page.evaluate(()=>window.__qa.track.readyState),'live');
  await page.evaluate(()=>window.__qa.channels.at(-1).receive({data:JSON.stringify({type:'conversation.item.input_audio_transcription.failed',item_id:'failed-audio'})}));
  await page.evaluate(()=>window.__qa.speak('4','Nega trauma recente.'));
  assert.equal(await page.evaluate(()=>window.nexaRadar.state.transcriptStatus),'stale','A later utterance cannot hide a lost audio segment');
  assert.equal(await page.evaluate(()=>window.__qa.track.readyState),'live');
  console.log('Recording and Radar views checked',viewport.width);
  await page.locator('#nfFinish').click();await page.waitForFunction(()=>!document.getElementById('processBtn').disabled);
  await page.locator('#processBtn').click();await page.waitForFunction(()=>/cefaleia/i.test(document.querySelector('.field[data-key="hda"] textarea').value));
  assert.match(await page.locator('.field[data-key="hipotese_diagnostica"] textarea').inputValue(),/cefaleia/i);
  assert.doesNotMatch(await page.locator('.field[data-key="hda"] textarea').inputValue(),/teve febre\?/i);
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
  // Published Protocol Library uses the same prescription composer and records the exact version used.
  await page.locator('#searchProtocolRxBtn').evaluate(el=>el.click());
  await page.waitForFunction(()=>document.getElementById('nexaProtocolLibrary18101')?.classList.contains('open')&&/Condição QA/.test(document.getElementById('nplList')?.textContent||''));
  await page.locator('#nplSearch').fill('J45');await page.locator('#nplSearchBtn').click();
  await page.waitForFunction(()=>/Condição QA/.test(document.getElementById('nplList')?.textContent||''));
  assert.match(await page.locator('#nplList').innerText(),/J45/);
  await page.locator('#nplSearch').fill('Condição QA');await page.locator('#nplSearchBtn').click();
  await page.waitForFunction(()=>/Condição QA/.test(document.getElementById('nplList')?.textContent||''));
  await page.locator('[data-npl-id="11111111-1111-4111-8111-111111111111"]').click();
  assert.match(await page.locator('#nplDetail').innerText(),/Versão 3/);
  await page.locator('#nplUse').click();
  await page.waitForFunction(()=>/ITEM QA/.test(document.getElementById('rxOptions')?.textContent||'')&&/ITEM QA/.test(document.getElementById('suggestedPrescription')?.value||''));
  const protocolUsage=await page.evaluate(()=>window.__NEXA_PROTOCOL_USAGE__);
  assert.equal(protocolUsage.length,1);
  assert.equal(protocolUsage[0].protocol_id,'11111111-1111-4111-8111-111111111111');
  assert.equal(protocolUsage[0].protocol_version_id,'22222222-2222-4222-8222-222222222222');
  await page.waitForTimeout(450);
  const protocolEncounter=await page.evaluate(async()=>{const id=window.nexaEncounterAutosave18101.currentEncounterId();return window.nexaEncounterAutosave18101.get(id)});
  assert.equal(protocolEncounter.protocol_usage[0].protocol_version_id,'22222222-2222-4222-8222-222222222222');
  assert.match(await copied('copyPrescriptionBtn'),/ITEM QA/);
  console.log('Published protocol search and prescription integration checked',viewport.width);
  // The nested template editor is not the patient's clinical conduct field.
  await page.locator('#conductContentInput').evaluate(el=>{el.value='RASCUNHO DE MODELO NÃO INCORPORADO';});
  await page.locator('#conductRecordText').evaluate(el=>{el.value='Conduta revisada do caso sintético.';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await copied('copyConductBtn'),'Conduta revisada do caso sintético.');
  const note=await copied('copyBtn');assert.match(note,/CONDUTAS:[\s\S]*Conduta revisada/);assert.doesNotMatch(note,/RASCUNHO DE MODELO/);
  for(const section of ['QUEIXA PRINCIPAL','HISTÓRIA DA DOENÇA ATUAL','ALERGIAS','COMORBIDADES','MEDICAÇÕES','ANTECEDENTES','EXAME FÍSICO','HIPÓTESE DIAGNÓSTICA','CONDUTAS'])assert.ok(note.includes(section),section);
  console.log('Summary, hypothesis, plan and copies checked',viewport.width);
  // Auditor UI: real components/RPC bridge with synthetic external data, on both desktop and iPhone viewports.
  await page.evaluate(async()=>{window.__qa.capabilities={...window.__qa.capabilities,is_reviewer:true};await window.nexaAuditFunctionalGuard18916.refreshCapabilities();window.nexaOpenProfessionalAuditExact();});
  await page.waitForFunction(()=>document.getElementById('nexaAuditExact')?.classList.contains('open')&&/Painel de Auditoria/.test(document.getElementById('axContent')?.textContent||''));
  assert.match(await page.locator('#axContent').innerText(),/Pendentes[\s\S]*3/);
  await page.evaluate(()=>window.nexaAuditNavigate18101('queue'));
  await page.waitForFunction(()=>/Fila de casos/.test(document.getElementById('axContent')?.textContent||'')&&document.querySelectorAll('[data-ax-open]').length>=3);
  await page.locator('[data-ax-open="33333333-3333-4333-8333-333333333331"]').click();
  await page.waitForFunction(()=>document.getElementById('axReview')?.classList.contains('open'));
  await page.locator('[data-ax-tab="comparacao"]').click();
  const comparison=await page.locator('#axRBody').innerText();assert.match(comparison,/NEXA ORIGINAL/);assert.match(comparison,/VERSÃO FINAL DO MÉDICO/);assert.match(comparison,/ORIGINAL QA A/);assert.match(comparison,/FINAL QA A/);
  await page.locator('[data-ax-tab="radar"]').click();const radarAudit=await page.locator('#axRBody').innerText();assert.match(radarAudit,/Hipotensão/);assert.match(radarAudit,/known_present/);assert.match(radarAudit,/Transcript bruto não é armazenado/);
  await page.locator('[data-ax-tab="conduta"]').click();const planAudit=await page.locator('#axRBody').innerText();assert.match(planAudit,/EXAME QA/);assert.match(planAudit,/PRESCRIÇÃO QA/);assert.match(planAudit,/internacao/i);assert.match(planAudit,/Versões|Protocolos/i);
  await page.locator('[data-ax-decision="approved"]').click();
  await page.waitForFunction(()=>window.__qa.auditDecisions.length===1&&/Auditoria registrada/.test(document.getElementById('axReview')?.textContent||''));
  assert.equal(await page.evaluate(()=>window.__qa.auditDecisions[0].decision),'approved');
  await page.evaluate(()=>{window.nexaCloseProfessionalAudit?.();});
  console.log('Audit panel, queue, comparison and approval checked',viewport.width);
  // Reopening a saved consultation during recording must also stop the primary recorder.
  await page.evaluate(()=>document.querySelector('.nexa-session-tab[data-stage="radar"]')?.click());
  await page.locator('#nfStart').click();
  await page.waitForFunction(()=>window.__qa.channels.length===2);
  await page.evaluate(()=>{window.__qa.previousTrack=window.__qa.track;window.fill({hda:'Disúria há dois dias.'});});
  await page.waitForFunction(()=>window.__qa.previousTrack.readyState==='ended'&&document.getElementById('processBtn').disabled);
  assert.equal(await page.locator('#consent').isChecked(),false);
  await page.evaluate(()=>window.__qa.speak('late-history','Cefaleia súbita com síncope.',1));
  assert.match(await page.locator('.field[data-key="hda"] textarea').inputValue(),/disúria/i);
  assert.equal(await page.evaluate(()=>window.radarState.facts.headache.state),'not_asked');
  assert.deepEqual(await page.evaluate(()=>window.nexaRadar.snapshot().ledger),{});

  // Auditor mode uses real UI contracts with a synthetic, deidentified queue.
  await page.evaluate(async()=>{
    window.__qa.capabilities={access_status:'active',clinical_access:true,is_admin:true,is_reviewer:true,display_name:'Auditor QA'};
    await window.nexaAuditFunctionalGuard18916.refreshCapabilities();
    window.nexaOpenProfessionalAuditExact();
  });
  await page.waitForFunction(()=>document.getElementById('nexaAuditExact')?.classList.contains('open')&&/Painel de Auditoria/.test(document.getElementById('axContent')?.textContent||''));
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#axContent .ax-kpi')].find(x=>/Pendentes/.test(x.textContent))?.querySelector('strong')?.textContent),'3');
  await page.evaluate(()=>document.querySelector('#nexaAuditExact [data-ax-view="queue"]')?.click());
  await page.waitForFunction(()=>document.querySelector('#axContent h1')?.textContent==='Fila de casos');
  await page.locator('#axSearch').fill('J45');
  await page.waitForFunction(()=>/CASO QA A/.test(document.getElementById('axContent')?.textContent||''));
  assert.doesNotMatch(await page.locator('#axContent').innerText(),/CASO QA B/);
  await page.locator('#axSearch').fill('');
  await page.waitForFunction(()=>/CASO QA B/.test(document.getElementById('axContent')?.textContent||''));

  await page.evaluate(()=>document.querySelector('[data-ax-open="33333333-3333-4333-8333-333333333331"]')?.click());
  await page.waitForFunction(()=>document.getElementById('axReview')?.classList.contains('open'));
  await page.evaluate(()=>document.querySelector('#axReview [data-ax-tab="comparacao"]')?.click());
  await page.waitForFunction(()=>/ORIGINAL QA A/.test(document.getElementById('axRBody')?.textContent||'')&&/FINAL QA A/.test(document.getElementById('axRBody')?.textContent||''));
  await page.evaluate(()=>document.querySelector('#axReview [data-ax-tab="documentacao"]')?.click());
  const hdaEdit=page.locator('#axReview [data-ax-field="hda"]');
  await hdaEdit.fill('FINAL QA A CORRIGIDO');
  await page.locator('#axReview [data-ax-decision="corrected"]').click();
  await page.waitForFunction(()=>window.__qa.auditDecisions.some(x=>x.case_id==='33333333-3333-4333-8333-333333333331'&&x.decision==='corrected'));
  assert.equal((await page.evaluate(()=>window.__qa.auditDecisions.find(x=>x.case_id==='33333333-3333-4333-8333-333333333331').corrected_fields.hda)),'FINAL QA A CORRIGIDO');
  await page.locator('#axReview .ax-success button').click();
  await page.waitForFunction(()=>!document.getElementById('axReview')?.classList.contains('open')&&/Fila de casos/.test(document.getElementById('axContent')?.textContent||''));

  await page.evaluate(()=>document.querySelector('[data-ax-open="33333333-3333-4333-8333-333333333332"]')?.click());
  await page.waitForFunction(()=>document.getElementById('axReview')?.classList.contains('open'));
  await page.locator('#axReview [data-ax-decision="approved"]').click();
  await page.waitForFunction(()=>window.__qa.auditDecisions.some(x=>x.case_id==='33333333-3333-4333-8333-333333333332'&&x.decision==='approved'));
  await page.locator('#axReview .ax-success button').click();
  await page.waitForFunction(()=>!document.getElementById('axReview')?.classList.contains('open'));

  await page.evaluate(()=>document.querySelector('[data-ax-open="33333333-3333-4333-8333-333333333333"]')?.click());
  await page.waitForFunction(()=>document.getElementById('axReview')?.classList.contains('open'));
  page.once('dialog',d=>d.accept('MOTIVO QA'));
  await page.locator('#axReview [data-ax-decision="discarded"]').click();
  await page.waitForFunction(()=>window.__qa.auditDecisions.some(x=>x.case_id==='33333333-3333-4333-8333-333333333333'&&x.decision==='discarded'&&x.note==='MOTIVO QA'));
  await page.locator('#axReview .ax-success button').click();
  await page.waitForFunction(()=>!document.getElementById('axReview')?.classList.contains('open'));

  await page.evaluate(()=>document.querySelector('#nexaAuditExact [data-ax-view="audited"]')?.click());
  await page.waitForFunction(()=>document.querySelector('#axContent h1')?.textContent==='Auditados');
  assert.match(await page.locator('#axContent').innerText(),/Corrigido/);
  assert.match(await page.locator('#axContent').innerText(),/Aprovado/);
  assert.match(await page.locator('#axContent').innerText(),/Descartado/);
  await page.evaluate(()=>document.querySelector('#nexaAuditExact [data-ax-view="stats"]')?.click());
  await page.waitForFunction(()=>document.querySelector('#axContent h1')?.textContent==='Estatísticas');
  assert.match(await page.locator('#axContent').innerText(),/Correções/);
  await page.evaluate(()=>document.querySelector('#nexaAuditExact [data-ax-view="learn"]')?.click());
  await page.waitForFunction(()=>document.querySelector('#axContent h1')?.textContent==='Aprendizado');
  assert.match(await page.locator('#axContent').innerText(),/Treinamento de modelo/);
  assert.match(await page.locator('#axContent').innerText(),/Não realizado/);
  console.log('Auditor approve/correct/discard, metrics and learning checked',viewport.width);
  await page.evaluate(async()=>{
    window.nexaCloseProfessionalAudit();
    window.__qa.capabilities={access_status:'active',clinical_access:true,is_admin:false,is_reviewer:false,display_name:'Médico QA'};
    await window.nexaAuditFunctionalGuard18916.refreshCapabilities();
  });

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
