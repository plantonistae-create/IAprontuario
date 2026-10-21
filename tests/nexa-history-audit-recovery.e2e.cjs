const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(path.join(__dirname,'browser-fixture.js'),'utf8');
const timeout=setTimeout(()=>{console.error('History/audit recovery E2E exceeded 150 seconds');process.exit(1)},150000);timeout.unref();
(async()=>{
 let browser,server;
 try{
  server=http.createServer((req,res)=>{
   let file=decodeURIComponent(req.url.split('?')[0]);if(file==='/')file='/index.html';
   const full=path.join(root,file);
   if(!full.startsWith(root+'/'))return res.writeHead(403).end();
   try{
    let content=fs.readFileSync(full);
    if(file==='/index.html')content=content.toString().replace(/<script[^>]+src="https:\/\/[^"]*supabase[^"]*"[^>]*><\/script>/g,'').replace('<head>','<head><script>'+fixture+'</script>');
    res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':'application/octet-stream');res.end(content);
   }catch{res.writeHead(404).end()}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
   const context=await browser.newContext({viewport,permissions:['microphone']});
   const page=await context.newPage();page.setDefaultTimeout(16000);
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.currentProf?.clinical_access&&window.nexaEncounterAutosave18101&&window.nexaAuditOutbox18919&&window.nexaRecoverHistoryV1&&window.nexaContinuousSoap1811);
   if(await page.locator('#nexaNewCaseBtn').isVisible())await page.locator('#nexaNewCaseBtn').click();
   await page.waitForFunction(()=>document.getElementById('nexaUnifiedFlow')&&window.nexaEncounterAutosave18101.currentEncounterId());
   await page.evaluate(()=>window.nexaRadarAutoReview1812?.setPhase('review','history-recovery-test'));
   await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='review');
   // Supabase session remains valid even though the doctor elected NOT to store the login.
   await page.evaluate(()=>localStorage.removeItem('sb-synthetic-auth-token'));
   assert.equal(await page.evaluate(()=>window.nexaAuditOutbox18919.owner()),'qa-physician-a','Audit must identify in-memory authenticated doctor');
   const note='Paciente QA sintético com sintomas há 24 horas, sem sinais de alarme.';
   await page.locator('.field[data-key="hda"] textarea').fill(note);
   await page.locator('.field[data-key="hipotese_diagnostica"] textarea').fill('Quadro clínico sintético a esclarecer.');
   const stored=await page.evaluate(async()=>{
    const api=window.nexaEncounterAutosave18101;
    const row=await api.preserve('synthetic_browser_closure',{sync:false});
    return {id:row.encounter_id,owner:row.owner_user_id,hda:row.fields.hda};
   });
   assert.equal(stored.owner,'qa-physician-a');assert.equal(stored.hda,note);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.currentProf?.clinical_access&&window.nexaRecoverHistoryV1&&window.nexaRecoverSavedEncounter);
   await page.evaluate(()=>window.nexaRecoverHistoryV1.refresh(true));
   await page.waitForFunction(needle=>[...document.querySelectorAll('#nexaRecoverList .nexa-recover-case')].some(el=>el.textContent?.includes(needle)),note.slice(0,42));
   const card=page.locator('#nexaRecoverList .nexa-recover-case').filter({hasText:note.slice(0,42)}).first();
   assert.match(await card.innerText(),/este computador/i,'Recovered draft must be drawn from local IndexedDB after browser reload');
   await card.getByRole('button',{name:'Reabrir atendimento'}).click();
   await page.waitForFunction(needle=>document.querySelector('.field[data-key="hda"] textarea')?.value===needle,note);
   assert.equal(await page.locator('.field[data-key="hda"] textarea').inputValue(),note,'History restore must recover completed clinical fields without copy/paste');
   assert.deepEqual(errors,[],'No browser errors during recovery');
   console.log('NEXA audit and history recovery at '+viewport.width+'px: PASS');
   await context.close();
  }
 }finally{await browser?.close();server?.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
