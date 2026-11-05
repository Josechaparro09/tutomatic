/**
 * Contratos de proveedores. Para añadir un servicio nuevo (Azure, Polly, Suno, etc.)
 * implementa una de estas interfaces y regístrala en providers/index.ts.
 */

export interface TTSRequest {
  text: string;
  voice?: string;
  /** Indicación de estilo/actuación: "cálido, claro, ritmo pausado" */
  style?: string;
  language?: string;
  model?: string;
  /** Opciones propias del proveedor (p. ej. url y params de VoiceStudio), tal cual vienen de la config. */
  options?: Record<string, any>;
  /** Archivo .wav de salida */
  outFile: string;
}

export interface TTSProvider {
  name: string;
  synthesize(req: TTSRequest): Promise<void>;
}

export interface MusicRequest {
  prompt: string;
  /** Duración deseada en segundos (la música se recorta/funde en la mezcla). */
  durationSec: number;
  model?: string;
  /** Archivo .wav de salida */
  outFile: string;
}

export interface MusicProvider {
  name: string;
  generate(req: MusicRequest): Promise<void>;
}

export interface ImageRequest {
  prompt: string;
  model?: string;
  aspect?: '16:9' | '1:1' | '9:16';
  /** Archivo .png de salida */
  outFile: string;
}

export interface ImageProvider {
  name: string;
  generate(req: ImageRequest): Promise<void>;
}
