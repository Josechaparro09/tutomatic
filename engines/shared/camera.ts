import type { CamKey, TStep } from './types.ts';

/**
 * Cámara virtual: genera keyframes de zoom/paneo a partir de los pasos con zoom.
 * Es la misma lógica para Remotion (cameraAt por cuadro) y HyperFrames (tweens GSAP).
 */
const EASE_MAX = 0.7;

const clampC = (c: number, s: number) => Math.min(1 - 0.5 / s, Math.max(0.5 / s, c));

interface Phase { tIn: number; tOut: number; s: number; cx: number; cy: number }

/**
 * Cada paso aporta hasta dos "planos": antes de la acción (el elemento con su etiqueta) y
 * después (el modal que se abrió, el campo tras elegir una opción…). Si después no hay nada
 * que encuadrar (navegó, desapareció), la cámara se aleja. El zoom ya viene ajustado para que
 * la región quepa completa.
 */
function phasesOf(steps: TStep[], recStart: number, recEnd: number): Phase[] {
  const out: Phase[] = [];
  const push = (tIn: number, tOut: number, s: number | null | undefined, b: TStep['box'] | null | undefined) => {
    if (!s || s <= 1 || !b) return;
    tIn = Math.max(recStart, tIn); tOut = Math.min(recEnd, tOut);
    if (tOut - tIn < 0.6) return;
    out.push({ tIn, tOut, s, cx: clampC(b.x + b.w / 2, s), cy: clampC(b.y + b.h / 2, s) });
  };
  for (const st of steps) {
    if (!st.zoom && !st.zoomAfter) continue;
    if (st.boxAfter === undefined || st.afterT === undefined) { // grabación antigua: un solo plano
      push(st.start + 0.05, st.end - 0.1, st.zoom, st.box);
      continue;
    }
    const split = Math.min(Math.max(st.afterT, st.start + 0.4), st.end - 0.2);
    const same = st.box && st.boxAfter && st.zoom && st.zoomAfter &&
      Math.abs(st.box.x + st.box.w / 2 - (st.boxAfter.x + st.boxAfter.w / 2)) < 0.03 &&
      Math.abs(st.box.y + st.box.h / 2 - (st.boxAfter.y + st.boxAfter.h / 2)) < 0.03 &&
      Math.abs(st.zoom - st.zoomAfter) < 0.15;
    if (same) { push(st.start + 0.05, st.end - 0.1, Math.min(st.zoom!, st.zoomAfter!), st.box); continue; }
    push(st.start + 0.05, split, st.zoom, st.box);
    push(split, st.end - 0.1, st.zoomAfter, st.boxAfter);
  }
  return out;
}

export function buildCamera(steps: TStep[], recStart: number, recEnd: number): CamKey[] {
  const segs = phasesOf(steps, recStart, recEnd);
  const keys: CamKey[] = [{ t: 0, s: 1, cx: 0.5, cy: 0.5 }];
  const unz = (t: number): CamKey => ({ t, s: 1, cx: 0.5, cy: 0.5 });
  const at = (g: Phase, t: number): CamKey => ({ t, s: g.s, cx: g.cx, cy: g.cy });
  // duración de la transición: hasta 0.7 s, pero nunca más de un tercio del plano
  const easeOf = (g: Phase) => Math.max(0.25, Math.min(EASE_MAX, (g.tOut - g.tIn) / 3));
  segs.forEach((g, i) => {
    const prev = segs[i - 1];
    const e = easeOf(g);
    if (prev && g.tIn - prev.tOut < 0.9) {
      // planos seguidos: paneo/zoom directo de uno a otro, sin alejar
      keys.push(at(prev, Math.max(prev.tOut, prev.tIn + easeOf(prev))));
      keys.push(at(g, Math.max(prev.tOut, g.tIn) + e));
    } else {
      if (prev) {
        const pe = easeOf(prev);
        keys.push(at(prev, prev.tOut - pe));
        keys.push(unz(prev.tOut));
      }
      keys.push(unz(g.tIn));
      keys.push(at(g, g.tIn + e));
    }
    if (i === segs.length - 1) {
      keys.push(at(g, g.tOut - e));
      keys.push(unz(g.tOut));
    }
  });
  keys.sort((a, b) => a.t - b.t);
  const out: CamKey[] = [];
  for (const k of keys) {
    const r = { t: +k.t.toFixed(3), s: +k.s.toFixed(4), cx: +k.cx.toFixed(4), cy: +k.cy.toFixed(4) };
    if (out.length && Math.abs(out[out.length - 1].t - r.t) < 1e-3) out[out.length - 1] = r;
    else if (out.length && r.t < out[out.length - 1].t) continue;
    else out.push(r);
  }
  return out;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function cameraAt(keys: CamKey[], t: number): { s: number; cx: number; cy: number } {
  if (!keys.length) return { s: 1, cx: 0.5, cy: 0.5 };
  if (t <= keys[0].t) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      const k = b.t === a.t ? 1 : ease((t - a.t) / (b.t - a.t));
      return { s: a.s + (b.s - a.s) * k, cx: a.cx + (b.cx - a.cx) * k, cy: a.cy + (b.cy - a.cy) * k };
    }
  }
  return keys[keys.length - 1];
}

/** Transformación CSS (origen 0 0) para un contenido de tamaño w×h. */
export function cameraTransform(c: { s: number; cx: number; cy: number }, w: number, h: number) {
  const tx = w * 0.5 - c.s * c.cx * w;
  const ty = h * 0.5 - c.s * c.cy * h;
  return { tx, ty, s: c.s, css: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${c.s.toFixed(4)})` };
}
