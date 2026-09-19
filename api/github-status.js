export default async function handler(req, res) {
  const authUrl = process.env.GITHUB_AUTH_URL || "https://soy-perrito-pro-pro-yt-iaoficial-au.vercel.app";
  const token = req.headers.cookie?.match(/(?:^|;\s*)github_token=([^;]+)/)?.[1];

  if (!token) {
    return res.status(200).json({ connected: false, authUrl });
  }

  try {
    const r = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: "Bearer " + decodeURIComponent(token),
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
    if (!r.ok) return res.status(200).json({ connected: false, authUrl });
    const u = await r.json();
    return res.status(200).json({
      connected: true,
      login: u.login,
      name: u.name || u.login,
      avatar_url: u.avatar_url || "",
      authUrl
    });
  } catch {
    return res.status(200).json({ connected: false, authUrl });
  }
}
