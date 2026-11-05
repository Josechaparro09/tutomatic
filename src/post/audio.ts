import fs from 'node:fs';
import path from 'node:path';
import type { Project } from '../lib/project.ts';
import type { StoryboardT } from '../lib/schema.ts';
import { getMusic, getTTS } from '../providers/index.ts';
import { ffmpeg, probeDuration } from '../lib/ffmpeg.ts';
import { ensureDir, hash, log, readJson, writeJson } from '../lib/util.ts';

export interface VoiceClip { id: string; text: string; file: string; duration: number; hash: string }
export type VoiceManifest = Record<string, VoiceClip>;

export function narrationSegments(sb: StoryboardT): { id: string; text: string }[] {
  const segs: { id: string; text: string }[] = [];
  if (sb.intro.narration?.trim()) segs.push({ id: 'intro', text: sb.intro.narration.trim() });
  for (const s of sb.steps) if (s.narration.trim()) segs.push({ id: s.id, text: s.narration.trim() });
  if (sb.outro.narration?.trim()) segs.push({ id: 'outro', text: sb.outro.narration.trim() });
  return segs;
}

export function loadVoiceManifest(p: Project): VoiceManifest {
  return fs.existsSync(p.paths.voiceManifest) ? readJson(p.paths.voiceManifest) : {};
}

/** Genera la voz de cada segmento. Usa caché por hash: solo regenera lo que cambió. */
export async function generateVoice(p: Project, sb: StoryboardT, { force = false, only }: { force?: boolean; only?: string[] } = {}) {
  const cfg = p.cfg.providers.tts;
  const providerName = process.env.TUTO_TTS || sb.voice.provider || cfg.provider;
  const provider = getTTS(providerName);
  // con --tts a otro proveedor, el modelo/voz de la config (p. ej. gemini/Kore) no aplican
  const sameAsCfg = providerName === cfg.provider;
  const model = sb.voice.model ?? (sameAsCfg ? cfg.model : undefined);
  const voice = sb.voice.voice ?? (sameAsCfg ? cfg.voice : undefined);
  const style = sb.voice.style ?? cfg.style;
  // Opciones extra del proveedor (url, engine, params…): config global + las del storyboard encima
  const strip = ({ provider: _a, model: _b, voice: _c, style: _d, ...rest }: Record<string, any>) => rest;
  const options: Record<string, any> = { ...(sameAsCfg ? strip(cfg) : {}), ...strip(sb.voice) };
  const params = { ...(sameAsCfg ? (cfg as any).params : {}), ...(sb.voice as any).params };
  if (Object.keys(params).length) options.params = params; else delete options.params;
  // sin opciones extra el hash queda igual que antes (no invalida voces ya generadas)
  const optKey = Object.keys(options).length ? [JSON.stringify(options)] : [];
  ensureDir(p.paths.voiceDir);
  const prev = loadVoiceManifest(p);
  const next: VoiceManifest = {};
  const segs = narrationSegments(sb);
  log.step(`Voz con ${provider.name}${model ? ` (${model})` : ''}${voice ? `, voz "${voice}"` : ''} — ${segs.length} segmentos`);
  if (!process.env.TUTO_TTS && sb.voice.provider && sb.voice.provider !== cfg.provider)
    log.warn(`El storyboard.json de este proyecto fija la voz en "${sb.voice.provider}" (campo voice.provider) y pisa tu tutomatic.config.yaml ("${cfg.provider}"). Bórralo de "voice" para usar la config, o usa --tts.`);

  let made = 0;
  for (const seg of segs) {
    const h = hash(provider.name, model, voice, style, sb.language, seg.text, ...optKey);
    const file = path.join(p.paths.voiceDir, `${seg.id}.wav`);
    const cached = prev[seg.id];
    const wanted = !only || only.includes(seg.id);
    if (!force && cached && cached.hash === h && fs.existsSync(file)) { next[seg.id] = cached; continue; }
    if (!wanted && cached) { next[seg.id] = cached; continue; }
    process.stdout.write(`  · ${seg.id} … `);
    await provider.synthesize({ text: seg.text, voice, style, language: sb.language, model, options, outFile: file });
    // Recorta silencios al inicio/fin para que el timing sea exacto
    const trimmed = file + '.trim.wav';
    await ffmpeg(['-i', file, '-af',
      'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse',
      trimmed]);
    fs.renameSync(trimmed, file);
    const duration = await probeDuration(file);
    next[seg.id] = { id: seg.id, text: seg.text, file: path.relative(p.build, file).split(path.sep).join('/'), duration, hash: h };
    made++;
    console.log(`${duration.toFixed(2)} s`);
  }
  writeJson(p.paths.voiceManifest, next);
  log.ok(`Voz lista (${made} nuevos, ${segs.length - made} en caché)`);
  return next;
}

export async function generateMusic(p: Project, sb: StoryboardT, durationSec: number, { force = false } = {}) {
  if (!sb.music.enabled) { log.info('Música desactivada en el storyboard'); return null; }
  const cfg = p.cfg.providers.music;
  if ((sb.music.provider ?? cfg.provider) === 'none') { log.info('Sin música (providers.music: none)'); return null; }
  const provider = getMusic(sb.music.provider ?? cfg.provider);
  const model = sb.music.model ?? cfg.model;
  const prompt = sb.music.prompt ?? 'Modern, light, optimistic lo-fi electronic background music for a product tutorial, 95 BPM, soft synth pads and gentle plucks.';
  const metaFile = p.paths.music + '.json';
  const h = hash(provider.name, model, prompt);
  if (!force && fs.existsSync(p.paths.music) && fs.existsSync(metaFile) && readJson(metaFile).hash === h) {
    const have = await probeDuration(p.paths.music);
    if (have >= durationSec - 1 || provider.name !== 'mock') {
      log.ok(`Música en caché (${have.toFixed(1)} s${have < durationSec ? '; se repite en bucle para cubrir el video' : ''})`);
      return p.paths.music;
    }
  }
  log.step(`Música con ${provider.name}${model ? ` (${model})` : ''} — ~${Math.round(durationSec)} s`);
  await provider.generate({ prompt, durationSec, model, outFile: p.paths.music });
  writeJson(metaFile, { hash: h, prompt, model, provider: provider.name });
  log.ok(`Música lista (${(await probeDuration(p.paths.music)).toFixed(1)} s)`);
  return p.paths.music;
}
