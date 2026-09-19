export default async function handler(req,res){
 const raw=req.headers.cookie?.match(/(?:^|; )github_token=([^;]*)/)?.[1];if(!raw)return res.status(401).json({error:"GitHub no está conectado."});
 const token=decodeURIComponent(raw),auth="Bearer "+token,body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
 try{
  const repo=String(body.repo||"soyperritoproproyt-iaoficial").replace(/[^a-zA-Z0-9_.-]/g,""),path=String(body.path||"").replace(/^\/+/, "");
  if(!path||path.includes(".."))return res.status(400).json({error:"Ruta no válida."});
  const url="https://api.github.com/repos/SoyPerritoYT/"+encodeURIComponent(repo)+"/contents/"+path.split("/").map(encodeURIComponent).join("/");
  const headers={Accept:"application/vnd.github+json",Authorization:auth,"User-Agent":"SoyPerritoProProYT-IAOFICIAL"};
  if(req.method==="GET"){const r=await fetch(url,{headers}),d=await r.json();if(!r.ok)return res.status(r.status).json({error:d.message||"No se pudo leer el archivo."});return res.status(200).json({name:d.name,path:d.path,sha:d.sha,content:d.content?Buffer.from(d.content,"base64").toString("utf8"):""});}
  if(req.method==="PUT"){const content=String(body.content??"");if(content.length>1000000)return res.status(413).json({error:"Archivo demasiado grande."});const payload={message:String(body.message||"Actualizar desde Modo GitHub"),content:Buffer.from(content,"utf8").toString("base64"),branch:String(body.branch||"main")};if(body.sha)payload.sha=String(body.sha);const r=await fetch(url,{method:"PUT",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify(payload)}),d=await r.json();if(!r.ok)return res.status(r.status).json({error:d.message||"No se pudo modificar el archivo."});return res.status(200).json({ok:true,sha:d.content?.sha||d.commit?.sha||""});}
  return res.status(405).json({error:"Método no permitido."});
 }catch(e){return res.status(500).json({error:e?.message||"Error de GitHub."});}
}