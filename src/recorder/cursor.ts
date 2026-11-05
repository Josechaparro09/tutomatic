/**
 * Script que se inyecta en cada página: dibuja un cursor bonito que sigue al mouse
 * sintético de Playwright, con onda al hacer clic. No intercepta eventos.
 */
export function cursorInitScript(color: string) {
  return `(() => {
  if (window.__tutoCursor) return;
  window.__tutoCursor = true;
  const COLOR = ${JSON.stringify(color)};
  const mount = () => {
    if (!document.body) return requestAnimationFrame(mount);
    const style = document.createElement('style');
    style.textContent = \`
      #__tuto_cursor{position:fixed;left:0;top:0;width:30px;height:30px;z-index:2147483647;pointer-events:none;
        transform:translate(-100px,-100px);will-change:transform;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));}
      .__tuto_ripple{position:fixed;z-index:2147483646;pointer-events:none;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;
        border:3px solid \${COLOR};background:\${COLOR}33;animation:__tuto_r .55s ease-out forwards;}
      @keyframes __tuto_r{from{transform:scale(.4);opacity:1}to{transform:scale(3.4);opacity:0}}
      .__tuto_hl{position:fixed;z-index:2147483645;pointer-events:none;left:0;top:0;
        border:2.5px solid \${COLOR};box-shadow:0 0 0 4px \${COLOR}26;opacity:0;transition:opacity .18s ease-out;will-change:transform,width,height;}
      .__tuto_hl.on{opacity:1}
    \`;
    document.documentElement.appendChild(style);
    const c = document.createElement('div');
    c.id = '__tuto_cursor';
    c.innerHTML = '<svg viewBox="0 0 32 32" width="30" height="30"><path d="M5 3 L5 25 L11 19.5 L15 28.5 L19 26.8 L15 18 L23 18 Z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    const place = (x, y) => { c.style.transform = 'translate(' + (x - 4) + 'px,' + (y - 2) + 'px)'; };
    try { const s = JSON.parse(sessionStorage.getItem('__tuto_pos') || 'null'); if (s) place(s[0], s[1]); } catch {}
    addEventListener('mousemove', (e) => {
      place(e.clientX, e.clientY);
      try { sessionStorage.setItem('__tuto_pos', JSON.stringify([e.clientX, e.clientY])); } catch {}
    }, { capture: true, passive: true });
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      r.className = '__tuto_ripple';
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.documentElement.appendChild(r);
      setTimeout(() => r.remove(), 700);
    }, { capture: true, passive: true });
    /*
     * Resaltado preciso: un marco ajustado al elemento (borde + 3 px), con sus mismas esquinas,
     * que lo SIGUE cuadro a cuadro (scroll, animaciones) y se apaga solo:
     *  - al hacer clic o empezar a escribir (tras 250 ms, para que se vea el clic),
     *  - si el elemento desaparece, se oculta o sale de la pantalla,
     *  - o cuando el grabador lo pide al terminar el paso.
     */
    let hl = null, hlEl = null, raf = 0, offTimer = 0;
    const off = (delay) => {
      clearTimeout(offTimer);
      offTimer = setTimeout(() => {
        if (!hl) return;
        const node = hl; hl = null; hlEl = null; cancelAnimationFrame(raf);
        node.classList.remove('on');
        setTimeout(() => node.remove(), 220);
      }, delay || 0);
    };
    const follow = () => {
      if (!hl || !hlEl) return;
      const r = hlEl.isConnected ? hlEl.getBoundingClientRect() : null;
      const st = r ? getComputedStyle(hlEl) : null;
      if (!r || r.width < 2 || r.height < 2 || st.visibility === 'hidden' || st.display === 'none' ||
          r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) { off(0); return; }
      const pad = 3;
      hl.style.transform = 'translate(' + (r.left - pad) + 'px,' + (r.top - pad) + 'px)';
      hl.style.width = (r.width + pad * 2) + 'px';
      hl.style.height = (r.height + pad * 2) + 'px';
      raf = requestAnimationFrame(follow);
    };
    window.__tutoHighlightEl = (el) => {
      clearTimeout(offTimer);
      if (hl) { const old = hl; hl = null; cancelAnimationFrame(raf); old.remove(); }
      if (!el) return;
      hlEl = el;
      hl = document.createElement('div');
      hl.className = '__tuto_hl';
      const rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 6;
      hl.style.borderRadius = (rad + 3) + 'px';
      document.documentElement.appendChild(hl);
      follow();
      requestAnimationFrame(() => hl && hl.classList.add('on'));
    };
    window.__tutoHighlightOff = (delay) => off(delay);
    // compatibilidad: __tutoHighlight(null) apaga
    window.__tutoHighlight = (b) => { if (!b) off(0); };
    addEventListener('mousedown', () => { if (hl) off(250); }, { capture: true, passive: true });
    addEventListener('keydown', () => { if (hl) off(250); }, { capture: true, passive: true });
  };
  mount();
})();`;
}
