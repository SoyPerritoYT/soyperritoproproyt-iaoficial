export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Falta configurar OPENAI_API_KEY en Vercel.' });
  }

  try {
    const { name, prompt } = req.body || {};
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Describe qué quieres que haga la app.' });
    }

    const appName = typeof name === 'string' && name.trim() ? name.trim() : 'Mi App OpenAI';
    const instructions = `Genera el código completo de una aplicación web llamada "${appName}".
La aplicación debe estar en un único archivo HTML, con CSS y JavaScript incluidos.
Debe ser clara, responsive y funcionar en móvil.
No incluy claves API reales ni pidas al usuario que pegue una clave secreta en el navegador.
Si necesita IA, usa el endpoint /api/chat del proyecto como backend.
Devuelve SOLO el HTML completo, empezando por <!DOCTYPE html> y terminando por </html>.
Requisitos del usuario:
${prompt.trim()}`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-5.6-luna',
        instructions,
        input: 'Crea la aplicación solicitada siguiendo exactamente las instrucciones.'
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || 'OpenAI rechazó la petición.'
      });
    }

    const code = data.output_text || data.output?.flatMap(x => x.content || [])
      .find(x => x.type === 'output_text')?.text || '';

    if (!code) return res.status(502).json({ error: 'OpenAI no devolvió código.' });

    const cleaned = code.replace(/^\s*\`\`\`(?:html)?\s*/i, '').replace(/\s*\`\`\`\s*$/i, '').trim();
    return res.status(200).json({ code: cleaned });
  } catch (error) {
    return res.status(500).json({ error: 'Error del servidor al crear la app.' });
  }
}