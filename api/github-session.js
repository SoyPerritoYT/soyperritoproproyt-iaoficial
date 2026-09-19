import crypto from "node:crypto";
function verifySession(value) {
  const secret = process.env.AUTH_GITHUB_SESSION_SECRET;
  if (!secret || !value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const payload = parts[0], signature = parts[1];
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  if (signature !== expected) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (!data.exp || data.exp < Date.now() || !data.token || !data.login) return null;
  return data;
}
function cookie(name, value, maxAge) {
  return name + "=" + encodeURIComponent(value) + "; Max-Age=" + maxAge + "; Path=/; HttpOnly; Secure; SameSite=Lax";
}
export default async function handler(req, res) {
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});\n  const session = verifySession(body.session || "");
  if (!session) return res.status(401).json({ error: "Sesión de GitHub no válida o caducada." });
  res.setHeader("Set-Cookie", [cookie("github_token", session.token, 3600), cookie("github_permission", session.permission || "read", 3600)]);
  res.json({ ok: true, login: session.login, permission: session.permission || "read" });
}