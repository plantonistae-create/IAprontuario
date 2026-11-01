// Shared fail-closed target validation for synthetic clinical JWT testing.
export const forbiddenRefs=new Set(['phaitiijsjwrggdnoxiz','fmkrcieubrlltiggyauc']);
export function isolatedTarget({ref,url,dbURL,ack,authURL,restURL,functionsURL,localOnly=false}) {
  if(forbiddenRefs.has(ref)||ack!==ref||!ref)
    throw new Error('An acknowledged, separate Supabase project ref is required');
  let api,db;
  try { api=new URL(url); db=new URL(dbURL); } catch { throw new Error('Invalid isolated project URL'); }
  if(ref==='local-nexa-pr92'){
    if(!localOnly||!/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(url)||
       !/^postgres(?:ql)?:\/\/postgres:[^@]+@127\.0\.0\.1:\d+\/postgres$/.test(dbURL)||
       api.protocol!=='http:'||api.hostname!=='127.0.0.1'||
       !/^\d+$/.test(api.port)||api.pathname!=='/'||api.search||api.hash||
       !['postgres:','postgresql:'].includes(db.protocol)||db.hostname!=='127.0.0.1'||
       !/^\d+$/.test(db.port)||db.username!=='postgres'||db.pathname!=='/postgres'||
       db.search||db.hash||!db.password)
      throw new Error('Local test target must use explicit loopback Auth and PostgreSQL');
    if(authURL!==api.origin+'/auth/v1'||restURL!==api.origin+'/rest/v1'||
       functionsURL!==api.origin+'/functions/v1')
      throw new Error('Local Auth, REST and Functions must share the loopback gateway');
    return {ref,api:api.origin,dbURL,local:true};
  }
  if(localOnly||!/^[a-z]{20}$/.test(ref))throw new Error('Remote projects are disabled in local mode');
  if(api.origin!==`https://${ref}.supabase.co`||api.pathname!=='/'||api.search||api.hash)
    throw new Error('Auth URL is not the acknowledged isolated project');
  if(!['postgres:','postgresql:'].includes(db.protocol)||
      !(db.hostname===`db.${ref}.supabase.co` ||
        (db.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(db.username)===`postgres.${ref}`)))
    throw new Error('Database URL is not the acknowledged isolated project');
  if(!db.password||!decodeURIComponent(db.pathname.slice(1)))throw new Error('Incomplete isolated DB URL');
  return {ref,api:api.origin,dbURL,local:false};
}
