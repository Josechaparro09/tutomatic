// Estilo "Ruta". Todo animado en `tl` con tiempos de TUTO (seguro para saltar a cualquier cuadro).
const B = TUTO.brand, R = document.documentElement.style;
[['--p', B.primary], ['--s', B.secondary], ['--bg', B.background], ['--sf', B.surface], ['--tx', B.text], ['--mu', B.mutedText], ['--font', `'${B.fontFamily}'`]]
  .forEach(([k, v]) => R.setProperty(k, v));
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CH = TUTO.chapters.length ? TUTO.chapters : [{ index: 1, total: 1, name: TUTO.title, start: TUTO.recording.start }];
const I = TUTO.intro, O = TUTO.outro, D = TUTO.duration;
const logo = B.logo ? `<img class="r-logo" src="${B.logo}">` : '';

// ── Fondo vivo ──
$('#bg').insertAdjacentHTML('beforeend', '<div id="r-glow-a" class="r-glow"></div><div id="r-glow-b" class="r-glow"></div>');
tl.fromTo('#r-glow-a', { scale: 1, x: 0 }, { scale: 1.15, x: -60, duration: 6, ease: 'sine.inOut', repeat: Math.ceil(D / 6), yoyo: true }, 0);
tl.fromTo('#r-glow-b', { scale: 1.1, y: 0 }, { scale: 0.9, y: -50, duration: 7, ease: 'sine.inOut', repeat: Math.ceil(D / 7), yoyo: true }, 0);
tl.fromTo('#grid', { backgroundPosition: '0px 0px' }, { backgroundPosition: '-340px -170px', duration: D, ease: 'none' }, 0);

// ── Ruta con paradas (se usa en la intro y en el outro) ──
function route(id, x0, y0, h, done) {
  const n = CH.length, gap = n > 1 ? h / (n - 1) : 0;
  const pts = CH.map((_, i) => [x0 + (i % 2 ? 90 : 0), y0 + i * gap]);
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < n; i++) { const [a, b] = pts[i - 1], [c, e] = pts[i]; d += ` C ${a} ${b + gap * 0.55}, ${c} ${e - gap * 0.55}, ${c} ${e}`; }
  const stops = CH.map((c, i) => `<div class="r-stop${done ? ' done' : ''}" id="${id}-s${i}" style="left:${pts[i][0]}px;top:${pts[i][1]}px">
      <div class="r-pin">${done ? '✓' : c.index}</div><div><small>Parada ${c.index}</small><b>${esc(c.name)}</b></div></div>`).join('');
  return { html: `<svg class="r-route" width="1920" height="1080"><path class="track" d="${d}"/><path class="line" id="${id}-line" d="${d}"/></svg>${stops}`, n };
}
function drawRoute(id, n, t0, dur) {
  const p = $(`#${id}-line`), L = p.getTotalLength();
  p.style.strokeDasharray = L; p.style.strokeDashoffset = L;
  tl.fromTo(p, { strokeDashoffset: L }, { strokeDashoffset: 0, duration: dur, ease: 'power2.inOut' }, t0);
  for (let i = 0; i < n; i++) {
    const at = t0 + (n > 1 ? (dur * i) / (n - 1) : 0);
    tl.fromTo(`#${id}-s${i}`, { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.45, ease: 'power3.out' }, at);
    tl.fromTo(`#${id}-s${i} .r-pin`, { scale: 0 }, { scale: 1, duration: 0.5, ease: 'back.out(2.2)' }, at);
  }
}

// ── Intro: título + agenda del video como ruta ──
const words = TUTO.title.split(' ');
const ri = route('ri', 1180, 200, 600, false);
$('#intro').insertAdjacentHTML('beforeend', `<div class="r-scene">${logo}<div class="r-col">
  <div class="r-kicker mono" id="ri-k">Tutorial · ${esc(B.name || '')}</div>
  <h1 class="r-title" id="ri-t">${words.map((w, i) => `<span class="w${i >= words.length - 2 ? ' hl' : ''}"><span id="ri-w${i}">${esc(w)}</span></span>`).join('')}</h1>
  <div class="r-rule" id="ri-r"></div><p class="r-sub" id="ri-sub">${esc(TUTO.subtitle)}</p></div>${ri.html}</div>`);
tl.fromTo('#intro .r-logo', { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0.1);
tl.fromTo('#ri-k', { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' }, 0.3);
words.forEach((_, i) => tl.fromTo(`#ri-w${i}`, { yPercent: 110 }, { yPercent: 0, duration: 0.7, ease: 'expo.out' }, 0.4 + i * 0.07));
tl.fromTo('#ri-r', { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: 'power4.out' }, 0.9);
tl.fromTo('#ri-sub', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, 1.0);
drawRoute('ri', ri.n, 1.2, Math.min(3.2, Math.max(1.2, I.end - 3)));

// ── Barra del navegador: seguimiento de la ruta ──
const url = $('#url');
url.innerHTML = `<div class="r-track">${CH.map((_, i) => `${i ? `<div class="r-seg" id="rt-g${i}"></div>` : ''}<div class="r-dot" id="rt-d${i}"></div>`).join('')}</div>` +
  CH.map((c, i) => `<div class="r-label" id="rt-l${i}"><em class="mono">${c.index}/${c.total}</em>${esc(c.name)}</div>`).join('');
CH.forEach((c, i) => {
  const t = Math.max(TUTO.recording.start, c.start), next = CH[i + 1] ? CH[i + 1].start : O.start;
  tl.set(`#rt-d${i}`, { attr: { class: 'r-dot on cur' } }, t);
  if (i) { tl.set(`#rt-g${i}`, { attr: { class: 'r-seg on' } }, t); tl.set(`#rt-d${i - 1}`, { attr: { class: 'r-dot on' } }, t); }
  tl.fromTo(`#rt-l${i}`, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }, t);
  tl.to(`#rt-l${i}`, { opacity: 0, y: -14, duration: 0.25, ease: 'power2.in' }, next - 0.25);
});

// ── Tarjeta de parada (arriba al centro de la pantalla, 1.7 s; no tapa el zoom, que queda al centro) ──
const S = TUTO.screen;
CH.forEach((c, i) => {
  const t0 = Math.max(TUTO.recording.start + 0.35, c.start), id = 'rc' + i;
  $('#root').insertAdjacentHTML('beforeend', `<div id="${id}" class="clip r-card" data-start="${t0}" data-duration="1.9" data-track-index="8">
    <div class="r-pin">${c.index}</div><div><small class="mono">PARADA ${c.index} DE ${c.total}</small><b>${esc(c.name)}</b></div></div>`);
  const el = $('#' + id);
  el.style.left = S.x + S.w / 2 + 'px'; el.style.top = S.y + 22 + 'px'; gsap.set(el, { xPercent: -50 });
  tl.fromTo(el, { opacity: 0, y: -30, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'back.out(1.6)' }, t0);
  tl.fromTo(`#${id} .r-pin`, { rotate: -120 }, { rotate: 0, duration: 0.6, ease: 'power3.out' }, t0 + 0.05);
  tl.to(el, { opacity: 0, y: -20, duration: 0.3, ease: 'power2.in' }, t0 + 1.55);
  // el rótulo del paso espera a que salga la tarjeta (no se muestran los dos a la vez)
  const st = TUTO.steps.find((s) => s.id === c.stepId), bd = $('#badge-' + c.stepId);
  if (bd && st) {
    tl.set(bd, { opacity: 0 }, Math.max(st.start, t0 - 0.35) + 0.001);
    if (st.end - (t0 + 1.85) > 1.2) tl.fromTo(bd, { opacity: 0, x: st.badgeSide === 'right' ? 30 : -30 }, { opacity: 1, x: 0, duration: 0.4, ease: 'power3.out' }, t0 + 1.85);
  }
});

// ── Outro: entregado + recorrido completo ──
const ro = route('ro', 1180, 200, 600, true);
$('#outro').insertAdjacentHTML('beforeend', `<div class="r-scene">
  <div class="r-check" id="ro-c"><svg width="64" height="64" viewBox="0 0 24 24"><path id="ro-cp" d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="24"/></svg></div>
  <div class="r-col" style="top:380px"><h2 class="r-otitle" id="ro-t">${esc(O.title)}</h2><p class="r-sub" id="ro-sub">${esc(O.subtitle)}</p>
  ${O.cta ? `<div><div class="r-cta" id="ro-cta">${esc(O.cta)}</div></div>` : ''}</div>
  ${B.logo ? `<img class="r-ologo" id="ro-l" src="${B.logo}">` : ''}${ro.html}</div>`);
tl.fromTo('#ro-c', { scale: 0, rotate: -90 }, { scale: 1, rotate: 0, duration: 0.7, ease: 'back.out(2)' }, O.start + 0.1);
tl.fromTo('#ro-cp', { strokeDashoffset: 24 }, { strokeDashoffset: 0, duration: 0.5, ease: 'power2.out' }, O.start + 0.45);
[['#ro-t', 0.4], ['#ro-sub', 0.6], ['#ro-cta', 0.8], ['#ro-l', 1.0]].forEach(([s, d]) => $(s) && tl.fromTo(s, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out' }, O.start + d));
drawRoute('ro', ro.n, O.start + 0.5, 1.8);
