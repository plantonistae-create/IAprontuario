const {chromium}=require('playwright');
const fs=require('fs');
const http=require('http');
const path=require('path');
const assert=require('node:assert/strict');

const watchdog=setTimeout(()=>{console.error('Audit responsive E2E exceeded 120 seconds');process.exit(1);},120000);watchdog.unref();
const root=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(path.join(__dirname,'browser-fixture.js'),'utf8');

function contrast(rgb1,rgb2){
  const parse=s=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
  const lum=s=>{
    const [r,g,b]=parse(s).map(v=>v/255).map(v=>v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4));
    return 0.2126*r+0.7152*g+0.0722*b;
  };
  const a=lum(rgb1),b=lum(rgb2);
  return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
}

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
    browser=await chromium.launch({headless:true});
    for(const viewport of [{width:1440,height:1000},{width:1280,height:900},{width:1024,height:850},{width:390,height:844}]){
      const page=await browser.newPage({viewport});
      page.setDefaultTimeout(15000);
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));

      await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.nexaAuditFunctionalGuard18916&&window.currentProf&&window.nexaOpenProfessionalAuditExact);
      await page.evaluate(async()=>{
        document.documentElement.setAttribute('data-theme','light');
        document.documentElement.setAttribute('data-nexa-theme','light');
        window.__qa.capabilities={access_status:'active',clinical_access:true,is_admin:true,is_reviewer:true,display_name:'Auditor QA'};
        await window.nexaAuditFunctionalGuard18916.refreshCapabilities();
        window.nexaOpenProfessionalAuditExact();
      });
      await page.waitForFunction(()=>document.getElementById('nexaAuditExact')?.classList.contains('open')&&/Painel de Auditoria/.test(document.getElementById('axContent')?.textContent||''));
      await page.waitForTimeout(120);

      const panel=await page.evaluate(()=>{
        const root=document.getElementById('nexaAuditExact');
        const content=document.getElementById('axContent');
        const kpis=[...content.querySelectorAll('.ax-kpi')].filter(el=>getComputedStyle(el).display!=='none');
        const grid=[...content.querySelectorAll('.ax-grid>.ax-card')].filter(el=>getComputedStyle(el).display!=='none');
        const table=content.querySelector('.ax-table');
        const action=content.querySelector('.ax-row:not(.head) .ax-reviewbtn');
        const side=root.querySelector('.ax-side');
        const active=root.querySelector('.ax-nav button.active');
        const sr=side?.getBoundingClientRect(),ar=active?.getBoundingClientRect(),tr=table?.getBoundingClientRect(),br=action?.getBoundingClientRect(),cr=content.getBoundingClientRect();
        return {
          rootOverflow:root.scrollWidth-root.clientWidth,
          docOverflow:document.documentElement.scrollWidth-innerWidth,
          content:{left:cr.left,right:cr.right,width:cr.width},
          kpiCount:kpis.length,
          kpiSpan:kpis.length?(kpis.at(-1).getBoundingClientRect().right-kpis[0].getBoundingClientRect().left):0,
          metricCount:grid.length,
          sideDisplay:side?getComputedStyle(side).display:null,
          sideWidth:sr?.width||0,
          activeText:active?.textContent?.trim()||'',
          activeClientWidth:active?.clientWidth||0,
          activeScrollWidth:active?.scrollWidth||0,
          activeColor:active?getComputedStyle(active).color:null,
          activeBg:active?getComputedStyle(active).backgroundColor:null,
          tableClient:table?.clientWidth||0,
          tableScroll:table?.scrollWidth||0,
          tableRect:tr?{left:tr.left,right:tr.right}:null,
          actionRect:br?{left:br.left,right:br.right}:null
        };
      });

      assert.ok(panel.rootOverflow<=1,'Audit root must not create global horizontal overflow at '+viewport.width);
      assert.ok(panel.docOverflow<=1,'Document must not create horizontal overflow at '+viewport.width);
      assert.equal(panel.kpiCount,4,'All four operational KPI cards stay visible at '+viewport.width);
      assert.equal(panel.metricCount,3,'All three dashboard metric cards stay visible at '+viewport.width);

      if(viewport.width>900){
        assert.ok(Math.abs(panel.sideWidth-220)<2,'Desktop sidebar stays stable at 220px');
        assert.ok(panel.activeScrollWidth<=panel.activeClientWidth+1,'Active sidebar label must not clip');
        assert.ok(contrast(panel.activeColor,panel.activeBg)>=4.5,'Active sidebar contrast must meet AA');
        assert.ok(panel.kpiSpan>=panel.content.width*0.88,'KPI grid must use the available content width');
        if(viewport.width>=1280){
          assert.ok(panel.tableScroll<=panel.tableClient+2,'Wide desktop table should fit without internal scroll at '+viewport.width);
          assert.ok(panel.actionRect.right<=panel.tableRect.right+1,'Action column must be visible at '+viewport.width);
        }else{
          assert.ok(panel.tableScroll>panel.tableClient,'1024px may use table-only horizontal scroll');
          await page.locator('.ax-table').evaluate(el=>{el.scrollLeft=el.scrollWidth;});
          const visibleAction=await page.evaluate(()=>{
            const t=document.querySelector('.ax-table').getBoundingClientRect();
            const b=document.querySelector('.ax-row:not(.head) .ax-reviewbtn').getBoundingClientRect();
            return b.left>=t.left-1&&b.right<=t.right+1;
          });
          assert.equal(visibleAction,true,'Action column must be reachable by table-only scroll at 1024px');
        }
      }else{
        assert.equal(panel.sideDisplay,'none','Mobile uses the existing hidden-sidebar behavior');
        assert.ok(panel.tableScroll<=panel.tableClient+2,'Mobile card table must not horizontally overflow');
      }

      fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
      await page.screenshot({path:path.join(root,`test-results/audit-panel-${viewport.width}.png`),fullPage:true});

      await page.evaluate(()=>document.querySelector('#nexaAuditExact [data-ax-view="queue"]')?.click());
      await page.waitForFunction(()=>document.querySelector('#axContent h1')?.textContent==='Fila de casos');
      const queue=await page.evaluate(()=>{
        const root=document.getElementById('nexaAuditExact');
        const filters=root.querySelector('.ax-filters');
        const table=root.querySelector('.ax-table');
        return {
          rootOverflow:root.scrollWidth-root.clientWidth,
          docOverflow:document.documentElement.scrollWidth-innerWidth,
          filtersClient:filters?.clientWidth||0,
          filtersScroll:filters?.scrollWidth||0,
          tableClient:table?.clientWidth||0,
          tableScroll:table?.scrollWidth||0,
          actionCount:root.querySelectorAll('.ax-row:not(.head) .ax-reviewbtn').length
        };
      });
      assert.ok(queue.rootOverflow<=1&&queue.docOverflow<=1,'Queue must not create global horizontal overflow at '+viewport.width);
      assert.ok(queue.actionCount>0,'Queue actions remain rendered at '+viewport.width);
      if(viewport.width<=900)assert.ok(queue.filtersScroll>=queue.filtersClient,'Mobile filters remain horizontally accessible');

      await page.screenshot({path:path.join(root,`test-results/audit-queue-${viewport.width}.png`),fullPage:true});

      await page.evaluate(()=>document.querySelector('#nexaAuditExact [data-ax-view="audited"]')?.click());
      await page.waitForFunction(()=>document.querySelector('#axContent h1')?.textContent==='Auditados');
      const audited=await page.evaluate(()=>{
        const root=document.getElementById('nexaAuditExact');
        const filters=root.querySelector('.ax-filters');
        return {
          rootOverflow:root.scrollWidth-root.clientWidth,
          docOverflow:document.documentElement.scrollWidth-innerWidth,
          filtersVisible:!!filters&&getComputedStyle(filters).display!=='none'
        };
      });
      assert.ok(audited.rootOverflow<=1&&audited.docOverflow<=1,'Audited view must not create global horizontal overflow at '+viewport.width);
      assert.equal(audited.filtersVisible,true,'Audited filters remain visible at '+viewport.width);
      assert.deepEqual(errors,[],'No new JavaScript runtime errors at '+viewport.width);

      console.log('Audit responsive E2E '+viewport.width+'px: PASS');
      await page.close();
    }
  }finally{
    await browser?.close();
    server.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
