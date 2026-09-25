const {webkit}=require('playwright');
const fs=require('fs');
const http=require('http');
const path=require('path');
const assert=require('node:assert/strict');

const watchdog=setTimeout(()=>{console.error('Audit WebKit smoke exceeded 90 seconds');process.exit(1);},90000);watchdog.unref();
const root=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(path.join(__dirname,'browser-fixture.js'),'utf8');

(async()=>{
  const server=http.createServer((req,res)=>{
    let file=decodeURIComponent(req.url.split('?')[0]);
    if(file==='/')file='/index.html';
    const full=path.join(root,file);
    if(!full.startsWith(root+'/')){res.writeHead(403).end();return;}
    try{
      let content=fs.readFileSync(full);
      if(file==='/index.html')content=content.toString()
        .replace(/<script[^>]+src="https:\/\/[^"]*supabase[^"]*"[^>]*><\/script>/g,'')
        .replace('<head>','<head><script>'+fixture+'</script>');
      res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');
      res.end(content);
    }catch{res.writeHead(404).end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser;
  try{
    browser=await webkit.launch({headless:true});
    for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
      const page=await browser.newPage({viewport});
      page.setDefaultTimeout(15000);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.nexaAuditFunctionalGuard18916&&window.nexaOpenProfessionalAuditExact);
      await page.evaluate(async()=>{
        document.documentElement.setAttribute('data-theme','light');
        document.documentElement.setAttribute('data-nexa-theme','light');
        document.body.classList.add('nexa-auditor-view');
        window.__qa.capabilities={access_status:'active',clinical_access:true,is_admin:true,is_reviewer:true,display_name:'Auditor QA'};
        await window.nexaAuditFunctionalGuard18916.refreshCapabilities();
        window.nexaOpenProfessionalAuditExact();
      });
      await page.waitForFunction(()=>document.getElementById('nexaAuditExact')?.classList.contains('open'));
      await page.waitForFunction(()=>/Painel de Auditoria/.test(document.getElementById('axContent')?.textContent||''));
      const state=await page.evaluate(()=>{
        const main=document.querySelector('#nexaAuditExact .ax-main');
        const top=document.querySelector('#nexaAuditExact .ax-topbar');
        const content=document.getElementById('axContent');
        const mr=main.getBoundingClientRect(),tr=top.getBoundingClientRect(),cr=content.getBoundingClientRect();
        return {
          mainWidth:mr.width,mainDisplay:getComputedStyle(main).display,mainTag:main.tagName,
          topWidth:tr.width,topDisplay:getComputedStyle(top).display,
          contentWidth:cr.width,contentText:content.textContent.trim(),
          rootOverflow:document.getElementById('nexaAuditExact').scrollWidth-document.getElementById('nexaAuditExact').clientWidth,
          docOverflow:document.documentElement.scrollWidth-innerWidth
        };
      });
      if(viewport.width>900){
        assert.ok(state.mainWidth>800,'Safari desktop auditor main pane must not collapse');
        assert.ok(state.topWidth>800,'Safari desktop auditor topbar must remain visible');
      }else{
        assert.ok(state.mainWidth>360,'Safari mobile auditor main pane must fill viewport');
      }
      assert.notEqual(state.mainDisplay,'none');
      assert.notEqual(state.mainTag,'MAIN','Auditor pane must not use a MAIN element hidden by legacy .nexa-auditor-view main rule');
      assert.notEqual(state.topDisplay,'none');
      assert.ok(state.contentWidth>300,'Audit content must retain measurable width');
      assert.match(state.contentText,/Painel de Auditoria/);
      assert.ok(state.rootOverflow<=1&&state.docOverflow<=1,'No global horizontal overflow in WebKit');
      assert.deepEqual(errors,[],'No JavaScript runtime errors in WebKit');
      console.log('Audit WebKit smoke '+viewport.width+'px: PASS');
      await page.close();
    }
  }finally{
    await browser?.close();
    server.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
