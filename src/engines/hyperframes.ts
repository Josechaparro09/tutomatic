import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import type { Timeline } from '../../engines/shared/types.ts';
import { cameraTransform } from '../../engines/shared/camera.ts';
import { ensureDir, log } from '../lib/util.ts';
import { detectGpu } from '../lib/gpu.ts';
import { stageAssets, type Engine } from './index.ts';

const require = createRequire(import.meta.url);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const n = (x: number) => +x.toFixed(3);

/**
 * Genera una composición HyperFrames (HTML + GSAP) equivalente a la plantilla Remotion.
 * El HTML resultante queda en build/hyperframes/index.html: puedes abrirlo en el Studio
 * (npx hyperframes preview) y retocarlo a mano o con las skills de HyperFrames.
 */
export interface DesignLayer { css?: string; js?: string; html?: string }

/** Capa de diseño del proyecto (projects/<p>/design/): design.css, design.html, design.js + recursos. */
export function loadDesign(projectDir: string): DesignLayer | null {
  const d = path.join(projectDir, 'design');
  if (!fs.existsSync(d)) return null;
  const rd = (f: string) => (fs.existsSync(path.join(d, f)) ? fs.readFileSync(path.join(d, f), 'utf8') : undefined);
  const out = { css: rd('design.css'), js: rd('design.js'), html: rd('design.html') };
  return out.css || out.js || out.html ? out : null;
}

/** Datos del video que design.js puede usar (tiempos de intro, pasos, capítulos, outro, marca). */
function tutoData(t: Timeline) {
  return {
    width: t.width, height: t.height, duration: n(t.duration), title: t.intro.title, subtitle: t.intro.subtitle ?? '',
    intro: { start: 0, end: n(t.intro.duration) },
    recording: { start: n(t.recording.start), end: n(t.recording.start + t.recording.duration) },
    outro: { start: n(t.outro.start), end: n(t.outro.start + t.outro.duration), title: t.outro.title, subtitle: t.outro.subtitle ?? '', cta: t.outro.cta ?? '' },
    screen: t.layout.screen,
    steps: t.steps.map((s) => ({ id: s.id, index: s.index, title: s.title ?? null, chapter: s.chapter ?? null, start: n(s.start), end: n(s.end), zoom: s.zoom ?? null, box: s.box ?? null, badgeSide: s.badgeSide })),
    chapters: t.steps.filter((s) => s.chapter).map((s, i, a) => ({ index: i + 1, total: a.length, name: s.chapter!, start: n(s.start), stepId: s.id })),
    brand: t.brand,
  };
}

export function composeHtml(t: Timeline, design?: DesignLayer | null): string {
  const b = t.brand;
  const { screen, chromeH, browserFrame } = t.layout;
  const I = t.intro.duration, R = t.recording, O = t.outro;
  const scrStart = n(R.start - 0.4), scrDur = n(R.duration + 0.8);
  const words = t.intro.title.split(' ');
  const font = `'${b.fontFamily}', Inter, 'Segoe UI', system-ui, sans-serif`;

  const badges = t.steps.filter((s) => s.title).map((s) => `
      <div id="badge-${s.id}" class="clip badge${s.badgeSide === 'right' ? ' right' : ''}" data-start="${n(s.start)}" data-duration="${n(s.end - s.start)}" data-track-index="3">
        <span class="num">${s.index}</span>${esc(s.title!)}
      </div>`).join('');
  const caps = t.showCaptions ? t.captions.map((c, i) => `
      <div id="cap-${i}" class="clip caption${c.position === 'top' ? ' top' : ''}" data-start="${n(c.start)}" data-duration="${n(c.end - c.start)}" data-track-index="4"><span>${esc(c.text)}</span></div>`).join('') : '';
  const logo = (h: number, id: string) => (b.logo ? `<img id="${id}" class="logo" src="${b.logo}" style="height:${h}px">` : '');

  // --- GSAP ---
  const js: string[] = [];
  // Intro
  js.push(`tl.fromTo('#intro-mark', { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: 'back.out(1.6)' }, 0.05);`);
  words.forEach((_, i) => js.push(`tl.fromTo('#w${i}', { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' }, ${n(0.2 + i * 0.1)});`));
  js.push(`tl.fromTo('#intro-bar', { width: 0 }, { width: 220, duration: 0.9, ease: 'power3.out' }, 0.4);`);
  js.push(`tl.fromTo('#intro-sub', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6 }, 0.6);`);
  js.push(`tl.to('#intro', { opacity: 0, scale: 1.04, duration: 0.5, ease: 'power2.in' }, ${n(I - 0.5)});`);
  // Pantalla
  js.push(`tl.fromTo('#screen', { opacity: 0, scale: 0.94, y: 30 }, { opacity: 1, scale: 1, y: 0, duration: 0.8, ease: 'power3.out' }, ${scrStart});`);
  js.push(`tl.to('#screen', { opacity: 0, duration: 0.5, ease: 'power2.in' }, ${n(O.start - 0.1)});`);
  js.push(`tl.fromTo('#progress', { width: '0%' }, { width: '100%', duration: ${n(R.duration)}, ease: 'none' }, ${n(R.start)});`);
  // Cámara
  const k0 = t.camera[0] ?? { t: 0, s: 1, cx: 0.5, cy: 0.5 };
  const c0 = cameraTransform(k0, screen.w, screen.h);
  js.push(`gsap.set('#cam', { transformOrigin: '0 0', x: ${n(c0.tx)}, y: ${n(c0.ty)}, scale: ${c0.s} });`);
  for (let i = 0; i < t.camera.length - 1; i++) {
    const a = t.camera[i], z = t.camera[i + 1];
    if (a.s === z.s && a.cx === z.cx && a.cy === z.cy) continue;
    const A = cameraTransform(a, screen.w, screen.h), Z = cameraTransform(z, screen.w, screen.h);
    js.push(`tl.fromTo('#cam', { x: ${n(A.tx)}, y: ${n(A.ty)}, scale: ${n(A.s)} }, { x: ${n(Z.tx)}, y: ${n(Z.ty)}, scale: ${n(Z.s)}, duration: ${n(z.t - a.t)}, ease: 'power2.inOut', immediateRender: false }, ${n(a.t)});`);
  }
  // Rótulos y subtítulos
  for (const s of t.steps.filter((x) => x.title)) {
    js.push(`tl.fromTo('#badge-${s.id}', { x: ${s.badgeSide === 'right' ? 40 : -40}, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: 'power3.out' }, ${n(s.start)});`);
    js.push(`tl.to('#badge-${s.id}', { opacity: 0, duration: 0.3 }, ${n(Math.max(s.start + 0.5, s.end - 0.3))});`);
  }
  if (t.showCaptions) t.captions.forEach((c, i) => {
    js.push(`tl.fromTo('#cap-${i}', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.15 }, ${n(c.start)});`);
  });
  // Outro
  js.push(`tl.fromTo('#check', { scale: 0 }, { scale: 1, duration: 0.7, ease: 'back.out(2)' }, ${n(O.start + 0.05)});`);
  js.push(`tl.fromTo('#check-path', { strokeDashoffset: 24 }, { strokeDashoffset: 0, duration: 0.6, ease: 'power2.out' }, ${n(O.start + 0.3)});`);
  ['#outro-title', '#outro-sub', '#outro-cta', '#outro-logo'].forEach((id, i) =>
    js.push(`tl.fromTo('${id}', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }, ${n(O.start + 0.35 + i * 0.2)});`));

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${t.width}, height=${t.height}" />
    <script src="gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${t.width}px; height: ${t.height}px; overflow: hidden; background: ${b.background}; }
      #root { position: relative; width: 100%; height: 100%; font-family: ${font}; color: ${b.text}; }
      .clip { position: absolute; inset: 0; }
      #bg { background: radial-gradient(1400px 900px at 78% 12%, ${b.primary}55, transparent 60%), radial-gradient(1100px 800px at 8% 96%, ${b.secondary}38, transparent 60%), ${b.background}; }
      #grid { position: absolute; inset: 0; background-image: linear-gradient(${b.text}08 1px, transparent 1px), linear-gradient(90deg, ${b.text}08 1px, transparent 1px); background-size: 64px 64px;
        -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%); mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%); }
      #intro { display: flex; align-items: center; justify-content: center; text-align: center; }
      #intro h1 { font-size: ${t.intro.title.length > 38 ? 84 : 104}px; line-height: 1.04; font-weight: 900; letter-spacing: -0.035em; max-width: 1400px; }
      #intro h1 span { display: inline-block; margin-right: 0.25em; }
      .pill { display: inline-block; padding: 10px 22px; border-radius: 999px; background: ${b.primary}; color: #fff; font-size: 26px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
      #intro-mark { margin-bottom: 36px; }
      #intro-bar { height: 8px; width: 0; margin: 34px auto 0; border-radius: 8px; background: linear-gradient(90deg, ${b.primary}, ${b.secondary}); }
      #intro-sub { font-size: 40px; color: ${b.mutedText}; margin-top: 30px; }
      #frame { position: absolute; left: ${screen.x}px; top: ${screen.y - chromeH}px; width: ${screen.w}px; height: ${screen.h + chromeH}px; border-radius: ${b.radius}px; overflow: hidden;
        background: ${b.surface}; box-shadow: 0 50px 100px rgba(0,0,0,.5), 0 0 0 1px ${b.text}1f; }
      #chrome { height: ${chromeH}px; display: ${browserFrame ? 'flex' : 'none'}; align-items: center; gap: 10px; padding: 0 20px; }
      #chrome i { width: 14px; height: 14px; border-radius: 50%; display: block; }
      #url { margin-left: 24px; flex: 1; max-width: 760px; height: ${Math.round(chromeH * 0.62)}px; border-radius: 999px; background: ${b.text}12; color: ${b.mutedText};
        font-size: ${Math.round(chromeH * 0.36)}px; display: flex; align-items: center; padding: 0 18px; }
      #viewport { position: absolute; left: 0; top: ${chromeH}px; width: ${screen.w}px; height: ${screen.h}px; overflow: hidden; background: #fff; }
      #cam { position: absolute; left: 0; top: 0; width: ${screen.w}px; height: ${screen.h}px; }
      #rec { position: absolute; inset: 0; width: ${screen.w}px; height: ${screen.h}px; object-fit: fill; }
      #progress { position: absolute; left: 0; bottom: 0; height: 6px; width: 0; background: linear-gradient(90deg, ${b.primary}, ${b.secondary}); }
      .badge { inset: auto; left: ${screen.x + 28}px; top: ${screen.y + 26}px; display: flex; align-items: center; gap: 16px; padding: 12px 26px 12px 12px; border-radius: 999px;
        background: ${b.surface}E6; border: 1px solid ${b.text}22; box-shadow: 0 12px 30px rgba(0,0,0,.35); font-size: 30px; font-weight: 700; z-index: 5; opacity: 0; }
      .badge.right { left: auto; right: ${t.width - (screen.x + screen.w) + 28}px; }
      .badge .num { width: 46px; height: 46px; border-radius: 50%; background: ${b.primary}; color: #fff; display: grid; place-items: center; font-size: 24px; font-weight: 900; }
      .caption { inset: auto; left: 0; right: 0; top: ${screen.y + screen.h - 130}px; display: flex; justify-content: center; z-index: 6; opacity: 0; }
      .caption.top { top: ${screen.y + 110}px; }
      .caption span { max-width: ${Math.round(screen.w * 0.8)}px; padding: 14px 30px; border-radius: 16px; background: rgba(8,10,18,.82); color: #fff; font-size: 42px; font-weight: 600; line-height: 1.25; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,.35); }
      #outro { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
      #check { width: 150px; height: 150px; border-radius: 50%; display: grid; place-items: center; background: linear-gradient(135deg, ${b.primary}, ${b.secondary}); box-shadow: 0 20px 60px ${b.primary}66; }
      #outro-title { font-size: 92px; font-weight: 900; letter-spacing: -0.03em; margin-top: 44px; }
      #outro-sub { font-size: 40px; color: ${b.mutedText}; margin-top: 18px; }
      #outro-cta { margin-top: 44px; padding: 20px 44px; border-radius: 999px; background: ${b.primary}; color: #fff; font-size: 36px; font-weight: 800; }
      #outro-logo { margin-top: 56px; }
      .logo { object-fit: contain; }
    </style>${design?.css ? `
    <style id="design-css">
${design.css}
    </style>` : ''}
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${n(t.duration)}" data-width="${t.width}" data-height="${t.height}">
      <div id="bg" class="clip" data-start="0" data-duration="${n(t.duration)}" data-track-index="0"><div id="grid"></div></div>

      <div id="intro" class="clip" data-start="0" data-duration="${n(I)}" data-track-index="1">
        <div>
          <div id="intro-mark">${b.logo ? logo(96, 'intro-logo') : '<span class="pill">Tutorial</span>'}</div>
          <h1>${words.map((w, i) => `<span id="w${i}">${esc(w)}</span>`).join('')}</h1>
          <div id="intro-bar"></div>
          ${t.intro.subtitle ? `<p id="intro-sub">${esc(t.intro.subtitle)}</p>` : '<p id="intro-sub"></p>'}
        </div>
      </div>

      <div id="screen" class="clip" data-start="${scrStart}" data-duration="${scrDur}" data-track-index="2">
        <div id="frame">
          <div id="chrome"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><div id="url">🔒&nbsp; ${esc(t.displayUrl)}</div></div>
          <div id="viewport">
            <div id="cam">
              <video id="rec" class="clip" src="${R.src}" muted playsinline data-start="${n(R.start)}" data-duration="${n(R.duration)}" data-track-index="2"></video>
            </div>
            <div id="progress"></div>
          </div>
        </div>
      </div>
${badges}
${caps}

      <div id="outro" class="clip" data-start="${n(O.start)}" data-duration="${n(O.duration)}" data-track-index="1">
        <div id="check"><svg width="80" height="80" viewBox="0 0 24 24"><path id="check-path" d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="24" stroke-dashoffset="24"/></svg></div>
        <h2 id="outro-title">${esc(O.title)}</h2>
        <p id="outro-sub">${esc(O.subtitle ?? '')}</p>
        ${O.cta ? `<div id="outro-cta">${esc(O.cta)}</div>` : '<div id="outro-cta" style="display:none"></div>'}
        ${b.logo ? logo(64, 'outro-logo') : '<div id="outro-logo"></div>'}
      </div>

${design?.html ? `      <!-- design.html -->\n${design.html}\n` : ''}
      ${t.audio.src ? `<audio id="mix" src="${t.audio.src}" data-start="0" data-duration="${n(t.duration)}" data-volume="1"></audio>` : ''}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      ${js.join('\n      ')}
      const TUTO = ${JSON.stringify(tutoData(t))};${design?.js ? `
      // ── design.js (projects/<p>/design) ──
      ;(function (tl, gsap, TUTO) {
${design.js}
      })(tl, gsap, TUTO);` : ''}
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;
}

function hyperframesBin(): string {
  const pkgPath = require.resolve('hyperframes/package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return path.join(path.dirname(pkgPath), pkg.bin.hyperframes);
}

export function runHyperframes(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [hyperframesBin(), ...args], {
      cwd, stdio: 'inherit', windowsHide: true,
      env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: '1', HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1' },
    });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`hyperframes ${args[0]} salió con código ${code}`))));
  });
}

/** Escribe el proyecto HyperFrames (index.html + recursos) sin renderizar. */
export function writeHyperframesProject(p: Parameters<Engine['render']>[0], tl: Timeline) {
  const dir = ensureDir(path.join(p.build, 'hyperframes'));
  stageAssets(p, tl, dir);
  fs.copyFileSync(require.resolve('gsap/dist/gsap.min.js'), path.join(dir, 'gsap.min.js'));
  const design = loadDesign(p.dir);
  // recursos de diseño (fuentes, imágenes, svg) → build/hyperframes/design/
  const dsrc = path.join(p.dir, 'design');
  if (design && fs.existsSync(dsrc)) {
    fs.cpSync(dsrc, path.join(dir, 'design'), { recursive: true, filter: (f) => !/design\.(css|js|html)$/.test(f) });
    log.info('Capa de diseño: ' + ['design.css', 'design.html', 'design.js'].filter((f) => fs.existsSync(path.join(dsrc, f))).join(', '));
  }
  fs.writeFileSync(path.join(dir, 'index.html'), composeHtml(tl, design));
  const meta = path.join(dir, 'meta.json');
  if (!fs.existsSync(meta)) fs.writeFileSync(meta, JSON.stringify({ id: p.name, name: tl.title }, null, 2));
  const hf = path.join(dir, 'hyperframes.json');
  if (!fs.existsSync(hf)) fs.writeFileSync(hf, JSON.stringify({ $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json', paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' } }, null, 2));
  return dir;
}

export const hyperframesEngine: Engine = {
  name: 'hyperframes',
  async render(p, tl, { quality, out }) {
    const dir = writeHyperframesProject(p, tl);
    log.step(`HyperFrames: composición en ${path.relative(process.cwd(), path.join(dir, 'index.html'))}`);
    const r = p.cfg.render;
    const gpu = await detectGpu(r.gpu);
    const extra: string[] = [];
    if (gpu.encoder) extra.push('--gpu');                 // codificación por GPU (NVENC, AMF, QSV, VideoToolbox, VAAPI)
    if (r.gpu === 'off') extra.push('--no-browser-gpu');   // por defecto HyperFrames prueba la GPU para dibujar y cae a software
    if (r.concurrency) extra.push('--workers', String(Math.min(8, r.concurrency)));
    const args = ['render', '--quality', quality, '--fps', String(tl.fps), '--video-frame-format', 'png', ...extra, '--output', out];
    try {
      await runHyperframes(args, dir);
    } catch (e) {
      if (!extra.includes('--gpu')) throw e;
      log.warn('HyperFrames con GPU falló; repito por software');
      await runHyperframes(args.filter((a) => a !== '--gpu'), dir);
    }
    return out;
  },
};
