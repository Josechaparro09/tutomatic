import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * Busca el ejecutable (al usarlo, no al importar, para que FFMPEG_PATH de .env sí cuente):
 *   1) FFMPEG_PATH / FFPROBE_PATH  2) el binario de ffmpeg-static si EXISTE  3) "ffmpeg" del PATH del sistema.
 * ffmpeg-static descarga el binario al instalar; si esa descarga falló (red, antivirus,
 * npm con --ignore-scripts) el archivo no existe y se usa el del sistema.
 */
function resolveBin(envVar: string, pkg: string, fallback: string): string {
  const env = process.env[envVar];
  if (env) return env;
  try {
    const mod = require(pkg);
    const p = typeof mod === 'string' ? mod : mod?.path;
    if (p && fs.existsSync(p)) return p;
  } catch { /* paquete no instalado */ }
  return fallback;
}

export const ffmpegBin = () => resolveBin('FFMPEG_PATH', 'ffmpeg-static', 'ffmpeg');
export const ffprobeBin = () => resolveBin('FFPROBE_PATH', 'ffprobe-static', 'ffprobe');

/** Verifica que FFmpeg y FFprobe funcionen ANTES de grabar (para no repetir acciones en la app). */
export async function ensureFfmpeg(): Promise<{ ffmpeg: string; ffprobe: string; version: string }> {
  const ffmpeg = ffmpegBin(), ffprobe = ffprobeBin();
  const fail = (which: string, bin: string) => new Error(
    `No encuentro ${which} (busqué: ${bin}).\n` +
    `  Arreglo 1: npm rebuild ${which === 'FFmpeg' ? 'ffmpeg-static' : 'ffprobe-static'}   (vuelve a descargar el binario)\n` +
    `  Arreglo 2: instala FFmpeg en el sistema (Windows: winget install Gyan.FFmpeg  o  scoop install ffmpeg) y abre una terminal nueva\n` +
    `  Arreglo 3: en .env pon ${which === 'FFmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH'}=C:\\ruta\\a\\${which === 'FFmpeg' ? 'ffmpeg' : 'ffprobe'}.exe`);
  let version = '';
  try { version = (await run(ffmpeg, ['-version'])).split('\n')[0]; } catch { throw fail('FFmpeg', ffmpeg); }
  try { await run(ffprobe, ['-version']); } catch { throw fail('FFprobe', ffprobe); }
  return { ffmpeg, ffprobe, version };
}

export function run(bin: string, args: string[], opts: { quiet?: boolean; cwd?: string } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd: opts.cwd, windowsHide: true });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${bin} ${args.slice(0, 6).join(' ')}… salió con código ${code}\n${err.slice(-2500)}`));
    });
  });
}

export const ffmpeg = (args: string[]) => run(ffmpegBin(), ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

export async function probeDuration(file: string): Promise<number> {
  const out = await run(ffprobeBin(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  const d = parseFloat(out.trim());
  if (!Number.isFinite(d)) throw new Error(`No pude leer la duración de ${file}`);
  return d;
}
