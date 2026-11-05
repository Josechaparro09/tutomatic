import fs from 'node:fs';
import os from 'node:os';
import { ffmpegBin, run } from './ffmpeg.ts';
import { log } from './util.ts';

/**
 * Aceleración por tarjeta gráfica, para cualquier marca:
 *   NVIDIA → h264_nvenc · AMD → h264_amf (Windows) / h264_vaapi (Linux) · Intel → h264_qsv / h264_vaapi
 *   Mac (Apple Silicon o Intel) → h264_videotoolbox
 * En modo "auto" se prueba cada codificador con una codificación real de 1 s: si el driver o la tarjeta
 * no responden, se pasa al siguiente y, al final, a libx264 (procesador). Nunca rompe el render.
 */

export type GpuMode = 'auto' | 'off' | 'nvenc' | 'qsv' | 'amf' | 'videotoolbox' | 'vaapi';
export interface GpuInfo { mode: GpuMode; encoder: string | null; vendor: string | null; tried: string[] }

const ENCODERS: Record<Exclude<GpuMode, 'auto' | 'off'>, { encoder: string; vendor: string }> = {
  nvenc: { encoder: 'h264_nvenc', vendor: 'NVIDIA' },
  qsv: { encoder: 'h264_qsv', vendor: 'Intel' },
  amf: { encoder: 'h264_amf', vendor: 'AMD' },
  videotoolbox: { encoder: 'h264_videotoolbox', vendor: 'Apple' },
  vaapi: { encoder: 'h264_vaapi', vendor: 'VA-API (Intel/AMD en Linux)' },
};

/** Orden de prueba por sistema operativo (las más rápidas y comunes primero). */
function candidates(): (keyof typeof ENCODERS)[] {
  if (process.platform === 'darwin') return ['videotoolbox'];
  if (process.platform === 'win32') return ['nvenc', 'amf', 'qsv'];
  return ['nvenc', 'vaapi', 'qsv'];
}

const VAAPI_DEVICE = process.env.TUTO_VAAPI_DEVICE || '/dev/dri/renderD128';

/** Argumentos de codificación de alta calidad para cada codificador (para la grabación). */
export function videoEncodeArgs(encoder: string | null, opts: { preset?: string; crf?: number } = {}): { pre: string[]; args: string[]; vfSuffix: string } {
  const crf = opts.crf ?? 16;
  switch (encoder) {
    case 'h264_nvenc':
      return { pre: [], vfSuffix: '', args: ['-c:v', 'h264_nvenc', '-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', String(crf + 3), '-b:v', '0', '-pix_fmt', 'yuv420p'] };
    case 'h264_qsv':
      return { pre: [], vfSuffix: '', args: ['-c:v', 'h264_qsv', '-preset', 'faster', '-global_quality', String(crf + 4), '-pix_fmt', 'nv12'] };
    case 'h264_amf':
      return { pre: [], vfSuffix: '', args: ['-c:v', 'h264_amf', '-quality', 'quality', '-rc', 'cqp', '-qp_i', String(crf + 2), '-qp_p', String(crf + 4), '-pix_fmt', 'yuv420p'] };
    case 'h264_videotoolbox':
      return { pre: [], vfSuffix: '', args: ['-c:v', 'h264_videotoolbox', '-b:v', '14M', '-allow_sw', '1', '-pix_fmt', 'yuv420p'] };
    case 'h264_vaapi':
      return { pre: ['-vaapi_device', VAAPI_DEVICE], vfSuffix: ',format=nv12,hwupload', args: ['-c:v', 'h264_vaapi', '-qp', String(crf + 4)] };
    default:
      return { pre: [], vfSuffix: '', args: ['-c:v', 'libx264', '-preset', opts.preset ?? 'veryfast', '-crf', String(crf), '-pix_fmt', 'yuv420p'] };
  }
}

async function works(encoder: string): Promise<boolean> {
  const { pre, args, vfSuffix } = videoEncodeArgs(encoder);
  const out = `${os.tmpdir()}/tuto-gpu-probe-${process.pid}-${encoder}.mp4`;
  try {
    await run(ffmpegBin(), ['-hide_banner', '-loglevel', 'error', '-y', ...pre, '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=1',
      '-vf', `format=yuv420p${vfSuffix}`, ...args, out]);
    return fs.existsSync(out) && fs.statSync(out).size > 1000;
  } catch { return false; } finally { fs.rmSync(out, { force: true }); }
}

let cached: GpuInfo | null = null;

/** Detecta (una vez por ejecución) qué codificador de GPU funciona en esta máquina. */
export async function detectGpu(mode: GpuMode = 'auto', { quiet = false } = {}): Promise<GpuInfo> {
  if (cached && cached.mode === mode) return cached;
  const forced = (process.env.TUTO_GPU as GpuMode | undefined) || mode;
  const info: GpuInfo = { mode: forced, encoder: null, vendor: null, tried: [] };
  if (forced === 'off') return (cached = info);
  let compiled = '';
  try { compiled = await run(ffmpegBin(), ['-hide_banner', '-encoders']); } catch { /* sin ffmpeg */ }
  const list = forced === 'auto' ? candidates() : [forced as keyof typeof ENCODERS];
  for (const k of list) {
    const e = ENCODERS[k];
    if (!e || !compiled.includes(e.encoder)) continue;
    info.tried.push(e.encoder);
    if (await works(e.encoder)) { info.encoder = e.encoder; info.vendor = e.vendor; break; }
  }
  if (!quiet) {
    if (info.encoder) log.info(`GPU: codificando con ${info.encoder} (${info.vendor})`);
    else if (forced !== 'auto') log.warn(`GPU "${forced}" no disponible (${info.tried.join(', ') || 'no compilado en este FFmpeg'}); uso el procesador`);
  }
  return (cached = info);
}
