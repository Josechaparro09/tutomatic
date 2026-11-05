import fs from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import { appUrl, type Project } from '../lib/project.ts';
import type { ActionStepT, StoryboardT } from '../lib/schema.ts';
import { interpolateEnv } from '../lib/config.ts';
import { log, sleep } from '../lib/util.ts';
import { SCAN_SCRIPT } from './scan.ts';

export async function launch(p: Project, { headed = false } = {}): Promise<Browser> {
  const r = p.cfg.recorder;
  return chromium.launch({
    headless: headed ? false : r.headless,
    executablePath: r.executablePath || process.env.TUTO_CHROME || undefined,
    args: ['--hide-scrollbars', '--force-device-scale-factor=1', '--disable-features=Translate'],
  });
}

/** Traduce los atajos "role:button|Guardar", "label:Correo", etc. a un Locator. */
export function resolveLocator(page: Page, selector: string): Locator {
  const m = selector.match(/^(role|label|text|placeholder|testid|alt|title|near):(.*)$/s);
  if (!m) return page.locator(selector).first();
  const [, kind, rest] = m;
  switch (kind) {
    case 'role': {
      const [role, name] = rest.split('|');
      return page.getByRole(role.trim() as any, name ? { name: name.trim() } : {}).first();
    }
    case 'label': return page.getByLabel(rest.trim()).first();
    case 'text': return page.getByText(rest.trim()).first();
    case 'placeholder': return page.getByPlaceholder(rest.trim()).first();
    case 'testid': return page.getByTestId(rest.trim()).first();
    case 'alt': return page.getByAltText(rest.trim()).first();
    case 'title': return page.getByTitle(rest.trim()).first();
    case 'near': {
      // "near:Pago Contra Entrega|switch" → el control con ese rol dentro del contenedor más cercano que tenga ese texto.
      // Para switches/checkbox sin nombre accesible (label hermano, no asociado).
      const [text, role = 'switch'] = rest.split('|').map((x) => x.trim());
      const byRole = page.getByRole(role as any);
      return page.locator('div,section,fieldset,li,label,tr,form,article')
        .filter({ hasText: text }).filter({ has: byRole }).last()
        .getByRole(role as any).first();
    }
  }
  return page.locator(selector).first();
}

export async function waitForSpec(page: Page, spec: string | undefined, timeout = 15000) {
  if (!spec) return;
  if (spec === 'load' || spec === 'networkidle' || spec === 'domcontentloaded') {
    await page.waitForLoadState(spec as any, { timeout }).catch(() => {});
  } else if (spec.startsWith('url:')) {
    await page.waitForURL(spec.slice(4), { timeout });
  } else {
    await resolveLocator(page, spec).waitFor({ state: 'visible', timeout });
  }
}

/**
 * Elemento visible que representa al locator. Los switches/checkbox con estilo propio suelen
 * tener un <input> oculto: en ese caso se usa su <label> o el contenedor visible más cercano.
 */
export async function visibleTarget(loc: Locator, timeout = 15000): Promise<Locator> {
  await loc.waitFor({ state: 'attached', timeout });
  if (await loc.isVisible().catch(() => false)) return loc;
  const id = await loc.getAttribute('id').catch(() => null);
  if (id) {
    const lbl = loc.page().locator(`label[for="${id.replace(/"/g, '\\"')}"]`).first();
    if (await lbl.isVisible().catch(() => false)) return lbl;
  }
  for (let up = 1; up <= 3; up++) {
    const anc = loc.locator(`xpath=ancestor::*[${up}]`);
    if (await anc.isVisible().catch(() => false)) return anc;
  }
  await loc.waitFor({ state: 'visible', timeout: Math.min(timeout, 5000) });
  return loc;
}

/** ¿Está encendido? Funciona con checkbox nativos, role=switch/checkbox (aria-checked) y data-state. */
export async function isOn(loc: Locator): Promise<boolean> {
  const v = await loc.isChecked().catch(() => null);
  if (v !== null) return v;
  return loc.evaluate((el: any) => {
    const ac = el.getAttribute('aria-checked');
    if (ac != null) return ac === 'true';
    const ds = el.getAttribute('data-state');
    return ds === 'checked' || ds === 'on' || el.hasAttribute('data-checked') || !!el.checked;
  }).catch(() => false);
}

export interface Theatrics {
  /** Mueve el cursor visible hasta (x,y). */
  moveTo(x: number, y: number): Promise<void>;
  typingDelayMs: number;
}

/**
 * Ejecuta una acción. Con `theatrics` (grabación) mueve el cursor suavemente y teclea visible;
 * sin ella (login, ensayo) actúa rápido.
 */
export async function runAction(page: Page, sb: StoryboardT, a: ActionStepT, th?: Theatrics) {
  const value = interpolateEnv(a.value);
  const timeout = 15000;
  const loc = a.selector ? resolveLocator(page, a.selector) : null;

  let target: Locator | null = null;
  const approach = async () => {
    if (!loc) return null;
    target = await visibleTarget(loc, timeout);
    await target.scrollIntoViewIfNeeded({ timeout }).catch(() => {});
    const box = await target.boundingBox();
    if (box && th) await th.moveTo(box.x + box.width / 2, box.y + box.height / 2);
    return box;
  };

  switch (a.action) {
    case 'none': break;
    case 'wait':
      if (a.ms) await sleep(a.ms);
      break;
    case 'goto':
      await page.goto(appUrl(sb, a.url ?? '/'), { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      break;
    case 'check': case 'uncheck': {
      // Switches y casillas: solo se hace clic si hace falta, y se verifica el estado final
      if (!loc) throw new Error(`La acción ${a.action} necesita "selector"`);
      const want = a.action === 'check';
      const box = await approach();
      if ((await isOn(loc)) !== want) {
        if (th && box) { await page.mouse.down(); await sleep(70); await page.mouse.up(); }
        else await target!.click({ timeout });
        await sleep(150);
        if ((await isOn(loc)) !== want) await target!.click({ timeout, force: true });
        await sleep(100);
        if ((await isOn(loc)) !== want) throw new Error(`No pude ${want ? 'activar' : 'desactivar'} ${a.selector}`);
      } else if (th) {
        await sleep(400); // ya estaba en el estado pedido: el cursor se queda señalándolo
      }
      break;
    }
    case 'click': case 'dblclick': case 'hover': {
      if (!loc) throw new Error(`La acción ${a.action} necesita "selector"`);
      const box = await approach();
      if (th && box) {
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        if (a.action === 'hover') break;
        if (a.action === 'dblclick') await page.mouse.dblclick(x, y);
        else { await page.mouse.down(); await sleep(70); await page.mouse.up(); }
      } else {
        const t = target ?? loc;
        if (a.action === 'click') await t.click({ timeout });
        else if (a.action === 'dblclick') await t.dblclick({ timeout });
        else await t.hover({ timeout });
      }
      break;
    }
    case 'fill': case 'type': {
      if (!loc) throw new Error(`La acción ${a.action} necesita "selector"`);
      await approach();
      if (th) { await page.mouse.down(); await sleep(60); await page.mouse.up(); }
      await loc.fill('');
      if (th && a.action === 'type') await loc.pressSequentially(value ?? '', { delay: th.typingDelayMs });
      else if (th) await loc.pressSequentially(value ?? '', { delay: Math.max(15, th.typingDelayMs / 2) });
      else await loc.fill(value ?? '');
      break;
    }
    case 'select': {
      if (!loc) throw new Error('La acción select necesita "selector"');
      await approach();
      await loc.selectOption({ label: value ?? '' }).catch(() => loc.selectOption(value ?? ''));
      break;
    }
    case 'press':
      if (loc) { await approach(); await loc.focus(); }
      await page.keyboard.press(a.key ?? 'Enter');
      break;
    case 'scroll':
      if (loc) await approach();
      else if (th) {
        // scroll suave en 20 pasos
        const dy = a.y ?? 600;
        for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, dy / 20); await sleep(25); }
      } else await page.mouse.wheel(0, a.y ?? 600);
      break;
  }
  await waitForSpec(page, a.waitFor);
}

/**
 * Hace login en un contexto aparte (fuera de cámara) y guarda la sesión en build/.auth.json.
 * Las credenciales vienen de .env vía ${VARIABLES} y nunca aparecen en el video.
 */
/** Comprueba que la sesión guardada sigue sirviendo (p. ej. tras reiniciar el servidor de la app). */
async function sessionStillValid(p: Project, sb: StoryboardT, browser: Browser): Promise<boolean> {
  const ctx = await browser.newContext({ viewport: sb.app.viewport, storageState: p.paths.auth });
  try {
    const page = await ctx.newPage();
    await page.goto(appUrl(sb, sb.app.start), { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    const loginPath = new URL(appUrl(sb, sb.login!.url)).pathname;
    const firstLoginSel = sb.login!.steps.find((s) => s.selector)?.selector;
    if (new URL(page.url()).pathname === loginPath) return false;
    if (firstLoginSel && (await resolveLocator(page, firstLoginSel).isVisible().catch(() => false))) return false;
    return true;
  } catch { return false; } finally { await ctx.close(); }
}

export async function ensureLogin(p: Project, sb: StoryboardT, browser: Browser, { force = false } = {}): Promise<string | undefined> {
  if (!sb.login || sb.login.steps.length === 0) return undefined;
  if (!force && fs.existsSync(p.paths.auth)) {
    const age = Date.now() - fs.statSync(p.paths.auth).mtimeMs;
    if (age < 30 * 60 * 1000 && (await sessionStillValid(p, sb, browser))) return p.paths.auth;
  }
  log.step('Iniciando sesión (fuera de cámara)…');
  const ctx = await browser.newContext({ viewport: sb.app.viewport });
  const page = await ctx.newPage();
  await page.goto(appUrl(sb, sb.login.url), { waitUntil: 'domcontentloaded' });
  for (const a of sb.login.steps) await runAction(page, sb, a);
  await waitForSpec(page, sb.login.waitFor ?? 'networkidle', 20000);
  await ctx.storageState({ path: p.paths.auth });
  await ctx.close();
  log.ok('Sesión iniciada');
  return p.paths.auth;
}

export async function newAppContext(p: Project, sb: StoryboardT, browser: Browser, storageState?: string, extra: Parameters<Browser['newContext']>[0] = {}): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: sb.app.viewport, deviceScaleFactor: 1, storageState, ...extra });
  // tsx/esbuild envuelve funciones con __name(); lo definimos en la página para page.evaluate
  await ctx.addInitScript('window.__name = window.__name || ((f) => f);');
  await ctx.addInitScript(SCAN_SCRIPT);
  return ctx;
}
