// Synthetic transaction model: tests design invariants, NOT Postgres concurrency.
// Do not import this into the Edge runtime or use with patient data.
export function createQuotaModel({memberships=[],tenants={},encounters=[],clock=()=>0}={}){
 const requests=new Map(),queue=new Map(),history=[];
 const membership=new Set(memberships),encounterOwners=new Set(encounters);
 const name=x=>typeof x==='string'&&/^[a-z][a-z0-9_-]{2,35}$/.test(x);
 async function admit({user,tenant,encounter,request,input,output}={}){
  if(![user,tenant,encounter,request].every(name)||!Number.isSafeInteger(input)||input<1||
     !Number.isSafeInteger(output)||output<1)throw Error('INVALID_ADMISSION');
  const previous=queue.get(tenant)||Promise.resolve();
  const job=previous.catch(()=>{}).then(()=>{
   const key=tenant+'|'+user,subject=tenant+'|'+user+'|'+encounter;
   if(!membership.has(key))return {allowed:false,reason:'TENANT_NOT_VERIFIED'};
   if(!encounterOwners.has(subject))return {allowed:false,reason:'ENCOUNTER_NOT_OWNED'};
   const cfg=tenants[tenant];if(!cfg)return {allowed:false,reason:'BUDGET_NOT_CONFIGURED'};
   const prior=requests.get(request);
   if(prior)return prior.subject===subject&&prior.input===input&&prior.output===output?
    {allowed:true,reason:'ALREADY_RESERVED'}:{allowed:false,reason:'IDEMPOTENCY_CONFLICT'};
   if(input>cfg.maxInput||output>cfg.maxOutput)return {allowed:false,reason:'PER_CALL_TOKEN_CAP'};
   const start=Math.floor(clock()/60000),recent=history.filter(x=>x.tenant===tenant&&x.minute===start);
   const all=history.filter(x=>x.subject===subject);
   if(recent.length>=cfg.tenantPerMinute||recent.filter(x=>x.user===user).length>=cfg.userPerMinute||
      recent.filter(x=>x.subject===subject).length>=cfg.encounterPerMinute||
      all.reduce((sum,x)=>sum+x.input+x.output,0)+input+output>cfg.encounterTokens)
      return {allowed:false,reason:'BUDGET_EXCEEDED'};
   history.push({tenant,user,subject,minute:start,input,output});
   requests.set(request,{subject,input,output});
   return {allowed:true,reason:'RESERVED'};
  });
  queue.set(tenant,job);return job;
 }
 return Object.freeze({admit,count:()=>history.length});
}
