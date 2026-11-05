import fs from 'node:fs';
import path from 'node:path';
import { appUrl, type Project } from '../lib/project.ts';
import { Brand, type BrandT, type StoryboardT } from '../lib/schema.ts';
import { ensureLogin, launch, newAppContext } from './browser.ts';
import { ensureDir, log, writeJson } from '../lib/util.ts';

function hexToRgb(h: string) {
  const m = h.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const lum = (h: string) => {
  const [r, g, b] = hexToRgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
function mix(h: string, toward: string, t: number) {
  const a = hexToRgb(h), b = hexToRgb(toward);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/**
 * Extrae la identidad visual de la app: color primario (botones/enlaces), tipografía, logo.
 * Genera brand.json (editable a mano) y brand/logo.png junto a él.
 */
export async function extractBrand(p: Project, sb: StoryboardT, { force = false } = {}): Promise<BrandT> {
  if (fs.existsSync(p.paths.brand) && !force) {
    log.ok('brand.json ya existe (usa --force para regenerarlo)');
    return Brand.parse(JSON.parse(fs.readFileSync(p.paths.brand, 'utf8')));
  }
  const browser = await launch(p);
  try {
    const storageState = await ensureLogin(p, sb, browser);
    const ctx = await newAppContext(p, sb, browser, storageState);
    const page = await ctx.newPage();
    await page.goto(appUrl(sb, sb.app.start), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    const data = await page.evaluate(() => {
      const toHex = (c: string) => {
        const m = c.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const [r, g, b, a] = m[1].split(',').map((s) => parseFloat(s));
        if (a !== undefined && a < 0.5) return null;
        return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
      };
      const sat = (hex: string) => {
        const n = parseInt(hex.slice(1), 16); const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        return mx === 0 ? 0 : (mx - mn) / mx;
      };
      const score: Record<string, number> = {};
      const lumi = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255; };
      const add = (hex: string | null, w: number) => {
        if (!hex || sat(hex) <= 0.25) return;
        const l = lumi(hex);
        // los primarios de marca suelen ser de luminancia media: penaliza casi-negros y pasteles
        const k = l > 0.12 && l < 0.75 ? 1 : 0.35;
        score[hex] = (score[hex] || 0) + w * k;
      };
      document.querySelectorAll<SVGElement>('svg [fill]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width >= 12 && r.top < 200) add(toHex(getComputedStyle(el).fill), 2);
      });
      document.querySelectorAll<HTMLElement>('button, a, [role=button], .btn, input[type=submit], nav, header, aside, [class*=sidebar], [class*=navbar], [class*=badge], [class*=chip]').forEach((el) => {
        const st = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.width < 4) return;
        add(toHex(st.backgroundColor), el.tagName === 'BUTTON' ? 3 : 1);
        add(toHex(st.color), el.tagName === 'A' ? 1 : 0.5);
        add(toHex(st.borderColor), 0.3);
      });
      // variables CSS típicas
      const rootSt = getComputedStyle(document.documentElement);
      for (const v of ['--primary', '--color-primary', '--brand', '--accent', '--mantine-primary-color-filled', '--bs-primary', '--chakra-colors-blue-500']) {
        const val = rootSt.getPropertyValue(v).trim();
        if (/^#[0-9a-f]{6}$/i.test(val)) score[val.toLowerCase()] = (score[val.toLowerCase()] || 0) + 10;
      }
      const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]).map(([h]) => h);
      const bodySt = getComputedStyle(document.body);
      const h1 = document.querySelector('h1,h2');
      const font = (h1 ? getComputedStyle(h1).fontFamily : bodySt.fontFamily).split(',')[0].replace(/["']/g, '').trim();
      // logo
      const cands = Array.from(document.querySelectorAll<HTMLElement>('img, svg')).filter((el) => {
        const s = ((el.getAttribute('alt') || '') + ' ' + (el.getAttribute('class') || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('src') || '') + ' ' + (el.parentElement?.className || '')).toLowerCase();
        const r = el.getBoundingClientRect();
        return /logo|brand/.test(s) && r.width >= 16 && r.height >= 12 && r.top < 300;
      });
      const logoEl = cands[0];
      if (logoEl) logoEl.setAttribute('data-tuto-logo', '1');
      const icon = (document.querySelector('link[rel~="icon"][sizes="192x192"], link[rel="apple-touch-icon"], link[rel~="icon"]') as HTMLLinkElement | null)?.href || null;
      return {
        ranked,
        bodyBg: toHex(bodySt.backgroundColor) || '#ffffff',
        text: toHex(bodySt.color) || '#111111',
        font,
        hasLogo: !!logoEl,
        icon,
        title: document.title,
        siteName: (document.querySelector('meta[property="og:site_name"]') as HTMLMetaElement | null)?.content || '',
      };
    });

    const dir = ensureDir(p.paths.brandDir);
    let logo: string | null = null;
    if (data.hasLogo) {
      const file = path.join(dir, 'logo.png');
      await page.locator('[data-tuto-logo]').first().screenshot({ path: file, omitBackground: true }).catch(() => {});
      if (fs.existsSync(file)) logo = 'brand/logo.png';
    }
    if (!logo && data.icon) {
      try {
        const r = await page.request.get(data.icon);
        if (r.ok() && /png|svg|ico|jpeg|webp/.test(r.headers()['content-type'] ?? '')) {
          const ext = /svg/.test(r.headers()['content-type']) ? 'svg' : 'png';
          if (ext === 'png' && /ico/.test(r.headers()['content-type'])) throw new Error('ico');
          fs.writeFileSync(path.join(dir, `logo.${ext}`), await r.body());
          logo = `brand/logo.${ext}`;
        }
      } catch { /* sin logo */ }
    }
    await page.screenshot({ path: path.join(dir, 'app.png') });
    await ctx.close();

    const primary = data.ranked[0] ?? '#4F46E5';
    const secondary = data.ranked.find((h) => h !== primary && lum(h) > 0.12 && Math.abs(lum(h) - lum(primary)) > 0.05) ?? mix(primary, '#ffffff', 0.4);
    const appIsDark = lum(data.bodyBg) < 0.2;
    // La envoltura del video usa un fondo oscuro teñido del primario (luce bien con apps claras y oscuras)
    const background = mix(primary, '#05060a', 0.86);
    const brand = Brand.parse({
      name: data.siteName || data.title.split(/[|\-–·]/)[0].trim() || sb.title,
      primary, secondary,
      background,
      surface: mix(primary, '#0d1020', 0.78),
      text: '#F5F7FF',
      mutedText: '#B4BBD3',
      fontFamily: data.font || 'Inter',
      logo,
      theme: 'dark',
    });
    writeJson(p.paths.brand, brand);
    log.ok(`brand.json: primario ${primary}, secundario ${secondary}, fuente "${brand.fontFamily}"${logo ? ', logo extraído' : ', sin logo'}${appIsDark ? ' (app oscura)' : ''}`);
    return brand;
  } finally {
    await browser.close();
  }
}
