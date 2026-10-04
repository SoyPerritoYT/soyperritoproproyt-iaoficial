import crypto from "node:crypto";

const MODELS = {
  "soyperrito-1.0-flash": ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"],
  "soyperrito-1.0-flash-lite": ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"],
  "soyperrito-1.0-fast": ["gemini-3.6-flash", "gemini-3.5-flash"],
  "soyperrito-1.0-pro": ["gemini-3.1-pro-preview"]
};

function validApiKey(value, secret) {
  if (typeof value !== "string" || !value.startsWith("spyt_live_")) return false;
  const raw = value.slice("spyt_live_".length);
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return false;
  const id = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret).update(id).digest("base64url");
  return sig === expected;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });

  const secret = process.env.SPYT_API_SECRET;
  const spytApiKey = process.env.SPYT_API_KEY;
  if (!secret) return res.status(500).json({ error: "Falta SPYT_API_SECRET en Vercel." });
  if (!spytApiKey) return res.status(500).json({ error: "Falta SPYT_API_KEY en Vercel." });

  const suppliedKey = req.headers["x-api-key"] || req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!validApiKey(suppliedKey, secret)) {
    return res.status(401).json({ error: "API Key inválida o ausente." });
  }

  try {
    const { message, model = "soyperrito-1.0-flash" } = req.body || {};
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Falta el contenido." });
    }

    const modelIds = MODELS[model];
    if (!modelIds) {
      return res.status(400).json({
        error: "Modelo no disponible.",
        availableModels: Object.keys(MODELS)
      });
    }

    const systemInstruction = `Eres SoyPerrito 1.0, la IA de SoyPerritoProProYT.
Responde en español cuando el usuario escriba en español.
Sé útil, clara y segura.
Si te preguntan quién te creó, quién es tu creador, quién hizo esta IA o quién desarrolló SoyPerrito 1.0, responde exactamente: "Fui creado por SoyPerritoProProYT".
No añadas el mensaje antiguo ni emojis a esa respuesta.
`;

    let lastError = "El modelo no pudo responder.";

    for (const modelId of modelIds) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": spytApiKey
            },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemInstruction }] },
              contents: [{ role: "user", parts: [{ text: message }] }],
              generationConfig: { maxOutputTokens: 1200 }
            })
          }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          lastError = data.error?.message || `El modelo respondió con HTTP ${response.status}.`;
          continue;
        }

        const reply = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
        if (reply) {
          return res.status(200).json({
            reply,
            model,
            providerModel: modelId
          });
        }

        lastError = "El modelo no devolvió texto.";
      } catch (e) {
        lastError = e.message || "Error de conexión con el modelo.";
      }
    }

    return res.status(503).json({
      error: "Todos los modelos de respaldo están temporalmente ocupados o no disponibles. Inténtalo de nuevo en unos segundos.",
      detail: lastError
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Error al contactar con SoyPerrito." });
  }
}
