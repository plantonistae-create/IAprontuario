// Synthetic external services for browser regression. Never included by the production build.
(()=>{
 let session={access_token:'synthetic-token',user:{id:'qa-physician-a',email:'qa@example.invalid',user_metadata:{display_name:'Médico QA'}}},authChange;
 const qa=window.__qa={requests:[],channels:[],clipboard:'',failRadar:false,denyCapabilities:false};
 const empty=()=>{const chain={then:resolve=>Promise.resolve({data:[],error:null}).then(resolve)};for(const k of ['select','eq','gte','order','limit','update','insert','delete','upsert','maybeSingle','single','in'])chain[k]=()=>chain;return chain;};
 window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session}}),onAuthStateChange:fn=>{authChange=fn;return {data:{subscription:{unsubscribe(){}}}}},signOut:async()=>{session=null;localStorage.removeItem('sb-synthetic-auth-token');authChange?.('SIGNED_OUT',null);return {error:null};}},rpc:async name=>qa.denyCapabilities?{error:{message:'Unavailable'}}:{data:name==='get_my_capabilities'?[{access_status:'active',clinical_access:true,is_admin:false,is_reviewer:false,display_name:'Médico QA'}]:[],error:null},from:empty})};
 const persistSession=()=>localStorage.setItem('sb-synthetic-auth-token',JSON.stringify(session));persistSession();
 qa.switchUser=id=>{session={...session,user:{id,email:'qa@example.invalid'}};persistSession();authChange?.('SIGNED_IN',session);};
 qa.speak=(id,transcript,index=qa.channels.length-1)=>{const channel=qa.channels[index];channel.receive?.({data:JSON.stringify({type:'conversation.item.input_audio_transcription.completed',item_id:id,transcript})});};
 window.RTCPeerConnection=class {addTrack(track){qa.track=track;}createDataChannel(){const channel={close(){this.onclose?.();},send(){}};Object.defineProperty(channel,'onmessage',{set(fn){this.handler=fn;if(fn)this.receive=fn;},get(){return this.handler;}});qa.channels.push(channel);return this.channel=channel;}async createOffer(){return {sdp:'synthetic'};}async setLocalDescription(){}async setRemoteDescription(){this.channel.onopen?.();}close(){}};
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{qa.clipboard=text;}}});
 const nativeFetch=window.fetch.bind(window);window.fetch=async(input,init={})=>{
 const url=String(input?.url||input);if(url.includes('.supabase.co')){
  qa.requests.push({url,method:init.method});
  if(url.includes('/rpc/get_my_capabilities'))return qa.denyCapabilities?Response.json({error:'Unavailable'},{status:503}):Response.json([{access_status:'active',clinical_access:true,is_admin:false,is_reviewer:false}]);
  if(url.includes('realtime-call'))return Response.json(init.body instanceof FormData?{text:'Cefaleia. Nega febre.'}:{sdp:'synthetic'});
  if(url.includes('realtime-radar'))return qa.failRadar?Response.json({error:'unavailable'},{status:503}):Response.json({items:[],observations:[]});
  if(url.includes('process-consultation'))return Response.json({fields:{queixa_principal:'Cefaleia',hda:'Cefaleia desde hoje. A dor começou de repente. Nega febre. Sem demais queixas.',alergias:'Nega alergias.',comorbidades:'Nega comorbidades.',medicacoes:'Nega uso contínuo.',antecedentes:'Sem antecedentes informados.',exame_fisico:'Exame em avaliação.',hipotese_diagnostica:'Cefaleia a esclarecer — R51',conduta:''},model:'synthetic',provider:'test'});
  if(url.includes('clinical-assistant'))return Response.json({answer:'{"destination":"em_avaliacao","reason":"Dados insuficientes no caso sintético"}'});
  if(url.includes('clinical-plan'))return Response.json({exames:[{nome:'Exame de teste',justificativa:'Caso sintético'}],prescricao:[{principio_ativo:'Medicamento QA sem uso clínico',apresentacao:'apresentação sintética',quantidade_total:'1 item de teste',via:'oral',manual_text:'Texto sintético para validar cópia, sem finalidade clínica.',sugerido:true}],orientacoes_alta:['Orientação de teste'],condutas:['Reavaliar o caso sintético.']});
  return Response.json([]);
 }return nativeFetch(input,init);
 };
})();
