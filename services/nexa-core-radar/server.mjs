// Reference local CPU HTTP service for the NEXA Core Radar API.
// Deploy behind an HTTPS reverse proxy and private network ONLY.
// Not approved for clinical production; no model training and no ASR included.
import http from "node:http";
import {timingSafeEqual} from "node:crypto";
import {inferRadarLocally} from "./infer.mjs";

const secret=process.env.NEXA_CORE_API_KEY||"";
if(secret.length<24)throw new Error("NEXA_CORE_API_KEY_REQUIRED");
const port=Number(process.env.PORT||8765);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error("INVALID_PORT");

function authorized(header){
  const bearer=String(header||"");
  if(!bearer.startsWith("Bearer "))return false;
  const actual=Buffer.from(bearer.slice(7));
  const expected=Buffer.from(secret);
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
function reply(response,status,body){
  response.writeHead(status,{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"no-referrer"
  });
  response.end(JSON.stringify(body));
}
const server=http.createServer(async(req,res)=>{
  if(req.method==="GET"&&req.url==="/healthz")return reply(res,200,{status:"ok",component:"radar-baseline"});
  if(req.method!=="POST"||req.url!=="/v1/radar/analyze")return reply(res,404,{error:"NOT_FOUND"});
  if(!authorized(req.headers.authorization))return reply(res,401,{error:"UNAUTHORIZED"});
  if(!String(req.headers["content-type"]||"").startsWith("application/json"))
    return reply(res,415,{error:"UNSUPPORTED_MEDIA_TYPE"});
  try{
    let total=0;const chunks=[];
    for await(const chunk of req){
      total+=chunk.length;
      if(total>64000)return reply(res,413,{error:"PAYLOAD_TOO_LARGE"});
      chunks.push(chunk);
    }
    let payload;
    try{payload=JSON.parse(Buffer.concat(chunks).toString("utf8"))}
    catch{return reply(res,400,{error:"INVALID_JSON"})}
    const output=inferRadarLocally(payload);
    return reply(res,200,output);
  }catch{
    // Do not reveal medical content or patient identifiers in error logs.
    return reply(res,422,{error:"INVALID_RADAR_REQUEST"});
  }
});
server.requestTimeout=22000;
server.headersTimeout=24000;
server.listen(port,"127.0.0.1",()=>{
  console.info("NEXA Core Radar baseline ready (loopback-only; TLS proxy required)");
});
