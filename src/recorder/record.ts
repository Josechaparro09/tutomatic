import fs from 'node:fs';
import path from 'node:path';
import type { CDPSession, Page } from 'playwright';
import { appUrl, type Project } from '../lib/project.ts';
import type { StoryboardT } from '../lib/schema.ts';
import { ensureLogin, launch, newAppContext, resolveLocator, runAction, visibleTarget, waitForSpec, type Theatrics } from './browser.ts';
import { cursorInitScript } from './cursor.ts';
import { loadVoiceManifest } from '../post/audio.ts';
import { ffmpeg, probeDuration } from '../lib/ffmpeg.ts';
import { detectGpu, videoEncodeArgs } from '../lib/gpu.ts';
import { ensureDir, estimateSpeech, log, readJson, sleep, writeJson } from '../lib/util.ts';
import { loadBrand } from '../lib/project.ts';
import { applyCoverage, type ScannedControl } from '../post/coverage.ts';

export interface Box { x: number; y: number; width: number; height: number }
export interface StepEvent {
  id: string;
  start: number; end: number;
  actionStart: number; actionEnd: number;
  box: Box | null;
  /** Encuadre tras la acción (null = alejar). Ausente en grabaciones antiguas. */
  boxAfter?: (Box & { dialog?: boolean }) | null;
  afterT?: number;
  click: { x: number; y: number; t: number } | null;
  voiceStart: number;
}
export interface Events { viewport: { width: number; height: number }; duration: number; steps: StepEvent[] }

const now = () => performance.now() / 1000;

/** Codifica con la GPU detectada; si algo falla, repite con libx264 (procesador). */
async function encodeWithFallback(p: Project, build: (enc: ReturnType<typeof videoEncodeArgs>) => string[]) {
  const gpu = await detectGpu(p.cfg.render.gpu);
  const t = Date.now();
  if (gpu.encoder) {
    try {
      await ffmpeg(build(videoEncodeArgs(gpu.encoder)));
      log.info(`Codificado con ${gpu.encoder} en ${((Date.now() - t) / 1000).toFixed(1)} s`);
      return;
    } catch (e: any) { log.warn(`${gpu.encoder} falló (${String(e.message).split('\n')[0].slice(0, 120)}); repito con el procesador`); }
  }
  await ffmpeg(build(videoEncodeArgs(null, { preset: p.cfg.render.encoderPreset })));
  log.info(`Codificado con libx264 (${p.cfg.render.encoderPreset}) en ${((Date.now() - t) / 1000).toFixed(1)} s`);
}
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function makeTheatrics(page: Page, p: Project, vp: { width: number; height: number }) {
  let pos = { x: vp.width * 0.55, y: vp.height * 0.6 };
  const th: Theatrics & { pos: () => { x: number; y: number } } = {
    typingDelayMs: p.cfg.recorder.typingDelayMs,
    pos: () => pos,
    async moveTo(x, y) {
      const dist = Math.hypot(x - pos.x, y - pos.y);
      // duración proporcional a la distancia (0.35–1.0 s)
      const dur = Math.min(1.0, Math.max(0.35, dist / 1400)) / p.cfg.recorder.cursorSpeed;
      const steps = Math.max(8, Math.round(dur * 60));
      const from = { ...pos };
      // ligera curva para que no sea una línea recta robótica
      const cx = (from.x + x) / 2 + (y - from.y) * 0.12, cy = (from.y + y) / 2 - (x - from.x) * 0.12;
      const t0 = now();
      for (let i = 1; i <= steps; i++) {
        const t = easeInOut(i / steps);
        const bx = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * cx + t * t * x;
        const by = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * cy + t * t * y;
        await page.mouse.move(bx, by);
        const target = t0 + (dur * i) / steps;
        const wait = (target - now()) * 1000;
        if (wait > 1) await sleep(wait);
      }
      pos = { x, y };
      await sleep(120);
    },
  };
  return th;
}

/** Captura por CDP: JPEG de alta calidad con marca de tiempo por cuadro. */
async function startScreencast(page: Page, framesDir: string, vp: { width: number; height: number }, quality: number) {
  ensureDir(framesDir);
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const frames: { file: string; t: number }[] = [];
  let n = 0;
  cdp.on('Page.screencastFrame', async (f: any) => {
    const t = now();
    const file = path.join(framesDir, `f${String(++n).padStart(6, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality, maxWidth: vp.width, maxHeight: vp.height, everyNthFrame: 1 });
  return {
    frames,
    async stop() { await cdp.send('Page.stopScreencast').catch(() => {}); },
  };
}

/** Une los cuadros (tiempo variable) en un MP4 a fps constante, recortado a [t0, tEnd]. */
async function assembleFrames(p: Project, frames: { file: string; t: number }[], t0: number, tEnd: number, out: string, fps: number, vp: { width: number; height: number }) {
  if (frames.length === 0) throw new Error('El screencast no produjo cuadros. Prueba recorder.mode: playwright en tutomatic.config.yaml');
  const list: string[] = [];
  for (let i = 0; i < frames.length; i++) {
    const start = Math.max(frames[i].t, t0);
    const end = Math.min(i + 1 < frames.length ? frames[i + 1].t : tEnd, tEnd);
    if (end <= t0 || end - start <= 0) continue;
    list.push(`file '${frames[i].file.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`, `duration ${(end - start).toFixed(4)}`);
  }
  if (list.length === 0) { // un solo cuadro antes de t0: estírelo
    const last = frames[frames.length - 1];
    list.push(`file '${last.file.replace(/\\/g, '/')}'`, `duration ${(tEnd - t0).toFixed(4)}`);
  }
  // el último archivo debe repetirse para que el concat respete su duración
  list.push(list[list.length - 2]);
  const listFile = path.join(path.dirname(frames[0].file), 'frames.txt');
  fs.writeFileSync(listFile, list.join('\n'));
  const vf = `fps=${fps},scale=${vp.width}:${vp.height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${vp.width}:${vp.height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`;
  await encodeWithFallback(p, (enc) => [...enc.pre, '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', vf + enc.vfSuffix, ...enc.args, '-movflags', '+faststart', '-t', (tEnd - t0).toFixed(3), out]);
}

export async function record(p: Project, sb: StoryboardT, { headed = false } = {}): Promise<Events> {
  const cfg = p.cfg.recorder;
  const vp = sb.app.viewport;
  const fps = p.cfg.render.fps;
  const voice = loadVoiceManifest(p);
  const brand = loadBrand(p);
  ensureDir(p.build);

  const browser = await launch(p, { headed });
  try {
    const storageState = sb.login?.record ? undefined : await ensureLogin(p, sb, browser);
    const rawDir = path.join(p.build, 'raw');
    fs.rmSync(rawDir, { recursive: true, force: true });
    ensureDir(rawDir);
    const ctx = await newAppContext(p, sb, browser, storageState,
      cfg.mode === 'playwright' ? { recordVideo: { dir: rawDir, size: vp } } : {});
    const ctxCreated = now();
    if (cfg.cursor) await ctx.addInitScript(cursorInitScript(brand.primary));
    const page = await ctx.newPage();

    const firstUrl = sb.login?.record ? sb.login.url : sb.app.start;
    log.step(`Abriendo ${appUrl(sb, firstUrl)}`);
    await page.goto(appUrl(sb, firstUrl), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    const th = makeTheatrics(page, p, vp);
    await page.mouse.move(th.pos().x, th.pos().y);
    await sleep(800);

    const cast = cfg.mode === 'screencast' ? await startScreencast(page, path.join(rawDir, 'frames'), vp, cfg.jpegQuality) : null;
    await sleep(300);
    const t0 = now();
    const rel = () => now() - t0;
    const events: StepEvent[] = [];

    if (sb.login?.record) {
      for (const a of sb.login.steps) await runAction(page, sb, a, th);
      await waitForSpec(page, sb.login.waitFor ?? 'networkidle', 20000);
      await sleep(600);
    }

    for (const [i, step] of sb.steps.entries()) {
      try {
      const start = rel();
      const voiceDelay = step.voiceDelay ?? 0.15;
      const voiceDur = voice[step.id]?.duration ?? estimateSpeech(step.narration);
      process.stdout.write(`  · [${i + 1}/${sb.steps.length}] ${step.id} (${step.action}) … `);

      let box: Box | null = null;
      let handle: any = null;
      let visHandle: any = null;
      if (step.selector && step.action !== 'goto') {
        const loc = resolveLocator(page, step.selector);
        try {
          const vis = await visibleTarget(loc, 15000);
          visHandle = await vis.elementHandle().catch(() => null);
          await vis.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
          handle = await loc.elementHandle().catch(() => null);
          // Encuadre: elemento + su etiqueta + lista abierta; fila completa para switches/casillas
          box = (await page.evaluate((el) => (window as any).__tutoFocusBox?.(el), handle ?? (await vis.elementHandle())).catch(() => null))
            ?? (await vis.boundingBox());
        } catch {
          throw new Error(`Paso "${step.id}": no encuentro el selector ${step.selector}. Corre "tutomatic rehearse" o "tutomatic inspect" para corregirlo.`);
        }
        // Marco de resaltado: ajustado al elemento visible (no al encuadre de cámara), aparece
        // mientras el cursor se acerca y se apaga solo al hacer clic / escribir / si el elemento cambia
        if (step.highlight) {
          if (visHandle) await page.evaluate((el) => (window as any).__tutoHighlightEl?.(el), visHandle).catch(() => {});
        }
      }

      // Encuadre manual del storyboard: manda sobre el automático
      const focusBoxOf = async () => {
        if (!step.focus) return undefined;
        const fl = resolveLocator(page, step.focus);
        if (!(await fl.isVisible().catch(() => false))) return null;
        const b = await fl.boundingBox().catch(() => null);
        return b ? { x: b.x - 12, y: b.y - 12, width: b.width + 24, height: b.height + 24 } : null;
      };
      const fPre = await focusBoxOf();
      if (fPre) box = fPre;
      const urlBefore = page.url();
      const dialogsBefore: number = await page.evaluate(() => (window as any).__tutoDialogCount?.() ?? 0).catch(() => 0);
      const hint = await page.evaluateHandle(() => document.activeElement).catch(() => null);
      const actionStart = rel();
      let click: StepEvent['click'] = null;
      await runAction(page, sb, step, th);
      if (box && ['click', 'dblclick', 'fill', 'type', 'select', 'check', 'uncheck'].includes(step.action)) {
        click = { x: th.pos().x, y: th.pos().y, t: actionStart + 0.5 };
      }
      const actionEnd = rel();
      // Encuadre DESPUÉS de la acción (modal que se abrió, campo tras elegir opción, nada si navegó)
      let boxAfter: Box | null = null;
      let afterT = actionEnd;
      if (step.selector && step.action !== 'goto') {
        await sleep(350);
        afterT = rel();
        boxAfter = await page.evaluate(([el, d, u, h]) => (window as any).__tutoAfterFocus?.(el, d, u, h) ?? null,
          [handle, dialogsBefore, urlBefore, hint] as const).catch(() => null);
      }
      if (step.focus) { const fPost = await focusBoxOf(); if (fPost !== undefined) boxAfter = fPost; }

      // Espera hasta que termine la narración del paso (+ respiración)
      const minEnd = start + Math.max(cfg.minStepSeconds, voiceDelay + voiceDur + cfg.gapAfterVoice) + (step.pauseAfter ?? 0);
      const wait = minEnd - rel();
      if (step.highlight) {
        // en pasos sin clic (hover/none) el marco se queda mientras se explica y se apaga suave antes del siguiente
        const hold = ['hover', 'none'].includes(step.action) ? Math.max(0, wait - 0.4) : 0;
        if (hold > 0) await sleep(hold * 1000);
        await page.evaluate(() => (window as any).__tutoHighlightOff?.(0)).catch(() => {});
      }
      const rest = minEnd - rel();
      if (rest > 0) await sleep(rest * 1000);
      const end = rel();
      events.push({ id: step.id, start, end, actionStart, actionEnd, box, boxAfter, afterT, click, voiceStart: start + voiceDelay });
      await handle?.dispose?.().catch?.(() => {});
      console.log(`${(end - start).toFixed(1)} s`);
      } catch (e: any) {
        console.log('');
        throw await stepFailure(p, page, step, e);
      }
    }

    await sleep(700);
    const tEnd = rel();
    await cast?.stop();
    const out = p.paths.recording;

    if (cast) {
      await ctx.close();
      // Guarda todo lo necesario para re-ensamblar sin volver a grabar (si FFmpeg falla aquí,
      // "tutomatic record <p> --reassemble" termina el trabajo sin repetir las acciones en la app)
      writeJson(path.join(rawDir, 'pending.json'), { t0, tEnd, fps, vp, frames: cast.frames, steps: events });
      await finishAssembly(p, path.join(rawDir, 'pending.json'));
      return readJson<Events>(p.paths.events);
    } else {
      const video = page.video();
      await ctx.close();
      const raw = await video!.path();
      const offset = t0 - ctxCreated;
      await encodeWithFallback(p, (enc) => [...enc.pre, '-ss', offset.toFixed(3), '-i', raw, '-t', tEnd.toFixed(3),
        '-vf', `fps=${fps},format=yuv420p` + enc.vfSuffix, ...enc.args, '-movflags', '+faststart', out]);
    }
    fs.rmSync(rawDir, { recursive: true, force: true });

    const duration = await probeDuration(out);
    const ev: Events = { viewport: vp, duration, steps: events };
    writeJson(p.paths.events, ev);
    log.ok(`Grabación lista: ${duration.toFixed(1)} s → ${path.relative(process.cwd(), out)}`);
    return ev;
  } finally {
    await browser.close();
  }
}

/**
 * Un paso falló al grabar: guarda una captura y lee los mensajes que muestra la app
 * (toasts, alertas, errores de formulario) para explicar POR QUÉ, no solo "Timeout".
 */
async function stepFailure(p: Project, page: any, step: { id: string; action: string; selector?: string }, e: any) {
  const dir = ensureDir(path.join(p.build, 'record-fail'));
  const shot = path.join(dir, `${step.id}.png`);
  await page.screenshot({ path: shot }).catch(() => {});
  const msgs: string[] = await page.evaluate(() => {
    const sel = '[role=alert],[role=status],[aria-live],[data-sonner-toast],.toast,.Toastify__toast,[class*="toast" i],[class*="error" i],[class*="alert" i],[aria-invalid=true]';
    const out = new Set<string>();
    document.querySelectorAll(sel).forEach((el: any) => {
      const t = (el.innerText || el.getAttribute?.('aria-label') || '').trim().replace(/\s+/g, ' ');
      if (t && t.length < 300 && el.checkVisibility?.() !== false) out.add(t);
    });
    return [...out].slice(0, 6);
  }).catch(() => []);
  const first = String(e?.message ?? e).split('\n')[0];
  const lines = [`El paso "${step.id}" (${step.action}${step.selector ? ` ${step.selector}` : ''}) falló: ${first}`];
  if (msgs.length) lines.push('La app mostraba en pantalla:', ...msgs.map((m) => `  • ${m}`));
  else lines.push('La app no mostraba ningún mensaje visible (puede que esté cargando, o que el texto esperado haya cambiado).');
  lines.push(`Captura: ${path.relative(process.cwd(), shot)}`);
  if (['click', 'press'].includes(step.action))
    lines.push('Ojo: si ese clic envía datos (crear, confirmar, guardar), revisa en la app si la acción se hizo o falló antes de volver a grabar.');
  lines.push('La grabación de antes sigue intacta. Arregla la causa y vuelve a correr el build.');
  return new Error(lines.join('\n'));
}

/** Une los cuadros guardados de una grabación (también sirve para reintentar tras un error de FFmpeg). */
export async function finishAssembly(p: Project, pendingFile = path.join(p.build, 'raw', 'pending.json')) {
  if (!fs.existsSync(pendingFile)) throw new Error('No hay una grabación pendiente de ensamblar. Corre: tutomatic record ' + p.name);
  const pend = readJson<any>(pendingFile);
  const frames = (pend.frames as { file: string; t: number }[]).filter((f) => fs.existsSync(f.file));
  if (!frames.length) throw new Error('Los cuadros de la grabación pendiente ya no existen. Hay que grabar de nuevo.');
  log.step(`Ensamblando ${frames.length} cuadros…`);
  try {
    await assembleFrames(p, frames, pend.t0, pend.t0 + pend.tEnd, p.paths.recording, pend.fps, pend.vp);
  } catch (e: any) {
    throw new Error(`${e.message}\nLa grabación quedó guardada: cuando lo arregles, corre "tutomatic record ${p.name} --reassemble" (no repite las acciones en la app).`);
  }
  const duration = await probeDuration(p.paths.recording);
  writeJson(p.paths.events, { viewport: pend.vp, duration, steps: pend.steps } satisfies Events);
  fs.rmSync(path.dirname(pendingFile), { recursive: true, force: true });
  log.ok(`Grabación lista: ${duration.toFixed(1)} s → ${path.relative(process.cwd(), p.paths.recording)}`);
}

/** Ensayo rápido: ejecuta el storyboard sin grabar para validar selectores. */
export async function rehearse(p: Project, sb: StoryboardT, { headed = false, until }: { headed?: boolean; until?: string } = {}) {
  const browser = await launch(p, { headed });
  const failDir = ensureDir(path.join(p.build, 'rehearse'));
  let ok = 0;
  try {
    const storageState = await ensureLogin(p, sb, browser, { force: true });
    const ctx = await newAppContext(p, sb, browser, storageState);
    const page = await ctx.newPage();
    await page.goto(appUrl(sb, sb.app.start), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    // Cobertura: qué controles hay en pantalla tras cada paso y cuáles toca el storyboard
    const scanned = new Map<string, ScannedControl>();
    const touched = new Set<string>();
    const scan = async (after: string) => {
      await sleep(250);
      const list: any[] = await page.evaluate(() => (window as any).__tutoScan?.() ?? []).catch(() => []);
      for (const ctl of list) if (!scanned.has(ctl.fingerprint)) scanned.set(ctl.fingerprint, { ...ctl, seenAfter: after, url: page.url() });
    };
    await scan('inicio');
    let stoppedBefore: string | null = null;
    for (const [i, step] of sb.steps.entries()) {
      if (until && step.id === until) {
        log.info(`Detenido antes de "${until}" (--until): los pasos siguientes no se ejecutaron`);
        stoppedBefore = until;
        break;
      }
      try {
        if (step.selector && !['goto', 'wait', 'none'].includes(step.action)) {
          const fp = await resolveLocator(page, step.selector)
            .evaluate((el) => (window as any).__tutoFingerprint?.(el), undefined, { timeout: 15000 }).catch(() => null);
          if (fp) touched.add(fp);
        }
        await runAction(page, sb, step);
        ok++;
        log.ok(`[${i + 1}] ${step.id} ${step.action}${step.selector ? ` ${step.selector}` : ''}`);
        await scan(step.id);
      } catch (e: any) {
        const shot = path.join(failDir, `${step.id}.png`);
        await page.screenshot({ path: shot }).catch(() => {});
        log.err(`[${i + 1}] ${step.id}: ${e.message.split('\n')[0]}`);
        log.info(`URL: ${page.url()}  · captura: ${shot}`);
        log.info(`Sugerencia: tutomatic inspect ${p.name} --path "${new URL(page.url()).pathname}"`);
        return { ok, failed: step.id };
      }
    }
    await ctx.close();
    log.ok(`Ensayo: ${ok}/${sb.steps.length} pasos OK`);
    applyCoverage(p, sb, scanned, touched, stoppedBefore);
  } finally {
    await browser.close();
  }
  return { ok, failed: null };
}
