import fs from 'node:fs';
import type { Project } from '../lib/project.ts';
import type { StoryboardT } from '../lib/schema.ts';
import type { VoicePlacement } from './timeline.ts';
import { ffmpeg } from '../lib/ffmpeg.ts';
import { log } from '../lib/util.ts';

/**
 * Mezcla final: voces en su posición exacta + música con "ducking" (baja cuando hay voz)
 * + normalización a -16 LUFS (estándar para YouTube/redes).
 */
export async function mixAudio(p: Project, sb: StoryboardT, voices: VoicePlacement[], duration: number) {
  const D = duration.toFixed(3);
  const args: string[] = [];
  const filters: string[] = [];
  voices.forEach((v, i) => {
    args.push('-i', v.file);
    const ms = Math.round(v.start * 1000);
    filters.push(`[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[v${i}]`);
  });
  const hasMusic = sb.music.enabled && (sb.music.provider ?? p.cfg.providers.music.provider) !== 'none' && fs.existsSync(p.paths.music);
  const n = voices.length;

  if (n === 0 && !hasMusic) {
    await ffmpeg(['-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo`, '-t', D, p.paths.mix]);
    return p.paths.mix;
  }

  if (n > 0) filters.push(`${voices.map((_, i) => `[v${i}]`).join('')}amix=inputs=${n}:normalize=0:dropout_transition=0,apad=whole_dur=${D}[voice]`);

  if (hasMusic) {
    args.push('-stream_loop', '-1', '-i', p.paths.music);
    const mi = n;
    const level = Math.min(1, sb.music.volume * 2.2).toFixed(3);
    const fadeOutStart = Math.max(0, duration - 3).toFixed(3);
    filters.push(`[${mi}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${D},asetpts=PTS-STARTPTS,volume=${level},afade=t=in:d=1.5,afade=t=out:st=${fadeOutStart}:d=3[mus]`);
    if (n > 0) {
      filters.push('[voice]asplit=2[vA][vSC]');
      filters.push('[mus][vSC]sidechaincompress=threshold=0.015:ratio=10:attack=15:release=450:makeup=1[duck]');
      filters.push('[vA][duck]amix=inputs=2:normalize=0:duration=first[pre]');
    } else filters.push('[mus]anull[pre]');
  } else filters.push('[voice]anull[pre]');

  filters.push(`[pre]atrim=0:${D},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[out]`);
  log.step(`Mezclando ${n} clips de voz${hasMusic ? ' + música con ducking' : ''}…`);
  await ffmpeg([...args, '-filter_complex', filters.join(';'), '-map', '[out]', '-ac', '2', '-ar', '48000', '-t', D, p.paths.mix]);
  log.ok('Audio mezclado (-16 LUFS)');
  return p.paths.mix;
}
