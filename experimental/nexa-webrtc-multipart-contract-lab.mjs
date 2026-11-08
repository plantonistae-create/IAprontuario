// Synthetic-only multipart contract classifier. No user content, networking or
// clinical code is imported. Output contains structural booleans, not SDP data.
const OFFER = 'v=0\r\ns=synthetic-offer\r\n';
const SESSION = JSON.stringify({type:'realtime',model:'synthetic-model'});

function classifyPart(wire, field) {
 const opening='Content-Disposition: form-data; name="'+field+'"';
 const index=wire.indexOf(opening);
 if(index<0)throw new Error('MISSING_SYNTHETIC_FIELD');
 const end=wire.indexOf('\r\n\r\n',index);
 if(end<0)throw new Error('MALFORMED_SYNTHETIC_MULTIPART');
 const headers=wire.slice(index,end);
 const match=headers.match(/\r\nContent-Type:\s*([^\r\n]+)/i);
 return Object.freeze({
  present:true,
  classified_as_file:/;\s*filename="[^"]*"/.test(headers),
  content_type:match?match[1]:null
 });
}

export async function inspectSyntheticMultipartWire() {
 const hosted=new FormData();
 hosted.append('sdp',new Blob([OFFER],{type:'application/sdp'}),'offer.sdp');
 hosted.append('session',new Blob([SESSION],{type:'application/json'}),'session.json');
 const reference=new FormData();
 reference.set('sdp',OFFER);
 reference.set('session',SESSION);

 async function inspect(form) {
  // Request serializes the FormData locally; no HTTP request is sent.
  const request=new Request('https://example.invalid/fixture-only',{
   method:'POST',body:form
  });
  const wire=await request.text();
  return Object.freeze({
   sdp:classifyPart(wire,'sdp'),
   session:classifyPart(wire,'session')
  });
 }
 return Object.freeze({
  synthetic_fixture:true,
  current_edge_form:await inspect(hosted),
  plain_field_reference:await inspect(reference),
  // Source contract comparison cannot prove provider acceptance or cause.
  proves_upstream_status:false,
  proves_ice_root_cause:false,
  billed_model_calls:0
 });
}
