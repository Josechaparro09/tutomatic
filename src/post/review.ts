import fs from 'node:fs';
import path from 'node:path';
import type { Project } from '../lib/project.ts';
import type { StoryboardT } from '../lib/schema.ts';
import type { Timeline } from '../../engines/shared/types.ts';
import { ffmpeg } from '../lib/ffmpeg.ts';
import { ensureDir, log, readJson } from '../lib/util.ts';

/**
 * Hoja de revisión por paso: 3 cuadros del video final (inicio · justo después de la acción · final),
 * para revisar encuadre, resaltado y subtítulos sin ver todo el video.
 * Deja build/review/NN-<paso>.png y build/review/index.md (narración + tiempos + qué revisar).
 */
export async function makeReview(p: Project, sb: StoryboardT, { source }: { source?: string } = {}) {
  const tl: Timeline = readJson(p.paths.timeline);
  const video = source ?? (fs.existsSync(p.paths.finalVideo) ? p.paths.finalVideo : null);
  if (!video) throw new Error('No hay video final. Corre: tutomatic render ' + p.name + ' --draft');
  const dir = path.join(p.build, 'review');
  fs.rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
  const lines = [`# Revisión: ${sb.title}`, '', `Video: ${video}`, '',
    'Para cada paso mira las 3 imágenes (inicio · después de la acción · final) y verifica:',
    '- el encuadre muestra completo lo que dice la narración (etiqueta + campo, lista, modal);',
    '- el marco de resaltado está ajustado al elemento y desaparece después del clic;',
    '- el subtítulo y el rótulo no tapan lo que se explica;',
    '- la pantalla coincide con lo que dice la voz (datos, estados, textos);',
    '- no hay datos sobrantes de ensayos anteriores.', ''];
  for (const st of tl.steps) {
    const sbStep = sb.steps.find((s) => s.id === st.id);
    const after = st.afterT ?? (st.start + st.end) / 2;
    const times = [st.start + 0.35, Math.min(st.end - 0.2, after + 0.5), st.end - 0.15].map((t) => Math.max(0, t));
    const frames: string[] = [];
    for (const [k, t] of times.entries()) {
      const f = path.join(dir, `_${st.index}-${k}.png`);
      await ffmpeg(['-ss', t.toFixed(2), '-i', video, '-frames:v', '1', '-vf', 'scale=640:-2', f]);
      frames.push(f);
    }
    const sheet = path.join(dir, `${String(st.index).padStart(2, '0')}-${st.id}.png`);
    await ffmpeg([...frames.flatMap((f) => ['-i', f]), '-filter_complex', `hstack=inputs=${frames.length}`, sheet]);
    frames.forEach((f) => fs.rmSync(f, { force: true }));
    lines.push(`## ${st.index}. ${st.id} (${sbStep?.action ?? ''}) — ${st.start.toFixed(1)}–${st.end.toFixed(1)} s`,
      `Narración: "${sbStep?.narration ?? ''}"`, `Imagen: ${path.basename(sheet)}`, '');
  }
  fs.writeFileSync(path.join(dir, 'index.md'), lines.join('\n'));
  log.ok(`Hojas de revisión: ${dir} (${tl.steps.length} pasos). Míralas antes del render final.`);
  return dir;
}
