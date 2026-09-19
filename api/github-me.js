export default async function handler(req, res) {
  const m = req.headers.cookie?.match(/(?:^|; )github_token=([^;]*)/);
  const token = m ? decodeURIComponent(m[1]) : "";
  if (!token) return res.status(401).json({ connected:false });
  const r = await fetch("https://api.github.com/user", { headers:{Accept:"application/vnd.github+json",Authorization:"Bearer "+token,"User-Agent":"SoyPerritoProProYT-IAOFICIAL"} });
  if (!r.ok) return res.status(401).json({ connected:false });
  const u = await r.json();
  res.json({ connected:true, login:u.login, name:u.name, avatar_url:u.avatar_url });
}