/* NEXA production hotfix · 2026-09-03
   Radar vivo + controles compactos + recuperação segura do gravador. */
(() => {
  'use strict';
  const HOTFIX_VERSION = '2026.09.03-radar-rec-v1';
  if (window.__NEXA_RADAR_REC_HOTFIX__ === HOTFIX_VERSION) return;
  window.__NEXA_RADAR_REC_HOTFIX__ = HOTFIX_VERSION;

  const byId = id => document.getElementById(id);
  const norm = value => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();

  const STOP = new Set(('a o os as um uma uns umas de da do das dos e ou em no na nos nas por para com sem que qual quais quem ' +
    'quando onde como se ao aos voce voces paciente houve tem teve esta estão estava foram foi ser estar ainda mais menos ' +
    'durante agora atual atualmente consegue conseguindo algum alguma').normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/\s+/));
  const SYN = new Map([
    ['pescoco','cervical'],['cervical','cervical'],['andar','marcha'],['caminhar','marcha'],['marcha','marcha'],
    ['formigamento','parestesia'],['dormencia','parestesia'],['parestesia','parestesia'],['forca','motora'],['fraqueza','motora'],
    ['voz','fala'],['falar','fala'],['fala','fala'],['engolir','degluticao'],['deglutir','degluticao'],['degluticao','degluticao'],
    ['urina','miccao'],['urinar','miccao'],['miccao','miccao'],['fezes','evacuacao'],['evacuar','evacuacao'],['queda','trauma'],
    ['impacto','trauma'],['trauma','trauma'],['dor','dor'],['febre','febre'],['vomito','vomito'],['vomitos','vomito']
  ]);
  const tokens = value => {
    const out = [];
    for (const raw of norm(value).split(' ')) {
      if (!raw || raw.length < 3 || STOP.has(raw)) continue;
      out.push(SYN.get(raw) || raw);
    }
    return [...new Set(out)];
  };
  const similarity = (a,b) => {
    const A = new Set(tokens(a)), B = new Set(tokens(b));
    if (!A.size || !B.size) return 0;
    let hit = 0; A.forEach(x => B.has(x) && hit++);
    return hit / Math.max(1, Math.min(A.size, B.size));
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function installStyles(){
    if (byId('nexaRadarRecHotfixStyle')) return;
    const style = document.createElement('style');
    style.id = 'nexaRadarRecHotfixStyle';
    style.textContent = `
      .panel-left .card.rec-zone{position:absolute!important;left:-10000px!important;top:auto!important;width:1px!important;height:1px!important;overflow:hidden!important;padding:0!important;margin:0!important;border:0!important;box-shadow:none!important}
      .nexa-desktop-session-actions{display:flex!important;align-items:center!important;gap:7px!important;flex-wrap:nowrap!important}
      .nexa-desktop-session-actions #nexaDesktopPause{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;min-height:36px!important;padding:7px 11px!important;border-radius:10px!important;white-space:nowrap!important}
      .nexa-desktop-session-actions #nexaDesktopFinish{min-height:36px!important;padding:7px 10px!important;border-radius:10px!important;white-space:nowrap!important}
      #nexaTopReset{width:36px!important;height:36px!important;min-width:36px!important;padding:0!important;border:1px solid var(--hair)!important;border-radius:10px!important;background:var(--surface)!important;color:var(--danger)!important;font-size:16px!important;display:grid!important;place-items:center!important}
      #nexaTopReset:hover{background:var(--dangerSoft)!important}
      .nexa-top-consent{display:flex!important;align-items:center!important;gap:5px!important;margin:0!important;padding:0 7px!important;min-height:34px!important;border:1px solid var(--hair)!important;border-radius:9px!important;background:var(--surface2)!important;white-space:nowrap!important;cursor:pointer!important}
      .nexa-top-consent input{width:auto!important;margin:0!important}
      .nexa-top-consent span{font-size:10px!important;color:var(--muted)!important}
      .nexa-record-live-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#d83b3b;box-shadow:0 0 0 3px color-mix(in srgb,#d83b3b 14%,transparent);animation:nexaRecPulse 1.25s ease-in-out infinite}
      @keyframes nexaRecPulse{0%,100%{opacity:.55}50%{opacity:1}}
      #nexaRadarResetBtn{display:none!important}
      .nexa-stage-view #resetBtn{display:none!important}
      .radar-question{transition:.22s ease}
      .radar-question.nexa-question-done{border-color:color-mix(in srgb,var(--accent) 38%,var(--hair))!important;background:color-mix(in srgb,var(--soft) 70%,var(--surface))!important;color:var(--accent)!important}
      .radar-question.nexa-question-done .nexa-question-dot{display:grid!important;place-items:center!important;background:var(--accent)!important;color:#fff!important;font-size:9px!important}
      .radar-question.nexa-question-done .nexa-question-dot:after{content:'✓'}
      .nexa-question-status{display:block;font-size:9px;color:var(--accent);font-weight:800;margin-top:2px;letter-spacing:.02em}
      .nexa-radar-done-title{font-size:9px;font-weight:850;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:9px 0 5px}
      .nexa-radar-recent-done{display:grid;gap:5px;opacity:.86}
      .nexa-radar-recent-done .radar-question{padding-top:7px!important;padding-bottom:7px!important}
      .nexa-top-recording{border-color:color-mix(in srgb,#d83b3b 40%,var(--hair))!important;background:color-mix(in srgb,#d83b3b 5%,var(--surface))!important;color:#a62f3c!important}
      @media(max-width:900px){
        .nexa-top-consent span{display:none!important}.nexa-top-consent{padding:0 8px!important}
        .nexa-desktop-session-actions{gap:5px!important}
        .nexa-desktop-session-actions #nexaDesktopPause{padding:7px 9px!important}
      }
      @media(max-width:620px){
        #nexaTopReset{width:34px!important;height:34px!important;min-width:34px!important}
        .nexa-desktop-session-actions #nexaDesktopPause{font-size:0!important}
        .nexa-desktop-session-actions #nexaDesktopPause .nexa-hotfix-record-label{font-size:11px!important}
      }
    `;
    document.head.appendChild(style);
  }

  function compactConsentAndActions(){
    const actions = document.querySelector('.nexa-desktop-session-actions');
    const consent = byId('consent');
    if (!actions) return;
    if (consent) {
      const row = consent.closest('.consent-row');
      const card = row?.closest('.card');
      if (row && !row.classList.contains('nexa-top-consent')) {
        const span = row.querySelector('span');
        if (span) {
          span.title = span.textContent.trim();
          span.textContent = 'Consentimento';
        }
        row.classList.add('nexa-top-consent');
        actions.insertBefore(row, actions.firstChild);
      }
      if (card) card.style.display = 'none';
    }
    if (!byId('nexaTopReset')) {
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.id = 'nexaTopReset';
      reset.title = 'Limpar consulta';
      reset.setAttribute('aria-label','Limpar consulta');
      reset.textContent = '⌫';
      reset.addEventListener('click', () => {
        const legacy = byId('resetBtn');
        if (!legacy) return;
        if (typeof legacy.onclick === 'function') legacy.onclick.call(legacy);
        else legacy.click();
        setTimeout(() => {
          const meaningful = [...document.querySelectorAll('textarea')].some(el => String(el.value || '').trim()) ||
            [...document.querySelectorAll('.conduct-template-check:checked')].length > 0;
          if (!meaningful) {
            try { if (typeof nexaClearPersistedSession === 'function') nexaClearPersistedSession(); } catch(_) {}
          }
          refreshRecordingControls();
        }, 40);
      });
      actions.appendChild(reset);
    }
  }

  let startInFlight = false;
  async function releaseStaleRecorder(){
    try { if (typeof stopRealtimeRadar === 'function') stopRealtimeRadar({wipe:true}); } catch(_) {}
    try { if (typeof stopRecordingTimer === 'function') stopRecordingTimer({reset:false}); } catch(_) {}
    try {
      if (typeof mediaRecorder !== 'undefined' && mediaRecorder && mediaRecorder.state !== 'inactive') {
        try { discardStoppedRecording = true; } catch(_) {}
        const recorder = mediaRecorder;
        await new Promise(resolve => {
          recorder.addEventListener?.('stop', resolve, {once:true});
          try { recorder.stop(); } catch(_) { resolve(); }
          setTimeout(resolve, 400);
        });
      }
    } catch(_) {}
    try { if (typeof stream !== 'undefined' && stream) stream.getTracks().forEach(t => { try{t.stop()}catch(_){}}); } catch(_) {}
    try { if (typeof audioCtx !== 'undefined' && audioCtx && audioCtx.state !== 'closed') await audioCtx.close(); } catch(_) {}
    try { if (typeof raf !== 'undefined') cancelAnimationFrame(raf); } catch(_) {}
    try { recording = false; } catch(_) {}
    try { mediaRecorder = null; } catch(_) {}
    try { stream = null; } catch(_) {}
    try { audioCtx = null; } catch(_) {}
    try { analyser = null; dataArray = null; } catch(_) {}
    try { chunks = []; audioBlob = null; } catch(_) {}
    try { discardStoppedRecording = false; } catch(_) {}
    const rec = byId('recBtn');
    if (rec) {
      rec.classList.remove('recording');
      const consent = byId('consent');
      rec.disabled = !!consent && !consent.checked;
    }
    const circle = byId('circleShape'), stop = byId('stopShape');
    if (circle) circle.style.display = '';
    if (stop) stop.style.display = 'none';
  }

  function installRecorderRecovery(){
    let original = null;
    try { if (typeof startRec === 'function') original = startRec; } catch(_) {}
    if (!original || original.__nexaRecoveredStart) return;
    const recoveredStart = async function(...args){
      if (startInFlight) return;
      startInFlight = true;
      try {
        let active = false;
        try { active = !!recording; } catch(_) {}
        if (!active) await releaseStaleRecorder();
        return await original.apply(this,args);
      } catch (err) {
        console.error('[NEXA] Falha ao reiniciar gravação', err);
        await releaseStaleRecorder();
        try { if (typeof show === 'function') show('Não foi possível reiniciar a gravação. O gravador foi recuperado; tente novamente.', true); } catch(_) {}
      } finally {
        startInFlight = false;
        setTimeout(refreshRecordingControls, 20);
      }
    };
    recoveredStart.__nexaRecoveredStart = true;
    try { startRec = recoveredStart; } catch(_) { return; }
    const top = byId('nexaDesktopPause');
    if (top && !top.dataset.nexaRecoveryBound) {
      top.dataset.nexaRecoveryBound = '1';
      top.addEventListener('click', e => {
        let active = false, blob = null;
        try { active = !!recording; } catch(_) {}
        try { blob = audioBlob; } catch(_) {}
        if (active || blob) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const consent = byId('consent');
        if (consent && !consent.checked) {
          try { if (typeof show === 'function') show('Confirme o consentimento antes de iniciar a gravação.', true); } catch(_) {}
          return;
        }
        recoveredStart();
      }, true);
    }
  }

  function recordingSnapshot(){
    let active = false, paused = false, secs = 0, blob = null;
    try { active = !!recording; } catch(_) {}
    try { paused = !!mediaRecorder && mediaRecorder.state === 'paused'; } catch(_) {}
    try { secs = Number(seconds || 0); } catch(_) {}
    try { blob = audioBlob; } catch(_) {}
    return {active,paused,secs,blob};
  }
  const fmtTime = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.max(0,s)%60).padStart(2,'0')}`;
  function refreshRecordingControls(){
    const top = byId('nexaDesktopPause'), finish = byId('nexaDesktopFinish');
    if (!top) return;
    const s = recordingSnapshot();
    if (s.active) {
      top.classList.add('nexa-top-recording');
      top.innerHTML = `<span class="nexa-record-live-dot"></span><span class="nexa-hotfix-record-label">${s.paused?'Retomar':'Pausar'} · ${fmtTime(s.secs)}</span>`;
      if (finish) { finish.style.display = ''; finish.disabled = false; }
    } else if (s.blob) {
      top.classList.remove('nexa-top-recording');
      top.innerHTML = '<span class="nexa-hotfix-record-label">✓ Gravação concluída</span>';
      if (finish) { finish.style.display = 'none'; finish.disabled = true; }
    } else {
      top.classList.remove('nexa-top-recording');
      top.innerHTML = '<span aria-hidden="true">🎙</span><span class="nexa-hotfix-record-label">Iniciar gravação</span>';
      if (finish) { finish.style.display = 'none'; finish.disabled = true; }
    }
  }

  const questionLedger = new Map();
  let renderGeneration = 0;
  function bestExisting(question){
    let best = null, score = 0;
    for (const entry of questionLedger.values()) {
      const s = similarity(entry.text, question);
      if (s > score) { score=s; best=entry; }
    }
    return score >= .58 ? best : null;
  }
  function transcriptSize(){
    try { return String((realtimeTranscript||'') + ' ' + (realtimeTranscriptDelta||'')).trim().length; } catch(_) { return 0; }
  }
  function coveredSupports(question, covered){
    if (!covered?.length) return false;
    return covered.some(x => similarity(question,x) >= .34);
  }
  function installRadarLedger(){
    let original = null;
    try { if (typeof radarRender === 'function') original = radarRender; } catch(_) {}
    if (!original || original.__nexaLedgerRender) return;
    const wrapped = function(data){
      const now = Date.now();
      const chars = transcriptSize();
      const questions = Array.isArray(data?.questions) ? data.questions.filter(Boolean).slice(0,8) : [];
      const covered = Array.isArray(data?.covered) ? data.covered : [];
      renderGeneration++;
      const presentEntries = new Set();
      for (const question of questions) {
        let entry = bestExisting(question);
        if (!entry || entry.status === 'done') {
          entry = {id:`q${renderGeneration}-${Math.random().toString(36).slice(2,7)}`,text:String(question),status:'pending',firstChars:chars,lastChars:chars,lastSeen:now,doneAt:0};
          questionLedger.set(entry.id,entry);
        } else {
          entry.text = String(question);
          entry.lastChars = chars;
          entry.lastSeen = now;
          entry.status = 'pending';
        }
        presentEntries.add(entry.id);
      }
      for (const entry of questionLedger.values()) {
        if (entry.status !== 'pending' || presentEntries.has(entry.id)) continue;
        const conversationAdvanced = chars - entry.lastChars >= 18;
        const backendCoverage = coveredSupports(entry.text,covered);
        const wasVisibleLongEnough = now - entry.lastSeen >= 1500 || chars - entry.firstChars >= 35;
        if (wasVisibleLongEnough && (conversationAdvanced || backendCoverage)) {
          entry.status = 'done';
          entry.doneAt = now;
        } else if (now - entry.lastSeen > 30000) {
          questionLedger.delete(entry.id);
        }
      }
      const result = original.apply(this,arguments);
      const host = byId('radarQuestions');
      if (!host) return result;
      const pending = [...questionLedger.values()].filter(x=>x.status==='pending').sort((a,b)=>b.lastSeen-a.lastSeen).slice(0,4);
      const done = [...questionLedger.values()].filter(x=>x.status==='done' && now-x.doneAt<18000).sort((a,b)=>b.doneAt-a.doneAt).slice(0,3);
      let html = pending.length
        ? pending.map(x=>`<div class="radar-question"><span class="nexa-question-dot"></span><span>${esc(x.text)}</span></div>`).join('')
        : '<div class="radar-empty">Nenhuma pergunta adicional prioritária.</div>';
      if (done.length) {
        html += `<div class="nexa-radar-done-title">Respondidas / esclarecidas</div><div class="nexa-radar-recent-done">` +
          done.map(x=>`<div class="radar-question nexa-question-done"><span class="nexa-question-dot"></span><span>${esc(x.text)}<small class="nexa-question-status">✓ esclarecida durante a conversa</small></span></div>`).join('') +
          '</div>';
      }
      host.innerHTML = html;
      return result;
    };
    wrapped.__nexaLedgerRender = true;
    try { radarRender = wrapped; } catch(_) {}
  }

  function bindResetCleanup(){
    const reset = byId('resetBtn');
    if (!reset || reset.dataset.nexaHotfixReset) return;
    reset.dataset.nexaHotfixReset='1';
    reset.addEventListener('click',()=>{
      questionLedger.clear();
      setTimeout(refreshRecordingControls,30);
    });
  }

  function init(){
    installStyles();
    compactConsentAndActions();
    installRecorderRecovery();
    installRadarLedger();
    bindResetCleanup();
    refreshRecordingControls();
    setInterval(refreshRecordingControls, 500);
    console.info('[NEXA] Hotfix ativo:',HOTFIX_VERSION);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
