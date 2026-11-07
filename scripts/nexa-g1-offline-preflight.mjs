// G1 preparation only: pure in-memory, fail-closed isolation manifest preflight.
// Never authenticates, makes HTTP requests, reads environment variables or creates resources.
// Passing this preflight NEVER authorizes G1 login, G2 upstream, G3 clinical review or G4 deploy.
import { fileURLToPath } from 'node:url';

export const PINNED_G1 = Object.freeze({
  main: 'cb95e0e19dcc9d81947e791ff5d10537104d0686',
  pr133: '3e05d7606860b3badbe9811b9ee2c0c7703e958a',
  hostedVersion: 6,
  hostedSha256: '1675c95f6b1a25569c6af86e5c461f05fd475ee0d8a759439631d2d56221e005',
});
const forbiddenRefs = ['fmkrcieubrlltiggyauc','phaitiijsjwrggdnoxiz'];
const groups = Object.freeze({
  repository:['main','pr133','prDraft'],
  hosted:['version','verifyJwt','bundleSha256','modified'],
  isolation:['kind','origin','ephemeral','networkDisabled','remoteProject'],
  privacy:['syntheticOnly','patientData','audioCapture','transcriptsStored','requestBodyLogging','metadataOnlyLogs'],
  credentials:['configured','readEnvironment','adminAccess'],
  actions:['login','makeRequest','upstream','writeDatabase','createResources','microphone','merge','deploy','changeJwtOrRls','paidRequests'],
  approvals:['g1','g2','g3','g4'],
});
function plain(o){return o!==null&&typeof o==='object'&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype;}
function schemaErrors(plan){
  if(!plain(plan))return ['PLAN_REQUIRED'];
  const errors=[];
  for(const key of Object.keys(plan)){if(!Object.hasOwn(groups,key))errors.push('UNEXPECTED_TOP_LEVEL_FIELD');}
  for(const [group,keys] of Object.entries(groups)){
    const section=plan[group];
    if(!plain(section)){errors.push('MISSING_'+group.toUpperCase());continue;}
    for(const key of Object.keys(section))if(!keys.includes(key))errors.push('UNEXPECTED_'+group.toUpperCase()+'_FIELD');
    for(const key of keys)if(!Object.hasOwn(section,key))errors.push('MISSING_'+group.toUpperCase()+'_FIELD');
  }
  return errors;
}
function containsForbiddenReference(input){
  if(typeof input==='string'){
    const v=input.toLowerCase();
    return forbiddenRefs.some(ref=>v.includes(ref))||/\b(?:service_role|supabase_access_token|bearer\s+[a-z0-9])/i.test(v);
  }
  if(Array.isArray(input))return input.some(containsForbiddenReference);
  if(plain(input))return Object.entries(input).some(([key,value])=>containsForbiddenReference(key)||containsForbiddenReference(value));
  return false;
}
function loopbackOrigin(value){
  if(typeof value!=='string')return false;
  try{
    const u=new URL(value);
    return u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)
      &&!!u.port&&u.username===''&&u.password===''&&u.pathname==='/'&&u.search===''&&u.hash==='';
  }catch{return false;}
}
export function assessG1OfflineReadiness(plan){
  const reasons=schemaErrors(plan);
  if(containsForbiddenReference(plan))reasons.push('PRODUCTION_OR_SECRET_REFERENCE');
  if(reasons.length===0){
    const {repository:r,hosted:h,isolation:i,privacy:p,credentials:c,actions:a,approvals:v}=plan;
    if(r.main!==PINNED_G1.main||r.pr133!==PINNED_G1.pr133||r.prDraft!==true)reasons.push('SOURCE_NOT_PINNED_DRAFT');
    if(h.version!==PINNED_G1.hostedVersion||h.bundleSha256!==PINNED_G1.hostedSha256||h.verifyJwt!==true||h.modified!==false)reasons.push('HOSTED_V6_INTEGRITY_REQUIRED');
    if(i.kind!=='local-preview'||!loopbackOrigin(i.origin)||i.ephemeral!==true||i.networkDisabled!==true||i.remoteProject!==false)reasons.push('NOT_ISOLATED_OFFLINE');
    if(p.syntheticOnly!==true||p.patientData!==false||p.audioCapture!==false||p.transcriptsStored!==false||p.requestBodyLogging!==false||p.metadataOnlyLogs!==true)reasons.push('PRIVACY_POLICY_REQUIRED');
    if(c.configured!==false||c.readEnvironment!==false||c.adminAccess!==false)reasons.push('CREDENTIALS_FORBIDDEN');
    if(Object.entries(a).some(([key,value])=>key==='paidRequests'?value!==0:value!==false))reasons.push('OPERATION_FORBIDDEN');
    if(Object.values(v).some(value=>value!==false))reasons.push('AUTHORIZATION_NOT_GRANTED');
  }
  const blockers=[...new Set(reasons)].sort();
  return Object.freeze({
    check:'G1_OFFLINE_PREPARATION_ONLY',
    result:blockers.length?'STOP':'OFFLINE_PREFLIGHT_PASS',
    blockers:Object.freeze(blockers),
    gates:Object.freeze({g0:'DOCUMENTED',g1:'BLOCKED_NOT_AUTHENTICATED',g2:'NO_GO',g3:'NO_GO',g4:'NO_GO'}),
    networkCalled:false,authenticated:false,upstreamValidated:false,productionChanged:false,
    authorizationGranted:false,costSavingsUsdProven:false,
  });
}
export const OFFLINE_ONLY_EXAMPLE=Object.freeze({
  repository:{main:PINNED_G1.main,pr133:PINNED_G1.pr133,prDraft:true},
  hosted:{version:6,verifyJwt:true,bundleSha256:PINNED_G1.hostedSha256,modified:false},
  isolation:{kind:'local-preview',origin:'http://127.0.0.1:4173',ephemeral:true,networkDisabled:true,remoteProject:false},
  privacy:{syntheticOnly:true,patientData:false,audioCapture:false,transcriptsStored:false,requestBodyLogging:false,metadataOnlyLogs:true},
  credentials:{configured:false,readEnvironment:false,adminAccess:false},
  actions:{login:false,makeRequest:false,upstream:false,writeDatabase:false,createResources:false,microphone:false,merge:false,deploy:false,changeJwtOrRls:false,paidRequests:0},
  approvals:{g1:false,g2:false,g3:false,g4:false},
});
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  // Only a local example; this does not inspect or provision a real environment.
  console.log(JSON.stringify(assessG1OfflineReadiness(OFFLINE_ONLY_EXAMPLE),null,2));
}
