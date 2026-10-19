const {chromium}=require('playwright');
const fs=require('fs');
const http=require('http');
const path=require('path');
const assert=require('node:assert/strict');

const watchdog=setTimeout(()=>{console.error('Continuous/SOAP E2E exceeded 150 seconds');process.exit(1);},150000);watchdog.unref();
const root=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(path.join(__dirname,'browser-fixture.js'),'utf8');
fs.mkdirSync(path.join(root,'test-results'),{recursive:true});

(async()=>{
 const server=http.createServer((req,res)=>{
  let file=decodeURIComponent(req.url.split('?')[0]);if(file==='/')file='/index.html';
  const full=path.join(root,file);if(!full.startsWith(root+'/')){res.writeHead(403).end();return;}
  try{
   let content=fs.readFileSync(full);
   if(file==='/index.html')content=content.toString().replace(/<script[^>]+src="https:\/\/[^"]*supabase[^"]*"[^>]*><\/script>/g,'').replace('<head>','<head><script>'+fixture+'</script>');
   res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(content);
  }catch{res.writeHead(404).end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   const page=await browser.newPage({viewport,permissions:['microphone']});page.setDefaultTimeout(18000);
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.currentProf?.clinical_access&&window.nexaContinuousSoap1811&&window.nexaEncounterAutosave18101&&window.nexaRadarAutoReview1812);
   if(await page.locator('#nexaNewCaseBtn').isVisible())await page.locator('#nexaNewCaseBtn').click();
   await page.waitForFunction(()=>document.getElementById('nexaUnifiedFlow')&&document.body.dataset.nexaFlow==='continuous');
   const consent=page.locator('#consent');
   assert.equal(await consent.isVisible(),true,'Native recording consent must be visible in the unified flow at '+viewport.width+'px');
   assert.equal(await consent.evaluate(el=>el.parentElement?.id),'nexaUnifiedConsent','Unified flow must reuse the native consent checkbox, not a second state');
   assert.equal(await consent.isChecked(),false,'Consent must start unchecked for a new encounter');
   assert.equal(await page.locator('#recBtn').isDisabled(),true,'Recorder must stay disabled until consent is confirmed');
   await consent.check();
   await page.waitForFunction(()=>!document.getElementById('recBtn')?.disabled);
   assert.equal(await consent.isChecked(),true,'Visible consent must enable the real recorder');
   await consent.uncheck();
   await page.waitForFunction(()=>document.getElementById('recBtn')?.disabled);
   assert.equal(await page.locator('#identifySpeakersLegacy').isVisible(),true,'Detailed speaker identification must be beside transcription');
   assert.equal(await page.locator('#identifySpeakersLegacy').isChecked(),false,'Detailed diarization must be opt-in');
   assert.equal(await page.locator('#identifySpeakersLegacy').evaluate(el=>el.closest('.nexa-flow-process-row')!==null),true,'Speaker toggle belongs to the real processing row');
   await page.evaluate(()=>window.nexaRadarAutoReview1812.setPhase('review','continuous-soap-e2e'));
   await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='review');
   assert.equal(await page.locator('#nexaUnifiedFlow').isVisible(),true,'Unified clinical flow must be visible');
   assert.equal(await page.locator('#nexaFlowHistory').isVisible(),true);
   assert.equal(await page.locator('#nexaFlowExam').isVisible(),true);
   assert.equal(await page.locator('#nexaFlowAssessment').isVisible(),true);
   assert.equal(await page.locator('#nexaFlowPlan').isVisible(),true);
   assert.equal(await page.locator('#nexaVitalSigns').isVisible(),false,'Redundant separate vital-sign editor must be hidden');
   assert.equal(await page.locator('#copyExamBtn').isVisible(),false,'Duplicate physical-exam copy must be hidden');
   assert.equal(await page.locator('#nexaFlowExam [data-copy="O"]').isVisible(),true,'One unified O copy must remain visible');
   assert.equal(await page.locator('#nexaTimestampConductBtn').isVisible(),false,'Timestamp conduct shortcut must be hidden');
   assert.equal(await page.locator('#nexaOrderLibraryBtn').isVisible(),true,'Library has explicit ordering control');
   assert.equal(await page.locator('#nexaPlanQuickComposer').count(),0,'Quick plan block must be removed');
   assert.equal(await page.locator('#nexaPlanPresets').count(),0,'Duplicate presets must not exist');
   assert.equal(await page.locator('#conductPickerBody').isVisible(),true,'Conduct library must be immediately expanded');
   await page.waitForFunction(()=>document.querySelectorAll('#conductList .conduct-item').length>=3);
   assert.equal(await page.locator('#conductList .conduct-item').count(),3,'Canonical library must show all saved conduct templates');
   assert.match(await page.locator('#conductList .conduct-item-preview').first().innerText(),/Oriento retorno/);
   assert.equal(await page.locator('#conductRecordText').isVisible(),true,'Free-form conduct field must remain editable');
   assert.equal(await page.locator('#nexaOrderLibraryBtn').innerText(),'Organizar biblioteca');
   assert.equal(await page.locator('#finalRecordActions').isVisible(),false,'Legacy duplicate final-record copy must be hidden');
   assert.equal(await page.locator('#nexaFlowCopyAll').isVisible(),true,'One final-record copy must be visible');
   assert.equal(await page.locator('#nexaChangeCid').isVisible(),true,'Change CID must be directly accessible');
   assert.equal(await page.locator('#nexaFlowPlan [data-plan-jump="conductBlock"]').isVisible(),false,'No duplicate conduct tile');
   assert.equal(await page.locator('#nexaFlowPlan [data-plan-jump="rxGuidancePreview"]').isVisible(),false,'Guidance remains within prescription');
   if(viewport.width>820){
    const shellLabels=await page.locator('#nfShell [data-go]').allTextContents();
    assert.deepEqual(shellLabels,['Contínuo','SOAP rápido','Histórico'],'Desktop sidebar must not expose legacy clinical pages');
    await page.locator('#nfShell [data-go="summary"]').click();
    await page.waitForFunction(()=>document.body.dataset.nexaFlow==='soap'&&document.body.dataset.nexaStage==='radar');
    await page.locator('#nfShell [data-go="radar"]').click();
    await page.waitForFunction(()=>document.body.dataset.nexaFlow==='continuous'&&document.body.dataset.nexaStage==='radar');
   }

   await page.locator('.field[data-key="hda"] textarea').fill('Dor abdominal há um dia, sem outros sintomas relevantes.');
   assert.equal(await page.locator('#nexaExamQuickComposer').count(),0,'Duplicate physical-exam quick composer must stay removed');
   await page.locator('.exam-type-btn[data-type="HOMEM"]').click();
   const generalExam=page.locator('.exam-sys-check[data-label="Estado geral"]');
   const respiratoryExam=page.locator('.exam-sys-check[data-label="Aparelho respiratório"]');
   await generalExam.check();
   let exam=await page.locator('.field[data-key="exame_fisico"] textarea').inputValue();
   assert.match(exam,/BEG, LOTE/i,'Profile-model system click must write the physical exam immediately');
   await respiratoryExam.check();
   exam=await page.locator('.field[data-key="exame_fisico"] textarea').inputValue();
   assert.match(exam,/AR: MVUA sem RA\./i,'Additional profile-model systems must appear immediately');
   await respiratoryExam.uncheck();
   exam=await page.locator('.field[data-key="exame_fisico"] textarea').inputValue();
   assert.doesNotMatch(exam,/AR: MVUA sem RA\./i,'Unchecking a system must remove that profile-model section');
   assert.match(exam,/BEG, LOTE/i,'Other selected profile-model systems must remain');

   const hyp=page.locator('.field[data-key="hipotese_diagnostica"] textarea');
   await hyp.fill('GECA');
   await page.waitForFunction(()=>window.nexaClinicalBridge18101.assessment().text==='GECA'&&window.nexaClinicalBridge18101.assessment().status==='altered');
   let a=await page.evaluate(()=>window.nexaClinicalBridge18101.assessment());
   assert.equal(a.confirmed_cid,'','Free assessment must proceed without CID');
   assert.equal(a.ai,'','Manual assessment must not be relabeled as AI output');
   assert.equal(await page.locator('#hypothesisEditPanel').isVisible(),false,'Typing free assessment must not force the legacy edit panel open');

   await page.locator('#physicianCid').fill('A09');
   await page.waitForFunction(()=>[...document.querySelectorAll('#physicianCidOptions option')].some(o=>o.value==='A09'));
   await page.locator('#nexaAssociateCid').click();
   await page.waitForFunction(()=>window.nexaClinicalBridge18101.assessment().confirmed_cid==='A09');
   a=await page.evaluate(()=>window.nexaClinicalBridge18101.assessment());
   assert.equal(a.text,'GECA','Associating CID must not overwrite physician text');
   assert.equal(a.confirmed_cid,'A09');

   await page.locator('#physicianCid').fill('J06.9');
   await page.waitForFunction(()=>[...document.querySelectorAll('#physicianCidOptions option')].some(o=>o.value==='J06.9'));
   await page.locator('#nexaAssociateCid').click();
   await page.waitForFunction(()=>window.nexaClinicalBridge18101.assessment().confirmed_cid==='J06.9');
   a=await page.evaluate(()=>window.nexaClinicalBridge18101.assessment());
   assert.equal(a.text,'GECA','Changing CID must not overwrite physician text');
   assert.equal(a.confirmed_cid,'J06.9');

   await page.locator('#physicianCid').fill('');
   await page.locator('#nexaAssociateCid').click();
   await page.waitForFunction(()=>window.nexaClinicalBridge18101.assessment().confirmed_cid==='');
   a=await page.evaluate(()=>window.nexaClinicalBridge18101.assessment());
   assert.equal(a.text,'GECA','Removing CID must preserve physician assessment');
   assert.equal(a.confirmed_cid,'');

   // Native saved conduct templates append in click order, independent of library sort order.
   const firstId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
   const secondId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
   await page.locator('#conductList .conduct-item[data-id="'+secondId+'"] .conduct-item-main').click();
   await page.locator('#conductList .conduct-item[data-id="'+firstId+'"] .conduct-item-main').click();
   let plan=await page.locator('#conductRecordText').inputValue();
   assert.ok(plan.toLowerCase().indexOf('oriento hidratação oral e sinais de alarme.')<plan.toLowerCase().indexOf('oriento retorno imediato em caso de piora clínica.'),'Patient conduct order must follow click order, not library sorting');
   const clickedPlan=plan;
   await page.locator('#nexaOrderLibraryBtn').click();
   assert.equal(await page.locator('#nexaOrderLibraryBtn').innerText(),'Concluir organização');
   await page.locator('#conductList .conduct-item[data-id="'+secondId+'"] .conduct-item-actions button').first().click();
   await page.waitForFunction(id=>window.__qa.conductTemplates[0]?.id===id,secondId);
   await page.waitForFunction(id=>document.querySelector('#conductList .conduct-item')?.dataset.id===id,secondId);
   assert.equal(await page.locator('#conductRecordText').inputValue(),clickedPlan,'Changing the library order must not change already recorded clinical conduct');
   await page.locator('#nexaOrderLibraryBtn').click();
   assert.equal(await page.locator('#nexaOrderLibraryBtn').innerText(),'Organizar biblioteca');
   await page.locator('#addConductTemplateBtn').click();
   await page.locator('#conductContentInput').fill('Reavaliar após resultado de exames. Orientar sinais de alarme.');
   await page.locator('#saveConductTemplateBtn').click();
   await page.waitForFunction(()=>window.__qa.conductTemplates.some(x=>x.content==='Reavaliar após resultado de exames. Orientar sinais de alarme.'));
   await page.waitForFunction(()=>document.querySelectorAll('#conductList .conduct-item').length===4);
   assert.equal(await page.locator('#conductRecordText').inputValue(),clickedPlan,'Registering a reusable template cannot append it without clicking');
   await page.locator('#conductList .conduct-item').last().locator('.conduct-item-main').click();
   plan=await page.locator('#conductRecordText').inputValue();
   assert.match(plan,/Reavaliar após resultado de exames\. Orientar sinais de alarme\./i,'Clicking new template must append its complete text');
   await page.locator('#conductRecordText').fill(plan+'\nConduta individualizada conforme reavaliação médica.');
   plan=await page.locator('#conductRecordText').inputValue();
   assert.match(plan,/Conduta individualizada conforme reavaliação médica\.$/i,'Free text editing must remain possible');
   assert.ok(plan.toLowerCase().indexOf('oriento hidratação')<plan.toLowerCase().indexOf('oriento retorno'),'Manual edits must not reorder previously selected conducts');

   await page.screenshot({path:path.join(root,'test-results',`continuous-flow-${viewport.width}.png`),fullPage:true});
   const before=await page.evaluate(()=>({hda:document.querySelector('.field[data-key="hda"] textarea').value,exam:document.querySelector('.field[data-key="exame_fisico"] textarea').value,hyp:document.querySelector('.field[data-key="hipotese_diagnostica"] textarea').value,plan:document.getElementById('conductRecordText').value,encounter:window.nexaEncounterAutosave18101.currentEncounterId()}));
   await page.locator('[data-flow-mode="soap"]').click();
   await page.waitForFunction(()=>document.body.dataset.nexaFlow==='soap');
   if(viewport.width>820){assert.equal(await page.locator('#nfShell [data-go="summary"]').evaluate(el=>el.classList.contains('active')),true,'SOAP sidebar item must be active');assert.equal(await page.locator('#nfShell [data-go="radar"]').evaluate(el=>el.classList.contains('active')),false,'Continuous sidebar item must be inactive in SOAP mode')}
   const soap=await page.evaluate(()=>window.nexaContinuousSoap1811.composeSoap());
   assert.match(soap,/S — SUBJETIVO/);assert.match(soap,/O — OBJETIVO/);assert.match(soap,/A — AVALIAÇÃO/);assert.match(soap,/P — PLANO/);assert.match(soap,/GECA/);assert.doesNotMatch(soap,/CID:/,'SOAP assessment must remain valid without confirmed CID');

   await page.screenshot({path:path.join(root,'test-results',`soap-flow-${viewport.width}.png`),fullPage:true});
   const after=await page.evaluate(()=>({hda:document.querySelector('.field[data-key="hda"] textarea').value,exam:document.querySelector('.field[data-key="exame_fisico"] textarea').value,hyp:document.querySelector('.field[data-key="hipotese_diagnostica"] textarea').value,plan:document.getElementById('conductRecordText').value,encounter:window.nexaEncounterAutosave18101.currentEncounterId()}));
   assert.deepEqual(after,before,'Continuous → SOAP must preserve the same encounter and fields');

   await page.locator('[data-copy="A"]').click();
   await page.locator('#nexaFlowCopyAll').click();
   assert.match(await page.locator('#nexaFlowPreview').textContent(),/A — AVALIAÇÃO/);
   await page.locator('[data-flow-mode="continuous"]').click();
   await page.waitForFunction(()=>document.body.dataset.nexaFlow==='continuous');
   if(viewport.width>820){assert.equal(await page.locator('#nfShell [data-go="radar"]').evaluate(el=>el.classList.contains('active')),true,'Continuous sidebar item must be active after swap back');assert.equal(await page.locator('#nfShell [data-go="summary"]').evaluate(el=>el.classList.contains('active')),false,'SOAP sidebar item must be inactive after swap back')}
   const back=await page.evaluate(()=>({hda:document.querySelector('.field[data-key="hda"] textarea').value,hyp:document.querySelector('.field[data-key="hipotese_diagnostica"] textarea').value,encounter:window.nexaEncounterAutosave18101.currentEncounterId()}));
   assert.equal(back.hda,before.hda);assert.equal(back.hyp,'GECA');assert.equal(back.encounter,before.encounter);

   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   assert.ok(overflow<=1,`No global horizontal overflow at ${viewport.width}px`);
   assert.deepEqual(errors,[],`No unhandled JavaScript errors at ${viewport.width}px`);
   console.log('Continuous/SOAP E2E '+viewport.width+'px: PASS');
   await page.close();
  }
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
