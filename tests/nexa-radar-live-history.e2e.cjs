/* Synthetic live-utterance end-to-end regression. Never contacts production systems. */
const {chromium}=require('playwright');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const assert=require('node:assert/strict');

const root=path.resolve(__dirname,'..'),fixture=fs.readFileSync(path.join(__dirname,'browser-fixture.js'),'utf8');
const watchdog=setTimeout(()=>{console.error('Radar live core-history UI E2E exceeded 150 seconds');process.exit(1)},150000);
watchdog.unref();
fs.mkdirSync(path.join(root,'test-results'),{recursive:true});

function server(){
 return http.createServer((req,res)=>{
  let pathname=decodeURIComponent(req.url.split('?')[0]);if(pathname==='/')pathname='/index.html';
  const file=path.join(root,pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{
   let contents=fs.readFileSync(file);
   if(pathname==='/index.html')contents=contents.toString()
     .replace(/<script[^>]+src="https:\/\/[^"]*supabase[^"]*"[^>]*><\/script>/g,'')
     .replace('<head>','<head><script>'+fixture+'</script>');
   res.setHeader('Content-Type',pathname.endsWith('.html')?'text/html':pathname.endsWith('.js')?'application/javascript':pathname.endsWith('.css')?'text/css':'application/octet-stream');
   res.end(contents);
  }catch{res.writeHead(404).end();}
 });
}
(async()=>{
 const app=server();await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   const page=await browser.newPage({viewport,permissions:['microphone']});
   page.setDefaultTimeout(18000);
   const errors=[];page.on('pageerror',err=>errors.push(err.message));
   await page.goto('http://127.0.0.1:'+app.address().port,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.currentProf?.clinical_access&&window.nexaRadar&&window.nexaRadarDynamicFocus18160&&document.getElementById('nfStart'));
   if(await page.locator('#nexaNewCaseBtn').isVisible())await page.locator('#nexaNewCaseBtn').click();
   await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult'&&document.getElementById('nexaRadarDynamic18160'));
   const currentHistory=()=>page.evaluate(()=>['comorbidades','alergias','medicacoes'].map(k=>document.querySelector('.field[data-key="'+k+'"] textarea')?.value||''));
   const before=await currentHistory();
   const stateOf=async id=>page.locator('#nexaFocusHistory18160 [data-concept="'+id+'"]').getAttribute('data-state');
   for(const id of ['comorbidities','allergies','medicines'])assert.equal(await stateOf(id),'pending',id+' must start pending');
   if(!(await page.locator('#consent').isChecked()))await page.locator('#consent').check();
   await page.locator('#nfStart').click();
   await page.waitForFunction(()=>window.__qa.channels.length>0&&window.nexaRadar.state.transcriptStatus==='live');
   const speak=async(id,utterance)=>page.evaluate(({id,utterance})=>window.__qa.speak(id,utterance),{id,utterance});
   await speak('core-q-allergy','Médico: Tem alergias?');
   await page.waitForFunction(()=>window.nexaRadar.state.facts.allergies.state==='not_asked');
   assert.equal(await stateOf('allergies'),'pending','A question from the clinician cannot become an answer');
   await speak('core-a-allergy-unknown','Paciente: Não sei informar.');
   await page.waitForFunction(()=>window.nexaRadar.state.facts.allergies.state!=='known_absent');
   assert.notEqual(await stateOf('allergies'),'documented','Uncertain history must not be certified');
   await speak('core-a-allergy','Paciente: Nega alergias.');
   await speak('core-q-disease','Médico: Possui comorbidades?');
   await speak('core-a-disease','Paciente: Tenho hipertensão arterial.');
   await speak('core-q-medicine','Médico: Faz uso de medicamentos contínuos?');
   await speak('core-a-medicine','Paciente: Uso losartana 50 mg diariamente.');
   await page.waitForFunction(()=>{
     const states=window.nexaRadar?.state?.facts||{};
     return states.allergies?.state==='known_absent'&&states.comorbidities?.state==='known_present'&&states.medicines?.state==='known_present';
   },null,{timeout:12000});
   await page.waitForFunction(()=>['comorbidities','allergies','medicines'].every(id=>
     document.querySelector('#nexaFocusHistory18160 [data-concept="'+id+'"]')?.dataset.state==='documented')
     &&document.getElementById('nexaFocusHistoryCount18160')?.textContent==='3/3',null,{timeout:12000});
   for(const id of ['comorbidities','allergies','medicines'])assert.equal(await stateOf(id),'documented',id+' must visibly refresh while recording');
   assert.deepEqual(await currentHistory(),before,'Recognizing live history must not silently modify the structured medical record');
   assert.deepEqual(errors,[],'No uncaught browser errors');
   await page.screenshot({path:path.join(root,'test-results','radar-live-history-'+viewport.width+'.png')});
   console.log('Radar live-history view '+viewport.width+'px: PASS');
   await page.close();
  }
 }finally{await browser?.close();app.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
