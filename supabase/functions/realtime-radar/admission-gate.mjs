// Not wired into the Edge runtime; an isolate-local proof is NOT a global rate limit.
const sha=/^[a-f0-9]{64}$/;
export function createRadarAdmissionGate({perUser=6,perTenant=60,perEncounter=24,windowMs=60000,maxSlots=2000,now=()=>Date.now()}={}){
 if(![perUser,perTenant,perEncounter,windowMs,maxSlots].every(n=>Number.isSafeInteger(n)&&n>=1)||
    maxSlots>20000||windowMs>86400000||typeof now!=='function')throw Error('BUDGET_CONFIG_INVALID');
 const map=new Map();
 return {admit({kind='remote',userKey,tenantKey,encounterKey}={}){
   if(kind==='visual'||kind==='status')return {allowed:true,remoteCall:false,reason:'LOCAL_ONLY'};
   if(kind!=='remote'||![userKey,tenantKey,encounterKey].every(s=>typeof s==='string'&&sha.test(s)))throw Error('BUDGET_INPUT_INVALID');
   const t=now();if(!Number.isSafeInteger(t)||t<0)throw Error('BUDGET_CLOCK_INVALID');
   const refs=[['user:'+userKey,perUser],['tenant:'+tenantKey,perTenant],['encounter:'+encounterKey,perEncounter]];
   const rows=refs.map(([key,limit])=>{
     const old=map.get(key),valid=old&&t>=old.start&&t-old.start<windowMs;
     return {key,limit,data:valid?old:{start:t,count:0}};
   });
   if(rows.some(x=>x.data.count>=x.limit))return {allowed:false,remoteCall:false,reason:'BUDGET_LIMIT'};
   if(map.size+rows.filter(x=>!map.has(x.key)).length>maxSlots)return {allowed:false,remoteCall:false,reason:'BUDGET_CAPACITY'};
   for(const x of rows)map.set(x.key,{start:x.data.start,count:x.data.count+1});
   return {allowed:true,remoteCall:true,reason:'ADMITTED'};
 }};
}
