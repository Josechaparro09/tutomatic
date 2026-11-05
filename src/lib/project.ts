import fs from 'node:fs';
import path from 'node:path';
import { Brand, Storyboard, type BrandT, type StoryboardT } from './schema.ts';
import { loadConfig, REPO_ROOT, type ConfigT } from './config.ts';
import { ensureDir, readJson } from './util.ts';

export interface Project {
  name: string;
  dir: string;
  build: string;
  output: string;
  cfg: ConfigT;
  paths: {
    storyboard: string;
    brand: string;
    voiceDir: string;
    voiceManifest: string;
    music: string;
    recording: string;
    events: string;
    auth: string;
    timeline: string;
    srt: string;
    vtt: string;
    mix: string;
    thumbnail: string;
    inspectDir: string;
    brandDir: string;
    finalVideo: string;
  };
}

export function projectsRoot(cfg = loadConfig()) {
  const env = process.env.TUTO_PROJECTS;
  if (env) return path.resolve(env);
  // Si el cwd tiene una carpeta projects/ o tutomatic.config.yaml, úsalo; si no, la del repo.
  const local = path.resolve(process.cwd(), cfg.projectsDir);
  if (fs.existsSync(local) || fs.existsSync(path.resolve(process.cwd(), 'tutomatic.config.yaml')) || fs.existsSync(path.resolve(process.cwd(), 'tuto.config.yaml'))) return local;
  return path.join(REPO_ROOT, cfg.projectsDir);
}

/** Acepta un nombre de proyecto o una ruta a su carpeta. */
export function openProject(nameOrPath: string, { mustExist = true } = {}): Project {
  const cfg = loadConfig();
  const asPath = path.resolve(nameOrPath);
  const dir = fs.existsSync(path.join(asPath, 'storyboard.json')) ? asPath : path.join(projectsRoot(cfg), nameOrPath);
  if (mustExist && !fs.existsSync(path.join(dir, 'storyboard.json'))) {
    throw new Error(`No encuentro el proyecto "${nameOrPath}" (busqué ${dir}/storyboard.json). Crea uno con: tutomatic init ${nameOrPath} --url <url>`);
  }
  const build = path.join(dir, 'build');
  const output = path.join(dir, 'output');
  const name = path.basename(dir);
  return {
    name, dir, build, output, cfg,
    paths: {
      storyboard: path.join(dir, 'storyboard.json'),
      brand: path.join(dir, 'brand.json'),
      voiceDir: path.join(build, 'voice'),
      voiceManifest: path.join(build, 'voice', 'voice.json'),
      music: path.join(build, 'music.wav'),
      recording: path.join(build, 'recording.mp4'),
      events: path.join(build, 'events.json'),
      auth: path.join(build, '.auth.json'),
      timeline: path.join(build, 'timeline.json'),
      srt: path.join(output, `${name}.srt`),
      vtt: path.join(output, `${name}.vtt`),
      mix: path.join(build, 'mix.wav'),
      thumbnail: path.join(output, `${name}-thumbnail.png`),
      inspectDir: path.join(build, 'inspect'),
      brandDir: path.join(dir, 'brand'),
      finalVideo: path.join(output, `${name}.mp4`),
    },
  };
}

export function loadStoryboard(p: Project): StoryboardT {
  const raw = readJson(p.paths.storyboard);
  const res = Storyboard.safeParse(raw);
  if (!res.success) {
    const msg = res.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`storyboard.json inválido:\n${msg}`);
  }
  const ids = new Set<string>();
  for (const s of res.data.steps) {
    if (ids.has(s.id)) throw new Error(`storyboard.json: id de paso repetido "${s.id}"`);
    ids.add(s.id);
  }
  return res.data;
}

export function loadBrand(p: Project): BrandT {
  if (!fs.existsSync(p.paths.brand)) return Brand.parse({});
  const b = Brand.parse(readJson(p.paths.brand));
  // el logo vive junto a brand.json (projects/<p>/brand/logo.png); si no existe, se omite
  if (b.logo && !fs.existsSync(path.join(p.dir, b.logo))) b.logo = null;
  return b;
}

export function prepareDirs(p: Project) {
  ensureDir(p.build);
  ensureDir(p.output);
}

/** Resuelve una URL relativa contra app.url */
export function appUrl(sb: StoryboardT, u: string) {
  return new URL(u, sb.app.url.endsWith('/') ? sb.app.url : sb.app.url + '/').toString();
}
