import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

const VERSION = '1.21.1';
const DATA_VERSION = 3955;

function cleanName(value) {
  return String(value || 'Mundo SoyPerrito')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .slice(0, 60) || 'Mundo SoyPerrito';
}

function hashSeed(text) {
  let h = 2166136261;
  for (const c of String(text)) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return BigInt.asIntN(64, BigInt(h) * 2654435761n);
}

async function zipDirectory(source, output) {
  await new Promise((resolve, reject) => {
    const out = createWriteStream(output);
    const archive = archiver('zip', { zlib: { level: 6 } });
    out.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(out);
    archive.directory(source, false);
    archive.finalize();
  });
}

function blockFor(x, y, z, mode, registry, Block, prompt) {
  const p = String(prompt).toLowerCase();
  const surface = /arena|castillo|castillo|isla|island|ciudad|city|aldea|village/.test(p)
    ? 'stone'
    : 'grass_block';

  if (y === 0) return new Block(registry.blocksByName.bedrock, registry.biomesByName.plains, 0);
  if (y < 4) return new Block(registry.blocksByName.stone, registry.biomesByName.plains, 0);
  if (y === 4) return new Block(registry.blocksByName[surface], registry.biomesByName.plains, 0);
  if (y > 4 && y < 64) return new Block(registry.blocksByName.air, registry.biomesByName.plains, 0);

  return new Block(registry.blocksByName.air.id, registry.biomesByName.plains.id, 0);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

  let root;
  try {
    const { edition = 'java', name, seed, mode = 'survival', prompt = '' } = req.body || {};

    if (edition !== 'java') {
      return res.status(400).json({
        error: 'La versión Bedrock todavía está en desarrollo. Este primer generador crea mundos Java.'
      });
    }
    if (!String(prompt).trim()) return res.status(400).json({ error: 'Describe el mundo que quieres crear.' });

    root = await fs.mkdtemp(path.join(os.tmpdir(), 'soyperrito-mc-'));
    const worldDir = path.join(root, 'world');
    const regionDir = path.join(worldDir, 'region');
    await fs.mkdir(regionDir, { recursive: true });

    const { default: Registry } = await import('prismarine-registry');
    const registryFactory = Registry || (await import('prismarine-registry')).default;
    const registry = registryFactory(VERSION);
    const { default: ChunkLoader } = await import('prismarine-chunk');
    const Chunk = ChunkLoader(registry);
    const { default: BlockLoader } = await import('prismarine-block');
    const Block = BlockLoader(registry);
    const { default: AnvilLoader } = await import('prismarine-provider-anvil');
    const Anvil = AnvilLoader;

    const anvil = new Anvil(regionDir);

    // Mundo inicial pequeño y válido: 4x4 chunks con terreno plano.
    for (let cx = -2; cx < 2; cx++) {
      for (let cz = -2; cz < 2; cz++) {
        const chunk = new Chunk({ minY: -64, worldHeight: 384 });
        chunk.initialize((x, y, z) => blockFor(x, y, z, mode, registry, Block, prompt));
        await anvil.save(cx, cz, chunk);
      }
    }

    const nbt = await import('prismarine-nbt');
    const now = BigInt(Date.now());
    const seedValue = seed ? hashSeed(seed) : now;

    const level = nbt.comp({
      Data: nbt.comp({
        DataVersion: nbt.int(DATA_VERSION),
        Version: nbt.comp({
          Id: nbt.int(19133),
          Name: nbt.string('1.21.1'),
          Snapshot: nbt.byte(0)
        }),
        LevelName: nbt.string(cleanName(name)),
        RandomSeed: nbt.long(seedValue),
        GameType: nbt.int(mode === 'creative' ? 1 : 0),
        MapFeatures: nbt.byte(1),
        AllowCommands: nbt.byte(mode === 'creative' ? 1 : 0),
        Difficulty: nbt.byte(1),
        DifficultyLocked: nbt.byte(0),
        Time: nbt.long(0n),
        DayTime: nbt.long(0n),
        SpawnX: nbt.int(0),
        SpawnY: nbt.int(5),
        SpawnZ: nbt.int(0),
        raining: nbt.byte(0),
        rainTime: nbt.int(0),
        thundering: nbt.byte(0),
        thunderTime: nbt.int(0),
        LastPlayed: nbt.long(now),
        SizeOnDisk: nbt.long(0n),
        hardcore: nbt.byte(0),
        initialized: nbt.byte(1)
      })
    });

    const zlib = await import('node:zlib');
    await fs.writeFile(
      path.join(worldDir, 'level.dat'),
      zlib.gzipSync(nbt.writeUncompressed(level))
    );

    await fs.writeFile(
      path.join(worldDir, 'session.lock'),
      Buffer.alloc(8)
    );

    const zipPath = path.join(root, 'mundo.zip');
    await zipDirectory(worldDir, zipPath);
    const buffer = await fs.readFile(zipPath);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${cleanName(name).replace(/\s+/g, '_')}.zip"`);
    res.status(200).send(buffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error?.message || 'No se pudo generar el mundo Java.' });
  } finally {
    if (root) await fs.rm(root, { recursive: true, force: true }).catch(() => {});
  }
}
