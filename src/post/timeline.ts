import fs from 'node:fs';
import path from 'node:path';
import type { Project } from '../lib/project.ts';
import { loadBrand } from '../lib/project.ts';
import type { StoryboardT } from '../lib/schema.ts';
import type { Events } from '../recorder/record.ts';
import { loadVoiceManifest } from './audio.ts';
import { buildCamera } from '../../engines/shared/camera.ts';
import type { TCaption, Timeline } from '../../engines/shared/types.ts';
import { readJson, writeJson } from '../lib/util.ts';

export interface VoicePlacement { id: string; file: string; start: number; duration: number; text: string }

/** Parte un texto en subtítulos de ≤ maxChars, respetando puntuación. */
export function chunkText(text: string, maxChars: number): string[] {
  // las etiquetas de actuación de la voz (<short pause>, <laugh>…) no van en los subtítulos
  const sentences = text.replace(/<[^>]{1,40}>/g, ' ').replace(/\s+/g, ' ').trim().split(/(?<=[.!?¿¡;:])\s+/);
  const out: string[] = [];
  for (const s of sentences) {
    const words = s.split(' ');
    let line = '';
    for (const w of words) {
      if ((line + ' ' + w).trim().length > maxChars && line) {
        out.push(line.trim());
        line = w;
      } else line += ' ' + w;
    }
    if (line.trim()) out.push(line.trim());
  }
  // evita fragmentos huérfanos de 1-2 palabras: fúndelos con el anterior si caben
  const merged: string[] = [];
  for (const c of out) {
    const prev = merged[merged.length - 1];
    if (prev && c.split(' ').length <= 2 && (prev + ' ' + c).length <= maxChars + 10) merged[merged.length - 1] = prev + ' ' + c;
    else merged.push(c);
  }
  return merged;
}

export function captionsFor(placements: VoicePlacement[], maxChars: number): TCaption[] {
  const caps: TCaption[] = [];
  for (const v of placements) {
    const chunks = chunkText(v.text, maxChars);
    const total = chunks.reduce((a, c) => a + c.length + 4, 0);
    let t = v.start;
    for (const c of chunks) {
      const d = v.duration * ((c.length + 4) / total);
      caps.push({ start: +t.toFixed(3), end: +(t + d).toFixed(3), text: c });
      t += d;
    }
  }
  return caps;
}

/** Combina storyboard + grabación + voz en timeline.json (lo que renderizan los motores). */
export function buildTimeline(p: Project, sb: StoryboardT): { timeline: Timeline; voices: VoicePlacement[] } {
  if (!fs.existsSync(p.paths.events)) throw new Error('Falta la grabación. Corre: tutomatic record ' + p.name);
  const ev: Events = readJson(p.paths.events);
  const voice = loadVoiceManifest(p);
  const brand = loadBrand(p);
  const r = p.cfg.render;
  const W = r.width, H = r.height;

  const introVoice = voice.intro?.duration ?? 0;
  const outroVoice = voice.outro?.duration ?? 0;
  const I = sb.intro.duration ?? Math.max(3.2, introVoice ? introVoice + 1.1 : 0);
  const rec = ev.duration;
  const O = sb.outro.duration ?? Math.max(3.8, outroVoice ? outroVoice + 1.4 : 0);
  const outroStart = I + rec;

  // Layout: grabación dentro de un marco de navegador centrado
  const chromeH = r.browserFrame ? Math.round(H * 0.043) : 0;
  const vw = ev.viewport.width, vh = ev.viewport.height;
  let sw = r.browserFrame ? Math.round(W * 0.86) : W;
  let sh = Math.round(sw * (vh / vw));
  const maxH = r.browserFrame ? H * 0.9 - chromeH : H;
  if (sh > maxH) { sh = Math.round(maxH); sw = Math.round(sh * (vw / vh)); }
  const screen = { x: Math.round((W - sw) / 2), y: Math.round((H - sh - chromeH) / 2 + chromeH), w: sw, h: sh };

  const norm = (b: { x: number; y: number; width: number; height: number } | null | undefined) =>
    b ? { x: Math.max(0, b.x / vw), y: Math.max(0, b.y / vh), w: Math.min(1, b.width / vw), h: Math.min(1, b.height / vh) } : null;
  /** Zoom que hace caber la región completa (con margen); nunca más que el máximo pedido. */
  const fitZoom = (b: { w: number; h: number } | null, max: number) => {
    if (!b) return null;
    const z = Math.min(max, 0.8 / Math.max(b.w, 0.01), 0.8 / Math.max(b.h, 0.01));
    return z >= 1.12 ? +z.toFixed(3) : null;
  };

  const steps = sb.steps.map((s, i) => {
    const e = ev.steps.find((x) => x.id === s.id);
    if (!e) throw new Error(`events.json no tiene el paso ${s.id}: vuelve a grabar (tutomatic record ${p.name})`);
    const defaultZoom = ['click', 'dblclick', 'fill', 'type', 'select', 'check', 'uncheck', 'hover'].includes(s.action);
    const wants = s.zoom !== false && (s.zoom === true || typeof s.zoom === 'number' || defaultZoom || !!s.focus);
    const maxZ = typeof s.zoom === 'number' ? s.zoom : r.zoom;
    const box = norm(e.box);
    const zoom = wants ? fitZoom(box, maxZ) : null;
    // Encuadre después de la acción: undefined = grabación antigua (se mantiene el de antes)
    const boxAfter = e.boxAfter === undefined ? undefined : norm(e.boxAfter);
    const zoomAfter = wants && boxAfter ? fitZoom(boxAfter, (e.boxAfter as any)?.dialog ? Math.min(maxZ, 1.4) : maxZ) : null;
    // ¿El elemento queda bajo la esquina superior izquierda (donde va el rótulo)?
    let badgeSide: 'left' | 'right' = 'left';
    let lowFocus = false;
    if (box) {
      const z = zoom ?? 1;
      const cl = (c: number) => Math.min(1 - 0.5 / z, Math.max(0.5 / z, c));
      const cx = cl(box.x + box.w / 2), cy = cl(box.y + box.h / 2);
      const sx = 0.5 + z * (box.x - cx), sy = 0.5 + z * (box.y - cy);
      if (sx < 0.42 && sy < 0.16) badgeSide = 'right';
      const sBottom = 0.5 + z * (box.y + box.h - cy);
      if (sBottom > 0.8 && sy < 1) lowFocus = true;
    }
    return {
      id: s.id, index: i + 1, title: s.title ?? null, badgeSide, lowFocus,
      start: +(I + e.start).toFixed(3), end: +(I + e.end).toFixed(3),
      box, zoom,
      boxAfter: boxAfter === undefined ? undefined : boxAfter, zoomAfter,
      afterT: e.afterT !== undefined ? +(I + e.afterT).toFixed(3) : undefined,
      clickT: e.click ? +(I + e.click.t).toFixed(3) : null, chapter: s.chapter ?? null,
    };
  });

  const voices: VoicePlacement[] = [];
  const place = (id: string, start: number) => {
    const v = voice[id];
    if (v) voices.push({ id, file: path.join(p.build, v.file), start: +start.toFixed(3), duration: v.duration, text: v.text });
  };
  place('intro', 0.6);
  for (const s of sb.steps) {
    const e = ev.steps.find((x) => x.id === s.id)!;
    place(s.id, I + e.voiceStart);
  }
  place('outro', outroStart + 0.5);

  const timeline: Timeline = {
    version: 1,
    fps: r.fps, width: W, height: H,
    duration: +(I + rec + O).toFixed(3),
    title: sb.title,
    subtitle: sb.subtitle ?? null,
    displayUrl: sb.app.displayUrl ?? new URL(sb.app.start, sb.app.url).host + new URL(sb.app.start, sb.app.url).pathname,
    brand,
    layout: { browserFrame: r.browserFrame, screen, chromeH },
    intro: { start: 0, duration: I, title: sb.intro.title ?? sb.title, subtitle: sb.intro.subtitle ?? sb.subtitle ?? null },
    recording: { src: 'recording.mp4', start: I, duration: rec, width: vw, height: vh },
    steps: steps.map(({ lowFocus, ...s }) => s),
    camera: buildCamera(steps, I, I + rec),
    captions: captionsFor(voices, p.cfg.subtitles.maxChars).map((c) => {
      const st = steps.find((s) => c.start >= s.start && c.start < s.end);
      return { ...c, position: st?.lowFocus ? 'top' as const : 'bottom' as const };
    }),
    showCaptions: r.captions,
    outro: { start: outroStart, duration: O, title: sb.outro.title, subtitle: sb.outro.subtitle ?? null, cta: sb.outro.cta ?? null },
    audio: { src: fs.existsSync(p.paths.mix) ? 'mix.wav' : null },
  };
  writeJson(p.paths.timeline, timeline);
  writeJson(path.join(p.build, 'voices.json'), voices);
  return { timeline, voices };
}

const fmt = (t: number, sep: string) => {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), x = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(x).padStart(3, '0')}`;
};

export function writeSubtitles(p: Project, caps: TCaption[]) {
  fs.mkdirSync(p.output, { recursive: true });
  const srt = caps.map((c, i) => `${i + 1}\n${fmt(c.start, ',')} --> ${fmt(c.end, ',')}\n${c.text}\n`).join('\n');
  const vtt = 'WEBVTT\n\n' + caps.map((c) => `${fmt(c.start, '.')} --> ${fmt(c.end, '.')}\n${c.text}\n`).join('\n');
  fs.writeFileSync(p.paths.srt, srt);
  fs.writeFileSync(p.paths.vtt, vtt);
}

/** Capítulos estilo YouTube (00:00 Título) a partir de chapter/title de los pasos. */
export function writeChapters(p: Project, tl: Timeline) {
  const lines = ['00:00 Introducción'];
  let last = '';
  for (const s of tl.steps) {
    const name = s.chapter ?? null;
    if (name && name !== last) {
      const t = Math.floor(s.start);
      lines.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')} ${name}`);
      last = name;
    }
  }
  const file = path.join(p.output, 'chapters.txt');
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return file;
}
