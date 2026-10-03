import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")!;

function adminSecretKey(){
  try{
    const keys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    if(keys?.default)return String(keys.default);
  }catch{}
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}
function adminClient(){
  const key=adminSecretKey();
  if(!key)throw new Error("ADMIN_SECRET_UNAVAILABLE");
  return createClient(SUPABASE_URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
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

    if(action==="invite"){
      const displayName=String(body?.display_name || "").trim();
      const email=String(body?.email || "").trim().toLowerCase();
      if(displayName.length<2 || !email.includes("@")) return json(req,{error:"Informe nome e e-mail válidos."},400);

      const {data:directory,error:directoryError}=await client.rpc("get_admin_user_directory");
      if(directoryError) throw new Error(directoryError.message);
      const occupied=(directory || []).filter((item:any)=>item.clinical_access===true && item.access_status==="active" && item.slot_no!=null).length;
      if(occupied>=5) return json(req,{error:"Os cinco slots clínicos já estão ocupados.",code:"CLINICAL_SLOT_LIMIT_REACHED"},409);

      const admin=adminClient();
      const redirectTo=Deno.env.get("NEXA_INVITE_REDIRECT_URL") || ALLOWED_ORIGIN;
      const {data:inviteData,error:inviteError}=await admin.auth.admin.inviteUserByEmail(email,{
        redirectTo,
        data:{display_name:displayName},
      });
      if(inviteError) throw new Error(inviteError.message || "INVITE_FAILED");
      const invited=inviteData?.user;
      if(!invited?.id) throw new Error("INVITE_USER_MISSING");

      const {data:access,error:accessError}=await client.rpc("admin_set_profile_access",{
        p_profile_id:invited.id,
        p_is_admin:false,
        p_is_reviewer:false,
        p_clinical_access:true,
        p_access_status:"active",
        p_reason:"Convite clínico criado pelo administrador.",
      });

      if(accessError){
        try{await admin.auth.admin.deleteUser(invited.id)}catch(rollbackError){console.error("NEXA admin invite rollback failed",rollbackError)}
        throw new Error(accessError.message);
      }

      return json(req,{
        ok:true,
        user:{id:invited.id,email:invited.email || email,display_name:displayName},
        access,
      },201);
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
    if(message==="ADMIN_SECRET_UNAVAILABLE") return json(req,{error:"Configuração administrativa indisponível."},500);
    if(/already registered|already exists|user.*exists/i.test(message)) return json(req,{error:"Já existe uma conta cadastrada com este e-mail.",code:"USER_ALREADY_EXISTS"},409);
    if(message.includes("CLINICAL_SLOT_LIMIT_REACHED")) return json(req,{error:"Os cinco slots clínicos já estão ocupados.",code:"CLINICAL_SLOT_LIMIT_REACHED"},409);
    console.error(error); return json(req,{error:message},500);
  }
});
