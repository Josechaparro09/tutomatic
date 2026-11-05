// Estilo "Suave". Todo animado en `tl` con tiempos de TUTO (seguro para saltar a cualquier cuadro).
const B = TUTO.brand, R = document.documentElement.style;
[['--p', B.primary], ['--s', B.secondary], ['--bg', B.background], ['--sf', B.surface], ['--tx', B.text], ['--mu', B.mutedText], ['--font', `'${B.fontFamily}'`]]
  .forEach(([k, v]) => R.setProperty(k, v));
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CH = TUTO.chapters.length ? TUTO.chapters : [{ index: 1, total: 1, name: TUTO.title, start: TUTO.recording.start }];
const I = TUTO.intro, O = TUTO.outro, D = TUTO.duration;

// ── Fondo: manchas de color que derivan + grano ──
$('#bg').insertAdjacentHTML('beforeend', '<div id="s-b1" class="s-blob"></div><div id="s-b2" class="s-blob"></div><div id="s-b3" class="s-blob"></div><div id="s-grain"></div>');
tl.fromTo('#s-b1', { x: 0, y: 0, scale: 1 }, { x: 260, y: 120, scale: 1.15, duration: 9, ease: 'sine.inOut', repeat: Math.ceil(D / 9), yoyo: true }, 0);
tl.fromTo('#s-b2', { x: 0, y: 0 }, { x: -220, y: -100, duration: 11, ease: 'sine.inOut', repeat: Math.ceil(D / 11), yoyo: true }, 0);
tl.fromTo('#s-b3', { x: 0, scale: 1 }, { x: -300, scale: 1.25, duration: 13, ease: 'sine.inOut', repeat: Math.ceil(D / 13), yoyo: true }, 0);

// ── Intro: tarjeta de vidrio centrada + capítulos como chips ──
const words = TUTO.title.split(' ');
$('#intro').insertAdjacentHTML('beforeend', `<div class="s-scene"><div class="s-glass" id="si-g">
  ${B.logo ? `<img class="s-logo" id="si-l" src="${B.logo}">` : ''}
  <h1 class="s-title">${words.map((w, i) => `<span class="w" id="si-w${i}">${esc(w)}</span>`).join('')}</h1>
  <p class="s-sub" id="si-sub">${esc(TUTO.subtitle)}</p>
  <div class="s-chips">${CH.map((c, i) => `<div class="s-chip" id="si-c${i}"><em>${c.index}</em>${esc(c.name)}</div>`).join('')}</div></div></div>`);
tl.fromTo('#si-g', { opacity: 0, y: 40, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.9, ease: 'power3.out' }, 0.05);
tl.fromTo('#si-l', { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, 0.3);
words.forEach((_, i) => tl.fromTo(`#si-w${i}`, { opacity: 0, filter: 'blur(14px)', y: 18 }, { opacity: 1, filter: 'blur(0px)', y: 0, duration: 0.7, ease: 'power2.out' }, 0.45 + i * 0.08));
tl.fromTo('#si-sub', { opacity: 0 }, { opacity: 1, duration: 0.6 }, 1.1);
CH.forEach((_, i) => tl.fromTo(`#si-c${i}`, { opacity: 0, y: 14, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'back.out(1.8)' }, 1.4 + i * 0.12));

// ── Indicador de capítulo en el margen inferior ──
CH.forEach((c, i) => {
  const t0 = Math.max(TUTO.recording.start + 0.2, c.start), t1 = (CH[i + 1] ? CH[i + 1].start : O.start) - 0.05, id = 'sb' + i;
  $('#root').insertAdjacentHTML('beforeend', `<div id="${id}" class="clip s-bar" data-start="${t0}" data-duration="${Math.max(0.5, t1 - t0)}" data-track-index="8">
    <div class="s-num">${c.index}</div><div class="s-name">${esc(c.name)}</div>
    <div class="s-segs">${CH.map((_, k) => `<i class="${k < i ? 'on' : k === i ? 'cur' : ''}"></i>`).join('')}</div></div>`);
  gsap.set('#' + id, { xPercent: -50 });
  tl.fromTo('#' + id, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out' }, t0);
  tl.fromTo(`#${id} .s-num`, { scale: 0.4 }, { scale: 1, duration: 0.5, ease: 'back.out(2.4)' }, t0 + 0.05);
  tl.to('#' + id, { opacity: 0, y: 12, duration: 0.25, ease: 'power2.in' }, t1 - 0.25);
});

// ── Outro ──
$('#outro').insertAdjacentHTML('beforeend', `<div class="s-scene"><div class="s-glass" id="so-g">
  <div class="s-check" id="so-c"><svg width="70" height="70" viewBox="0 0 24 24"><path id="so-cp" d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="24"/></svg></div>
  <h2 class="s-title" id="so-t">${esc(O.title)}</h2><p class="s-sub" id="so-sub">${esc(O.subtitle)}</p>
  ${O.cta ? `<div class="s-cta" id="so-cta">${esc(O.cta)}</div>` : ''}
  ${B.logo ? `<img class="s-logo" id="so-l" src="${B.logo}" style="margin:44px 0 0;height:58px">` : ''}</div></div>`);
tl.fromTo('#so-g', { opacity: 0, y: 40, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: 'power3.out' }, O.start);
tl.fromTo('#so-c', { scale: 0 }, { scale: 1, duration: 0.7, ease: 'back.out(2)' }, O.start + 0.25);
tl.fromTo('#so-cp', { strokeDashoffset: 24 }, { strokeDashoffset: 0, duration: 0.5, ease: 'power2.out' }, O.start + 0.6);
[['#so-t', 0.5], ['#so-sub', 0.7], ['#so-cta', 0.9], ['#so-l', 1.1]].forEach(([s, d]) => $(s) && tl.fromTo(s, { opacity: 0, y: 20, filter: 'blur(8px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.6, ease: 'power2.out' }, O.start + d));
