const REPO = "SoyPerritoYT/soyperritoproproyt-iaoficial";
const API = "https://api.github.com";

function getToken(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

async function gh(path, token, options = {}) {
  return fetch(API + path, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + token,
      "User-Agent": "SoyPerritoProProYT-IAOFICIAL",
      ...(options.headers || {})
    }
  });
}

export default async function handler(req, res) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: "GitHub no está conectado." });

  try {
    const me = await gh("/user", token);
    const user = await me.json();
    if (!me.ok || !user.login) return res.status(401).json({ error: "La conexión de GitHub ha caducado." });

    if (req.method === "GET") {
      return res.json({ connected: true, login: user.login, name: user.name || "", avatar_url: user.avatar_url || "" });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const action = String(body.action || "");

    if (action === "read") {
      const path = String(body.path || "").replace(/^\/+/, "");
      if (!path || path.includes("..")) return res.status(400).json({ error: "Ruta de archivo no válida." });
      const r = await gh("/repos/" + REPO + "/contents/" + path, token);
      const d = await r.json();
      if (!r.ok || Array.isArray(d)) return res.status(r.status).json({ error: d.message || "No se pudo leer el archivo." });
      const content = d.encoding === "base64" ? Buffer.from(d.content.replace(/\s/g, ""), "base64").toString("utf8") : "";
      return res.json({ ok: true, path, content, sha: d.sha });
    }

    if (action === "write") {
      const path = String(body.path || "").replace(/^\/+/, "");
      const content = String(body.content ?? "");
      const message = String(body.message || "Update from SoyPerritoProProYT.IAOFICIAL");
      if (!path || path.includes("..")) return res.status(400).json({ error: "Ruta de archivo no válida." });
      if (content.length > 2 * 1024 * 1024) return res.status(400).json({ error: "El archivo supera el límite de 2 MB." });

      const existing = await gh("/repos/" + REPO + "/contents/" + path, token);
      const existingData = await existing.json();
      const payload = {
        message,
        content: Buffer.from(content, "utf8").toString("base64"),
        branch: "main"
      };
      if (existing.ok && !Array.isArray(existingData)) payload.sha = existingData.sha;

      const r = await gh("/repos/" + REPO + "/contents/" + path, token, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: d.message || "GitHub rechazó el cambio." });
      return res.json({ ok: true, path, commit_sha: d.commit?.sha || null, url: d.content?.html_url || null });
    }

    return res.status(400).json({ error: "Acción de GitHub no válida." });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "Error de GitHub." });
  }
}