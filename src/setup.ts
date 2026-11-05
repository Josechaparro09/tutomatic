/**
 * `tutomatic setup`: asistente que deja todo listo sin editar archivos a mano.
 * Escribe tutomatic.config.yaml (conservando los comentarios) y .env, instala lo que falte
 * (Chromium, navegador de HyperFrames, FFmpeg si el usuario acepta) e instala la skill.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { checkbox, confirm, input, password, select } from '@inquirer/prompts';
import { REPO_ROOT, configPath, loadEnv, resetConfigCache } from './lib/config.ts';
import { c, log } from './lib/util.ts';

export const SECTIONS = ['requisitos', 'voz', 'musica', 'motor', 'diseño', 'app', 'skill'] as const;
type Section = (typeof SECTIONS)[number];

const ENV_FILE = path.join(REPO_ROOT, '.env');
const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

// ───────────── archivos ─────────────

/** Abre la config conservando comentarios. Migra el antiguo tuto.config.yaml si hace falta. */
function openConfig() {
  let file = configPath();
  if (path.basename(file) === 'tuto.config.yaml') {
    const next = path.join(path.dirname(file), 'tutomatic.config.yaml');
    fs.copyFileSync(file, next);
    fs.renameSync(file, file + '.bak');
    log.info(`Tu tuto.config.yaml pasó a llamarse tutomatic.config.yaml (copia de respaldo: tuto.config.yaml.bak)`);
    file = next;
  }
  if (!fs.existsSync(file)) fs.copyFileSync(path.join(REPO_ROOT, 'templates', 'tutomatic.config.yaml'), file);
  const doc = YAML.parseDocument(fs.readFileSync(file, 'utf8'));
  return {
    get: (p: (string | number)[]) => doc.getIn(p) as any,
    set: (p: (string | number)[], v: unknown) => doc.setIn(p, v),
    del: (p: (string | number)[]) => { if (doc.hasIn(p)) doc.deleteIn(p); },
    save: () => { fs.writeFileSync(file, doc.toString({ lineWidth: 0 })); resetConfigCache(); },
    file,
  };
}

function readEnv(): Record<string, string> {
  if (!fs.existsSync(ENV_FILE)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) out[m[1]] = m[2].replace(/^(['"`])(.*)\1$/, '$2');
  }
  return out;
}

/** Cambia o agrega claves en .env sin tocar el resto del archivo. */
function writeEnv(vals: Record<string, string | undefined>) {
  if (!fs.existsSync(ENV_FILE)) fs.copyFileSync(path.join(REPO_ROOT, '.env.example'), ENV_FILE);
  let lines = fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/);
  for (const [k, v] of Object.entries(vals)) {
    if (v === undefined) continue;
    // dotenv no interpreta escapes: se envuelve con un tipo de comilla que no aparezca en el valor
    const qc = ["'", '"', '`'].find((ch) => !v.includes(ch));
    if (!qc) log.warn(`El valor de ${k} tiene los tres tipos de comillas; puede que no se lea bien`);
    const q = /[\s#"'`$\\=]/.test(v) ? `${qc ?? '"'}${v}${qc ?? '"'}` : v;
    const i = lines.findIndex((l) => new RegExp(`^\\s*#?\\s*${k}\\s*=`).test(l));
    if (i >= 0) lines[i] = `${k}=${q}`; else lines.push(`${k}=${q}`);
    process.env[k] = v;
  }
  fs.writeFileSync(ENV_FILE, lines.join(os.EOL === '\r\n' ? '\r\n' : '\n'));
}

const mask = (v?: string) => (v ? `${v.slice(0, 4)}…${v.slice(-3)}` : '');

function run(cmd: string, args: string[], label: string) {
  log.step(label);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: isWin, cwd: REPO_ROOT });
  if (r.status !== 0) { log.warn(`No se pudo: ${cmd} ${args.join(' ')}`); return false; }
  return true;
}

const head = (t: string) => console.log('\n' + c.bold(c.cyan(`■ ${t}`)));

// ───────────── secciones ─────────────

async function requisitos() {
  head('Requisitos');
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) log.err(`Node ${process.versions.node}: necesitas Node 22 o superior (nodejs.org)`); else log.ok(`Node ${process.versions.node}`);

  const { ensureFfmpeg } = await import('./lib/ffmpeg.ts');
  try { const f = await ensureFfmpeg(); log.ok(`FFmpeg ${f.version.split(' ')[2] ?? ''}`); }
  catch {
    log.warn('No encuentro FFmpeg.');
    const how = isWin ? ['winget', ['install', '--id', 'Gyan.FFmpeg', '-e', '--accept-source-agreements', '--accept-package-agreements']]
      : isMac ? ['brew', ['install', 'ffmpeg']] : null;
    if (how && await confirm({ message: `¿Lo instalo con ${how[0]}?`, default: true })) {
      run(how[0] as string, how[1] as string[], 'Instalando FFmpeg…');
      log.info('Si sigue sin aparecer, cierra y abre la terminal (para que tome el PATH nuevo).');
    } else if (!how) log.info('Instálalo con tu gestor de paquetes, p. ej.: sudo apt install ffmpeg');
    else log.info('También sirve: npm rebuild ffmpeg-static ffprobe-static');
  }

  const { chromium } = await import('playwright');
  try { const b = await chromium.launch({ executablePath: process.env.TUTO_CHROME || undefined }); log.ok(`Chromium ${b.version()}`); await b.close(); }
  catch { run('npx', ['playwright', 'install', 'chromium'], 'Instalando Chromium (para grabar la app)…'); }
}

const GEMINI_VOICES = [
  ['Kore', 'femenina · firme y clara (la de tus tutoriales)'], ['Aoede', 'femenina · ligera'], ['Leda', 'femenina · juvenil'],
  ['Sulafat', 'femenina · cálida'], ['Achernar', 'femenina · suave'], ['Callirrhoe', 'femenina · relajada'],
  ['Charon', 'masculina · informativa'], ['Puck', 'masculina · alegre'], ['Orus', 'masculina · firme'], ['Fenrir', 'masculina · enérgica'],
] as const;

async function askGeminiKey(env: Record<string, string>) {
  if (env.GEMINI_API_KEY && !(await confirm({ message: `Ya tienes una clave de Google (${mask(env.GEMINI_API_KEY)}). ¿La cambias?`, default: false }))) return env.GEMINI_API_KEY;
  console.log(c.dim('  Créala gratis en https://aistudio.google.com/apikey'));
  const key = (await password({ message: 'Pega tu clave de Google (GEMINI_API_KEY):', mask: '•' })).trim();
  if (!key) return env.GEMINI_API_KEY;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(10000) });
    if (r.ok) log.ok('Clave de Google válida'); else log.warn(`Google respondió ${r.status}: revisa la clave (la guardo igual)`);
  } catch { log.warn('No pude comprobar la clave (sin conexión); la guardo igual'); }
  writeEnv({ GEMINI_API_KEY: key });
  return key;
}

async function voz() {
  head('Voz del narrador');
  const cfg = openConfig();
  const env = readEnv();
  const current = cfg.get(['providers', 'tts', 'provider']);
  const prov = await select({
    message: '¿Con qué se genera la voz?',
    default: current,
    choices: [
      { value: 'google', name: 'Google Gemini (recomendado: natural, 30 voces, sin instalar nada)' },
      { value: 'voicestudio', name: 'VoiceStudio (local en tu PC, gratis, sin internet, tu propia voz clonada)' },
      { value: 'elevenlabs', name: 'ElevenLabs (de pago)' },
      { value: 'openai', name: 'OpenAI (de pago)' },
      { value: 'mock', name: 'Sin voz real (solo pruebas, gratis)' },
    ],
  });
  const T = ['providers', 'tts'];
  for (const k of ['model', 'voice', 'url', 'language', 'params', 'timeoutMs', 'instruct']) cfg.del([...T, k]);
  cfg.set([...T, 'provider'], prov);

  if (prov === 'google') {
    await askGeminiKey(env);
    const v = await select({ message: 'Voz:', default: 'Kore', choices: GEMINI_VOICES.map(([n, d]) => ({ value: n, name: `${n} — ${d}` })) });
    cfg.set([...T, 'model'], 'gemini-3.8-flash-tts');
    cfg.set([...T, 'voice'], v);
  } else if (prov === 'voicestudio') {
    const { voicestudioVoices } = await import('./providers/others.ts');
    let url = env.VOICESTUDIO_URL || 'http://localhost:3900/v1';
    let data: any = null;
    for (;;) {
      try { data = await voicestudioVoices({ url }); break; } catch {
        log.warn(`VoiceStudio no responde en ${url}.`);
        const what = await select({ message: '¿Qué hago?', choices: [
          { value: 'retry', name: 'Ya lo abrí, vuelve a intentar' }, { value: 'url', name: 'Está en otra dirección' }, { value: 'skip', name: 'Configurarlo sin comprobar (lo abro después)' }] });
        if (what === 'skip') break;
        if (what === 'url') { url = (await input({ message: 'Dirección de la API (termina en /v1):', default: url })).replace(/\/+$/, ''); writeEnv({ VOICESTUDIO_URL: url }); }
      }
    }
    const profiles: any[] = (data?.voices ?? []).filter((x: any) => x.type === 'profile');
    let voice: string;
    if (profiles.length) {
      voice = await select({ message: 'Elige tu voz (perfil de VoiceStudio):', choices: profiles.map((x) => ({ value: x.voice_id ?? x.id, name: `${x.name} (${x.language ?? '?'}) · id ${x.voice_id ?? x.id}` })) });
    } else {
      if (data) log.warn('No tienes voces clonadas en VoiceStudio todavía. Crea una en la app (pestaña Clone) y vuelve a correr: tutomatic setup --only voz');
      voice = (await input({ message: 'Id del perfil de voz (puedes dejarlo vacío y ponerlo luego):' })).trim();
    }
    const engines: any[] = (data?.engines ?? []).filter((e: any) => e.available && e.supports_cloning);
    const model = engines.length > 1
      ? await select({ message: 'Motor de VoiceStudio:', default: 'omnivoice', choices: engines.map((e) => ({ value: e.id, name: e.display_name })) })
      : 'omnivoice';
    const quality = await select({ message: 'Calidad:', default: 32, choices: [
      { value: 32, name: 'Alta (32 pasos, más lenta)' }, { value: 16, name: 'Rápida (16 pasos)' }] });
    const lang = await input({ message: 'Idioma fijo de la voz (es, en, pt…):', default: 'es' });
    const slow = (data?.engines ?? []).some((e: any) => e.id === model && /VRAM/.test(e.routing_reason ?? ''));
    cfg.set([...T, 'model'], model);
    if (voice) cfg.set([...T, 'voice'], voice);
    cfg.set([...T, 'language'], lang);
    cfg.set([...T, 'params'], { guidance_scale: 2.5, num_step: quality, denoise: true });
    cfg.set([...T, 'timeoutMs'], slow ? 600000 : 300000);
    if (url !== 'http://localhost:3900/v1') cfg.set([...T, 'url'], url);
    if (slow) log.info('Tu tarjeta tiene poca memoria para este motor: dejé 10 min de espera por frase.');
    log.info('Recuerda: con VoiceStudio la app debe estar abierta cuando generes las voces.');
  } else if (prov === 'elevenlabs') {
    if (!env.ELEVENLABS_API_KEY || await confirm({ message: 'ElevenLabs: ¿cambiar la clave?', default: !env.ELEVENLABS_API_KEY })) {
      const k = (await password({ message: 'Clave de ElevenLabs:', mask: '•' })).trim(); if (k) writeEnv({ ELEVENLABS_API_KEY: k });
    }
    const v = (await input({ message: 'Id de la voz (en ElevenLabs → Voices → ID):', default: 'EXAVITQu4vr4xnSDxMaL' })).trim();
    cfg.set([...T, 'model'], 'eleven_multilingual_v2');
    cfg.set([...T, 'voice'], v);
  } else if (prov === 'openai') {
    if (!env.OPENAI_API_KEY || await confirm({ message: 'OpenAI: ¿cambiar la clave?', default: !env.OPENAI_API_KEY })) {
      const k = (await password({ message: 'Clave de OpenAI:', mask: '•' })).trim(); if (k) writeEnv({ OPENAI_API_KEY: k });
    }
    const v = await select({ message: 'Voz:', default: 'coral', choices: ['coral', 'nova', 'shimmer', 'sage', 'alloy', 'ash', 'ballad', 'echo', 'fable', 'onyx', 'verse'].map((n) => ({ value: n, name: n })) });
    cfg.set([...T, 'model'], 'gpt-4o-mini-tts');
    cfg.set([...T, 'voice'], v);
  }
  if (!cfg.get([...T, 'style'])) cfg.set([...T, 'style'], 'Narrador de tutorial: cálido, claro y cercano, ritmo pausado, español latinoamericano neutro.');
  cfg.save();
  log.ok(`Voz: ${prov}${cfg.get([...T, 'voice']) ? ` · ${cfg.get([...T, 'voice'])}` : ''}`);
}

async function musica() {
  head('Música de fondo');
  const cfg = openConfig();
  const prov = await select({ message: '¿Música de fondo?', default: cfg.get(['providers', 'music', 'provider']), choices: [
    { value: 'google', name: 'Sí, generada con Google Lyria (usa la misma clave de Google)' },
    { value: 'none', name: 'Sin música' },
    { value: 'mock', name: 'Un tono de prueba (solo para ensayar)' }] });
  cfg.set(['providers', 'music', 'provider'], prov);
  if (prov === 'google') { cfg.set(['providers', 'music', 'model'], 'lyria-3.5'); await askGeminiKey(readEnv()); } else cfg.del(['providers', 'music', 'model']);
  cfg.save();
  log.ok(`Música: ${prov}`);
}

async function motor() {
  head('Motor de video y tarjeta gráfica');
  const cfg = openConfig();
  const eng = await select({ message: '¿Con qué motor se arma el video?', default: cfg.get(['render', 'engine']) ?? 'hyperframes', choices: [
    { value: 'hyperframes', name: 'HyperFrames (recomendado: estilos de diseño Ruta/Etiqueta/Suave, animaciones GSAP, licencia libre)' },
    { value: 'remotion', name: 'Remotion (React; gratis para personas y equipos pequeños, empresas grandes necesitan licencia)' }] });
  cfg.set(['render', 'engine'], eng);
  if (eng === 'hyperframes') run('npx', ['hyperframes', 'browser', 'ensure'], 'Preparando el navegador de HyperFrames…');

  const { detectGpu } = await import('./lib/gpu.ts');
  process.stdout.write('  Probando la tarjeta gráfica… ');
  const g = await detectGpu('auto');
  console.log(g.encoder ? c.green(`${g.vendor} → ${g.encoder}`) : c.yellow('no hay una GPU usable; se usará el procesador'));
  const gpu = await select({ message: 'Usar la tarjeta gráfica para codificar:', default: cfg.get(['render', 'gpu']) ?? 'auto', choices: [
    { value: 'auto', name: 'Automático (recomendado: la usa si responde y si falla vuelve al procesador)' },
    { value: 'off', name: 'No, solo el procesador' }] });
  cfg.set(['render', 'gpu'], gpu);
  const q = await select({ message: 'Calidad por defecto:', default: cfg.get(['render', 'quality']) ?? 'high', choices: [
    { value: 'high', name: 'Alta (para publicar)' }, { value: 'standard', name: 'Estándar (más rápido)' }] });
  cfg.set(['render', 'quality'], q);
  cfg.save();
  log.ok(`Motor: ${eng} · GPU: ${gpu} · calidad: ${q}`);
}

async function diseno() {
  head('Estilo visual');
  const cfg = openConfig();
  console.log(c.dim('  Se aplica a los proyectos nuevos (tutomatic init). Muestras en examples/designs/*/'));
  const style = await select({ message: 'Estilo por defecto:', default: cfg.get(['design', 'default']) ?? 'ruta', choices: [
    { value: 'ruta', name: 'Ruta — los capítulos son paradas de una ruta (ideal logística y procesos)' },
    { value: 'etiqueta', name: 'Etiqueta — panel de color, etiqueta de envío y sellos (más enérgico)' },
    { value: 'suave', name: 'Suave — minimal; el capítulo va abajo y nunca tapa la app' },
    { value: 'none', name: 'Ninguno — el estilo base, sin capa de diseño' }] });
  cfg.set(['design', 'default'], style);
  cfg.save();
  const root = path.join(REPO_ROOT, (cfg.get(['projectsDir']) as string) ?? 'projects');
  const bare = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, 'storyboard.json')) && !fs.existsSync(path.join(root, d, 'design'))) : [];
  if (style !== 'none' && bare.length) {
    const pick = await checkbox({ message: `¿Aplicar "${style}" también a proyectos que ya tienes?`, choices: bare.map((d) => ({ value: d, name: d })) });
    for (const d of pick) fs.cpSync(path.join(REPO_ROOT, 'examples', 'designs', style), path.join(root, d, 'design'), { recursive: true });
    if (pick.length) log.ok(`Estilo aplicado a: ${pick.join(', ')}`);
  }
  log.ok(`Estilo por defecto: ${style}`);
}

async function app() {
  head('Usuario de la app que vas a grabar');
  console.log(c.dim('  Se guarda solo en .env de este equipo. El storyboard lo usa como ${TUTO_USER} / ${TUTO_PASSWORD}.'));
  const env = readEnv();
  if (env.TUTO_USER && !/facturin/.test(env.TUTO_USER) && !(await confirm({ message: `Ya hay un usuario (${env.TUTO_USER}). ¿Lo cambias?`, default: false }))) return;
  const user = (await input({ message: 'Usuario o correo (vacío para omitir):', default: env.TUTO_USER && !env.TUTO_USER.includes('facturin') ? env.TUTO_USER : '' })).trim();
  if (!user) return;
  const pass = await password({ message: 'Contraseña:', mask: '•' });
  writeEnv({ TUTO_USER: user, TUTO_PASSWORD: pass });
  log.ok('Usuario guardado en .env');
}

async function skill() {
  head('Skill para Claude');
  const where = await checkbox({ message: '¿Dónde la instalo?', choices: [
    { value: 'code', name: 'Claude Code en este equipo (~/.claude/skills/tutomatic)', checked: true },
    { value: 'zip', name: 'Archivo tutomatic.skill para subir a la app de Claude (web/escritorio)', checked: true }] });
  await installSkill({ claudeCode: where.includes('code'), zip: where.includes('zip') });
}

// ───────────── skill ─────────────

export const skillDir = () => path.join(REPO_ROOT, 'skills', 'tutomatic');
export const claudeSkillDir = () => path.join(os.homedir(), '.claude', 'skills', 'tutomatic');

export async function installSkill({ claudeCode = true, zip = true } = {}) {
  if (claudeCode) {
    const dst = claudeSkillDir();
    fs.rmSync(dst, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.cpSync(skillDir(), dst, { recursive: true, filter: (f) => !f.includes(`${path.sep}evals`) });
    // le dice a la skill dónde está el CLI, aunque `tutomatic` no esté en el PATH
    fs.writeFileSync(path.join(dst, 'TUTOMATIC_HOME.txt'), REPO_ROOT + '\n');
    log.ok(`Skill instalada para Claude Code: ${dst}`);
  }
  if (zip) {
    const { default: AdmZip } = await import('adm-zip');
    const z = new AdmZip();
    z.addLocalFolder(skillDir(), 'tutomatic', (f) => !f.includes('evals'));
    const out = path.join(REPO_ROOT, 'tutomatic.skill');
    z.writeZip(out);
    log.ok(`Paquete para la app de Claude: ${out}`);
    console.log(c.dim('  Súbelo en Claude → Configuración → Capacidades → Skills → Subir skill. Si ya lo subiste con tu cuenta, no hace falta otra vez.'));
  }
}

// ───────────── principal ─────────────

const RUN: Record<Section, () => Promise<void>> = { requisitos, voz, musica, motor, 'diseño': diseno, app, skill };
const ALIAS: Record<string, Section> = { diseno: 'diseño', design: 'diseño', music: 'musica', música: 'musica', voice: 'voz', engine: 'motor', gpu: 'motor', deps: 'requisitos' };

export async function runSetup({ only }: { only?: string } = {}) {
  loadEnv();
  console.log(c.bold(`\nTutomatic · configuración`) + c.dim(`  (${REPO_ROOT})`));
  console.log(c.dim('Enter acepta la opción marcada. Puedes repetir esto cuando quieras: tutomatic setup'));
  const list: Section[] = only
    ? only.split(',').map((s) => s.trim().toLowerCase()).map((s) => (ALIAS[s] ?? s) as Section).filter((s) => {
      if (!SECTIONS.includes(s)) { log.warn(`Sección desconocida "${s}". Usa: ${SECTIONS.join(', ')}`); return false; } return true; })
    : [...SECTIONS];
  try {
    for (const s of list) await RUN[s]();
  } catch (e: any) {
    if (e?.name === 'ExitPromptError') { console.log('\n' + c.yellow('Configuración cancelada. Lo que ya respondiste quedó guardado.')); return; }
    throw e;
  }
  console.log('\n' + c.bold(c.green('✔ Listo.')) + ' Revisa todo con ' + c.bold('tutomatic doctor') + '. Para probar sin gastar: ' + c.bold('tutomatic demo'));
}
