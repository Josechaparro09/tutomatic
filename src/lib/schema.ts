import { z } from 'zod';

/**
 * Esquema del storyboard: el "guion ejecutable" del tutorial.
 * El agente lo escribe tras explorar la app; el CLI lo valida, lo narra, lo graba y lo renderiza.
 */

export const ACTIONS = [
  'click', 'dblclick', 'fill', 'type', 'press', 'hover', 'select',
  'check', 'uncheck', 'scroll', 'goto', 'wait', 'none',
] as const;

export const ActionStep = z.object({
  action: z.enum(ACTIONS).default('none'),
  /**
   * Selector del elemento. Acepta:
   *  - selectores Playwright/CSS:  "#guardar", "button.primary", "text=Facturas"
   *  - atajos accesibles:          "role:button|Guardar", "label:Correo", "text:Nueva factura",
   *                                "placeholder:Buscar", "testid:save-btn"
   */
  selector: z.string().optional(),
  /** Texto para fill/type/select. Admite ${VARIABLE} desde .env */
  value: z.string().optional(),
  /** Tecla para press (Enter, Tab, Control+S...) */
  key: z.string().optional(),
  /** URL (absoluta o relativa a app.url) para goto */
  url: z.string().optional(),
  /** Para scroll sin selector: píxeles verticales */
  y: z.number().optional(),
  /** Para wait: milisegundos */
  ms: z.number().optional(),
  /**
   * Esperar tras la acción: un selector, "url:**\/ruta", "load" o "networkidle".
   */
  waitFor: z.string().optional(),
});

export const Step = ActionStep.extend({
  id: z.string().regex(/^[a-z0-9][a-z0-9-_]*$/i, 'id: solo letras, números, - y _'),
  /** Título corto que aparece como rótulo del paso (lower third). */
  title: z.string().optional(),
  /** Lo que dice la voz durante este paso. Frases cortas y naturales. */
  narration: z.string().default(''),
  /** Zoom de cámara sobre el elemento. true = 1.6x, número = factor. */
  zoom: z.union([z.boolean(), z.number().min(1).max(3)]).optional(),
  /**
   * Encuadre manual: selector del área que la cámara debe mostrar en este paso (p. ej. la tarjeta
   * "Datos del destinatario"). Si no se indica, se calcula solo (elemento + etiqueta + lista/modal).
   */
  focus: z.string().optional(),
  /** Dibuja un anillo de resaltado sobre el elemento durante el paso. */
  highlight: z.boolean().optional(),
  /** Segundos extra de pausa al final del paso (respiración). */
  pauseAfter: z.number().min(0).max(10).optional(),
  /** Segundos que la voz espera antes de empezar (por defecto 0.15). */
  voiceDelay: z.number().min(0).max(5).optional(),
  /** Nombre de capítulo (para marcas de capítulo en la descripción). */
  chapter: z.string().optional(),
});

export const Question = z.object({
  id: z.string(),
  question: z.string(),
  /** Si es bloqueante, `tutomatic build` no avanza hasta que tenga respuesta. */
  blocking: z.boolean().default(true),
  answer: z.string().nullable().default(null),
  /** "coverage" = generada por tutomatic rehearse para un control que el tutorial no usa */
  source: z.string().optional(),
  /** huella del control (para coverage) */
  control: z.string().optional(),
  selector: z.string().optional(),
});

export const Storyboard = z.object({
  $schema: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  language: z.string().default('es-CO'),
  audience: z.string().optional(),
  goal: z.string().optional(),
  app: z.object({
    url: z.string().url(),
    /** Ruta inicial de la grabación (relativa a url). */
    start: z.string().default('/'),
    viewport: z.object({ width: z.number().default(1440), height: z.number().default(810) })
      .default({ width: 1440, height: 810 }),
    /** Texto que aparece en la barra de direcciones del marco de navegador. */
    displayUrl: z.string().optional(),
  }),
  login: z.object({
    url: z.string().default('/login'),
    steps: z.array(ActionStep).default([]),
    /** Espera final que confirma el login: selector o "url:**\/dashboard" */
    waitFor: z.string().optional(),
    /** false (por defecto): el login ocurre fuera de cámara. */
    record: z.boolean().default(false),
  }).optional(),
  voice: z.object({
    provider: z.string().optional(),
    model: z.string().optional(),
    voice: z.string().optional(),
    style: z.string().optional(),
  }).passthrough().default({}),
  music: z.object({
    enabled: z.boolean().default(true),
    provider: z.string().optional(),
    model: z.string().optional(),
    prompt: z.string().optional(),
    /** Volumen base de la música bajo la voz (0-1). */
    volume: z.number().min(0).max(1).default(0.18),
  }).default({ enabled: true, volume: 0.18 }),
  intro: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    narration: z.string().optional(),
    duration: z.number().optional(),
  }).default({}),
  outro: z.object({
    title: z.string().default('¡Listo!'),
    subtitle: z.string().optional(),
    cta: z.string().optional(),
    narration: z.string().optional(),
    duration: z.number().optional(),
  }).default({ title: '¡Listo!' }),
  steps: z.array(Step).min(1),
  questions: z.array(Question).default([]),
});

export type StoryboardT = z.infer<typeof Storyboard>;
export type StepT = z.infer<typeof Step>;
export type ActionStepT = z.infer<typeof ActionStep>;

export const Brand = z.object({
  name: z.string().default('Tutorial'),
  primary: z.string().default('#4F46E5'),
  secondary: z.string().default('#22D3EE'),
  background: z.string().default('#0B1020'),
  surface: z.string().default('#151B2E'),
  text: z.string().default('#F5F7FF'),
  mutedText: z.string().default('#A9B1CC'),
  fontFamily: z.string().default('Inter'),
  logo: z.string().nullable().default(null),
  /** dark | light: tema de la envoltura del video (no de la app). */
  theme: z.enum(['dark', 'light']).default('dark'),
  /** Radio de esquinas de tarjetas, en px. */
  radius: z.number().default(18),
});
export type BrandT = z.infer<typeof Brand>;
