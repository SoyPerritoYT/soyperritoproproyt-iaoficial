export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
  res.setHeader("Set-Cookie", [
    "github_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
    "github_permission=; Max-Age=0; Path=/; Secure; SameSite=Lax"
  ]);
  return res.json({ ok: true });
}
