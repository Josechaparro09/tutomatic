import fs from 'node:fs';
import path from 'node:path';
import { appUrl, type Project } from '../lib/project.ts';
import type { StoryboardT } from '../lib/schema.ts';
import { ensureLogin, launch, newAppContext, runAction } from './browser.ts';
import { c, ensureDir, log, slug, writeJson } from '../lib/util.ts';

export interface InspectedEl {
  n: number;
  tag: string;
  role: string;
  name: string;
  selector: string;
  alternatives: string[];
  box: { x: number; y: number; width: number; height: number };
  /** Opciones visibles de un <select> (el valor de `select` debe ser una de estas etiquetas) */
  options?: string[];
  /** Para controles de formulario: estado actual (encendido/apagado, valor) y si es obligatorio */
  state?: string;
  required?: boolean;
  section?: string;
}

/**
 * Abre una pantalla de la app y lista los elementos interactivos con selectores sugeridos.
 * Pensado para que el agente escriba el storyboard sin adivinar selectores.
 */
export async function inspect(p: Project, sb: StoryboardT, opts: { path?: string; afterStep?: string; login?: boolean; headed?: boolean }) {
  const browser = await launch(p, { headed: opts.headed });
  try {
    const storageState = opts.login === false ? undefined : await ensureLogin(p, sb, browser);
    const ctx = await newAppContext(p, sb, browser, storageState);
    const page = await ctx.newPage();
    const target = opts.path ?? sb.app.start;
    await page.goto(appUrl(sb, target), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    if (opts.afterStep) {
      // reproduce el storyboard hasta ese paso (incluido) para inspeccionar el estado resultante
      for (const s of sb.steps) {
        await runAction(page, sb, s);
        if (s.id === opts.afterStep) break;
      }
      await page.waitForTimeout(500);
    }

    const els: InspectedEl[] = await page.evaluate(() => {
      const q = 'a[href],button,input,select,textarea,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[role=option],[onclick],[contenteditable=true],summary';
      const W = window as any;
      const nodes = Array.from(document.querySelectorAll<HTMLElement>(q + ',' + W.__tutoControlQ));
      const out: any[] = [];
      const cssEsc = (s: string) => (window as any).CSS?.escape ? CSS.escape(s) : s.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
      const implicitRole = (el: HTMLElement) => {
        const t = el.tagName.toLowerCase();
        const type = (el as HTMLInputElement).type;
        if (el.getAttribute('role')) return el.getAttribute('role')!;
        if (t === 'a') return 'link';
        if (t === 'button' || (t === 'input' && ['submit', 'button', 'reset'].includes(type))) return 'button';
        if (t === 'input' && type === 'checkbox') return 'checkbox';
        if (t === 'input' && type === 'radio') return 'radio';
        if (t === 'select') return 'combobox';
        if (t === 'textarea' || t === 'input') return 'textbox';
        return '';
      };
      const labelOf = (el: HTMLElement) => {
        const id = el.id;
        if (id) { const l = document.querySelector(`label[for="${cssEsc(id)}"]`); if (l) return (l.textContent || '').trim(); }
        const wrap = el.closest('label'); if (wrap) return (wrap.textContent || '').trim();
        return el.getAttribute('aria-label') || '';
      };
      for (const el of nodes) {
        if (el.matches(String(W.__tutoControlQ))) {
          // control de formulario: nombre/selector/estado del escáner compartido (incluye switches con input oculto)
          const vis = W.__tutoVisualOf(el);
          if (!vis) continue;
          const vr = vis.getBoundingClientRect();
          if (vr.bottom < 0 || vr.top > innerHeight * 3) continue;
          const d = W.__tutoDescribe(el);
          const tag = el.tagName.toLowerCase();
          const options = tag === 'select' ? Array.from((el as HTMLSelectElement).options).map((o) => o.label.trim()).filter(Boolean) : undefined;
          out.push({ tag, role: d.kind, name: d.name + (d.nameSource === 'texto cercano' ? ' ≈' : ''), options, selector: d.selector, alternatives: d.alternatives,
            state: d.state, required: d.required, section: d.section,
            box: { x: Math.round(vr.x), y: Math.round(vr.y), width: Math.round(vr.width), height: Math.round(vr.height) } });
          continue;
        }
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        if (r.width < 4 || r.height < 4 || st.visibility === 'hidden' || st.display === 'none' || +st.opacity === 0) continue;
        if (r.bottom < 0 || r.top > innerHeight * 3) continue;
        const tag = el.tagName.toLowerCase();
        const role = implicitRole(el);
        const text = (el.innerText || (el as HTMLInputElement).value || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        const label = labelOf(el).replace(/\s+/g, ' ').slice(0, 60);
        const name = el.getAttribute('aria-label') || label || text || el.getAttribute('title') || (el as HTMLInputElement).placeholder || '';
        const alts: string[] = [];
        const testid = el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-cy');
        if (testid) alts.push(`testid:${testid}`);
        if (role && name && ['button', 'link', 'tab', 'menuitem', 'checkbox', 'radio', 'switch', 'combobox'].includes(role)) alts.push(`role:${role}|${name}`);
        if (label && ['input', 'textarea', 'select'].includes(tag)) alts.push(`label:${label}`);
        const ph = (el as HTMLInputElement).placeholder; if (ph) alts.push(`placeholder:${ph}`);
        if (el.id && !W.__tutoUnstableId(el.id)) alts.push(`#${cssEsc(el.id)}`);
        const nm = el.getAttribute('name'); if (nm) alts.push(`${tag}[name="${nm}"]`);
        if (text && !alts.length) alts.push(`text:${text}`);
        if (!alts.length) alts.push(tag + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).map(cssEsc).join('.') : ''));
        const options = tag === 'select' ? Array.from((el as HTMLSelectElement).options).map((o) => o.label.trim()).filter(Boolean) : undefined;
        out.push({ tag, role, name, options, selector: alts[0], alternatives: alts.slice(1), box: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } });
      }
      return out.map((e, i) => ({ n: i + 1, ...e }));
    });

    const dir = ensureDir(p.paths.inspectDir);
    const base = opts.afterStep ? slug(`after-${opts.afterStep}`) : (target.replace(/[/?#]/g, '') ? slug(target) : 'inicio');
    const shot = path.join(dir, `${base}.png`);
    // Dibuja números sobre los elementos para que el agente pueda mirar la captura
    await page.evaluate((list: InspectedEl[]) => {
      for (const e of list) {
        const d = document.createElement('div');
        d.textContent = String(e.n);
        Object.assign(d.style, { position: 'fixed', left: `${e.box.x}px`, top: `${e.box.y}px`, background: '#e11d48', color: '#fff', font: 'bold 12px sans-serif', padding: '1px 4px', borderRadius: '4px', zIndex: '2147483647', pointerEvents: 'none' });
        d.className = '__tuto_tag';
        document.documentElement.appendChild(d);
        const o = document.createElement('div');
        Object.assign(o.style, { position: 'fixed', left: `${e.box.x}px`, top: `${e.box.y}px`, width: `${e.box.width}px`, height: `${e.box.height}px`, outline: '2px solid #e11d4899', zIndex: '2147483646', pointerEvents: 'none' });
        document.documentElement.appendChild(o);
      }
    }, els);
    await page.screenshot({ path: shot });
    const info = { url: page.url(), title: await page.title(), screenshot: shot, elements: els };
    const headings = await page.evaluate(() => Array.from(document.querySelectorAll('h1,h2,h3')).map((h) => (h.textContent || '').trim()).filter(Boolean).slice(0, 8));
    // Textos visibles no interactivos (celdas, tarjetas, avisos): útiles como objetivo de hover/none
    const texts: string[] = await page.evaluate(() => {
      const seen = new Set<string>();
      const out: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const el = n as HTMLElement;
        if (el.closest('a,button,select,input,textarea,label,[role=button],script,style,.__tuto_tag')) continue;
        const own = Array.from(el.childNodes).filter((c) => c.nodeType === 3).map((c) => c.textContent || '').join(' ').replace(/\s+/g, ' ').trim();
        if (own.length < 2 || own.length > 80 || seen.has(own)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || r.top > innerHeight) continue;
        seen.add(own);
        out.push(own);
        if (out.length >= 60) break;
      }
      return out;
    });
    writeJson(path.join(dir, `${base}.json`), { ...info, texts });

    console.log(`\nURL: ${info.url}\nTítulo: ${info.title}${headings.length ? `\nEncabezados: ${headings.join(' · ')}` : ''}\n`);
    console.log('  #  rol          nombre                                   selector sugerido');
    for (const e of els.slice(0, 80)) {
      const st = e.state !== undefined && ['switch', 'checkbox', 'radio'].includes(e.role) ? ` [${e.state}]` : '';
      const req = e.required ? '*' : ' ';
      console.log(`${String(e.n).padStart(3)}${req} ${(e.role || e.tag).padEnd(12).slice(0, 12)} ${(e.name + st).padEnd(40).slice(0, 40)} ${e.selector}`);
      if (e.options?.length) console.log(`       opciones: ${e.options.map((o) => JSON.stringify(o)).join(', ')}`);
    }
    if (texts.length) {
      console.log('\nTextos visibles (para hover/none usa "text:<texto>"):');
      console.log('  ' + texts.map((t) => JSON.stringify(t)).join(' · '));
    }
    if (els.length > 80) console.log(`  … ${els.length - 80} más en el JSON`);
    console.log(c.dim('  * = obligatorio · ≈ = nombre tomado del texto cercano (el control no tiene etiqueta accesible) · [estado] de switches/casillas'));
    const toggles = els.filter((e) => ['switch', 'checkbox', 'radio'].includes(e.role));
    if (toggles.length) log.warn(`Hay ${toggles.length} switch/casilla(s) en pantalla: decide con el usuario si el tutorial los activa, los explica o los omite.`);
    log.ok(`Captura numerada: ${shot}`);
    log.info(`Detalle (alternativas y coordenadas): ${path.join(dir, `${base}.json`)}`);
    await ctx.close();
    return info;
  } finally {
    await browser.close();
  }
}

export function inspectExists(p: Project) { return fs.existsSync(p.paths.inspectDir); }
