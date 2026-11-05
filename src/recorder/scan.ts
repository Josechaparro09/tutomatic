/**
 * Escáner de controles de formulario que se ejecuta DENTRO de la página.
 * Se inyecta como texto (no como función TS) para que inspect y rehearse compartan
 * exactamente la misma lógica de nombres, selectores y huellas.
 *
 * Expone:
 *   window.__tutoScan()        → lista de controles de formulario visibles
 *   window.__tutoFingerprint(el) → huella estable de un control (o del control asociado a un label/contenedor)
 */
export const SCAN_SCRIPT = String.raw`(() => {
  if (window.__tutoScan) return;
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const cssEsc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);
  // ids generados por React/Radix/Base UI/Headless UI/MUI: cambian entre cargas, no sirven como selector
  const unstableId = (id) => !id || /\d{3,}|^:r|_r_|radix-|base-ui|headlessui|react-aria|^mui-|^rc-|^:/.test(id);

  const CONTROL_Q = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]),select,textarea,' +
    '[role=switch],[role=checkbox],[role=radio],[role=combobox],[role=slider],[role=spinbutton],[contenteditable=true]';

  const kindOf = (el) => {
    const role = el.getAttribute('role');
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (role === 'switch' || (tag === 'input' && type === 'checkbox' && el.getAttribute('role') === 'switch')) return 'switch';
    if (role === 'checkbox' || (tag === 'input' && type === 'checkbox')) return 'checkbox';
    if (role === 'radio' || (tag === 'input' && type === 'radio')) return 'radio';
    if (tag === 'select') return 'select';
    if (role === 'combobox') return 'combobox';
    if (tag === 'textarea') return 'textarea';
    if (role === 'slider' || type === 'range') return 'slider';
    if (type === 'file') return 'file';
    if (type === 'date' || type === 'datetime-local' || type === 'time') return 'date';
    if (el.isContentEditable) return 'editor';
    return 'text';
  };

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width >= 4 && r.height >= 4 && st.visibility !== 'hidden' && st.display !== 'none' && +st.opacity > 0.05;
  };

  // Para inputs ocultos (switches/checkbox con estilo propio) devuelve el elemento visible que los representa
  const visualOf = (el) => {
    // display:none en él o en un ancestro → realmente oculto (p. ej. campo que aparece solo al activar un switch)
    if (el.checkVisibility && !el.checkVisibility()) return null;
    if (visible(el)) return el;
    if (el.id) { const l = document.querySelector('label[for="' + cssEsc(el.id) + '"]'); if (l && visible(l)) return l; }
    let p = el.parentElement;
    for (let i = 0; p && i < 3; i++, p = p.parentElement) if (visible(p)) return p;
    return null;
  };

  const accName = (el) => {
    const al = el.getAttribute('aria-label'); if (al) return clean(al);
    const lb = el.getAttribute('aria-labelledby');
    if (lb) { const t = lb.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean).map((n) => n.textContent).join(' '); if (clean(t)) return clean(t); }
    if (el.id) { const l = document.querySelector('label[for="' + cssEsc(el.id) + '"]'); if (l && clean(l.textContent)) return clean(l.textContent); }
    const wrap = el.closest('label'); if (wrap && clean(wrap.textContent)) return clean(wrap.textContent);
    return '';
  };

  // Texto cercano: primer renglón del contenedor más próximo que tenga texto propio
  const nearText = (el) => {
    let p = el.parentElement;
    const own = clean(el.innerText || '');
    for (let i = 0; p && i < 5; i++, p = p.parentElement) {
      const t = (p.innerText || '').split('\n').map(clean).filter((s) => s && s !== own && !/^[*•·|:]+$/.test(s));
      if (t.length) return t[0].slice(0, 70);
    }
    return '';
  };

  const sectionOf = (el) => {
    let p = el.parentElement;
    for (let i = 0; p && i < 12; i++, p = p.parentElement) {
      const h = p.querySelector(':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > header h2,:scope > header h3,:scope > div > h2,:scope > div > h3,:scope > legend');
      if (h && clean(h.textContent)) return clean(h.textContent).slice(0, 60);
    }
    return '';
  };

  const groupOf = (el) => {
    const g = el.closest('form,[role=dialog],dialog,[role=form]');
    if (g) return (g.tagName.toLowerCase()) + ':' + (g.getAttribute('id') && !unstableId(g.id) ? g.id : g.getAttribute('aria-label') || g.getAttribute('name') || sectionOf(el) || 'form');
    return 'page:' + location.pathname;
  };

  const stateOf = (el, kind) => {
    if (kind === 'switch' || kind === 'checkbox' || kind === 'radio') {
      const ac = el.getAttribute('aria-checked');
      const on = ac != null ? ac === 'true' : !!el.checked;
      const dc = el.getAttribute('data-state') || (el.hasAttribute('data-checked') ? 'checked' : '');
      return on || dc === 'checked' || dc === 'on' ? 'encendido' : 'apagado';
    }
    if (kind === 'select') return clean(el.options && el.selectedIndex >= 0 ? el.options[el.selectedIndex].label : '');
    return clean(el.value || el.textContent || '').slice(0, 40);
  };

  const describe = (el) => {
    const kind = kindOf(el);
    const role = kind === 'text' || kind === 'textarea' || kind === 'date' ? 'textbox' : kind === 'select' ? 'combobox' : kind;
    const acc = accName(el);
    const ph = clean(el.getAttribute('placeholder') || '');
    const near = acc ? '' : nearText(el);
    const name = acc || near || ph;
    const tag = el.tagName.toLowerCase();
    const alts = [];
    const testid = el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-cy');
    if (testid) alts.push('testid:' + testid);
    if (acc && ['switch', 'checkbox', 'radio', 'combobox', 'slider'].includes(kind)) alts.push('role:' + role + '|' + acc);
    if (acc && ['text', 'textarea', 'select', 'date', 'file'].includes(kind)) alts.push('label:' + acc);
    if (!acc && ph && kind === 'combobox') alts.push('role:combobox|' + ph);
    if (!acc && near && ['switch', 'checkbox', 'radio', 'combobox', 'slider'].includes(kind)) alts.push('near:' + near + '|' + role);
    if (ph) alts.push('placeholder:' + ph);
    if (el.id && !unstableId(el.id)) alts.push('#' + cssEsc(el.id));
    if (el.getAttribute('name')) alts.push(tag + '[name="' + el.getAttribute('name') + '"]');
    if (!alts.length && near) alts.push('near:' + near + '|' + role);
    if (!alts.length) alts.push(tag);
    const section = sectionOf(el);
    const required = el.required || el.getAttribute('aria-required') === 'true' || /\*\s*$/.test(name);
    return {
      kind, role, name, nameSource: acc ? 'accesible' : near ? 'texto cercano' : 'placeholder',
      section, group: groupOf(el), required, state: stateOf(el, kind),
      disabled: !!(el.disabled || el.getAttribute('aria-disabled') === 'true'),
      fingerprint: kind + '|' + name.replace(/\s*\*\s*$/, '').toLowerCase() + '|' + section.toLowerCase(),
      selector: alts[0], alternatives: alts.slice(1),
    };
  };

  window.__tutoDescribe = describe;
  window.__tutoVisualOf = visualOf;
  window.__tutoUnstableId = unstableId;
  window.__tutoControlQ = CONTROL_Q;

  // ── Encuadre de cámara ────────────────────────────────────────────────
  const rectOf = (n) => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
  const union = (a, b) => {
    if (!a) return b; if (!b) return a;
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
  };
  const inView = (r) => r.width > 2 && r.height > 2 && r.x + r.width > 0 && r.y + r.height > 0 && r.x < innerWidth && r.y < innerHeight;
  const DIALOG_Q = '[role=dialog],[role=alertdialog],dialog[open],[aria-modal=true]';
  const visibleDialogs = () => Array.from(document.querySelectorAll(DIALOG_Q)).filter((d) => { const v = visualOf(d); return v && inView(rectOf(v)); });
  window.__tutoDialogCount = () => visibleDialogs().length;

  /**
   * Región que la cámara debe mostrar para un elemento: el elemento + su etiqueta visible
   * (label asociado o el texto justo encima) + la lista desplegable que haya abierto,
   * y para controles pequeños (switch/casilla) la fila completa.
   */
  window.__tutoFocusBox = (el0) => {
    if (!el0 || !el0.isConnected) return null;
    const el = visualOf(el0) || el0;
    let box = rectOf(el);
    if (!inView(box)) return null;
    const ctl = el0.matches && el0.matches(CONTROL_Q) ? el0 : (el0.querySelector ? el0.querySelector(CONTROL_Q) : null);
    // etiqueta
    let lbl = null;
    if (ctl) {
      if (ctl.labels && ctl.labels[0]) lbl = ctl.labels[0];
      const lb = ctl.getAttribute('aria-labelledby'); if (!lbl && lb) lbl = document.getElementById(lb.split(/\s+/)[0]);
      if (!lbl) { // texto encima dentro del mismo grupo (patrón label hermano)
        let p = el.parentElement;
        for (let i = 0; p && i < 3 && !lbl; i++, p = p.parentElement) lbl = p.querySelector(':scope > label, :scope > span, :scope > p');
      }
    }
    if (lbl && lbl !== el && visible(lbl)) {
      const lr = rectOf(lbl);
      if (Math.abs(lr.y - box.y) < 90 && Math.abs(lr.x - box.x) < 400) box = union(box, lr);
    }
    // switch / casilla / botón pequeño: la fila con su texto
    if (box.width < 90) {
      let p = el.parentElement;
      for (let i = 0; p && i < 5; i++, p = p.parentElement) {
        const r = rectOf(p);
        if (r.width > innerWidth * 0.75 || r.height > innerHeight * 0.3) break;
        if ((p.innerText || '').trim().length > 2 && r.width > box.width * 1.5) { box = union(box, r); break; }
      }
    }
    // lista desplegable abierta por este control
    const role = (ctl || el0).getAttribute && (ctl || el0).getAttribute('role');
    const expanded = ctl && ctl.getAttribute('aria-expanded') === 'true';
    if (ctl && (role === 'combobox' || expanded)) {
      const id = ctl.getAttribute('aria-controls') || ctl.getAttribute('aria-owns');
      let lists = id ? [document.getElementById(id)].filter(Boolean) : [];
      if (!lists.length) lists = Array.from(document.querySelectorAll('[role=listbox],[role=menu]'));
      for (const l of lists) {
        const v = visualOf(l); if (!v) continue;
        const r = rectOf(v);
        if (inView(r) && Math.abs(r.x - box.x) < 300 && r.y - (box.y + box.height) < 60 && r.y > box.y - 400) box = union(box, { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 260) });
      }
    }
    const pad = 14;
    return { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 };
  };

  /**
   * Qué mostrar DESPUÉS de la acción: un modal que acaba de abrirse, el mismo elemento si sigue
   * en pantalla, o el control que quedó con el foco (p. ej. el campo tras elegir una opción).
   * null = alejar la cámara (navegación, el elemento desapareció).
   */
  window.__tutoAfterFocus = (el, dialogsBefore, urlBefore, hint) => {
    if (location.href !== urlBefore) return null;
    const ds = visibleDialogs();
    if (ds.length > dialogsBefore) {
      const d = ds[ds.length - 1];
      let v = visualOf(d) || d; let r = rectOf(v);
      // muchos modales son una capa a pantalla completa: busca la tarjeta visible dentro
      if (r.width > innerWidth * 0.8 && r.height > innerHeight * 0.8) {
        let best = null, bestA = 0;
        const walk = (n, depth) => {
          for (const c of n.children) {
            const cr = rectOf(c);
            const a = cr.width * cr.height;
            if (visible(c) && cr.width < innerWidth * 0.8 && a > bestA && a > 20000) { best = c; bestA = a; }
            else if (depth < 4) walk(c, depth + 1);
          }
        };
        walk(v, 0);
        if (best) { v = best; r = rectOf(best); }
      }
      return { x: r.x - 10, y: r.y - 10, width: r.width + 20, height: r.height + 20, dialog: true };
    }
    const optionLike = el && el.closest && el.closest('[role=option],[role=menuitem],[role=listbox],[role=menu]');
    if (el && el.isConnected && !optionLike) {
      const v = visualOf(el);
      if (v && inView(rectOf(v))) return window.__tutoFocusBox(el);
    }
    // tras elegir una opción: el campo que tenía el foco antes (el buscador/combobox)
    if (optionLike && hint && hint.isConnected) {
      const v = visualOf(hint);
      if (v && inView(rectOf(v))) return window.__tutoFocusBox(hint);
    }
    const a = document.activeElement;
    if (a && a !== document.body && a !== document.documentElement) {
      const v = visualOf(a);
      if (v && inView(rectOf(v))) return window.__tutoFocusBox(a);
    }
    return null;
  };

  window.__tutoFingerprint = (el) => {
    if (!el) return null;
    let c = el.matches && el.matches(CONTROL_Q) ? el : null;
    if (!c && el.tagName === 'LABEL' && el.control) c = el.control;
    if (!c && el.querySelector) c = el.querySelector(CONTROL_Q);
    return c ? describe(c).fingerprint : null;
  };

  window.__tutoScan = () => {
    const out = [];
    const seenRadio = new Set();
    for (const el of document.querySelectorAll(CONTROL_Q)) {
      if (el.closest('header,nav,[role=navigation],[role=banner],[role=search],[role=listbox],[role=menu]')) continue;
      const vis = visualOf(el);
      if (!vis) continue;
      const r = vis.getBoundingClientRect();
      const d = describe(el);
      if (d.kind === 'radio' && el.name) { if (seenRadio.has(el.name)) continue; seenRadio.add(el.name); }
      out.push({ ...d, box: { x: Math.round(r.x), y: Math.round(r.y + scrollY), width: Math.round(r.width), height: Math.round(r.height) } });
    }
    return out;
  };
})();`;
