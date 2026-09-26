import { Sandbox } from '@vercel/sandbox';

const NAME = 'soyperrito-digital-pc';
const PORT = 6080;

async function setup(sandbox) {
  const check = await sandbox.runCommand({
    cmd: 'bash',
    args: ['-lc', 'test -f /tmp/pc-ready && echo ready || echo setup']
  });
  if ((await check.stdout()).trim() === 'ready') return;

  await sandbox.runCommand({
    cmd: 'bash',
    args: ['-lc',
      'apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y xvfb xfce4 x11vnc novnc websockify xdotool xterm'
    ]
  });

  await sandbox.runCommand({
    cmd: 'bash',
    args: ['-lc',
      'mkdir -p /tmp/pc && Xvfb :1 -screen 0 1280x800x24 >/tmp/pc/xvfb.log 2>&1 & sleep 2; DISPLAY=:1 startxfce4 >/tmp/pc/xfce.log 2>&1 & sleep 5; DISPLAY=:1 x11vnc -display :1 -forever -shared -rfbport 5900 -nopw >/tmp/pc/vnc.log 2>&1 & sleep 2; websockify --web=/usr/share/novnc 6080 localhost:5900 >/tmp/pc/websockify.log 2>&1 & touch /tmp/pc-ready'
    ]
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

  try {
    const { action, command } = req.body || {};
    const sandbox = await Sandbox.getOrCreate({
      name: NAME,
      ports: [PORT],
      timeout: 45 * 60 * 1000,
      persistent: true
    });

    await setup(sandbox);

    if (action === 'open') {
      const url = sandbox.domain(PORT) + '/vnc.html?autoconnect=true&resize=scale&path=websockify';
      return res.status(200).json({ url });
    }

    if (action === 'natural') {
      if (typeof command !== 'string' || !command.trim()) {
        return res.status(400).json({ error: 'Falta la instrucción.' });
      }
      const key = process.env.GEMINI_API_KEY;
      if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY no está configurada en Vercel.' });

      const instruction = command.trim();
      const system = `Eres el controlador seguro de un PC Linux XFCE. Convierte una instrucción en español en UN SOLO comando shell que use únicamente estas acciones: echo, pwd, ls, cd, mkdir, touch, cat, python3, node, npm, git, xdotool, xterm. No uses sudo, rm, shutdown, reboot, passwd, curl, wget, apt, chmod ni pipes para descargar/ejecutar código. Para abrir una terminal usa xterm. Para acciones gráficas usa xdotool. Devuelve SOLO el comando, sin markdown ni explicaciones.`;

      const rr = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent', {
        method:'POST',
        headers:{'Content-Type':'application/json','x-goog-api-key':key},
        body:JSON.stringify({
          system_instruction:{parts:[{text:system}]},
          contents:[{role:'user',parts:[{text:instruction}]}],
          generationConfig:{maxOutputTokens:300,temperature:0}
        })
      });
      const data=await rr.json().catch(()=>({}));
      if(!rr.ok) return res.status(rr.status).json({error:data.error?.message||'No se pudo interpretar la instrucción.'});
      const generated=data.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim().replace(/^\`+|\`+$/g,'');
      if(!generated) return res.status(500).json({error:'La IA no devolvió ningún comando.'});

      const allowed = /^(echo |pwd$|ls( |$)|cd |mkdir |touch |cat |python3? |node |npm |git |xdotool |xterm( |$))/;
      const blocked = /(rm\\s+-rf|mkfs|dd\\s+if=|shutdown|reboot|passwd|sudo|apt|curl|wget|\\|.*sh)/i;
      if(!allowed.test(generated) || blocked.test(generated)) {
        return res.status(400).json({error:'La instrucción generó una acción no permitida.'});
      }
      const result = await sandbox.runCommand({cmd:'bash',args:['-lc',generated],timeout:30000});
      return res.status(200).json({
        command: generated,
        output: ((await result.stdout()) + (await result.stderr())).slice(-12000),
        exitCode: result.exitCode
      });
    }

    if (action === 'command') {
      if (typeof command !== 'string' || !command.trim()) {
        return res.status(400).json({ error: 'Falta el comando.' });
      }
      const allowed = /^(echo |pwd$|ls( |$)|cd |mkdir |touch |cat |python3? |node |npm |git |xdotool |xterm( |$))/;
      const blocked = /(rm\\s+-rf|mkfs|dd\\s+if=|shutdown|reboot|passwd|curl.*\\|.*sh|wget.*\\|.*sh)/i;
      if (!allowed.test(command.trim()) || blocked.test(command)) {
        return res.status(400).json({ error: 'Ese comando no está permitido en el PC digital.' });
      }
      const result = await sandbox.runCommand({ cmd: 'bash', args: ['-lc', command], timeout: 30000 });
      return res.status(200).json({
        output: ((await result.stdout()) + (await result.stderr())).slice(-12000),
        exitCode: result.exitCode
      });
    }

    return res.status(400).json({ error: 'Acción no válida.' });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'No se pudo iniciar el PC digital.' });
  }
}
