import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import dotenv from 'dotenv';
import { z } from 'zod';

/** Raíz del repo tutomatic (donde vive tutomatic.config.yaml). */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const ProviderCfg = z.object({
  provider: z.string(),
  model: z.string().optional(),
}).passthrough();

export const Config = z.object({
  projectsDir: z.string().default('projects'),
  providers: z.object({
    tts: ProviderCfg.extend({ voice: z.string().optional(), style: z.string().optional() })
      .default({ provider: 'google', model: 'gemini-3.8-flash-tts', voice: 'Kore' }),
    music: ProviderCfg.default({ provider: 'google', model: 'lyria-3.5' }),
    image: ProviderCfg.default({ provider: 'google', model: 'gemini-2.5-flash-image' }),
  }).prefault({}),
  recorder: z.object({
    mode: z.enum(['screencast', 'playwright']).default('screencast'),
    headless: z.boolean().default(true),
    cursor: z.boolean().default(true),
    typingDelayMs: z.number().default(55),
    cursorSpeed: z.number().default(1),
    jpegQuality: z.number().default(92),
    minStepSeconds: z.number().default(1.6),
    gapAfterVoice: z.number().default(0.45),
    /** Ruta a un Chrome/Chromium alternativo (opcional). */
    executablePath: z.string().optional(),
  }).prefault({}),
  render: z.object({
    engine: z.enum(['remotion', 'hyperframes']).default('remotion'),
    fps: z.number().default(30),
    width: z.number().default(1920),
    height: z.number().default(1080),
    quality: z.enum(['draft', 'standard', 'high']).default('high'),
    /** Factor de zoom por defecto cuando un paso tiene zoom: true */
    zoom: z.number().default(1.6),
    captions: z.boolean().default(true),
    browserFrame: z.boolean().default(true),
    /**
     * Tarjeta gráfica: auto (detecta NVIDIA/AMD/Intel/Apple y la usa si responde), off, o forzar
     * nvenc | amf | qsv | videotoolbox | vaapi. Si falla, siempre vuelve al procesador.
     */
    gpu: z.enum(['auto', 'off', 'nvenc', 'qsv', 'amf', 'videotoolbox', 'vaapi']).default('auto'),
    /** Preset de libx264 cuando no hay GPU (ultrafast…medium): más rápido = archivo un poco más grande */
    encoderPreset: z.enum(['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow']).default('veryfast'),
    /** Cuadros que se dibujan en paralelo (Remotion/HyperFrames). Vacío = automático */
    concurrency: z.number().int().min(1).max(32).optional(),
  }).prefault({}),
  subtitles: z.object({
    maxChars: z.number().default(42),
  }).prefault({}),
  /** Estilo visual que `init` copia a cada proyecto nuevo (examples/designs/<estilo>): ruta | etiqueta | suave | none */
  design: z.object({
    default: z.string().default('none'),
  }).prefault({}),
});
export type ConfigT = z.infer<typeof Config>;

let cached: ConfigT | null = null;

export function loadEnv() {
  // .env del directorio actual y del repo (el primero gana)
  dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true } as any);
  dotenv.config({ path: path.join(REPO_ROOT, '.env'), quiet: true } as any);
}

/** Archivo de configuración en uso: tutomatic.config.yaml (o el antiguo tuto.config.yaml), en la carpeta actual o en la del repo. */
export function configPath(): string {
  for (const dir of [process.cwd(), REPO_ROOT])
    for (const name of ['tutomatic.config.yaml', 'tuto.config.yaml']) {
      const f = path.resolve(dir, name);
      if (fs.existsSync(f)) return f;
    }
  return path.join(REPO_ROOT, 'tutomatic.config.yaml');
}

export function resetConfigCache() { cached = null; }

export function loadConfig(): ConfigT {
  if (cached) return cached;
  loadEnv();
  let c = configPath();
  if (!fs.existsSync(c)) c = path.join(REPO_ROOT, 'templates', 'tutomatic.config.yaml'); // sin setup: valores de la plantilla
  const raw: unknown = fs.existsSync(c) ? YAML.parse(fs.readFileSync(c, 'utf8')) ?? {} : {};
  cached = Config.parse(raw);
  return cached;
}

/** Sustituye ${VAR} por variables de entorno. Falla si falta alguna. */
export function interpolateEnv(s: string | undefined): string | undefined {
  if (s == null) return s;
  return s.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, name) => {
    const v = process.env[name];
    if (v == null) throw new Error(`Falta la variable de entorno ${name} (defínela en .env)`);
    return v;
  });
}
