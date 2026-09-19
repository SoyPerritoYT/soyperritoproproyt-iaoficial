export const config = { runtime: "nodejs" };

const BASE = "https://generativelanguage.googleapis.com/v1beta";

function key() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("Falta GEMINI_API_KEY en Vercel.");
  return k;
}

export default async function handler(req) {
  try {
    const apiKey = key();

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const prompt = String(body.prompt || "").trim();
      if (!prompt) return Response.json({ error: "Falta el prompt." }, { status: 400 });

      const finalPrompt =
        "PROTAGONISTA PRINCIPAL: un perrito blanco gamer, claramente un perro, adorable y consistente durante todo el vídeo. " +
        "NO gatos y NO sustituir al protagonista por otro animal. " +
        "Crea una escena vertical para YouTube Shorts, dinámica y diferente, con movimiento de cámara, iluminación y sonido adecuados. " +
        "IDEA DEL USUARIO: " + prompt;

      const r = await fetch(
        BASE + "/models/veo-3.1-generate-preview:predictLongRunning",
        {
          method: "POST",
          headers: {
            "x-goog-api-key": apiKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            instances: [{ prompt: finalPrompt }],
            parameters: {
              aspectRatio: "9:16",
              resolution: "720p",
                          }
          })
        }
      );

      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        return Response.json(
          { error: data.error?.message || "Google rechazó la generación." },
          { status: r.status }
        );
      }

      return Response.json({ operation: data.name });
    }

    if (req.method === "GET") {
      const url = new URL(req.url);
      const operation = url.searchParams.get("operation");
      if (!operation) return Response.json({ error: "Falta operation." }, { status: 400 });

      const r = await fetch(BASE + "/" + operation, {
        headers: { "x-goog-api-key": apiKey }
      });
      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        return Response.json(
          { error: data.error?.message || "No se pudo consultar el vídeo." },
          { status: r.status }
        );
      }

      if (!data.done) {
        return Response.json({ done: false });
      }

      if (data.error) {
        return Response.json({ done: true, error: data.error.message || "La generación falló." });
      }

      const sample = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video;
      const videoUri = sample?.uri;
      if (!videoUri) {
        return Response.json({ done: true, error: "La generación terminó pero no devolvió el vídeo." });
      }

      // Proxy del MP4: la API key nunca llega al navegador.
      const video = await fetch(videoUri, {
        headers: { "x-goog-api-key": apiKey }
      });

      if (!video.ok || !video.body) {
        return Response.json({ done: true, error: "No se pudo descargar el MP4 generado." }, { status: 502 });
      }

      return new Response(video.body, {
        status: 200,
        headers: {
          "Content-Type": video.headers.get("content-type") || "video/mp4",
          "Cache-Control": "no-store"
        }
      });
    }

    return Response.json({ error: "Método no permitido." }, { status: 405 });
  } catch (e) {
    return Response.json({ error: e.message || "Error del servidor." }, { status: 500 });
  }
}
