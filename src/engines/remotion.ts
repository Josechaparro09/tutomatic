import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { REPO_ROOT } from '../lib/config.ts';
import { log } from '../lib/util.ts';
import { detectGpu } from '../lib/gpu.ts';
import { stageAssets, type Engine } from './index.ts';

/**
 * Motor Remotion (React). Plantilla en engines/remotion/src/Tutorial.tsx.
 * Nota de licencia: Remotion es gratis para individuos y empresas pequeñas;
 * empresas más grandes necesitan licencia (remotion.dev/license).
 */
export const remotionEngine: Engine = {
  name: 'remotion',
  async render(p, tl, { quality, out }) {
    const publicDir = stageAssets(p, tl, path.join(p.build, 'remotion-public'));
    log.step('Remotion: empaquetando plantilla…');
    const serveUrl = await bundle({
      entryPoint: path.join(REPO_ROOT, 'engines', 'remotion', 'src', 'index.ts'),
      publicDir,
      onProgress: () => {},
    });
    const inputProps = { timeline: tl };
    const browserExecutable = process.env.REMOTION_BROWSER || p.cfg.recorder.executablePath || null;
    const r = p.cfg.render;
    const gpu = await detectGpu(r.gpu);
    // Chrome dibuja con la tarjeta gráfica (ANGLE). Si no hay GPU, Chromium cae solo a SwiftShader.
    const gl = r.gpu === 'off' ? null : ('angle' as const);
    const chromiumOptions = { gl };
    const composition = await selectComposition({ serveUrl, id: 'Tutorial', inputProps, browserExecutable, logLevel: 'error', chromiumOptions });
    // Remotion solo sabe codificar por GPU con NVENC (Windows/Linux) y VideoToolbox (Mac)
    const hw = gpu.encoder === 'h264_nvenc' || gpu.encoder === 'h264_videotoolbox';
    const crf = quality === 'draft' ? 28 : quality === 'standard' ? 20 : 16;
    const bitrate = quality === 'draft' ? '4M' : quality === 'standard' ? '10M' : '16M';
    const x264Preset = quality === 'draft' ? 'ultrafast' : quality === 'standard' ? 'veryfast' : (r.encoderPreset === 'medium' || r.encoderPreset === 'slow' ? r.encoderPreset : 'fast');

    const attempt = async (useHw: boolean, glMode: typeof gl) => {
      let last = -1;
      log.step(`Remotion: renderizando ${composition.durationInFrames} cuadros (${quality}; dibujo ${glMode ? 'GPU/ANGLE' : 'software'}; codificación ${useHw ? gpu.encoder : `libx264 ${x264Preset}`})…`);
      await renderMedia({
        composition, serveUrl, inputProps, codec: 'h264',
        ...(useHw ? { hardwareAcceleration: 'if-possible' as const, videoBitrate: bitrate } : { crf, x264Preset }),
        scale: quality === 'draft' ? 0.5 : 1,
        concurrency: r.concurrency ?? null,
        chromiumOptions: { gl: glMode },
        outputLocation: out,
        browserExecutable,
        audioCodec: 'aac',
        logLevel: 'error',
        onProgress: ({ progress }) => {
          const pct = Math.floor(progress * 100);
          if (pct >= last + 10) { last = pct; process.stdout.write(`  ${pct}%`); }
        },
      });
      console.log('');
    };
    try {
      await attempt(hw, gl);
    } catch (e: any) {
      if (!hw && !gl) throw e;
      console.log('');
      log.warn(`Render con GPU falló (${String(e.message).split('\n')[0].slice(0, 140)}); repito por software`);
      await attempt(false, null);
    }
    return out;
  },
};
