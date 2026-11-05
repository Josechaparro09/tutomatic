import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import type { Project } from '../lib/project.ts';
import type { StoryboardT } from '../lib/schema.ts';
import type { Timeline } from '../../engines/shared/types.ts';
import { ffmpeg } from '../lib/ffmpeg.ts';
import { getImage } from '../providers/index.ts';
import { log, readJson } from '../lib/util.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const dataUri = (file: string) => {
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
};

/** Miniatura 1280×720 con la identidad visual: título grande + captura de la app en perspectiva. */
export async function makeThumbnail(p: Project, sb: StoryboardT, { ai = false, text }: { ai?: boolean; text?: string } = {}) {
  const tl: Timeline = readJson(p.paths.timeline);
  const b = tl.brand;
  // fotograma representativo: mitad del paso más largo
  const longest = [...tl.steps].sort((a, z) => (z.end - z.start) - (a.end - a.start))[0];
  const at = longest ? (longest.start + longest.end) / 2 - tl.recording.start : tl.recording.duration / 2;
  const frame = path.join(p.build, 'thumb-frame.jpg');
  await ffmpeg(['-ss', Math.max(0, at).toFixed(2), '-i', p.paths.recording, '-frames:v', '1', '-q:v', '2', frame]);

  let bg = '';
  if (ai) {
    const cfg = p.cfg.providers.image;
    try {
      const out = path.join(p.build, 'thumb-bg.png');
      await getImage(cfg.provider).generate({
        model: cfg.model, aspect: '16:9', outFile: out,
        prompt: `Abstract premium background for a software tutorial thumbnail. Brand colors ${b.primary} and ${b.secondary} on deep ${b.background}. Soft gradients, subtle geometric light, lots of empty space on the left for a title. No text, no letters, no logos, no people.`,
      });
      bg = `background-image:url(${dataUri(out)});background-size:cover;`;
    } catch (e: any) { log.warn(`Fondo IA no disponible (${e.message.split('\n')[0]}); uso degradado de marca`); }
  }
  const logo = b.logo && fs.existsSync(path.join(p.dir, b.logo)) ? `<img class="logo" src="${dataUri(path.join(p.dir, b.logo))}">` : '';
  const title = text ?? sb.title;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;box-sizing:border-box}
    body{width:1280px;height:720px;overflow:hidden;font-family:'${b.fontFamily}',Inter,'Segoe UI',system-ui,sans-serif;color:${b.text};
      background:radial-gradient(1200px 700px at 85% 20%, ${b.primary}55, transparent 60%),radial-gradient(900px 600px at 0% 100%, ${b.secondary}33, transparent 60%),${b.background};${bg}}
    .wrap{position:absolute;inset:0;display:flex;align-items:center;padding:0 0 0 72px}
    .txt{width:560px;z-index:2}
    .tag{display:inline-block;background:${b.primary};color:#fff;font-weight:800;font-size:22px;letter-spacing:.08em;text-transform:uppercase;padding:8px 16px;border-radius:10px;margin-bottom:22px}
    h1{font-size:${title.length > 40 ? 58 : 70}px;line-height:1.02;font-weight:900;letter-spacing:-.03em;text-shadow:0 4px 24px rgba(0,0,0,.35)}
    .logo{height:56px;margin-top:30px;object-fit:contain}
    .shot{position:absolute;right:-120px;top:110px;width:820px;border-radius:16px;overflow:hidden;
      box-shadow:0 40px 80px rgba(0,0,0,.55),0 0 0 2px ${b.primary}88;transform:perspective(1600px) rotateY(-14deg) rotateX(4deg)}
    .bar{height:30px;background:${b.surface};display:flex;gap:8px;align-items:center;padding-left:14px}
    .bar i{width:11px;height:11px;border-radius:50%;background:#ff5f57}.bar i:nth-child(2){background:#febc2e}.bar i:nth-child(3){background:#28c840}
    .shot img{display:block;width:100%}
  </style></head><body>
    <div class="shot"><div class="bar"><i></i><i></i><i></i></div><img src="${dataUri(frame)}"></div>
    <div class="wrap"><div class="txt"><div class="tag">Tutorial</div><h1>${esc(title)}</h1>${logo}</div></div>
  </body></html>`;
  const browser = await chromium.launch({ executablePath: p.cfg.recorder.executablePath || process.env.TUTO_CHROME || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent(html, { waitUntil: 'load' });
    fs.mkdirSync(p.output, { recursive: true });
    await page.screenshot({ path: p.paths.thumbnail });
  } finally { await browser.close(); }
  fs.rmSync(frame, { force: true });
  log.ok(`Miniatura: ${p.paths.thumbnail}`);
  return p.paths.thumbnail;
}
