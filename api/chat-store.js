const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(command) {
  if (!url || !token) throw new Error('Falta configurar UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN en Vercel.');
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
    body: JSON.stringify(command)
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || 'Error de base de datos.');
  return data.result;
}
function cookieValue(req,name){const cookies=String(req.headers.cookie||'').split(';');const item=cookies.find(x=>x.trim().startsWith(name+'='));return item?decodeURIComponent(item.trim().slice(name.length+1)):'';}

export default async function handler(req,res){
  try{
    const session=cookieValue(req,'session');
    if(!session)return res.status(401).json({error:'Inicia sesión primero.'});
    const username=await redis(['GET','session:'+session]);
    if(!username)return res.status(401).json({error:'Sesión caducada.'});
    const key='chat:'+username;
    if(req.method==='GET'){
      const raw=await redis(['GET',key]);
      return res.status(200).json({messages:raw?JSON.parse(raw):[]});
    }
    if(req.method==='POST'){
      const messages=Array.isArray(req.body?.messages)?req.body.messages.slice(-80):[];
      await redis(['SET',key,JSON.stringify(messages)]);
      return res.status(200).json({ok:true});
    }
    if(req.method==='DELETE'){
      await redis(['DEL',key]);
      return res.status(200).json({ok:true});
    }
    return res.status(405).json({error:'Método no permitido.'});
  }catch(error){console.error(error);return res.status(500).json({error:error.message||'Error del servidor.'});}
}
