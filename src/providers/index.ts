import { googleImage, googleMusic, googleTTS } from './google.ts';
import { elevenlabsTTS, mockMusic, mockTTS, noneImage, openaiTTS, voicestudioTTS } from './others.ts';
import type { ImageProvider, MusicProvider, TTSProvider } from './types.ts';

/** Registro de proveedores. Añade aquí tus adaptadores nuevos. */
const tts: Record<string, TTSProvider> = { google: googleTTS, elevenlabs: elevenlabsTTS, openai: openaiTTS, voicestudio: voicestudioTTS, mock: mockTTS };
const music: Record<string, MusicProvider> = { google: googleMusic, mock: mockMusic };
const image: Record<string, ImageProvider> = { google: googleImage, none: noneImage };

function pick<T>(reg: Record<string, T>, name: string, kind: string): T {
  // TUTO_PROVIDER=mock fuerza el proveedor mock en todo (útil para ensayos sin costo)
  const forced = process.env.TUTO_PROVIDER;
  const key = forced && reg[forced] ? forced : name;
  const p = reg[key];
  if (!p) throw new Error(`Proveedor de ${kind} desconocido: "${name}". Disponibles: ${Object.keys(reg).join(', ')}`);
  return p;
}

export const getTTS = (name: string) => pick(tts, name, 'voz');
export const getMusic = (name: string) => pick(music, name, 'música');
export const getImage = (name: string) => pick(image, name, 'imagen');
export const listProviders = () => ({ tts: Object.keys(tts), music: Object.keys(music), image: Object.keys(image) });
