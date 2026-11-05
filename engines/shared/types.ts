/**
 * timeline.json: la descripción completa y neutral del video final.
 * Ambos motores (Remotion y HyperFrames) renderizan exactamente esto.
 */
export interface TBrand {
  name: string; primary: string; secondary: string; background: string; surface: string;
  text: string; mutedText: string; fontFamily: string; logo: string | null; theme: 'dark' | 'light'; radius: number;
}

export interface TStep {
  id: string;
  index: number;
  title: string | null;
  start: number;
  end: number;
  /** Rectángulo del elemento, normalizado 0-1 respecto a la grabación */
  box: { x: number; y: number; w: number; h: number } | null;
  zoom: number | null;
  /** Encuadre después de la acción (null = vista completa; undefined = igual que antes) */
  boxAfter?: { x: number; y: number; w: number; h: number } | null;
  zoomAfter?: number | null;
  /** Momento (s) en que la cámara pasa al encuadre posterior */
  afterT?: number;
  clickT: number | null;
  chapter: string | null;
  /** Lado del rótulo del paso, para no tapar el elemento enfocado */
  badgeSide: 'left' | 'right';
}

export interface TCaption { start: number; end: number; text: string; /** top si el elemento enfocado está abajo */ position?: 'top' | 'bottom' }

export interface CamKey { t: number; s: number; cx: number; cy: number }

export interface Timeline {
  version: 1;
  fps: number;
  width: number;
  height: number;
  duration: number;
  title: string;
  subtitle: string | null;
  displayUrl: string;
  brand: TBrand;
  layout: {
    browserFrame: boolean;
    /** Área donde va la grabación (px del lienzo) */
    screen: { x: number; y: number; w: number; h: number };
    chromeH: number;
  };
  intro: { start: number; duration: number; title: string; subtitle: string | null };
  recording: { src: string; start: number; duration: number; width: number; height: number };
  steps: TStep[];
  camera: CamKey[];
  captions: TCaption[];
  showCaptions: boolean;
  outro: { start: number; duration: number; title: string; subtitle: string | null; cta: string | null };
  audio: { src: string | null };
}
