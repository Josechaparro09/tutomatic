import fs from 'node:fs';
import path from 'node:path';
import type { Project } from '../lib/project.ts';
import type { Timeline } from '../../engines/shared/types.ts';
import { ensureDir } from '../lib/util.ts';

export type EngineName = 'remotion' | 'hyperframes';
export type Quality = 'draft' | 'standard' | 'high';

export interface RenderOpts { quality: Quality; out: string }

export interface Engine {
  name: EngineName;
  render(p: Project, tl: Timeline, opts: RenderOpts): Promise<string>;
}

/** Copia a `dir` solo los recursos que el video necesita (grabación, mezcla, logo). */
export function stageAssets(p: Project, tl: Timeline, dir: string) {
  ensureDir(dir);
  const files = [[p.build, tl.recording.src], [p.build, tl.audio.src], [p.dir, tl.brand.logo]].filter(([, r]) => r) as [string, string][];
  for (const [base, rel] of files) {
    const src = path.join(base, rel);
    const dst = path.join(dir, rel);
    if (!fs.existsSync(src)) throw new Error(`Falta el recurso ${src}`);
    ensureDir(path.dirname(dst));
    const same = fs.existsSync(dst) && fs.statSync(dst).size === fs.statSync(src).size && fs.statSync(dst).mtimeMs >= fs.statSync(src).mtimeMs;
    if (!same) fs.copyFileSync(src, dst);
  }
  return dir;
}

export async function getEngine(name: EngineName): Promise<Engine> {
  if (name === 'remotion') return (await import('./remotion.ts')).remotionEngine;
  if (name === 'hyperframes') return (await import('./hyperframes.ts')).hyperframesEngine;
  throw new Error(`Motor desconocido "${name}". Usa remotion o hyperframes.`);
}
