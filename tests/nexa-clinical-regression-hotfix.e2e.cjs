const {chromium}=require('playwright');
const fs=require('fs');
const http=require('http');
const path=require('path');
const assert=require('node:assert/strict');

const watchdog=setTimeout(()=>{console.error('Clinical regression hotfix E2E exceeded 220 seconds');process.exit(1);},220000);watchdog.unref();
const root=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(path.join(__dirname,'browser-fixture.js'),'utf8');
fs.mkdirSync(path.join(root,'test-results'),{recursive:true});

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function parseTimer(v){const m=String(v||'').match(/^(\d+):(\d{2})$/);return m?(+m[1]*60)+(+m[2]):0}

(async()=>{
 const server=http.createServer((req,res)=>{
  let file=decodeURIComponent(req.url.split('?')[0]);if(file==='/')file='/index.html';
  const full=path.join(root,file);if(!full.startsWith(root+path.sep)){res.writeHead(403).end();return}
  try{
   let body=fs.readFileSync(full);
   if(file==='/index.html')body=body.toString().replace(/<script[^>]+src="https:\/\/[^"]*supabase[^"]*"[^>]*><\/script>/g,'').replace('<head>','<head><script>'+fixture+'</script>');
   res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(body);
  }catch{res.writeHead(404).end()}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   const page=await browser.newPage({viewport,permissions:['microphone']});page.setDefaultTimeout(25000);
   const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   await page.addInitScript(()=>{
     window.__nexaScrollIntoViewCalls=[];window.__nexaWindowScrollCalls=[];
     const nativeInto=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(options){window.__nexaScrollIntoViewCalls?.push({id:this.id||'',options});return nativeInto?.call(this,options)};
     const nativeScroll=window.scrollTo.bind(window);window.scrollTo=function(...args){window.__nexaWindowScrollCalls?.push(args[0]);return nativeScroll(...args)};
   });
   await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
   try{
    await page.waitForFunction(()=>window.currentProf?.clinical_access&&window.nexaEncounterAutosave18101&&window.nexaAuditOutbox18919&&window.nexaRadarAutoReview1812&&document.getElementById('nfStart'));
   }catch(error){
    const diagnostic=await page.evaluate(()=>({currentProf:window.currentProf||null,runtime:!!window.nexaClinicalRuntime18121,autosave:!!window.nexaEncounterAutosave18101,outbox:!!window.nexaAuditOutbox18919,review:!!window.nexaRadarAutoReview1812,nfStart:!!document.getElementById('nfStart'),loginDisplay:document.getElementById('loginGate')?.style?.display,mainDisplay:document.getElementById('mainApp')?.style?.display,phase:document.body.dataset.nexaClinicalPhase||'',status:document.getElementById('status')?.textContent||''}));
    console.error('HOTFIX_BOOT_DIAGNOSTIC',JSON.stringify(diagnostic));console.error('HOTFIX_PAGE_ERRORS',JSON.stringify(errors));
    await page.screenshot({path:path.join(root,'test-results',`clinical-regression-boot-failure-${viewport.width}.png`),fullPage:true}).catch(()=>{});
    throw error;
   }
   assert.equal(await page.evaluate(()=>window.nexaClinicalRuntime18121?.getProfile?.()?.id),await page.evaluate(()=>window.currentProf.id),'runtime profile contract must expose the active physician to external modules');
   if(await page.locator('#nexaNewCaseBtn').isVisible())await page.locator('#nexaNewCaseBtn').click();
   await page.waitForFunction(()=>document.querySelector('.nexa-stage-view[data-stage="radar"]')?.classList.contains('active')&&!document.querySelector('.nexa-stage-view[data-stage="radar"]')?.hidden&&!!window.nexaEncounterAutosave18101?.currentEncounterId?.());

   const ids=[];
   for(let n=1;n<=3;n++){
    const expectedMode=n===2?'soap':'continuous';
    await page.evaluate(mode=>window.nexaContinuousSoap1811?.setMode?.(mode),expectedMode);
    await page.waitForFunction(mode=>document.body.dataset.nexaFlow===mode,expectedMode);
    await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult');
    if(!(await page.locator('#consent').isChecked()))await page.locator('#consent').evaluate(el=>{el.checked=true;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.locator('#nfStart').click();
    await page.waitForFunction(()=>document.getElementById('recBtn')?.classList.contains('recording'));

    if(n===1){
      await sleep(1250);
      const before=parseTimer(await page.locator('#timer').innerText());assert.ok(before>=1,'timer must advance while recording');
      await page.locator('#recBtn').click();
      try{
        await page.waitForFunction(()=>document.getElementById('recBtn')?.dataset.recordingState==='paused'&&/pausada/i.test(document.getElementById('status')?.textContent||''));
      }catch(error){
        const diagnostic=await page.evaluate(()=>({
          recState:document.getElementById('recBtn')?.dataset.recordingState||'',
          recClass:document.getElementById('recBtn')?.className||'',
          recDisabled:!!document.getElementById('recBtn')?.disabled,
          recAria:document.getElementById('recBtn')?.getAttribute('aria-label')||'',
          status:document.getElementById('status')?.textContent||'',
          pauseText:document.getElementById('nfPause')?.textContent||'',
          nativePauseText:document.getElementById('nexaPauseBtn')?.textContent||'',
          processDisabled:!!document.getElementById('processBtn')?.disabled
        }));
        console.error('V18122_CIRCULAR_PAUSE_DIAGNOSTIC',JSON.stringify(diagnostic));
        console.error('V18122_CIRCULAR_PAUSE_PAGE_ERRORS',JSON.stringify(errors));
        throw error;
      }
      assert.equal(await page.locator('#processBtn').isDisabled(),true,'circular pause must not finalize the recording');
      assert.match(await page.locator('#recBtn').getAttribute('aria-label'),/Retomar gravação/i);
      const paused=parseTimer(await page.locator('#timer').innerText());await sleep(1250);
      assert.equal(parseTimer(await page.locator('#timer').innerText()),paused,'timer must stop while paused');
      await page.locator('#recBtn').click();
      await page.waitForFunction(()=>document.getElementById('recBtn')?.dataset.recordingState==='recording'&&/gravando consulta/i.test(document.getElementById('status')?.textContent||''));
      assert.match(await page.locator('#recBtn').getAttribute('aria-label'),/Pausar gravação/i);
      await sleep(1150);assert.ok(parseTimer(await page.locator('#timer').innerText())>paused,'timer must resume from the previous value');
    }

    await page.locator('#nfFinish').click();
    await page.waitForFunction(()=>!document.getElementById('processBtn').disabled&&/pronta para transcrever/i.test(document.getElementById('status')?.textContent||''));
    await page.waitForFunction(()=>document.getElementById('nfProcess')?.dataset.nexaAutofocus==='process');
    assert.equal(await page.locator('#recBtn').getAttribute('data-recording-state'),'stopped','Finalizar must leave the recorder stopped');
    assert.equal(await page.locator('#recBtn').isDisabled(),true,'finalized circular control must not start a new recording');
    assert.match(await page.locator('#nfProcess').innerText(),/Transcrever e estruturar/i);
    assert.equal(await page.evaluate(()=>{const r=document.getElementById('nfProcess').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}),true,'structure CTA must be fully visible after Finalizar');
    assert.ok(await page.evaluate(()=>window.__nexaScrollIntoViewCalls.some(x=>x.id==='nfProcess')),'Finalizar must scroll the visible structure CTA into view');

    await page.evaluate(()=>{window.__qa.processDelayMs=450;});
    if(n===1){
      await page.evaluate(()=>window.__qa.processFailureStatus=503);
      await page.locator('#nfProcess').click();
      await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='processing');
      assert.equal(await page.locator('#nexaFlowHistory').isVisible(),true,'History/HDA section must stay mounted during processing');
      assert.equal(await page.locator('#nexaFlowAssessment').isVisible(),true,'Assessment section must stay mounted during processing');
      await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='error');
      assert.match(await page.locator('#status').innerText(),/Falha ao transcrever\/estruturar/i,'processing error must remain visible');
      assert.equal(await page.locator('#nexaFlowPlan').isVisible(),true,'sections must remain visible after a processing error');
      await page.evaluate(()=>window.__qa.processFailureStatus=0);
    }else if(n===2){
      await page.evaluate(()=>window.__qa.processAuthFailures=1);
    }

    await page.locator('#nfProcess').click();
    await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='processing');
    assert.equal(await page.locator('#nexaFlowHistory').isVisible(),true);
    await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='review'&&/cefaleia/i.test(document.querySelector('.field[data-key="hda"] textarea')?.value||''));
    assert.match(await page.locator('.field[data-key="antecedentes"] textarea').inputValue(),/antecedentes/i);
    assert.match(await page.locator('.field[data-key="medicacoes"] textarea').inputValue(),/uso/i);
    assert.match(await page.locator('.field[data-key="alergias"] textarea').inputValue(),/alergias/i);
    assert.match(await page.locator('.field[data-key="hipotese_diagnostica"] textarea').inputValue(),/cefaleia/i);
    assert.match(await page.locator('#conductRecordText').inputValue(),/reavaliar/i);

    if(n===1){
      const phase1Baseline=await page.evaluate(()=>({
        mode:document.body.dataset.nexaFlow||'continuous',
        values:Object.fromEntries(['queixa_principal','hda','antecedentes','alergias','comorbidades','medicacoes','exame_fisico','conduta'].map(k=>[k,document.querySelector('.field[data-key="'+k+'"] textarea')?.value||'']))
      }));
      assert.equal(await page.locator('#nexaFlowExam').isVisible(),true,'Exam must be visible in real review phase');
      assert.equal(await page.locator('#nexaFlowPlan').isVisible(),true,'Plan must be visible in real review phase');

      const legacyExam=page.locator('#nexaFlowExam details.nexa-legacy-exam');if(await legacyExam.count())await legacyExam.evaluate(el=>{el.open=true});
      assert.equal(await page.locator('.exam-type-btn[data-type="HOMEM"]').isVisible(),true,'legacy profile picker must be visible when expanded');
      await page.locator('.exam-type-btn[data-type="HOMEM"]').click();
      const estadoGeral=page.locator('#examSystems .exam-check').filter({hasText:'Estado geral'}).locator('input');
      const ar=page.locator('#examSystems .exam-check').filter({hasText:'Aparelho respiratório'}).locator('input');
      await estadoGeral.check();await ar.check();
      await page.waitForFunction(()=>/Exame adicionado/i.test(document.getElementById('nexaQuickUndoMessage')?.textContent||''));
      assert.match(await page.locator('.field[data-key="exame_fisico"] textarea').inputValue(),/BEG/i);
      assert.match(await page.locator('.field[data-key="exame_fisico"] textarea').inputValue(),/AR:/i);
      await page.locator('#nexaQuickUndoBtn').click();
      const examAfterUndo=await page.locator('.field[data-key="exame_fisico"] textarea').inputValue();
      assert.match(examAfterUndo,/BEG/i);assert.doesNotMatch(examAfterUndo,/AR:/i);
      assert.equal(await estadoGeral.isChecked(),true);assert.equal(await ar.isChecked(),false);

      const conductVisibility=await page.evaluate(()=>{
        const el=document.getElementById('toggleConductPickerBtn');
        const chain=[];let n=el;
        while(n&&chain.length<10){
          const cs=getComputedStyle(n),r=n.getBoundingClientRect();
          chain.push({tag:n.tagName,id:n.id||'',className:String(n.className||''),display:cs.display,visibility:cs.visibility,opacity:cs.opacity,width:r.width,height:r.height,hidden:!!n.hidden});
          n=n.parentElement;
        }
        return {phase:document.body.dataset.nexaClinicalPhase||'',flow:document.body.dataset.nexaFlow||'',chain};
      });
      if(!(await page.locator('#toggleConductPickerBtn').isVisible()))console.error('PHASE1_CONDUCT_VISIBILITY',JSON.stringify(conductVisibility));
      assert.equal(await page.locator('#toggleConductPickerBtn').isVisible(),true,'conduct library control must be visible in review phase');
      await page.locator('#toggleConductPickerBtn').click();
      await page.waitForFunction(()=>document.getElementById('conductPickerBody')?.classList.contains('open'));
      await page.locator('#conductSearchInput').fill('orientacao');
      await page.waitForFunction(()=>/Orientação/i.test(document.getElementById('conductList')?.innerText||''));
      await page.locator('#conductSearchInput').fill('hidrat');
      await page.waitForFunction(()=>/hidratação/i.test(document.getElementById('conductList')?.innerText||''));
      await page.locator('#conductSearchInput').fill('retorno piora');
      await page.waitForFunction(()=>document.querySelectorAll('#conductList .conduct-item').length===1);
      const retornoItem=page.locator('#conductList .conduct-item-main').first();
      await retornoItem.click();await retornoItem.click();
      assert.equal((await page.locator('#conductRecordText').inputValue()).match(/retorno imediato/gi)?.length||0,1);
      await page.evaluate(()=>{const el=document.getElementById('conductRecordText');el.value+='\nTEXTO MANUAL POSTERIOR';el.dispatchEvent(new Event('input',{bubbles:true}))});
      await page.locator('#nexaQuickUndoBtn').click();
      const afterLibraryUndo=await page.locator('#conductRecordText').inputValue();
      assert.match(afterLibraryUndo,/TEXTO MANUAL POSTERIOR/);assert.doesNotMatch(afterLibraryUndo,/retorno imediato/i);
      await page.locator('#conductManualInput').fill('Conduta manual QA');await page.locator('#conductManualAddBtn').click();
      assert.match(await page.locator('#conductRecordText').inputValue(),/Conduta manual QA/i);
      await page.locator('#nexaQuickUndoBtn').click();assert.doesNotMatch(await page.locator('#conductRecordText').inputValue(),/Conduta manual QA/i);
      await page.locator('#conductSearchInput').fill('resultado inexistente');
      await page.waitForFunction(()=>/Nenhuma conduta cadastrada encontrada/i.test(document.getElementById('conductList')?.innerText||''));
      assert.equal(await page.locator('#conductManualInput').isVisible(),true);

      await page.evaluate(()=>{const values={queixa_principal:'DOR ABDOMINAL',hda:'DOR HÁ 2 DIAS',antecedentes:'HAS',alergias:'NEGA',comorbidades:'',medicacoes:''};for(const[k,v]of Object.entries(values)){const el=document.querySelector('.field[data-key="'+k+'"] textarea');el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))}});
      const copiedS=await page.evaluate(()=>window.nexaContinuousSoap1811.composeS());
      assert.equal(copiedS,'QP:\nDOR ABDOMINAL\n\nHDA:\nDOR HÁ 2 DIAS\n\nANTECEDENTES:\nHAS\n\nALERGIAS:\nNEGA');
      assert.doesNotMatch(await page.evaluate(()=>window.nexaContinuousSoap1811.composeA()),/CID:/);
      await page.evaluate(()=>window.nexaContinuousSoap1811.setMode('soap'));
      await page.locator('.nexa-flow-copy[data-copy="S"]').click();
      await page.waitForFunction(()=>/^✓ S copiado$/.test(document.getElementById('nexaFlowCopyFeedback')?.textContent||''));
      assert.equal(await page.evaluate(()=>window.__qa.clipboard),copiedS);
      await page.locator('#nexaFlowCopyAll').click();
      const copiedSoap=await page.evaluate(()=>window.__qa.clipboard);
      for(const title of ['S — SUBJETIVO','O — OBJETIVO','A — AVALIAÇÃO','P — PLANO'])assert.match(copiedSoap,new RegExp(title));

      await page.evaluate(b=>{
        for(const[k,v]of Object.entries(b.values)){const el=document.querySelector('.field[data-key="'+k+'"] textarea');if(el){el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))}}
        const q=document.getElementById('conductSearchInput');if(q)q.value='';window.clearLastQuickAction?.();window.nexaContinuousSoap1811.setMode(b.mode);
      },phase1Baseline);
    }

    await page.waitForFunction(count=>window.__qa.consultationRows.filter(r=>r.encounter_state==='ready_for_audit').length>=count,n);
    const id=await page.evaluate(()=>window.nexaEncounterAutosave18101.currentEncounterId());ids.push(id);
    await page.waitForFunction(count=>window.__qa.auditSubmissions.length>=count,n);
    assert.equal(await page.evaluate(()=>new Set(window.__qa.auditSubmissions.map(x=>x.source_consultation_id)).size),n,'Audit submissions must remain idempotent across sequential encounters');

    if(n<3){
      if(n===1&&viewport.width>820){
        await page.evaluate(()=>{
          const spacer=document.createElement('div');spacer.id='nexaClearScrollProbe';spacer.setAttribute('aria-hidden','true');spacer.style.height='1600px';document.body.appendChild(spacer);
          window.scrollTo(0,document.documentElement.scrollHeight);
        });
        await page.waitForFunction(()=>scrollY>100);
        await page.locator('#nfTopClear').click();
        try{
          await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult'&&!document.querySelector('.field[data-key="hda"] textarea')?.value&&scrollY<2);
        }catch(error){
          const diagnostic=await page.evaluate(()=>({
            phase:document.body.dataset.nexaClinicalPhase||'',
            stage:document.body.dataset.nexaStage||'',
            hda:document.querySelector('.field[data-key="hda"] textarea')?.value||'',
            scrollY,
            scrollHeight:document.documentElement.scrollHeight,
            timer:document.getElementById('timer')?.textContent||'',
            recState:document.getElementById('recBtn')?.dataset.recordingState||'',
            status:document.getElementById('status')?.textContent||'',
            scrollCalls:window.__nexaWindowScrollCalls?.slice(-12)||[]
          }));
          console.error('V18122_CLEAR_TOP_DIAGNOSTIC',JSON.stringify(diagnostic));
          console.error('V18122_CLEAR_TOP_PAGE_ERRORS',JSON.stringify(errors));
          throw error;
        }
        assert.ok(await page.evaluate(()=>window.__nexaWindowScrollCalls.some(x=>x&&typeof x==='object'&&x.top===0&&x.behavior==='smooth')),'Limpar consulta must scroll smoothly to the top after reset');
        await page.evaluate(()=>document.getElementById('nexaClearScrollProbe')?.remove());
      }else{
        await page.locator('#resetBtn').evaluate(el=>el.click());
        await page.waitForFunction(()=>document.body.dataset.nexaClinicalPhase==='consult'&&!document.querySelector('.field[data-key="hda"] textarea')?.value);
      }
      assert.equal(await page.locator('#timer').innerText(),'00:00','timer must reset between encounters');
      assert.equal(await page.locator('#recBtn').getAttribute('data-recording-state'),'idle','recorder must reset to idle between encounters');
    }
   }

   assert.equal(new Set(ids).size,3,'Three sequential visits must use three encounter identities');
   assert.equal(await page.evaluate(()=>window.__qa.consultationRows.length),3,'Three sequential visits must persist as three History encounters');
   assert.equal(await page.evaluate(()=>window.__qa.auditSubmissions.length),3,'Three eligible sequential visits must produce three Audit submissions');

   if(viewport.width<=820){
    const mobileHistory='#nexaMobileBottomNav [data-mobile-stage="history"]';
    await page.waitForFunction(sel=>{const el=document.querySelector(sel);return !!el&&getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().width>0},mobileHistory);
    await page.locator(mobileHistory).click();
   }else{
    await page.locator('#nfSide [data-go="history"]').click();
   }
   await page.waitForFunction(()=>document.body.dataset.nexaStage==='history'&&document.getElementById('nexa197History'));
   await page.evaluate(()=>{window.__qa.consultationRows.push({id:'55555555-5555-4555-8555-555555555555',user_id:'qa-physician-a',fields:{queixa_principal:'Atendimento legado QA',hda:'Registro antigo compatível.',hipotese_diagnostica:'Gastroenterite',cid:'A09',conduta:'Orientar hidratação oral'},status:'draft',created_at:new Date().toISOString(),updated_at:new Date().toISOString()});return window.nexaRefreshHistory197?.()});
   await page.waitForFunction(()=>document.querySelectorAll('#n197List .n197-item').length===4);
   assert.match(await page.locator('#n197List').innerText(),/Atendimento legado QA/,'legacy History rows must remain visible alongside Continuous/SOAP encounters');
   const historySearch=page.locator('#n197Search');
   await historySearch.fill('registro antigo');await page.waitForFunction(()=>document.querySelectorAll('#n197List .n197-item').length===1);assert.match(await page.locator('#n197List').innerText(),/Atendimento legado QA/);
   await historySearch.fill('A09');await page.waitForFunction(()=>document.querySelectorAll('#n197List .n197-item').length===1);
   await historySearch.fill('hidratacao');await page.waitForFunction(()=>document.querySelectorAll('#n197List .n197-item').length===1);
   await historySearch.fill('gastroenterite');await page.waitForFunction(()=>document.querySelectorAll('#n197List .n197-item').length===1);
   const todaySearch=await page.evaluate(()=>new Date().toLocaleDateString('pt-BR'));await historySearch.fill(todaySearch);await page.waitForFunction(()=>document.querySelectorAll('#n197List .n197-item').length>=1);
   await historySearch.fill('nao existe 999');await page.waitForFunction(()=>/Nenhum atendimento encontrado para esta busca/i.test(document.getElementById('n197List')?.innerText||''));
   await historySearch.fill('');
   await page.waitForFunction(()=>document.querySelectorAll('#n197List .n197-item').length===4);
   const historyVisible=await page.locator('#nexa197History').isVisible();
   if(!historyVisible){
    const diagnostic=await page.evaluate(()=>{
      const root=document.getElementById('nexa197History'),chain=[];let el=root;
      while(el&&chain.length<10){const s=getComputedStyle(el);chain.push({tag:el.tagName,id:el.id||'',className:el.className||'',display:s.display,visibility:s.visibility,opacity:s.opacity,hidden:!!el.hidden,rect:{w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height}});el=el.parentElement}
      return{stage:document.body.dataset.nexaStage||'',bodyClass:document.body.className,chain};
    });
    console.error('HOTFIX_HISTORY_VISIBILITY_DIAGNOSTIC',JSON.stringify(diagnostic));
   }
   assert.equal(historyVisible,true,'Persistent History must be visible from the History navigation');

   const legacyItem=page.locator('#n197List .n197-item').filter({hasText:'Atendimento legado QA'}).first();
   await legacyItem.locator('button').click();
   await page.waitForFunction(()=>/registro antigo compatível/i.test(document.querySelector('.field[data-key="hda"] textarea')?.value||''));

   if(viewport.width<=820){
    const mobileHistory='#nexaMobileBottomNav [data-mobile-stage="history"]';
    await page.locator(mobileHistory).click();
   }else{
    await page.locator('#nfSide [data-go="history"]').click();
   }
   await page.waitForFunction(()=>document.body.dataset.nexaStage==='history'&&document.getElementById('nexa197History'));
   const structuredItem=page.locator('#n197List .n197-item').filter({hasText:/Cefaleia/i}).first();
   await structuredItem.locator('button').click();
   await page.waitForFunction(()=>/cefaleia/i.test(document.querySelector('.field[data-key="hda"] textarea')?.value||''));

   await page.screenshot({path:path.join(root,'test-results',`clinical-regression-hotfix-${viewport.width}.png`),fullPage:true});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert.ok(overflow<=1,`No horizontal overflow at ${viewport.width}px`);
   assert.deepEqual(errors,[],`No unhandled JavaScript errors at ${viewport.width}px`);
   console.log(`Clinical regression hotfix E2E ${viewport.width}px: PASS`);
   await page.close();
  }
 }finally{await browser?.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
