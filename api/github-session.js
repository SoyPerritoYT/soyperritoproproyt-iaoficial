import crypto from "node:crypto";
function cookie(name,value,options={}){const p=[name+"="+encodeURIComponent(value)];if(options.maxAge!==undefined)p.push("Max-Age="+options.maxAge);p.push("Path=/");if(options.httpOnly)p.push("HttpOnly");if(options.secure)p.push("Secure");if(options.sameSite)p.push("SameSite="+options.sameSite);return p.join("; ");}
function verify(payload,signature,secret){const expected=crypto.createHmac("sha256",secret).update(payload).digest("base64url");return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signature));}
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Método no permitido."});
 try{
  const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{}),handoff=String(body.handoff||""),dot=handoff.lastIndexOf(".");
  if(dot<1)return res.status(400).json({error:"Handoff inválido."});
  const payload=handoff.slice(0,dot),signature=handoff.slice(dot+1),secret=process.env.AUTH_GITHUB_SESSION_SECRET;
  if(!secret)return res.status(500).json({error:"Falta AUTH_GITHUB_SESSION_SECRET en Vercel."});
  if(!verify(payload,signature,secret))return res.status(401).json({error:"Handoff no válido."});
  const data=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
  if(!data.token||!data.exp||Date.now()>Number(data.exp))return res.status(401).json({error:"La autorización ha caducado."});
  const gh=await fetch("https://api.github.com/user",{headers:{Accept:"application/vnd.github+json",Authorization:"Bearer "+data.token,"User-Agent":"SoyPerritoProProYT-IAOFICIAL"}});
  const user=await gh.json();
  if(!gh.ok||!user.login)return res.status(401).json({error:"El token de GitHub no es válido."});
  res.setHeader("Set-Cookie",cookie("github_token",data.token,{maxAge:3600,httpOnly:true,secure:true,sameSite:"Lax"}));
  return res.status(200).json({connected:true,login:user.login,name:user.name||"",avatar_url:user.avatar_url||""});
 }catch(e){return res.status(400).json({error:e?.message||"No se pudo conectar GitHub."});}
}