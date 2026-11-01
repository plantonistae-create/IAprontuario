const {chromium}=require('playwright');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(path.join(__dirname,'browser-fixture.js'),'utf8');

(async()=>{
 const server=http.createServer((req,res)=>{
  const file=decodeURIComponent(req.url.split('?')[0])==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0]);
  const full=path.resolve(root,'.'+file);
  if(!full.startsWith(root+path.sep)){res.writeHead(403).end();return}
  try{
   let body=fs.readFileSync(full);
   if(file==='/index.html')body=body.toString().replace(/<script[^>]+src="https:\/\/[^\"]*supabase[^\"]*"[^>]*><\/script>/g,'').replace('<head>','<head><script>'+fixture+'</script>');
   res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':'application/octet-stream');res.end(body);
  }catch{res.writeHead(404).end()}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof window.nexaShowMedicationReview==='function');
  await page.evaluate(()=>window.nexaShowMedicationReview({requires_review:true,alerts:[
   {code:'volume_missing',medicine:'omeprazol',reported_name:'omeprazol',amount:'5',unit:'mL'},
   {code:'medication_missing',medicine:'celestrat',reported_name:'celestrat'}
  ]}));
  const warning=page.locator('#nexaMedicationReview');
  await warning.waitFor({state:'attached'});
  assert.match(await warning.textContent(),/5 mL/);
  assert.match(await warning.textContent(),/concentração pode continuar não informada/);
  assert.match(await warning.textContent(),/Celestrat/i);
  assert.equal(await page.locator('.field[data-key="medicacoes"] textarea').inputValue(),'');
  await page.evaluate(()=>window.nexaShowMedicationReview({requires_review:false,alerts:[]}));
  assert.equal(await warning.count(),0);
  console.log('MEDICATION_REVIEW_UI_PASS: review-only warning, unchanged medical record');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error.name||'BrowserError',String(error.message||'').slice(0,300));process.exitCode=1});
