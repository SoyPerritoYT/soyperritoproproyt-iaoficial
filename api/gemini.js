export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método no permitido.'});
  const key=process.env.GEMINI_API_KEY;
  if(!key) return res.status(500).json({error:'GEMINI_API_KEY no está configurada en Vercel.'});
  try{
    const {message}=req.body||{};
    if(typeof message!=='string'||!message.trim()) return res.status(400).json({error:'Falta el contenido.'});
    const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-goog-api-key':key},
      body:JSON.stringify({
        contents:[{role:'user',parts:[{text:message}]}],
        generationConfig:{maxOutputTokens:1200,temperature:0.2}
      })
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok) return res.status(response.status).json({error:data.error?.message||'Gemini rechazó la petición.'});
    const reply=data.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'Gemini no devolvió texto.';
    return res.status(200).json({reply});
  }catch(e){return res.status(500).json({error:e.message||'Error al contactar con Gemini.'});}
}