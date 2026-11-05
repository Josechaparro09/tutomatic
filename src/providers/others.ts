import fs from 'node:fs';
import { ffmpeg } from '../lib/ffmpeg.ts';
import { estimateSpeech } from '../lib/util.ts';
import type { MusicProvider, TTSProvider, ImageProvider } from './types.ts';

/** ElevenLabs (solo voz). Requiere ELEVENLABS_API_KEY. voice = voice_id. */
export const elevenlabsTTS: TTSProvider = {
  name: 'elevenlabs',
  async synthesize({ text, voice = 'EXAVITQu4vr4xnSDxMaL', model = 'eleven_multilingual_v2', outFile }) {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) throw new Error('Falta ELEVENLABS_API_KEY en .env');
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ text, model_id: model }),
    });
    if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${await r.text()}`);
    const tmp = outFile + '.mp3';
    fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
    await ffmpeg(['-i', tmp, '-ar', '48000', '-ac', '2', outFile]);
    fs.rmSync(tmp, { force: true });
  },
};

/** OpenAI (solo voz). Requiere OPENAI_API_KEY. style → instructions. */
export const openaiTTS: TTSProvider = {
  name: 'openai',
  async synthesize({ text, voice = 'alloy', style, model = 'gpt-4o-mini-tts', outFile }) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('Falta OPENAI_API_KEY en .env');
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, voice, input: text, instructions: style, response_format: 'wav' }),
    });
    if (!r.ok) throw new Error(`OpenAI TTS ${r.status}: ${await r.text()}`);
    const tmp = outFile + '.src.wav';
    fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
    await ffmpeg(['-i', tmp, '-ar', '48000', '-ac', '2', outFile]);
    fs.rmSync(tmp, { force: true });
  },
};

/**
 * Proveedor "mock": sin API ni costo. Genera audio sintético con la duración
 * estimada de la narración. Sirve para ensayar tiempos y probar el pipeline.
 */
export const mockTTS: TTSProvider = {
  name: 'mock',
  async synthesize({ text, outFile }) {
    const d = estimateSpeech(text).toFixed(2);
    // Murmullo suave modulado (no es voz: solo marca dónde va la narración)
    await ffmpeg(['-f', 'lavfi', '-i', `sine=frequency=220:duration=${d}`, '-f', 'lavfi', '-i', `sine=frequency=330:duration=${d}`,
      '-filter_complex', `[0][1]amix=inputs=2,volume=0.25,tremolo=f=5:d=0.7,afade=t=in:d=0.05,afade=t=out:st=${Math.max(0, +d - 0.1)}:d=0.1`,
      '-ar', '48000', '-ac', '2', outFile]);
  },
};

export const mockMusic: MusicProvider = {
  name: 'mock',
  async generate({ durationSec, outFile }) {
    const d = Math.ceil(durationSec);
    // Pad ambiental: acorde (La menor añadido) con trémolo lento
    const notes = [220, 261.63, 329.63, 392];
    const inputs = notes.flatMap((f) => ['-f', 'lavfi', '-i', `sine=frequency=${f}:duration=${d}`]);
    await ffmpeg([...inputs, '-filter_complex',
      `amix=inputs=${notes.length},volume=0.6,tremolo=f=0.25:d=0.5,lowpass=f=1800,afade=t=in:d=2,afade=t=out:st=${Math.max(0, d - 3)}:d=3`,
      '-ar', '48000', '-ac', '2', outFile]);
  },
};

export const noneImage: ImageProvider = {
  name: 'none',
  async generate() { throw new Error('Sin proveedor de imagen'); },
};

/**
 * VoiceStudio (local, gratis, sin internet): API compatible con OpenAI en tu PC.
 * Config (tutomatic.config.yaml → providers.tts):
 *   provider: voicestudio
 *   voice: <id del perfil clonado>      # tutomatic voices lo lista
 *   model: omnivoice                    # motor: omnivoice | voxcpm2 | cosyvoice | …
 *   url: http://localhost:3900/v1       # o VOICESTUDIO_URL en .env
 *   language: es                        # fijo (no "auto"): evita que cambie de acento
 *   params: { guidance_scale: 2.5, num_step: 32, denoise: true }   # se envían tal cual
 */
export const voicestudioURL = (options?: Record<string, any>) =>
  String(options?.url || process.env.VOICESTUDIO_URL || 'http://localhost:3900/v1').replace(/\/+$/, '');

export const voicestudioTTS: TTSProvider = {
  name: 'voicestudio',
  async synthesize({ text, voice, style, language, model, options = {}, outFile }) {
    const url = voicestudioURL(options);
    const body: Record<string, any> = {
      model: model && !model.startsWith('gemini') ? model : 'omnivoice',
      input: text,
      response_format: 'wav',
      language: options.language ?? (language ? language.split('-')[0].toLowerCase() : undefined),
      ...(voice && voice !== 'Kore' ? { voice } : {}),
      // OmniVoice solo entiende etiquetas de diseño en inglés; el estilo de Gemini se manda solo si lo pides
      ...(options.instruct ? { instruct: options.instruct } : options.sendStyle && style ? { instruct: style } : {}),
      ...(options.description ? { description: options.description } : {}),
      ...(options.params ?? {}),
    };
    let r: Response;
    try {
      r = await fetch(`${url}/audio/speech`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(process.env.VOICESTUDIO_API_KEY ? { authorization: `Bearer ${process.env.VOICESTUDIO_API_KEY}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Number(options.timeoutMs ?? 300000)),
      });
    } catch (e: any) {
      throw new Error(`VoiceStudio no responde en ${url} (${e.cause?.code ?? e.name}). Abre la app VoiceStudio y vuelve a intentar.`);
    }
    if (!r.ok) throw new Error(`VoiceStudio ${r.status}: ${(await r.text()).slice(0, 400)}`);
    const tmp = outFile + '.src.wav';
    fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
    await ffmpeg(['-i', tmp, '-ar', '48000', '-ac', '2', outFile]);
    fs.rmSync(tmp, { force: true });
  },
};

/** Lista perfiles y motores de VoiceStudio (GET /audio/voices). */
export async function voicestudioVoices(options?: Record<string, any>) {
  const url = voicestudioURL(options);
  const r = await fetch(`${url}/audio/voices`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`VoiceStudio ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json() as Promise<any>;
}
