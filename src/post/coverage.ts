import fs from 'node:fs';
import type { Project } from '../lib/project.ts';
import type { StoryboardT } from '../lib/schema.ts';
import { c, hash, log, readJson, slug, writeJson } from '../lib/util.ts';
import path from 'node:path';

/**
 * Cobertura de formularios: detecta controles (campos, switches, casillas, selects) que el
 * tutorial NO toca en los formularios que sí usa, y los convierte en preguntas para el usuario.
 * Así ninguna opción (p. ej. "Pago contra entrega") se omite en silencio.
 */

export interface ScannedControl {
  kind: string; role: string; name: string; nameSource: string; section: string; group: string;
  required: boolean; state: string; disabled: boolean; fingerprint: string;
  selector: string; alternatives: string[];
  /** Paso tras el cual apareció por primera vez ("inicio" = antes del primer paso) */
  seenAfter: string; url: string;
}

export interface CoverageReport {
  generatedAt: string;
  stepsHash: string;
  complete: boolean;
  stoppedBefore: string | null;
  touched: string[];
  untouched: ScannedControl[];
}

const coverageFile = (p: Project) => path.join(p.build, 'coverage.json');

/** Huella de las acciones del storyboard (no de la narración): si cambia, hay que volver a ensayar. */
export function stepsHash(sb: StoryboardT) {
  return hash(sb.app, sb.steps.map((s) => [s.id, s.action, s.selector ?? '', s.value ?? '', s.key ?? '', s.url ?? '']));
}

const KIND_ES: Record<string, string> = {
  switch: 'interruptor', checkbox: 'casilla', radio: 'opción (radio)', select: 'lista desplegable',
  combobox: 'buscador/lista', text: 'campo de texto', textarea: 'campo de texto largo', date: 'fecha',
  file: 'carga de archivo', slider: 'deslizador', editor: 'editor de texto',
};

function questionFor(ctl: ScannedControl) {
  const where = ctl.section ? ` (sección "${ctl.section}")` : '';
  const name = ctl.name.replace(/\s*\*\s*$/, '') || ctl.selector;
  if (['switch', 'checkbox'].includes(ctl.kind)) {
    const on = ctl.state === 'encendido';
    const st = ctl.kind === 'checkbox' ? (on ? 'marcada' : 'sin marcar') : ctl.state;
    return `El formulario tiene "${name}"${where}: ${KIND_ES[ctl.kind]}, actualmente ${st}. El tutorial no lo toca. ` +
      `¿Lo ${on ? 'desactivamos' : 'activamos'} en el video, solo lo explicamos sin tocarlo, o lo omitimos?`;
  }
  if (['radio', 'select', 'combobox'].includes(ctl.kind)) {
    return `El formulario tiene "${name}"${where} (${KIND_ES[ctl.kind]}${ctl.state ? `, valor actual "${ctl.state}"` : ''}) y el tutorial no lo usa. ` +
      `¿Elegimos una opción (¿cuál?), solo lo explicamos, o lo omitimos?`;
  }
  return `El campo "${name}"${where}${ctl.required ? ' es OBLIGATORIO y' : ''} no se llena en el tutorial. ` +
    `¿Lo llenamos (¿con qué valor de ejemplo?), solo lo explicamos, o lo omitimos?`;
}

/** Cruza lo escaneado con lo tocado, escribe build/coverage.json y actualiza las preguntas del storyboard. */
export function applyCoverage(p: Project, sb: StoryboardT, scanned: Map<string, ScannedControl>, touched: Set<string>, stoppedBefore: string | null) {
  const touchedGroups = new Set<string>();
  for (const fp of touched) { const s = scanned.get(fp); if (s) touchedGroups.add(s.group); }
  const untouched = [...scanned.values()].filter((s) => touchedGroups.has(s.group) && !touched.has(s.fingerprint) && !s.disabled);

  const report: CoverageReport = {
    generatedAt: new Date().toISOString(), stepsHash: stepsHash(sb), complete: !stoppedBefore,
    stoppedBefore, touched: [...touched], untouched,
  };
  writeJson(coverageFile(p), report);

  // Actualiza preguntas en storyboard.json (respetando el formato y lo que ya respondió el usuario)
  const raw = readJson<any>(p.paths.storyboard);
  raw.questions = Array.isArray(raw.questions) ? raw.questions : [];
  const byControl = new Map<string, any>(raw.questions.filter((q: any) => q.control).map((q: any) => [q.control, q]));
  // quita preguntas automáticas sin responder de controles que ahora sí se tocan
  raw.questions = raw.questions.filter((q: any) => !(q.source === 'coverage' && !q.answer && touched.has(q.control)));
  const ids = new Set(raw.questions.map((q: any) => q.id));
  let added = 0;
  for (const ctl of untouched) {
    if (byControl.has(ctl.fingerprint)) continue;
    let id = `campo-${slug(ctl.name || ctl.kind)}`;
    for (let i = 2; ids.has(id); i++) id = `campo-${slug(ctl.name || ctl.kind)}-${i}`;
    ids.add(id);
    const blocking = ['switch', 'checkbox', 'radio', 'select', 'combobox'].includes(ctl.kind) || ctl.required;
    raw.questions.push({ id, question: questionFor(ctl), blocking, answer: null, source: 'coverage', control: ctl.fingerprint, selector: ctl.selector });
    added++;
  }
  fs.writeFileSync(p.paths.storyboard, JSON.stringify(raw, null, 2) + '\n');

  // Informe
  if (untouched.length === 0) {
    log.ok(`Cobertura: el tutorial usa todos los controles de los formularios que recorre (${touched.size} tocados)`);
  } else {
    console.log(c.yellow(`\nCobertura: ${untouched.length} control(es) de los formularios del tutorial NO se usan:`));
    for (const u of untouched) {
      const q = raw.questions.find((x: any) => x.control === u.fingerprint);
      const status = q?.answer ? c.green(`respondida: ${q.answer}`) : c.red('SIN RESPONDER');
      console.log(`  • ${u.name || '(sin nombre)'}  ${c.dim(`[${KIND_ES[u.kind] ?? u.kind}${u.required ? ', obligatorio' : ''}${['switch', 'checkbox'].includes(u.kind) ? `, ${u.state}` : ''}]`)}  ${c.dim(u.selector)}  → ${status}`);
    }
    if (added) log.warn(`Agregué ${added} pregunta(s) al storyboard (source: "coverage"). Pregúntaselas al usuario antes de grabar.`);
  }
  if (stoppedBefore) log.warn(`Cobertura parcial: el ensayo se detuvo antes de "${stoppedBefore}"`);
  return report;
}

/** Verifica que la cobertura esté al día con los pasos actuales. */
export function coverageStatus(p: Project, sb: StoryboardT): { ok: boolean; reason?: string; report?: CoverageReport } {
  const f = coverageFile(p);
  if (!fs.existsSync(f)) return { ok: false, reason: 'no hay ensayo de cobertura (corre: tutomatic rehearse ' + p.name + ')' };
  const report = readJson<CoverageReport>(f);
  if (report.stepsHash !== stepsHash(sb)) return { ok: false, reason: 'los pasos cambiaron desde el último ensayo (corre: tutomatic rehearse ' + p.name + ')', report };
  return { ok: true, report };
}
