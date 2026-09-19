import { experimental_generateVideo as generateVideo } from "ai";
import { put } from "@vercel/blob";

export const config = { runtime: "nodejs" };

export default async function handler(req) {
  if (req.method !== "POST") return Response.json({ error: "Método no permitido." }, { status: 405 });

  const gatewayKey = process.env.AI_GATEWAY_API_KEY;
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  if (!gatewayKey) return Response.json({ error: "Falta AI_GATEWAY_API_KEY en Vercel." }, { status: 500 });
  if (!blobToken) return Response.json({ error: "Falta BLOB_READ_WRITE_TOKEN en Vercel." }, { status: 500 });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const idea = String(body.prompt || "").trim();
    if (!idea) return Response.json({ error: "Escribe una idea para el vídeo." }, { status: 400 });

    const prompt =
      "PROTAGONISTA OBLIGATORIO: un perrito blanco gamer, claramente un perro. " +
      "Mantén el mismo perrito durante todo el vídeo. NO gatos ni otros animales como protagonista. " +
      "Vídeo vertical 9:16 para YouTube Shorts, con acción clara, cámara dinámica, iluminación atractiva y final divertido. " +
      "IDEA: " + idea;

    const result = await generateVideo({
      model: "alibaba/wan-v3.0-video",
      prompt,
      aspectRatio: "9:16",
      duration: 8,
      providerOptions: {
        alibaba: { pollTimeoutMs: 600000 }
      }
    });

    const video = result.videos?.[0]?.uint8Array;
    if (!video) throw new Error("El modelo no devolvió ningún vídeo.");

    const blob = await put("videos/soyperrito-" + Date.now() + ".mp4", video, {
      access: "public",
      token: blobToken,
      contentType: "video/mp4",
      addRandomSuffix: true
    });

    return Response.json({ ok: true, url: blob.url, model: "alibaba/wan-v3.0-video" });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error?.message || "No se pudo generar el vídeo." }, { status: 500 });
  }
}
