import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import { loadConfig, REPO_ROOT } from './lib/config.ts';
import { openProject, loadStoryboard, prepareDirs, projectsRoot, type Project } from './lib/project.ts';
import { c, ensureDir, log, readJson, writeJson, estimateSpeech } from './lib/util.ts';
import { ensureFfmpeg } from './lib/ffmpeg.ts';
import { listProviders } from './providers/index.ts';
import { generateMusic, generateVoice, loadVoiceManifest, narrationSegments } from './post/audio.ts';
import { buildTimeline, writeChapters, writeSubtitles } from './post/timeline.ts';
import { mixAudio } from './post/mix.ts';
import { coverageStatus } from './post/coverage.ts';
import type { Timeline } from '../engines/shared/types.ts';
import type { EngineName, Quality } from './engines/index.ts';

const program = new Command();
program
  .name('tutomatic')
  .description('Graba y produce videos tutoriales de apps web: voz, música, subtítulos e identidad visual.\nMotores de render: Remotion o HyperFrames.')
  .version('0.1.0');

const wrap = (fn: (...a: any[]) => Promise<void>) => async (...a: any[]) => {
  try { await fn(...a); } catch (e: any) { log.err(e?.message ?? String(e)); process.exitCode = 1; }
};

function questionsBlocking(p: Project) {
  const sb = loadStoryboard(p);
  return sb.questions.filter((q) => q.blocking && !q.answer?.trim());
}

// ───────────────────────── init
program.command('init <name>')
  .description('Crea un proyecto con un storyboard plantilla')
  .requiredOption('-u, --url <url>', 'URL base de la app (ej. http://localhost:3000)')
  .option('-t, --title <title>', 'título del tutorial')
  .option('-l, --lang <lang>', 'idioma (BCP-47)', 'es-CO')
  .option('--login-url <path>', 'ruta del login', '/login')
  .option('--no-login', 'la app no requiere login')
  .option('--design <estilo>', 'estilo visual: ruta | etiqueta | suave | none (por defecto el de la config)')
  .action(wrap(async (name: string, o) => {
    const p = openProject(name, { mustExist: false });
    if (fs.existsSync(p.paths.storyboard)) throw new Error(`Ya existe ${p.paths.storyboard}`);
    ensureDir(p.dir);
    const sb = {
      $schema: path.relative(p.dir, path.join(REPO_ROOT, 'schema', 'storyboard.schema.json')).split(path.sep).join('/'),
      title: o.title ?? 'Cómo hacer X en la app',
      subtitle: 'Tutorial paso a paso',
      language: o.lang,
      audience: 'Usuarios nuevos',
      goal: 'Qué logra el usuario al terminar',
      app: { url: o.url, start: '/', viewport: { width: 1440, height: 810 } },
      ...(o.login !== false ? {
        login: {
          url: o.loginUrl,
          steps: [
            { action: 'fill', selector: 'label:Correo', value: '${TUTO_USER}' },
            { action: 'fill', selector: 'label:Contraseña', value: '${TUTO_PASSWORD}' },
            { action: 'click', selector: 'role:button|Ingresar' },
          ],
          waitFor: 'networkidle',
          record: false,
        },
      } : {}),
      voice: {},
      music: { enabled: true, volume: 0.18, prompt: 'Light, modern, optimistic background music for a software tutorial, soft synths, 95 BPM' },
      intro: { narration: 'En este tutorial vas a aprender a…' },
      outro: { title: '¡Listo!', subtitle: 'Ya sabes cómo hacerlo', cta: 'Pruébalo ahora', narration: '¡Y listo! Así de fácil.' },
      steps: [
        { id: 'abrir-modulo', title: 'Abre el módulo', narration: 'Primero, entra al módulo desde el menú lateral.', action: 'click', selector: 'role:link|Módulo', zoom: true },
      ],
      questions: [],
    };
    writeJson(p.paths.storyboard, sb);
    const style = o.design ?? loadConfig().design.default;
    if (style && style !== 'none') {
      const src = path.join(REPO_ROOT, 'examples', 'designs', style);
      if (fs.existsSync(src)) { fs.cpSync(src, path.join(p.dir, 'design'), { recursive: true }); log.info(`Estilo visual: ${style} (en ${path.join(name, 'design')})`); }
      else log.warn(`No existe el estilo "${style}" en examples/designs; el proyecto queda con el estilo base`);
    }
    log.ok(`Proyecto creado: ${p.dir}`);
    log.info(`Siguiente: tutomatic inspect ${name}   (lista elementos y selectores de la app)`);
  }));

// ───────────────────────── setup / skill / update / where
program.command('setup').description('Asistente: configura voz, música, motor, GPU, estilo, usuario de la app y la skill')
  .option('--only <secciones>', 'solo estas secciones (coma): requisitos, voz, musica, motor, diseño, app, skill')
  .action(wrap(async (o) => { const { runSetup } = await import('./setup.ts'); await runSetup({ only: o.only }); }));

program.command('skill').description('Instala o actualiza la skill de Claude')
  .option('--no-claude-code', 'no copiarla a ~/.claude/skills')
  .option('--no-zip', 'no generar tutomatic.skill (para la app de Claude)')
  .action(wrap(async (o) => { const { installSkill } = await import('./setup.ts'); await installSkill({ claudeCode: o.claudeCode, zip: o.zip }); }));

program.command('where').description('Muestra la carpeta de Tutomatic').action(() => { console.log(REPO_ROOT); });

program.command('update').description('Baja la última versión (git pull), reinstala dependencias y actualiza la skill')
  .action(wrap(async () => {
    const { spawnSync } = await import('node:child_process');
    const sh = (cmd: string, args: string[]) => spawnSync(cmd, args, { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' }).status === 0;
    if (!fs.existsSync(path.join(REPO_ROOT, '.git'))) throw new Error('Esta copia no viene de git. Instálala con: git clone https://github.com/Josechaparro09/tutomatic');
    log.step('Bajando la última versión…');
    if (!sh('git', ['pull', '--ff-only'])) throw new Error('git pull falló (¿cambiaste archivos de la herramienta a mano?). Revisa con: git status');
    log.step('Instalando dependencias…');
    if (!sh('npm', ['install', '--no-fund', '--no-audit'])) throw new Error('npm install falló');
    const { installSkill, claudeSkillDir } = await import('./setup.ts');
    await installSkill({ claudeCode: fs.existsSync(claudeSkillDir()), zip: true });
    log.ok('Tutomatic actualizado. Si la app de Claude usa la skill, vuelve a subir tutomatic.skill para tener la última versión.');
  }));

// ───────────────────────── doctor
program.command('doctor').description('Verifica dependencias, claves y proveedores').action(wrap(async () => {
  const cfg = loadConfig();
  console.log(c.bold('tutomatic doctor'));
  { const { configPath } = await import('./lib/config.ts');
    if (!fs.existsSync(configPath())) log.warn('Todavía no configuras este equipo: corre ' + c.bold('tutomatic setup'));
    else console.log(c.dim(`  Config: ${configPath()}`)); }
  console.log(`  Node            ${process.version}`);
  try { const f = await ensureFfmpeg(); log.ok(`FFmpeg: ${f.version.slice(0, 40)}  (${f.ffmpeg})`); } catch (e: any) { log.err(e.message); }
  try {
    const { chromium } = await import('playwright');
    const b = await chromium.launch({ executablePath: cfg.recorder.executablePath || process.env.TUTO_CHROME || undefined });
    log.ok(`Chromium (Playwright) ${b.version()}`); await b.close();
  } catch (e: any) { log.err(`Chromium no disponible: ejecuta "npx playwright install chromium"  (${e.message.split('\n')[0]})`); }
  const k = (v: string) => (process.env[v] ? c.green('✔') : c.dim('—'));
  console.log(`  GEMINI_API_KEY ${k('GEMINI_API_KEY')}   ELEVENLABS_API_KEY ${k('ELEVENLABS_API_KEY')}   OPENAI_API_KEY ${k('OPENAI_API_KEY')}`);
  console.log(`  TUTO_USER ${k('TUTO_USER')}   TUTO_PASSWORD ${k('TUTO_PASSWORD')}`);
  const pr = listProviders();
  console.log(`  Proveedores: voz [${pr.tts.join(', ')}]  música [${pr.music.join(', ')}]  imagen [${pr.image.join(', ')}]`);
  console.log(`  Config: voz=${cfg.providers.tts.provider}/${cfg.providers.tts.model} (${cfg.providers.tts.voice})  música=${cfg.providers.music.provider}/${cfg.providers.music.model}  motor=${cfg.render.engine}`);
  console.log(`  Proyectos en: ${projectsRoot(cfg)}`);
  const { detectGpu } = await import('./lib/gpu.ts');
  const g = await detectGpu(cfg.render.gpu, { quiet: true });
  if (g.encoder) log.ok(`GPU: ${g.vendor} → ${g.encoder} (render.gpu: ${cfg.render.gpu})`);
  else log.info(`GPU: ninguna disponible para FFmpeg${g.tried.length ? ` (probé ${g.tried.join(', ')})` : ''}; se usa el procesador (libx264 ${cfg.render.encoderPreset})`);
  {
    const { voicestudioVoices, voicestudioURL } = await import('./providers/others.ts');
    const vs = cfg.providers.tts.provider === 'voicestudio';
    try {
      const v = await voicestudioVoices(cfg.providers.tts as any);
      const n = (v?.voices ?? v?.data ?? (Array.isArray(v) ? v : [])).length;
      log.ok(`VoiceStudio en ${voicestudioURL(cfg.providers.tts as any)} (${n} voces) — tutomatic voices para verlas`);
    } catch (e: any) {
      if (vs) log.err(`VoiceStudio no responde en ${voicestudioURL(cfg.providers.tts as any)}: abre la app (${String(e.cause?.code ?? e.message).slice(0, 80)})`);
      else console.log(c.dim('  VoiceStudio (voz local): no está abierto — opcional'));
    }
  }
  if (process.env.TUTO_PROVIDER) log.warn(`TUTO_PROVIDER=${process.env.TUTO_PROVIDER} fuerza ese proveedor en todo`);
}));

// ───────────────────────── inspect
program.command('inspect <project>')
  .description('Abre una pantalla de la app y lista elementos interactivos con selectores sugeridos + captura numerada')
  .option('-p, --path <path>', 'ruta a inspeccionar (por defecto app.start)')
  .option('-a, --after <stepId>', 'ejecuta el storyboard hasta ese paso y luego inspecciona')
  .option('--no-login', 'no iniciar sesión')
  .option('--headed', 'mostrar el navegador')
  .action(wrap(async (name: string, o) => {
    const p = openProject(name); prepareDirs(p);
    const { inspect } = await import('./recorder/inspect.ts');
    await inspect(p, loadStoryboard(p), { path: o.path, afterStep: o.after, login: o.login, headed: o.headed });
  }));

// ───────────────────────── validate
program.command('validate <project>').description('Valida el storyboard y muestra preguntas pendientes y duración estimada')
  .action(wrap(async (name: string) => {
    const p = openProject(name);
    const sb = loadStoryboard(p);
    const est = narrationSegments(sb).reduce((a, s) => a + estimateSpeech(s.text) + 0.6, 0) + 7;
    log.ok(`storyboard válido: ${sb.steps.length} pasos, ~${Math.round(est)} s estimados`);
    const noNarr = sb.steps.filter((s) => !s.narration.trim()).map((s) => s.id);
    if (noNarr.length) log.warn(`Pasos sin narración: ${noNarr.join(', ')}`);
    const long = sb.steps.filter((s) => s.narration.length > 220).map((s) => s.id);
    if (long.length) log.warn(`Narraciones largas (>220 caracteres), considera partirlas: ${long.join(', ')}`);
    const cov = coverageStatus(p, sb);
    if (!cov.ok) log.warn(`Cobertura: ${cov.reason}`);
    else if (cov.report!.untouched.length) log.info(`Cobertura: ${cov.report!.untouched.length} control(es) no usados (ver preguntas "campo-…")`);
    else log.ok('Cobertura: todos los controles de los formularios recorridos se usan');
    const pend = sb.questions.filter((q) => !q.answer?.trim());
    if (pend.length) {
      console.log(c.yellow(`\nPreguntas pendientes (${pend.length}):`));
      for (const q of pend) console.log(`  ${q.blocking ? c.red('●') : c.dim('○')} [${q.id}] ${q.question}${q.source === 'coverage' ? c.dim('  (cobertura)') : ''}`);
    }
  }));

// ───────────────────────── rehearse
program.command('rehearse <project>').description('Ensaya el storyboard rápido (sin grabar) para validar selectores')
  .option('--headed', 'mostrar el navegador')
  .option('--until <stepId>', 'detenerse ANTES de este paso (p. ej. el que guarda/envía) para no crear datos')
  .action(wrap(async (name: string, o) => {
    const p = openProject(name); prepareDirs(p);
    const { rehearse } = await import('./recorder/record.ts');
    const r = await rehearse(p, loadStoryboard(p), { headed: o.headed, until: o.until });
    if (r.failed) process.exitCode = 2;
  }));

// ───────────────────────── brand
program.command('brand <project>').description('Extrae la identidad visual de la app → brand.json')
  .option('-f, --force', 'regenerar aunque exista')
  .action(wrap(async (name: string, o) => {
    const p = openProject(name); prepareDirs(p);
    const { extractBrand } = await import('./recorder/brand.ts');
    await extractBrand(p, loadStoryboard(p), { force: o.force });
  }));

// ───────────────────────── voice
program.command('voice <project>').description('Genera la narración (con caché: solo regenera lo que cambió)')
  .option('-f, --force', 'regenerar todo')
  .option('--only <ids>', 'solo estos segmentos (coma)')
  .option('--tts <proveedor>', 'usar otro proveedor de voz solo esta vez (p. ej. voicestudio)')
  .action(wrap(async (name: string, o) => {
    if (o.tts) process.env.TUTO_TTS = o.tts;
    const p = openProject(name); prepareDirs(p);
    await generateVoice(p, loadStoryboard(p), { force: o.force, only: o.only?.split(',') });
  }));

// ───────────────────────── voices (VoiceStudio)
program.command('voices').description('Lista las voces de VoiceStudio (local) para poner su id en providers.tts.voice')
  .option('--json', 'respuesta completa')
  .action(wrap(async (o) => {
    const cfg = loadConfig();
    const { voicestudioVoices } = await import('./providers/others.ts');
    const v = await voicestudioVoices(cfg.providers.tts as any).catch((e: any) => { throw new Error(`VoiceStudio no responde: ábrelo primero (${e.cause?.code ?? e.message})`); });
    if (o.json) { console.log(JSON.stringify(v, null, 2)); return; }
    const list: any[] = v?.voices ?? v?.data ?? (Array.isArray(v) ? v : []);
    if (!list.length) { console.log(JSON.stringify(v, null, 2)); return; }
    for (const x of list) {
      const id = x.id ?? x.voice_id ?? x.profile_id ?? x.name;
      const extra = [x.name && x.name !== id ? x.name : '', x.engine ?? x.model ?? '', x.language ?? x.lang ?? ''].filter(Boolean).join(' · ');
      console.log(`  ${c.bold(String(id))}${extra ? c.dim('  ' + extra) : ''}`);
    }
    if (Array.isArray(v?.engines)) console.log(c.dim(`  Motores: ${v.engines.map((e: any) => e.id ?? e.name ?? e).join(', ')}`));
  }));

// ───────────────────────── record
program.command('record <project>').description('Graba la app siguiendo el storyboard, sincronizado con la voz')
  .option('--headed', 'mostrar el navegador')
  .option('--reassemble', 'solo une los cuadros de la última grabación (si falló FFmpeg), sin volver a grabar')
  .action(wrap(async (name: string, o) => {
    const p = openProject(name); prepareDirs(p);
    await ensureFfmpeg();
    if (o.reassemble) { const { finishAssembly } = await import('./recorder/record.ts'); await finishAssembly(p); return; }
    const sb = loadStoryboard(p);
    if (!fs.existsSync(p.paths.voiceManifest)) log.warn('Aún no hay voz: los tiempos se estimarán. Recomendado: tutomatic voice primero.');
    const { record } = await import('./recorder/record.ts');
    await record(p, sb, { headed: o.headed });
  }));

// ───────────────────────── music
program.command('music <project>').description('Genera la música de fondo')
  .option('-f, --force', 'regenerar')
  .option('-d, --duration <s>', 'duración en segundos (por defecto, la del video)')
  .action(wrap(async (name: string, o) => {
    const p = openProject(name); prepareDirs(p);
    const sb = loadStoryboard(p);
    let d = o.duration ? +o.duration : 0;
    if (!d && fs.existsSync(p.paths.timeline)) d = readJson<Timeline>(p.paths.timeline).duration;
    if (!d) d = narrationSegments(sb).reduce((a, s) => a + estimateSpeech(s.text) + 0.8, 0) + 8;
    await generateMusic(p, sb, d + 2, { force: o.force });
  }));

// ───────────────────────── timeline + subtitles + mix
async function assemble(p: Project, sb = loadStoryboard(p)) {
  let { timeline, voices } = buildTimeline(p, sb);
  writeSubtitles(p, timeline.captions);
  writeChapters(p, timeline);
  log.ok(`Timeline: ${timeline.duration.toFixed(1)} s · ${timeline.captions.length} subtítulos · ${timeline.camera.length} keyframes de cámara`);
  await mixAudio(p, sb, voices, timeline.duration);
  ({ timeline } = buildTimeline(p, sb)); // ahora con audio
  return timeline;
}
program.command('assemble <project>').description('Construye timeline.json, subtítulos (SRT/VTT), capítulos y la mezcla de audio')
  .action(wrap(async (name: string) => { const p = openProject(name); prepareDirs(p); await assemble(p); }));

// ───────────────────────── render
async function doRender(p: Project, engine: EngineName, quality: Quality) {
  if (!fs.existsSync(p.paths.timeline)) await assemble(p);
  const tl: Timeline = readJson(p.paths.timeline);
  const { getEngine } = await import('./engines/index.ts');
  const eng = await getEngine(engine);
  const out = engine === p.cfg.render.engine || !fs.existsSync(p.paths.finalVideo) ? p.paths.finalVideo : p.paths.finalVideo.replace(/\.mp4$/, `.${engine}.mp4`);
  const t0 = Date.now();
  await eng.render(p, tl, { quality, out });
  log.ok(`Video (${engine}, ${quality}) en ${((Date.now() - t0) / 1000).toFixed(0)} s → ${out}`);
  return out;
}
program.command('render <project>').description('Renderiza el video final')
  .option('-e, --engine <engine>', 'remotion | hyperframes')
  .option('-q, --quality <q>', 'draft | standard | high')
  .option('--draft', 'borrador rápido (= --quality draft)')
  .option('--gpu <modo>', 'auto | off | nvenc | amf | qsv | videotoolbox | vaapi')
  .action(wrap(async (name: string, o) => {
    if (o.gpu) process.env.TUTO_GPU = o.gpu;
    const p = openProject(name); prepareDirs(p);
    await doRender(p, (o.engine ?? p.cfg.render.engine) as EngineName, (o.draft ? 'draft' : o.quality ?? p.cfg.render.quality) as Quality);
  }));

// ───────────────────────── hyperframes project (para editar en el Studio)
program.command('hf-project <project>').description('Escribe la composición HyperFrames (build/hyperframes) sin renderizar, para abrirla en el Studio')
  .option('--preview', 'abrir el Studio de HyperFrames')
  .action(wrap(async (name: string, o) => {
    const p = openProject(name); prepareDirs(p);
    if (!fs.existsSync(p.paths.timeline)) await assemble(p);
    const { writeHyperframesProject, runHyperframes } = await import('./engines/hyperframes.ts');
    const dir = writeHyperframesProject(p, readJson(p.paths.timeline));
    log.ok(`Proyecto HyperFrames: ${dir}`);
    await runHyperframes(['lint'], dir).catch((e) => log.warn(e.message));
    if (o.preview) await runHyperframes(['preview'], dir);
  }));

// ───────────────────────── thumbnail
program.command('thumbnail <project>').description('Genera la miniatura con la identidad visual')
  .option('--ai', 'fondo generado con IA (proveedor de imagen)')
  .option('--text <text>', 'texto de la miniatura (por defecto el título)')
  .action(wrap(async (name: string, o) => {
    const p = openProject(name); prepareDirs(p);
    if (!fs.existsSync(p.paths.timeline)) await assemble(p);
    const { makeThumbnail } = await import('./post/thumbnail.ts');
    await makeThumbnail(p, loadStoryboard(p), { ai: o.ai, text: o.text });
  }));

// ───────────────────────── build (todo)
program.command('build <project>').description('Pipeline completo: voz → marca → grabación → música → mezcla → subtítulos → render → miniatura')
  .option('-e, --engine <engine>', 'remotion | hyperframes')
  .option('-q, --quality <q>', 'draft | standard | high')
  .option('--draft', 'borrador rápido para revisar tiempos y encuadre (= --quality draft)')
  .option('--mock', 'voz y música de prueba, sin gastar API (= TUTO_PROVIDER=mock)')
  .option('--gpu <modo>', 'auto | off | nvenc | amf | qsv | videotoolbox | vaapi')
  .option('--tts <proveedor>', 'proveedor de voz solo esta vez: google | voicestudio | elevenlabs | openai')
  .option('--headed', 'mostrar el navegador al grabar')
  .option('--no-music', 'sin música')
  .option('--ai-thumbnail', 'fondo de miniatura con IA')
  .option('--skip-record', 'reusar la grabación existente')
  .option('--force', 'ignorar preguntas bloqueantes sin responder y la verificación de cobertura')
  .action(wrap(async (name: string, o) => {
    if (o.mock) process.env.TUTO_PROVIDER = 'mock';
    if (o.gpu) process.env.TUTO_GPU = o.gpu;
    if (o.tts) process.env.TUTO_TTS = o.tts;
    const p = openProject(name); prepareDirs(p);
    await ensureFfmpeg(); // antes de grabar: si falta FFmpeg, no se repiten acciones en la app
    const cov = coverageStatus(p, loadStoryboard(p));
    if (!cov.ok && !o.force) throw new Error(`Cobertura de formularios: ${cov.reason}. El ensayo detecta campos y switches que el tutorial no usa, para no omitirlos en silencio. (o usa --force)`);
    if (cov.report && !cov.report.complete) log.warn(`La cobertura es parcial (el ensayo se detuvo antes de "${cov.report.stoppedBefore}")`);
    const pend = questionsBlocking(p);
    if (pend.length && !o.force) {
      console.log(c.yellow('Hay preguntas bloqueantes sin responder en storyboard.json:'));
      for (const q of pend) console.log(`  [${q.id}] ${q.question}`);
      throw new Error('Respóndelas (campo "answer") o usa --force');
    }
    let sb = loadStoryboard(p);
    if (o.music === false) sb = { ...sb, music: { ...sb.music, enabled: false } };
    const t0 = Date.now();
    await generateVoice(p, sb);
    if (!fs.existsSync(p.paths.brand)) { const { extractBrand } = await import('./recorder/brand.ts'); await extractBrand(p, sb); }
    if (!o.skipRecord || !fs.existsSync(p.paths.events)) { const { record } = await import('./recorder/record.ts'); await record(p, sb, { headed: o.headed }); }
    const pre = buildTimeline(p, sb).timeline;
    if (sb.music.enabled) await generateMusic(p, sb, pre.duration + 2);
    await assemble(p, sb);
    const out = await doRender(p, (o.engine ?? p.cfg.render.engine) as EngineName, (o.draft ? 'draft' : o.quality ?? p.cfg.render.quality) as Quality);
    const { makeThumbnail } = await import('./post/thumbnail.ts');
    await makeThumbnail(p, sb, { ai: o.aiThumbnail });
    console.log('');
    log.ok(c.bold(`Tutorial listo en ${((Date.now() - t0) / 60000).toFixed(1)} min`));
    console.log(`  Video:      ${out}\n  Subtítulos: ${p.paths.srt}\n  Miniatura:  ${p.paths.thumbnail}\n  Capítulos:  ${path.join(p.output, 'chapters.txt')}`);
  }));

// ───────────────────────── status
program.command('review <project>').description('Hojas de revisión por paso (3 cuadros: inicio, después de la acción, final) en build/review')
  .option('--source <mp4>', 'video a revisar (por defecto, output/<proyecto>.mp4)')
  .action(wrap(async (name: string, o) => {
    const p = openProject(name); prepareDirs(p);
    await ensureFfmpeg();
    const { makeReview } = await import('./post/review.ts');
    await makeReview(p, loadStoryboard(p), { source: o.source });
  }));

program.command('status <project>').description('Qué piezas existen y cuáles faltan')
  .action(wrap(async (name: string) => {
    const p = openProject(name);
    const sb = loadStoryboard(p);
    const v = loadVoiceManifest(p);
    const segs = narrationSegments(sb);
    const have = (f: string) => (fs.existsSync(f) ? c.green('✔') : c.dim('—'));
    console.log(`${c.bold(sb.title)}  (${p.dir})`);
    console.log(`  ${have(p.paths.brand)} brand.json`);
    console.log(`  ${segs.every((s) => v[s.id]) ? c.green('✔') : c.dim('—')} voz (${segs.filter((s) => v[s.id]).length}/${segs.length})`);
    console.log(`  ${have(p.paths.recording)} grabación`);
    console.log(`  ${have(p.paths.music)} música`);
    console.log(`  ${have(p.paths.mix)} mezcla`);
    console.log(`  ${have(p.paths.srt)} subtítulos`);
    console.log(`  ${have(p.paths.finalVideo)} video final`);
    console.log(`  ${have(p.paths.thumbnail)} miniatura`);
  }));

program.parseAsync(process.argv);
