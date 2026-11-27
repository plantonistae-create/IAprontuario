// V5.29 test helper: serves index.html with the local-vault PILOT enabled for the synthetic physicians (hashes only, like production config). NEXA_PILOT=off serves the shipped default (pilot OFF = previous flow).
const crypto=require('crypto');
const hash=id=>crypto.createHash('sha256').update(String(id).toLowerCase()).digest('hex');
const FROM='vaultPilot:{enabled:false,ownerIdHashes:[]}';
const A='aaaaaaaa-0000-4000-8000-0000000000a1',B='bbbbbbbb-0000-4000-8000-0000000000b1';
const config=ids=>'vaultPilot:{enabled:true,ownerIdHashes:'+JSON.stringify(ids.map(hash))+'}';
function apply(html,{ids=[A,B],mode=process.env.NEXA_PILOT||'on'}={}){if(!html.includes(FROM))throw new Error('pilot config marker missing in index.html');return mode==='off'?html:html.replace(FROM,config(ids))}
module.exports={apply,hash,config,FROM,A,B};
