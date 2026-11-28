// S7.1 LAB ONLY — no production deploy; GET-only static origin, no proxy.
// Node >=22; explicit trusted local TLS certificate and isolated hostname/IP required.
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),net=require('node:net');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const env=process.env,host=env.NEXA_S71_BIND||'127.0.0.1',port=Number(env.NEXA_S71_PORT||8443);
const name=env.NEXA_S71_HOST||'localhost';
const private4=s=>/^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(s)&&net.isIP(s)===4;
if(!private4(host)||!Number.isInteger(port)||port<1024||port>65535||
 !(name==='localhost'||private4(name)||/^[a-z0-9-]+\.test$/.test(name))||
 (host!=='127.0.0.1'&&env.NEXA_S71_LAN_ACK!=='synthetic-only-private-lan'))throw Error('S71_PRIVATE_ORIGIN_REQUIRED');
if(!env.NEXA_S71_TLS_CERT||!env.NEXA_S71_TLS_KEY)throw Error('S71_TRUSTED_LOCAL_TLS_REQUIRED');
const allowedHost=name+':'+port;
const source=rel=>fs.readFileSync(path.join(root,rel),'utf8');
function replaceExactly(s,from,to){assert.equal(s.split(from).length,2,'S71_PINNED_ANCHOR_MISMATCH');return s.replace(from,to)}
const pilot=require('../../tests/helpers/pilot.cjs');
let fixture=source('tests/browser-fixture.js');
// Owner is a synthetic A/B selector persisted in sessionStorage; not a real auth mechanism.
fixture=replaceExactly(fixture,"let session={access_token:'synthetic-token',user:{id:'aaaaaaaa-0000-4000-8000-0000000000a1'", "let session={access_token:'synthetic-token',user:{id:sessionStorage.getItem('nexa-s71-owner')==='B'?'bbbbbbbb-0000-4000-8000-0000000000b1':'aaaaaaaa-0000-4000-8000-0000000000a1'");
fixture=replaceExactly(fixture,'}return nativeFetch(input,init);','}throw new Error("S71_NON_FIXTURE_NETWORK_BLOCKED");');
let html=source('index.html');
html=pilot.apply(html,{ids:[pilot.A,pilot.B],mode:'on'});
html=replaceExactly(html,"const SUPABASE_URL='https://fmkrcieubrlltiggyauc.supabase.co';","const SUPABASE_URL='https://synthetic.supabase.co';");
const keyPattern=/const SUPABASE_ANON_KEY='[^']+';/g;
assert.equal([...html.matchAll(keyPattern)].length,1);
html=html.replace(keyPattern,"const SUPABASE_ANON_KEY='synthetic-only';");
const externalScript=/<script\b[^>]*src=["']https:\/\/[^"']+["'][^>]*>\s*<\/script>/gi;
html=html.replace(externalScript,'');
html=html.replace(/<link\b[^>]*rel=["']manifest["'][^>]*>/gi,'');
html=replaceExactly(html,"window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('NEXA SW',err)));","/* S71: service worker deliberately disabled in this first physical browser fixture. */");
assert(html.includes('assistAuthority:false,remotePreservation:false')&&html.includes('audioRetention:{enabled:false,days:7}'));
html=replaceExactly(html,'<head>','<head><script src="/__s71/fixture.js"></script><script defer src="/__s71/panel.js"></script>');
html=html.replace(/<title>[^<]*<\/title>/i,'<title>NEXA S7.1 — SOMENTE TESTE SINTÉTICO</title>');
// Instrument only the served vault copy. Never edit the real vault. The append receipt remains the original result.
let vault=source('nexa-audio-checkpoint-p0.js');
vault=replaceExactly(vault,'Object.freeze({begin,append,recover,finalize,listOwned,chunkBuffers,usage,requestPersistence,purge,','Object.freeze({begin,append:async(args)=>{const result=await append(args);try{await window.__s71RecordAck?.(args,result)}catch{window.__s71EvidenceFailed=true}return result},recover,finalize,listOwned,chunkBuffers,usage,requestPersistence,purge,');
const assets=new Set(["apple-touch-icon.png","favicon-64.png","icon-192.png","icon-512.png","nexa-admin-preservation-v525.js","nexa-admin-users-slots-functional-guard-v18.9.18.js","nexa-approved-ui-v15.js","nexa-assist-authority-v514.js","nexa-audio-backup-queue-v514.js","nexa-audio-checkpoint-p0.js","nexa-audio-storage-v524.js","nexa-audit-autosave-v18.5.js","nexa-audit-clear-safety-v18.9.5.js","nexa-audit-functional-guard-v18.9.16.js","nexa-audit-outbox-v18.9.19.js","nexa-audit-supabase-compat-v18.9.16.js","nexa-audit-ui-integrity-v18.9.16.js","nexa-auditor-exact-v18.9.js","nexa-auditor-functional-v18.9.1.js","nexa-auditor-mobile-fix-v18.7.1.js","nexa-auditor-mobile-guard-v9.js","nexa-auditor-native-v18.8.js","nexa-auditor-panel-queue-v18.9.2.js","nexa-auditor-workspace-v18.7.js","nexa-auth-rescue-v13.js","nexa-auth-session-v1.css","nexa-auth-session-v1.js","nexa-capture-v516.js","nexa-clean-ui-v6.js","nexa-clean-ui-v7.js","nexa-clinical-plan-guard-v18.9.12.js","nexa-conduct-state-guard-v18.9.13.js","nexa-continuous-soap-v18.11.js","nexa-core-audit-learning-v2.js","nexa-core-radar-review-v3.css","nexa-core-radar-review-v3.js","nexa-desktop-layout-v12.js","nexa-desktop-mockup-v11.js","nexa-desktop-stability-v10.js","nexa-destination-advisory-guard-v18.9.14.js","nexa-destination-flow-v18.9.15.js","nexa-encounter-autosave-v18.10.1.js","nexa-encounter-conflicts-v18.10.2.js","nexa-final-ui-v18.js","nexa-gap-selfheal-v18.6.2.js","nexa-history-lifecycle-v18.6.9.js","nexa-history-native-v18.9.5.js","nexa-history-recovery-v1.js","nexa-history-style-audit-v18.9.7.js","nexa-history-style-v18.9.6.js","nexa-hotfix-v1.js","nexa-hotfix.js","nexa-hypothesis-cid-guard-v18.9.11.js","nexa-icon-1024.png","nexa-layout-flow-v18.1.js","nexa-layout-flow-v18.5.js","nexa-layout-flow-v18.6.js","nexa-layout-static-v18.6.5.js","nexa-medical-layout-state-v18.9.3.js","nexa-mobile-flow-v18.8.1.js","nexa-mobile-order-v6.js","nexa-mobile-safe-area-v18.6.8.js","nexa-mobile-shell-v18.6.7.js","nexa-mobile-top-safe-v18.8.js","nexa-mobile-viewport-fix-v8.js","nexa-parity-v17-hotfix.js","nexa-parity-v17.js","nexa-password-onboarding-v1.js","nexa-preservation-adapters-v523.js","nexa-protocol-functional-guard-v18.9.17.js","nexa-protocol-library-v18.10.1.js","nexa-radar-auto-review-v18.12.js","nexa-radar-capture-v524.js","nexa-radar-controller.js","nexa-radar-dynamic-focus-v18.16.css","nexa-radar-dynamic-focus-v18.16.js","nexa-radar-engine.js","nexa-radar-ps-mode-v18.14.js","nexa-radar-stable-state-v18.9.4.js","nexa-radar-state-bridge-v18.9.9.js","nexa-radar-v4.js","nexa-radar-visual-flow-v18.13.js","nexa-radar.css","nexa-record-draft-history-v18.6.6.js","nexa-recorder-layout-v18.12.4.js","nexa-recording-timer-state-v18.9.8.js","nexa-role-mobile-v4.js","nexa-runtime-consolidated-v14.js","nexa-shell-v5.js","nexa-sic-documentation-rule-v18.9.8.js","nexa-storage-risk-v528.js","nexa-summary-state-guard-v18.9.10.js","nexa-transcript-v524.js","nexa-ui-v3.js"]);
const special=new Map([['/index.html',html],['/__s71/fixture.js',fixture],['/__s71/panel.js',source('labs/nexa-s71/panel.LAB-ONLY.js')],['/nexa-audio-checkpoint-p0.js',vault]]);
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
const server=https.createServer({cert:fs.readFileSync(env.NEXA_S71_TLS_CERT),key:fs.readFileSync(env.NEXA_S71_TLS_KEY),minVersion:'TLSv1.2'},(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
 res.setHeader('Permissions-Policy','microphone=(self), camera=(), geolocation=()');
 res.setHeader('Referrer-Policy','no-referrer');
 if(req.headers.host!==allowedHost||req.method!=='GET'){res.writeHead(403).end();return}
 const raw=req.url.split('?')[0],p=raw==='/'?'/index.html':raw;
 if(!special.has(p)&&!assets.has(p.slice(1))){res.writeHead(404).end();return}
 try{
  const body=special.has(p)?special.get(p):fs.readFileSync(path.join(root,p.slice(1)));
  res.setHeader('Content-Type',types[path.extname(p)]||'application/octet-stream');res.end(body);
 }catch{res.writeHead(404).end()}
});
server.listen(port,host,()=>console.log('S71 SYNTHETIC ONLY https://'+allowedHost+'/ (no proxy, no real data; keep origin stable for reload)'));
