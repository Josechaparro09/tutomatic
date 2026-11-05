// App de ejemplo "Facturín" para probar tutomatic sin tu app real.
// node examples/demo-app/server.js  →  http://localhost:4321  (usuario: demo@facturin.co / demo123)
import http from 'node:http';

const PORT = +(process.env.PORT || 4321);
const USER = { email: 'demo@facturin.co', password: 'demo123', name: 'Laura Gómez' };
const sessions = new Set();
const invoices = [
  { n: 1041, client: 'Café Andino SAS', concept: 'Diseño de empaques', amount: 1850000, status: 'Pagada' },
  { n: 1042, client: 'Ferretería El Tornillo', concept: 'Mantenimiento web', amount: 620000, status: 'Pendiente' },
  { n: 1043, client: 'Clínica Dental Sonrisas', concept: 'Campaña redes sociales', amount: 2400000, status: 'Vencida' },
];
const clients = ['Café Andino SAS', 'Ferretería El Tornillo', 'Clínica Dental Sonrisas', 'Panadería La Espiga'];
const money = (v) => '$ ' + Number(v).toLocaleString('es-CO');

const css = `
*{box-sizing:border-box;margin:0}body{font-family:Inter,'Segoe UI',system-ui,sans-serif;background:#f5f7fb;color:#1c2333}
a{color:inherit;text-decoration:none}
.login{min-height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#0f766e,#14b8a6)}
.card{background:#fff;border-radius:18px;padding:44px;width:420px;box-shadow:0 30px 80px rgba(0,0,0,.18)}
.brand{display:flex;align-items:center;gap:12px;font-weight:800;font-size:24px;color:#0f766e}
.brand .logo{width:38px;height:38px}
label{display:block;font-size:14px;font-weight:600;margin:18px 0 6px;color:#3b4660}
input,select{width:100%;padding:12px 14px;border:1.5px solid #d8deea;border-radius:10px;font-size:16px;font-family:inherit;background:#fff}
input:focus,select:focus{outline:none;border-color:#14b8a6;box-shadow:0 0 0 4px #14b8a622}
.btn{display:inline-flex;align-items:center;gap:8px;background:#0f766e;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit}
.btn.full{width:100%;justify-content:center;margin-top:26px}
.btn.ghost{background:#eef2f7;color:#1c2333}
.app{display:grid;grid-template-columns:260px 1fr;min-height:100vh}
aside{background:#0b3b37;color:#cfe9e6;padding:26px 18px}
aside .brand{color:#fff;margin:0 8px 34px}
aside nav a{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:10px;font-weight:600;margin-bottom:4px}
aside nav a.on,aside nav a:hover{background:#14b8a633;color:#fff}
main{padding:34px 44px}
.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:28px}
h1{font-size:30px;letter-spacing:-.02em}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-bottom:28px}
.kpi{background:#fff;border-radius:14px;padding:22px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.kpi b{display:block;font-size:28px;margin-top:6px}
table{width:100%;background:#fff;border-radius:14px;border-collapse:collapse;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)}
th,td{text-align:left;padding:16px 20px;border-bottom:1px solid #eef1f6}th{font-size:13px;color:#6b7690;text-transform:uppercase;letter-spacing:.05em}
.tag{padding:4px 10px;border-radius:999px;font-size:13px;font-weight:700}
.Pagada{background:#dcfce7;color:#166534}.Contra{background:#e0f2fe;color:#075985}.Pendiente{background:#fef9c3;color:#854d0e}.Vencida{background:#fee2e2;color:#991b1b}
.form{background:#fff;border-radius:14px;padding:30px;max-width:720px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.row{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.toast{background:#dcfce7;color:#166534;padding:14px 18px;border-radius:10px;margin-bottom:20px;font-weight:600}
.opt{display:flex;justify-content:space-between;align-items:center;border:1.5px solid #e3e8f0;border-radius:12px;padding:14px 16px;margin-top:22px}
.opt b{display:block}.opt small{color:#6b7690}
.sw{width:44px;height:24px;border-radius:999px;background:#cfd6e3;position:relative;cursor:pointer;transition:background .2s;flex:none}
.sw::after{content:'';position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:left .2s;box-shadow:0 1px 2px rgba(0,0,0,.2)}
.sw[aria-checked=true]{background:#14b8a6}.sw[aria-checked=true]::after{left:23px}
.combo{position:relative}.list{position:absolute;left:0;right:0;top:100%;margin-top:4px;background:#fff;border:1.5px solid #d8deea;border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.12);z-index:5;overflow:hidden}
.optn{padding:11px 14px;cursor:pointer}.optn:hover{background:#f0fdfa}
.modal{position:fixed;inset:0;background:rgba(10,20,30,.45);display:grid;place-items:center;z-index:50}.modal[hidden]{display:none}.modal .box{background:#fff;border-radius:16px;padding:30px;width:460px;box-shadow:0 30px 80px rgba(0,0,0,.25)}
.chk{display:flex;gap:10px;align-items:center;margin-top:18px;font-weight:500}.chk input{width:18px;height:18px;accent-color:#0f766e}
`;
const logo = `<svg class="logo" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#14b8a6"/><path d="M12 11h16v4H17v4h9v4h-9v6h-5z" fill="#fff"/></svg>`;
const page = (title, body) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title} · Facturín</title><meta property="og:site_name" content="Facturín"><style>${css}</style></head><body>${body}</body></html>`;
const shell = (active, content) => page(active, `<div class="app"><aside><div class="brand">${logo} Facturín</div><nav>
  <a href="/" class="${active === 'Inicio' ? 'on' : ''}">🏠 Inicio</a>
  <a href="/facturas" class="${active === 'Facturas' ? 'on' : ''}">🧾 Facturas</a>
  <a href="/clientes" class="${active === 'Clientes' ? 'on' : ''}">👥 Clientes</a>
  <a href="/ajustes" class="${active === 'Ajustes' ? 'on' : ''}">⚙️ Ajustes</a></nav></aside><main>${content}</main></div>`);

const table = () => `<table><thead><tr><th>N.º</th><th>Cliente</th><th>Concepto</th><th>Valor</th><th>Estado</th></tr></thead><tbody>
${invoices.map((i) => `<tr><td>#${i.n}</td><td>${i.client}</td><td>${i.concept}</td><td>${money(i.amount)}</td><td><span class="tag ${i.status.split(' ')[0]}">${i.status}</span></td></tr>`).join('')}</tbody></table>`;

const routes = {
  'GET /login': () => page('Ingresar', `<div class="login"><form class="card" method="post" action="/login"><div class="brand">${logo} Facturín</div>
    <p style="color:#6b7690;margin-top:8px">Facturación simple para tu negocio</p>
    <label for="email">Correo</label><input id="email" name="email" type="email" placeholder="tu@empresa.co">
    <label for="password">Contraseña</label><input id="password" name="password" type="password">
    <button class="btn full" type="submit">Ingresar</button></form></div>`),
  'GET /': () => shell('Inicio', `<div class="top"><h1>Hola, ${USER.name.split(' ')[0]} 👋</h1></div>
    <div class="kpis"><div class="kpi">Facturado este mes<b>${money(invoices.reduce((a, i) => a + i.amount, 0))}</b></div><div class="kpi">Pendiente de cobro<b>${money(invoices.filter((i) => i.status !== 'Pagada').reduce((a, i) => a + i.amount, 0))}</b></div><div class="kpi">Facturas<b>${invoices.length}</b></div></div>${table()}`),
  'GET /facturas': (q) => shell('Facturas', `${q.get('ok') ? `<div class="toast">✅ Factura #${q.get('ok')} creada correctamente</div>` : ''}<div class="top"><h1>Facturas</h1><a class="btn" href="/facturas/nueva">＋ Nueva factura</a></div>${table()}`),
  'GET /facturas/nueva': () => shell('Facturas', `<div class="top"><h1>Nueva factura</h1></div><form class="form" method="post" action="/facturas">
    <label for="cliente">Cliente</label><div class="combo"><input id="cliente" role="combobox" aria-expanded="false" aria-controls="cli-list" autocomplete="off" placeholder="Busca un cliente…"><input type="hidden" name="client">
      <div id="cli-list" role="listbox" class="list" hidden>${clients.map((c) => `<div role="option" class="optn">${c}</div>`).join('')}</div></div>
    <label for="concepto">Concepto</label><input id="concepto" name="concept" placeholder="Ej: Diseño de logo">
    <div class="row"><div><label for="valor">Valor (COP)</label><input id="valor" name="amount" inputmode="numeric" placeholder="0"></div>
    <div><label for="vence">Vence en</label><select id="vence" name="due"><option>15 días</option><option selected>30 días</option><option>60 días</option></select></div></div>
    <div class="opt"><div><b>Pago contra entrega</b><small>El mensajero cobra el valor al entregar el pedido</small></div>
      <span class="sw" id="base-ui-_r_7_" role="switch" aria-checked="false" tabindex="0"></span><input type="hidden" name="cod" value="0"></div>
    <div id="cod-extra" style="display:none"><label for="monto">Monto a cobrar al entregar (COP)</label><input id="monto" name="codAmount" inputmode="numeric" placeholder="0"></div>
    <label class="chk"><input type="checkbox" name="emailCopy"> Enviar copia de la factura al cliente por correo</label>
    <script>(()=>{const sw=document.getElementById('base-ui-_r_7_');const f=()=>{const on=sw.getAttribute('aria-checked')!=='true';sw.setAttribute('aria-checked',String(on));sw.nextElementSibling.value=on?'1':'0';document.getElementById('cod-extra').style.display=on?'block':'none';};sw.addEventListener('click',f);sw.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();f();}});})();</script>
    <div style="display:flex;gap:12px;margin-top:28px"><button class="btn" type="button" id="revisar">Guardar factura</button><a class="btn ghost" href="/facturas">Cancelar</a></div></form>
    <div id="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-t" hidden class="modal"><div class="box"><h2 id="dlg-t">¿Confirmas la factura?</h2>
      <p id="dlg-sum" style="color:#3b4660;margin:12px 0 22px"></p><div style="display:flex;gap:12px"><button class="btn" id="confirmar" type="button">Confirmar</button><button class="btn ghost" id="volver" type="button">Volver</button></div></div></div>
    <script>(()=>{const i=document.getElementById('cliente'),l=document.getElementById('cli-list'),h=i.nextElementSibling;
      const show=(q)=>{let n=0;for(const o of l.children){const m=o.textContent.toLowerCase().includes(q.toLowerCase());o.hidden=!m;n+=m}l.hidden=!n;i.setAttribute('aria-expanded',String(!!n));};
      i.addEventListener('input',()=>show(i.value));i.addEventListener('focus',()=>show(i.value));
      l.addEventListener('mousedown',e=>{const o=e.target.closest('[role=option]');if(!o)return;e.preventDefault();i.value=o.textContent;h.value=o.textContent;l.hidden=true;i.setAttribute('aria-expanded','false');i.focus();});
      const d=document.getElementById('dlg'),f=document.querySelector('form.form');
      document.getElementById('revisar').onclick=()=>{document.getElementById('dlg-sum').textContent=(h.value||'Sin cliente')+' · '+(document.getElementById('concepto').value||'—')+' · $ '+(document.getElementById('valor').value||'0');d.hidden=false;};
      document.getElementById('volver').onclick=()=>{d.hidden=true};document.getElementById('confirmar').onclick=()=>f.submit();})();</script>`),
  'GET /clientes': () => shell('Clientes', `<div class="top"><h1>Clientes</h1></div><table><tbody>${clients.map((c) => `<tr><td>${c}</td></tr>`).join('')}</tbody></table>`),
  'GET /ajustes': () => shell('Ajustes', `<div class="top"><h1>Ajustes</h1></div>`),
};

const body = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(new URLSearchParams(d))); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const sid = (req.headers.cookie || '').match(/sid=(\w+)/)?.[1];
  const authed = sid && sessions.has(sid);
  const send = (html, code = 200) => { res.writeHead(code, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); };
  const go = (to, extra = {}) => { res.writeHead(303, { location: to, ...extra }); res.end(); };

  if (req.method === 'POST' && url.pathname === '/login') {
    const f = await body(req);
    if (f.get('email') === USER.email && f.get('password') === USER.password) {
      const id = Math.random().toString(36).slice(2);
      sessions.add(id);
      return go('/', { 'set-cookie': `sid=${id}; Path=/; HttpOnly` });
    }
    return go('/login?error=1');
  }
  if (req.method === 'POST' && url.pathname === '/facturas' && authed) {
    const f = await body(req);
    const n = invoices[invoices.length - 1].n + 1;
    invoices.push({ n, client: f.get('client') || 'Sin cliente', concept: f.get('concept') || '—', amount: +(f.get('amount') || '0').replace(/\D/g, ''), status: f.get('cod') === '1' ? 'Contra entrega' : 'Pendiente' });
    return go(`/facturas?ok=${n}`);
  }
  if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  const key = `${req.method} ${url.pathname}`;
  if (key !== 'GET /login' && !authed) return go('/login');
  const h = routes[key];
  return h ? send(h(url.searchParams)) : send('No encontrado', 404);
}).listen(PORT, () => console.log(`Facturín demo en http://localhost:${PORT}  (demo@facturin.co / demo123)`));
