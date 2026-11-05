// Variables de marca para design.css
const r = document.documentElement.style, B = TUTO.brand;
r.setProperty('--tuto-primary', B.primary); r.setProperty('--tuto-secondary', B.secondary);
r.setProperty('--tuto-text', B.text); r.setProperty('--tuto-muted', B.mutedText); r.setProperty('--tuto-surface', B.surface);

// Fondo vivo: texto fantasma que se desplaza y brillos que respiran (todo en la línea de tiempo: determinista)
const bg = document.getElementById('bg');
bg.insertAdjacentHTML('beforeend', `<div id="glow-a" class="glow"></div><div id="glow-b" class="glow"></div><div id="ghost">${TUTO.title.split(' ').slice(-1)[0]}</div>`);
tl.fromTo('#ghost', { x: 0 }, { x: -260, duration: TUTO.duration, ease: 'none' }, 0);
tl.fromTo('#glow-a', { scale: 1 }, { scale: 1.18, duration: 4, ease: 'sine.inOut', repeat: Math.ceil(TUTO.duration / 4), yoyo: true }, 0);
tl.fromTo('#glow-b', { scale: 1.1 }, { scale: 0.92, duration: 5, ease: 'sine.inOut', repeat: Math.ceil(TUTO.duration / 5), yoyo: true }, 0);

// Tarjeta de capítulo al inicio de cada capítulo (entra, se queda 1.1 s y sale antes de la acción)
const root = document.getElementById('root');
TUTO.steps.filter((s) => s.chapter).forEach((s, i) => {
  const id = 'chap-' + i, t0 = Math.max(TUTO.recording.start, s.start - 0.15);
  root.insertAdjacentHTML('beforeend', `<div id="${id}" class="clip chapter" data-start="${t0}" data-duration="1.8" data-track-index="7"><div class="n">${i + 1}</div><div><small>Capítulo ${i + 1}</small><b>${s.chapter}</b></div></div>`);
  tl.fromTo('#' + id, { opacity: 0, scale: 0.9, y: 30 }, { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: 'back.out(1.7)' }, t0);
  tl.fromTo('#' + id + ' .n', { rotate: -90 }, { rotate: 0, duration: 0.6, ease: 'power3.out' }, t0 + 0.05);
  tl.to('#' + id, { opacity: 0, y: -20, duration: 0.3, ease: 'power2.in' }, t0 + 1.45);
});
