import crypto from "node:crypto";

function cookie(name, value, options = {}) {
  const parts = [name + "=" + encodeURIComponent(value)];
  if (options.maxAge !== undefined) parts.push("Max-Age=" + options.maxAge);
  parts.push("Path=/");
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push("SameSite=" + options.sameSite);
  return parts.join("; ");
}

function baseUrl(req) {
  return process.env.AUTH_BASE_URL || `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
}

export default async function handler(req, res) {
  const { code, state, action, error, permission } = req.query || {};
  const origin = baseUrl(req);
  const callback = origin + "/api/github-auth";

  if (error) {
    return res.redirect("/?github_error=" + encodeURIComponent(String(error)));
  }

  if (action === "login") {
    const selectedPermission = permission === "write" ? "write" : "read";
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) return res.status(500).send("Falta GITHUB_CLIENT_ID en Vercel.");

    const stateValue = crypto.randomBytes(32).toString("hex");
    const authUrl = new URL("https://github.com/login/oauth/authorize");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", callback);
    authUrl.searchParams.set("scope", selectedPermission === "write" ? "public_repo" : "read:user");
    authUrl.searchParams.set("state", stateValue);

    res.setHeader("Set-Cookie", cookie("github_oauth_state", stateValue, {
      maxAge: 600, httpOnly: true, secure: true, sameSite: "Lax"
    }));
    return res.redirect(authUrl.toString());
  }

  if (!code || !state) return res.status(400).send("Falta el código o el estado de autorización.");

  const stateCookie = req.headers.cookie?.match(/(?:^|; )github_oauth_state=([^;]*)/)?.[1];
  const expectedState = stateCookie ? decodeURIComponent(stateCookie) : "";
  if (!expectedState || state !== expectedState) {
    return res.status(400).send("Estado OAuth no válido. Vuelve a iniciar la conexión.");
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).send("Configura GITHUB_CLIENT_ID y GITHUB_CLIENT_SECRET en Vercel.");
  }

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: callback
    })
  });

  const token = await tokenResponse.json();
  if (!token.access_token) return res.status(401).send("GitHub no devolvió un token válido.");

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token.access_token,
      "User-Agent": "SoyPerritoProProYT-IAOFICIAL"
    }
  });

  const user = await userResponse.json();
  if (!user.login) return res.status(401).send("No se pudo obtener la cuenta de GitHub.");

  res.setHeader("Set-Cookie", [
    cookie("github_token", token.access_token, {
      maxAge: 3600, httpOnly: true, secure: true, sameSite: "Lax"
    }),
    cookie("github_login", user.login, {
      maxAge: 3600, httpOnly: false, secure: true, sameSite: "Lax"
    }),
    cookie("github_oauth_state", "", {
      maxAge: 0, httpOnly: true, secure: true, sameSite: "Lax"
    })
  ]);

  return res.redirect("/?github=connected");
}
