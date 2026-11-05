// Estilo "Etiqueta". Todo animado en `tl` con tiempos de TUTO (seguro para saltar a cualquier cuadro).
const B = TUTO.brand, R = document.documentElement.style;
[['--p', B.primary], ['--s', B.secondary], ['--bg', B.background], ['--sf', B.surface], ['--tx', B.text], ['--mu', B.mutedText], ['--font', `'${B.fontFamily}'`]]
  .forEach(([k, v]) => R.setProperty(k, v));
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CH = TUTO.chapters.length ? TUTO.chapters : [{ index: 1, total: 1, name: TUTO.title, start: TUTO.recording.start, stepId: '' }];
const I = TUTO.intro, O = TUTO.outro, D = TUTO.duration, pad = (k) => String(k).padStart(2, '0');
const mins = Math.max(1, Math.round(D / 60));

// código de barras determinista a partir del título
let h = 7; for (const ch of TUTO.title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
const bars = Array.from({ length: 46 }, (_, i) => { h = (h * 1103515245 + 12345) >>> 0; return 2 + (h % 4) * 2; });
const code = String(h % 100000000).padStart(8, '0');
const barsHtml = `<div class="e-bars">${bars.map((w, i) => `<i style="width:${w}px;opacity:${i % 5 === 3 ? 0 : 1}"></i>`).join('')}</div><div class="e-code mono">${code}</div>`;

tl.fromTo('#grid', { backgroundPosition: '0px 0px' }, { backgroundPosition: '-520px 0px', duration: D, ease: 'none' }, 0);

// ── Intro: panel de marca + etiqueta de envío con los datos del video ──
const words = TUTO.title.split(' ');
$('#intro').insertAdjacentHTML('beforeend', `<div class="e-scene"><div class="e-panel" id="ei-p"></div>
  <div class="e-kicker mono" id="ei-k">TUTORIAL · ${esc((B.name || '').toUpperCase())}</div>
  <h1 class="e-title">${words.map((w, i) => `<span class="w"><span id="ei-w${i}">${esc(w)}</span></span>`).join('')}</h1>
  <p class="e-sub" id="ei-sub">${esc(TUTO.subtitle)}</p>
  <div class="e-label" id="ei-l">${B.logo ? `<img class="logo-e" src="${B.logo}">` : ''}
    <div class="e-row mono"><span>TIPO</span><b>Tutorial</b></div>
    <div class="e-row mono"><span>CAPÍTULOS</span><b>${pad(CH.length)}</b></div>
    <div class="e-row mono"><span>DURACIÓN</span><b>~${mins} min</b></div>
    <div class="e-row mono"><span>DESTINO</span><b>${esc(CH[CH.length - 1].name)}</b></div>${barsHtml}</div>
  <div class="e-stamp mono" id="ei-st" style="left:1560px;top:120px">NUEVO</div></div>`);
tl.fromTo('#ei-p', { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: 'expo.inOut' }, 0.05);
tl.fromTo('#ei-k', { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' }, 0.6);
words.forEach((_, i) => tl.fromTo(`#ei-w${i}`, { yPercent: 115 }, { yPercent: 0, duration: 0.75, ease: 'expo.out' }, 0.7 + i * 0.06));
tl.fromTo('#ei-sub', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 1.2);
tl.fromTo('#ei-l', { opacity: 0, x: 120, rotate: 6 }, { opacity: 1, x: 0, rotate: -2, duration: 0.9, ease: 'back.out(1.4)' }, 0.9);
tl.fromTo('#ei-l .e-row', { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.12, ease: 'power2.out' }, 1.4);
tl.fromTo('#ei-l .e-bars i', { scaleY: 0 }, { scaleY: 1, duration: 0.3, stagger: 0.012, ease: 'power2.out', transformOrigin: 'bottom' }, 1.9);
tl.fromTo('#ei-st', { opacity: 0, scale: 2.4, rotate: -24 }, { opacity: 1, scale: 1, rotate: -12, duration: 0.35, ease: 'power4.in' }, 2.7);
tl.to('#ei-l', { rotate: 0, y: -8, duration: Math.max(1, I.end - 3.6), ease: 'sine.inOut' }, 2.8);

// ── Barra del navegador: chip con el capítulo ──
$('#url').insertAdjacentHTML('beforeend', CH.map((c, i) => `<div class="e-chip mono" id="ec${i}">CAP ${pad(c.index)}/${pad(c.total)}</div>`).join(''));
CH.forEach((c, i) => {
  const t = Math.max(TUTO.recording.start, c.start), next = CH[i + 1] ? CH[i + 1].start : O.start;
  tl.fromTo(`#ec${i}`, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)' }, t);
  tl.to(`#ec${i}`, { opacity: 0, duration: 0.2 }, next - 0.2);
});

// ── Etiqueta de capítulo (arriba al centro, 1.7 s) ──
const S = TUTO.screen;
CH.forEach((c, i) => {
  const t0 = Math.max(TUTO.recording.start + 0.35, c.start), id = 'et' + i;
  $('#root').insertAdjacentHTML('beforeend', `<div id="${id}" class="clip e-tag" data-start="${t0}" data-duration="1.9" data-track-index="8">
    <div class="num mono">${pad(c.index)}</div><div class="txt"><small class="mono">CAPÍTULO ${pad(c.index)} / ${pad(c.total)}</small><b>${esc(c.name)}</b></div></div>`);
  const el = $('#' + id); el.style.left = S.x + S.w / 2 + 'px'; el.style.top = S.y + 22 + 'px';
  gsap.set(el, { xPercent: -50 });
  tl.fromTo(el, { opacity: 0, scale: 1.25, rotate: -5 }, { opacity: 1, scale: 1, rotate: -1.5, duration: 0.32, ease: 'power4.in' }, t0);
  tl.to(el, { rotate: 0, duration: 0.8, ease: 'elastic.out(1, 0.5)' }, t0 + 0.32);
  tl.to(el, { opacity: 0, y: -24, duration: 0.28, ease: 'power2.in' }, t0 + 1.55);
  const st = TUTO.steps.find((s) => s.id === c.stepId), bd = $('#badge-' + c.stepId);
  if (bd && st) {
    tl.set(bd, { opacity: 0 }, Math.max(st.start, t0 - 0.35) + 0.001);
    if (st.end - (t0 + 1.85) > 1.2) tl.fromTo(bd, { opacity: 0, x: st.badgeSide === 'right' ? 30 : -30 }, { opacity: 1, x: 0, duration: 0.4, ease: 'power3.out' }, t0 + 1.85);
  }
});

// ── Outro: panel + etiqueta entregada con la lista de capítulos ──
$('#outro').insertAdjacentHTML('beforeend', `<div class="e-scene"><div class="e-panel" id="eo-p"></div>
  <div class="e-kicker mono" id="eo-k" style="top:230px">LISTO · ${esc((B.name || '').toUpperCase())}</div>
  <h2 class="e-otitle" id="eo-t">${esc(O.title)}</h2>
  <p class="e-sub" id="eo-sub" style="bottom:auto;top:440px">${esc(O.subtitle)}</p>
  ${O.cta ? `<div class="e-cta" id="eo-cta">${esc(O.cta)}</div>` : ''}
  <div class="e-label e-list" id="eo-l" style="top:130px">${B.logo ? `<img class="logo-e" src="${B.logo}">` : ''}
    ${CH.map((c) => `<div class="e-row mono"><span>${pad(c.index)}</span><b>${esc(c.name)}</b></div>`).join('')}${barsHtml}</div>
  <div class="e-stamp mono" id="eo-st" style="left:1440px;top:820px">COMPLETADO</div></div>`);
tl.fromTo('#eo-p', { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: 'expo.inOut' }, O.start);
tl.fromTo('#eo-k', { opacity: 0 }, { opacity: 1, duration: 0.4 }, O.start + 0.5);
tl.fromTo('#eo-t', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out' }, O.start + 0.55);
tl.fromTo('#eo-sub', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }, O.start + 0.75);
if (O.cta) tl.fromTo('#eo-cta', { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(2)' }, O.start + 0.95);
tl.fromTo('#eo-l', { opacity: 0, x: 120, rotate: 6 }, { opacity: 1, x: 0, rotate: -2, duration: 0.8, ease: 'back.out(1.4)' }, O.start + 0.6);
tl.fromTo('#eo-l .e-row', { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.35, stagger: 0.12, ease: 'power2.out' }, O.start + 1.1);
tl.fromTo('#eo-st', { opacity: 0, scale: 2.4, rotate: -24 }, { opacity: 1, scale: 1, rotate: -10, duration: 0.35, ease: 'power4.in' }, O.start + 1.1 + CH.length * 0.12);
