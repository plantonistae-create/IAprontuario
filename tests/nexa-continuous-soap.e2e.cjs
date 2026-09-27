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
   await page.waitForFunction(()=>window.currentProf?.clinical_access&&window.nexaContinuousSoap1811&&window.nexaEncounterAutosave18101);
   if(await page.locator('#nexaNewCaseBtn').isVisible())await page.locator('#nexaNewCaseBtn').click();
   await page.waitForFunction(()=>document.getElementById('nexaUnifiedFlow')&&document.body.dataset.nexaFlow==='continuous');
   assert.equal(await page.locator('#nexaUnifiedFlow').isVisible(),true,'Unified clinical flow must be visible');
   assert.equal(await page.locator('#nexaFlowHistory').isVisible(),true);
   assert.equal(await page.locator('#nexaFlowExam').isVisible(),true);
   assert.equal(await page.locator('#nexaFlowAssessment').isVisible(),true);
   assert.equal(await page.locator('#nexaFlowPlan').isVisible(),true);

   await page.locator('.field[data-key="hda"] textarea').fill('Dor abdominal há um dia, sem outros sintomas relevantes.');
   await page.locator('[data-exam-chip="beg"]').click();
   await page.locator('[data-exam-chip="hydrated"]').click();
   let exam=await page.locator('.field[data-key="exame_fisico"] textarea').inputValue();
   assert.match(exam,/GERAL: BEG, hidratado\./i,'One-click exam chips must write immediately');
   await page.locator('.field[data-key="exame_fisico"] textarea').evaluate(el=>{el.value+='\nTexto manual preservado.';el.dispatchEvent(new Event('input',{bubbles:true}))});
   await page.locator('[data-exam-chip="colored"]').click();
   exam=await page.locator('.field[data-key="exame_fisico"] textarea').inputValue();
   assert.match(exam,/corado/i);assert.match(exam,/Texto manual preservado/,'Manual exam text must coexist with chips');
   await page.locator('[data-exam-chip="hydrated"]').click();
   exam=await page.locator('.field[data-key="exame_fisico"] textarea').inputValue();
   assert.doesNotMatch(exam,/hidratado/i,'Second click must remove quick finding');
   assert.match(exam,/Texto manual preservado/);

   const hyp=page.locator('.field[data-key="hipotese_diagnostica"] textarea');
   await hyp.fill('GECA');
   await page.waitForFunction(()=>window.nexaClinicalBridge18101.assessment().text==='GECA'&&window.nexaClinicalBridge18101.assessment().status==='altered');
   let a=await page.evaluate(()=>window.nexaClinicalBridge18101.assessment());
   assert.equal(a.confirmed_cid,'','Free assessment must proceed without CID');
   assert.equal(a.ai,'','Manual assessment must not be relabeled as AI output');
   assert.equal(await page.locator('#hypothesisEditPanel').isVisible(),false,'Typing free assessment must not force the legacy edit panel open');

   await page.locator('#physicianCid').fill('A09');
   await page.locator('#nexaAssociateCid').click();
   await page.waitForFunction(()=>window.nexaClinicalBridge18101.assessment().confirmed_cid==='A09');
   a=await page.evaluate(()=>window.nexaClinicalBridge18101.assessment());
   assert.equal(a.text,'GECA','Associating CID must not overwrite physician text');
   assert.equal(a.confirmed_cid,'A09');

   await page.locator('#physicianCid').fill('J06.9');
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

   await page.locator('#nexaPlanQuickComposer').getByRole('button',{name:'Solicito exames',exact:true}).click();
   let plan=await page.locator('#conductRecordText').inputValue();assert.match(plan,/Solicito exames\./);
   await page.locator('#conductRecordText').evaluate(el=>{el.value+='\nReavaliar após resultado.';el.dispatchEvent(new Event('input',{bubbles:true}))});
   await page.locator('#nexaPlanQuickComposer').getByRole('button',{name:'Orientações',exact:true}).click();
   plan=await page.locator('#conductRecordText').inputValue();assert.match(plan,/Orientações\./);assert.match(plan,/Reavaliar após resultado\./,'Manual plan text must coexist with quick actions');

   await page.screenshot({path:path.join(root,'test-results',`continuous-flow-${viewport.width}.png`),fullPage:true});
   const before=await page.evaluate(()=>({hda:document.querySelector('.field[data-key="hda"] textarea').value,exam:document.querySelector('.field[data-key="exame_fisico"] textarea').value,hyp:document.querySelector('.field[data-key="hipotese_diagnostica"] textarea').value,plan:document.getElementById('conductRecordText').value,encounter:window.nexaEncounterAutosave18101.currentEncounterId()}));
   await page.locator('[data-flow-mode="soap"]').click();
   await page.waitForFunction(()=>document.body.dataset.nexaFlow==='soap');
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
