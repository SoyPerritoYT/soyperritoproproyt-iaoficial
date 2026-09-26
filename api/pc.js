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
