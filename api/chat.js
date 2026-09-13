export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'Falta configurar OPENAI_API_KEY en el servidor.' });

  try {
    const { message, history = [] } = req.body || {};
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'Falta el mensaje.' });

    const input = history
      .filter(x => x && (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string')
      .slice(-12)
      .map(x => ({ role: x.role, content: x.content }));

    if (!input.length || input[input.length - 1].content !== message) input.push({ role: 'user', content: message });

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-5.6-luna',
        instructions: 'Eres SoyPerritoProProYT.IAOFICIAL, un asistente amable y útil. Responde en español salvo que el usuario pida otro idioma.',
        input
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || 'Error de OpenAI.' });

    const reply = data.output_text || data.output?.flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text || '';
    if (!reply) return res.status(502).json({ error: 'La API no devolvió texto.' });
    return res.status(200).json({ reply });
  } catch (error) {
    return res.status(500).json({ error: 'Error del servidor al conectar con la API.' });
  }
}
