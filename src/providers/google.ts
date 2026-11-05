import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { ffmpeg } from '../lib/ffmpeg.ts';
import type { ImageProvider, MusicProvider, TTSProvider } from './types.ts';

/**
 * Proveedor Google (Gemini API, Interactions API):
 *  - Voz:    gemini-3.8-flash-tts / gemini-3.8-flash-lite-tts (30 voces: Kore, Puck, Charon, Aoede...)
 *  - Música: lyria-3.5 (pistas largas) / lyria-3-clip-preview (30 s)
 *  - Imagen: modelo de imagen de Gemini (configurable)
 * Requiere GEMINI_API_KEY (o GOOGLE_API_KEY) en .env
 */

function client() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('Falta GEMINI_API_KEY en .env (consíguela en https://aistudio.google.com/apikey)');
  return new GoogleGenAI({ apiKey });
}

/** Busca el primer bloque de audio/imagen en la respuesta de la Interactions API. */
function findMedia(interaction: any, kind: 'audio' | 'image'): { data: string; mime?: string } {
  const direct = kind === 'audio' ? interaction?.output_audio : interaction?.output_image;
  if (direct?.data) return { data: direct.data, mime: direct.mime_type };
  for (const step of interaction?.steps ?? interaction?.outputs ?? []) {
    for (const c of step?.content ?? [step]) {
      if (c?.type === kind && c?.data) return { data: c.data, mime: c.mime_type };
    }
  }
  throw new Error(`La respuesta de Google no trae ${kind}. Respuesta: ${JSON.stringify(interaction).slice(0, 600)}`);
}

async function withRetry<T>(fn: () => Promise<T>, label: string, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e: any) {
      last = e;
      const status = e?.status ?? e?.code;
      if (status && ![429, 500, 502, 503, 504].includes(Number(status))) break;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1) ** 2));
    }
  }
  throw new Error(`${label}: ${(last as any)?.message ?? last}`);
}

/** Convierte cualquier audio a WAV 48 kHz estéreo para la mezcla. */
async function toWav(tmp: string, outFile: string) {
  await ffmpeg(['-i', tmp, '-ar', '48000', '-ac', '2', outFile]);
  fs.rmSync(tmp, { force: true });
}

export const googleTTS: TTSProvider = {
  name: 'google',
  async synthesize({ text, voice = 'Kore', style, language, model = 'gemini-3.8-flash-tts', outFile }) {
    const ai = client();
    const input: any = { type: 'text', text };
    if (style) input.annotations = [{ type: 'speech_metadata', style }];
    const interaction: any = await withRetry(() => (ai as any).interactions.create({
      model,
      input: [input],
      response_format: { type: 'audio', mime_type: 'audio/wav' },
      generation_config: { speech_config: [{ voice, ...(language ? { language } : {}) }] },
    }), `Gemini TTS (${model})`);
    const { data, mime } = findMedia(interaction, 'audio');
    const buf = Buffer.from(data, 'base64');
    const tmp = outFile + '.raw';
    if (mime && /l16|pcm/i.test(mime)) {
      fs.writeFileSync(tmp, buf);
      await ffmpeg(['-f', 's16le', '-ar', '24000', '-ac', '1', '-i', tmp, '-ar', '48000', '-ac', '2', outFile]);
      fs.rmSync(tmp, { force: true });
    } else {
      fs.writeFileSync(tmp, buf);
      await toWav(tmp, outFile);
    }
  },
};

export const googleMusic: MusicProvider = {
  name: 'google',
  async generate({ prompt, durationSec, model = 'lyria-3.5', outFile }) {
    const ai = client();
    const mins = Math.floor(durationSec / 60);
    const secs = Math.round(durationSec % 60);
    const fullPrompt = `${prompt}\nInstrumental only, no vocals. Background music for a software tutorial voice-over: ` +
      `steady, unobtrusive, no sudden drops or builds. Length about ${mins}:${String(secs).padStart(2, '0')}.`;
    const req: any = { model, input: fullPrompt };
    if (!/clip/.test(model)) req.response_format = { type: 'audio', mime_type: 'audio/wav' };
    const interaction: any = await withRetry(() => (ai as any).interactions.create(req), `Lyria (${model})`);
    const { data } = findMedia(interaction, 'audio');
    const tmp = outFile + '.src';
    fs.writeFileSync(tmp, Buffer.from(data, 'base64'));
    await toWav(tmp, outFile);
  },
};

export const googleImage: ImageProvider = {
  name: 'google',
  async generate({ prompt, model = 'gemini-2.5-flash-image', aspect = '16:9', outFile }) {
    const ai = client();
    const interaction: any = await withRetry(() => (ai as any).interactions.create({
      model,
      input: prompt,
      response_format: { type: 'image', aspect_ratio: aspect },
    }), `Imagen (${model})`);
    const { data } = findMedia(interaction, 'image');
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    const tmp = outFile + '.src';
    fs.writeFileSync(tmp, Buffer.from(data, 'base64'));
    await ffmpeg(['-i', tmp, outFile]);
    fs.rmSync(tmp, { force: true });
  },
};
