import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")!;
const ALLOWED_ORIGIN=Deno.env.get("ALLOWED_ORIGIN") || "https://plantonistae-create.github.io";

function cors(req:Request){
  const origin=req.headers.get("origin") || "";
  const allow=ALLOWED_ORIGIN ? (origin===ALLOWED_ORIGIN ? origin : "") : origin;
  return {
    "Access-Control-Allow-Origin":allow,"Vary":"Origin",
    "Access-Control-Allow-Headers":"authorization, apikey, content-type",
    "Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"no-store",
  };
}
function json(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:cors(req)});}

async function requireAdmin(req:Request){
  const auth=req.headers.get("Authorization") || "";
  if(!auth.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const client=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await client.auth.getUser();
  if(userError || !userData.user) throw new Error("UNAUTHORIZED");
  const {data:profile,error:profileError}=await client.from("profiles").select("is_admin,access_status").eq("id",userData.user.id).single();
  if(profileError || profile?.is_admin!==true || profile?.access_status!=="active") throw new Error("ADMIN_REQUIRED");
  return client;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="POST") return json(req,{error:"Método não permitido."},405);
  const origin=req.headers.get("origin") || "";
  if(ALLOWED_ORIGIN && origin!==ALLOWED_ORIGIN) return json(req,{error:"Origem não autorizada."},403);
  try{
    const client=await requireAdmin(req);
    const body=await req.json().catch(()=>({}));
    const action=String(body?.action || "list");

    if(action==="list"){
      const {data,error}=await client.rpc("get_admin_user_directory");
      if(error) throw new Error(error.message);
      const users=data || [];
      const occupied=users.filter((item:any)=>item.clinical_access===true && item.access_status==="active" && item.slot_no!=null && Number.isInteger(item.slot_no)).length;
      return json(req,{
        users,
        slots:{total:5,occupied:occupied,available:Math.max(0,5-occupied)},
      });
    }

    if(action==="set_access"){
      const status=String(body?.access_status || "").toLowerCase();
      if(!["pending","active","disabled"].includes(status)) return json(req,{error:"Status de acesso inválido."},400);
      if(typeof body?.is_admin!=="boolean" || typeof body?.is_reviewer!=="boolean" || typeof body?.clinical_access!=="boolean") return json(req,{error:"Capabilities obrigatórias."},400);
      const reason=String(body?.reason || "").trim();
      if(!reason) return json(req,{error:"Justificativa obrigatória."},400);
      const {data,error}=await client.rpc("admin_set_profile_access",{
        p_profile_id:String(body?.profile_id || ""),
        p_is_admin:body.is_admin,
        p_is_reviewer:body.is_reviewer,
        p_clinical_access:body.clinical_access,
        p_access_status:status,
        p_reason:reason,
      });
      if(error) throw new Error(error.message);
      return json(req,data);
    }

    return json(req,{error:"Ação inválida."},400);
  }catch(error){
    const message=error instanceof Error ? error.message : "Falha interna.";
    if(message==="UNAUTHORIZED") return json(req,{error:"Sessão inválida ou expirada."},401);
    if(message==="ADMIN_REQUIRED") return json(req,{error:"Acesso administrativo não autorizado."},403);
    if(message.includes("CLINICAL_SLOT_LIMIT_REACHED")) return json(req,{error:"Os cinco slots clínicos já estão ocupados.",code:"CLINICAL_SLOT_LIMIT_REACHED"},409);
    console.error(error); return json(req,{error:message},500);
  }
});
