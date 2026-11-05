import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

export function readJson<T = any>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function writeJson(p: string, data: unknown) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

export function hash(...parts: unknown[]) {
  return crypto.createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 12);
}

export function slug(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'item';
}

/** Estimación de duración de narración cuando aún no hay audio (≈14 caracteres/seg). */
export function estimateSpeech(text: string) {
  return text.trim() ? Math.max(1.2, text.trim().length / 14) : 0;
}

export const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

export const log = {
  step: (s: string) => console.log(`${c.cyan('▸')} ${s}`),
  ok: (s: string) => console.log(`${c.green('✔')} ${s}`),
  warn: (s: string) => console.log(`${c.yellow('!')} ${s}`),
  info: (s: string) => console.log(`  ${c.dim(s)}`),
  err: (s: string) => console.error(`${c.red('✖')} ${s}`),
};

export function toPosix(p: string) {
  return p.split(path.sep).join('/');
}
