import crypto from 'node:crypto';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const SESSION_SECONDS = 60 * 60 * 24 * 7;

async function redis(command) {
  if (!url || !token) throw new Error('Falta configurar UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN en Vercel.');
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
    body: JSON.stringify(command)
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || 'Error de base de datos.');
  return data.result;
}

function cookieValue(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  const item = cookies.find(x => x.trim().startsWith(name + '='));
  return item ? decodeURIComponent(item.trim().slice(name.length + 1)) : '';
}

function safeUsername(v) {
  return String(v || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 30);
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = await new Promise((resolve, reject) =>
    crypto.pbkdf2(password, salt, 120000, 32, 'sha256', (err, key) => err ? reject(err) : resolve(key))
  );
  return {salt, hash: derived.toString('hex')};
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', 'session=' + encodeURIComponent(token) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + SESSION_SECONDS);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
}

export default async function handler(req, res) {
  try {
    const session = cookieValue(req, 'session');

    if (req.method === 'GET') {
      if (!session) return res.status(401).json({error: 'No hay sesión.'});
      const username = await redis(['GET', 'session:' + session]);
      if (!username) return res.status(401).json({error: 'Sesión caducada.'});
      return res.status(200).json({username});
    }

    if (req.method === 'DELETE') {
      if (session) await redis(['DEL', 'session:' + session]);
      clearSessionCookie(res);
      return res.status(200).json({ok: true});
    }

    if (req.method !== 'POST') return res.status(405).json({error: 'Método no permitido.'});

    const {action, username, password} = req.body || {};
    const user = safeUsername(username);
    if (user.length < 3) return res.status(400).json({error: 'El nombre debe tener al menos 3 caracteres.'});
    if (typeof password !== 'string' || password.length < 6) return res.status(400).json({error: 'La contraseña debe tener al menos 6 caracteres.'});

    const key = 'user:' + user;
    if (action === 'register') {
      const exists = await redis(['EXISTS', key]);
      if (exists) return res.status(409).json({error: 'Ese nombre ya existe.'});
      const {salt, hash} = await hashPassword(password);
      await redis(['SET', key, JSON.stringify({username: user, salt, hash})]);
    } else if (action === 'login') {
      const raw = await redis(['GET', key]);
      if (!raw) return res.status(401).json({error: 'Nombre o contraseña incorrectos.'});
      const account = JSON.parse(raw);
      const {hash} = await hashPassword(password, account.salt);
      if (!crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(account.hash, 'hex'))) {
        return res.status(401).json({error: 'Nombre o contraseña incorrectos.'});
      }
    } else {
      return res.status(400).json({error: 'Acción no válida.'});
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    await redis(['SET', 'session:' + sessionToken, user, 'EX', String(SESSION_SECONDS)]);
    setSessionCookie(res, sessionToken);
    return res.status(200).json({username: user});
  } catch (error) {
    console.error(error);
    return res.status(500).json({error: error.message || 'Error del servidor.'});
  }
}
