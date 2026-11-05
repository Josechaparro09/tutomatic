# Referencia del storyboard.json

El esquema JSON completo está en `schema/storyboard.schema.json` (el validador es `src/lib/schema.ts`). Aquí va lo que necesitas para escribir uno bueno.

## Índice
1. Estructura general
2. Pasos: acciones y campos
3. Selectores
4. Login
5. Ejemplo completo
6. Cómo se calcula el tiempo

## 1. Estructura general

```jsonc
{
  "title": "Cómo crear una factura",          // aparece en intro y miniatura
  "subtitle": "En menos de un minuto",
  "language": "es-CO",                        // idioma de la voz
  "audience": "…", "goal": "…",               // contexto para ti; no sale en el video
  "app": {
    "url": "http://localhost:3000",           // base
    "start": "/",                             // dónde arranca la grabación (ya logueado)
    "viewport": { "width": 1440, "height": 810 },   // 16:9; 1440×810 hace la UI legible
    "displayUrl": "app.miempresa.com"         // texto de la barra del marco de navegador
  },
  "login": { … },                             // ver §4
  "voice": { "style": "…" },  // opcional. NO pongas provider/voice aquí: salen de tutomatic.config.yaml; solo si el usuario pide otra voz para ESTE video
  "music": { "enabled": true, "volume": 0.18, "prompt": "…" },
  "intro":  { "title": "…", "subtitle": "…", "narration": "…" },
  "outro":  { "title": "¡Listo!", "subtitle": "…", "cta": "…", "narration": "…" },
  "steps": [ … ],
  "questions": [ { "id": "q1", "question": "…", "blocking": true, "answer": null } ]
}
```

Viewport: 1440×810 es el mejor equilibrio. La app se ve con su diseño de escritorio y el texto queda legible en 1080p. Usa 1280×720 si la UI tiene letra pequeña, y 1920×1080 solo si la app lo necesita (se ve más pequeña).

## 2. Pasos

| campo | uso |
|---|---|
| `id` | único, kebab-case (`abrir-facturas`) |
| `title` | rótulo corto que aparece arriba a la izquierda ("Abre Facturas"). Omítelo para que no salga rótulo |
| `narration` | lo que dice la voz durante el paso |
| `action` | `click` `dblclick` `fill` `type` `press` `hover` `select` `check` `uncheck` `scroll` `goto` `wait` `none` |
| `selector` | elemento objetivo (ver §3) |
| `value` | texto para fill/type, opción para select (por su etiqueta visible) |
| `key` | tecla para press: `Enter`, `Tab`, `Control+S` |
| `url` | para goto (relativa a app.url) |
| `y` | para scroll sin selector: píxeles |
| `ms` | para wait |
| `waitFor` | tras la acción: selector, `url:**/ruta`, `load` o `networkidle` |
| `zoom` | `true`, número (1–3, zoom **máximo**), `false`. Por defecto hay zoom en clic/escritura/hover/select. El zoom real se ajusta solo para que el área completa quepa en pantalla |
| `focus` | selector del área que debe mostrar la cámara en ese paso (p. ej. `text:Datos del Destinatario >> xpath=ancestor::section[1]` o `#tarjeta-pago`). Úsalo solo cuando el encuadre automático no sea el que quieres |
| `highlight` | anillo pulsante sobre el elemento antes de la acción |
| `pauseAfter` | segundos extra al final del paso |
| `voiceDelay` | segundos antes de que arranque la voz (por defecto 0.15) |
| `chapter` | inicia un capítulo (sale en chapters.txt) |

**Cómo encuadra la cámara.** Cada paso tiene dos planos:
- **Antes de la acción:** el elemento, su etiqueta y la lista desplegable que haya abierto. Para switches y casillas, la fila completa.
- **Después de la acción:** el modal que se abrió, el campo que quedó elegido (tras hacer clic en una opción) o el mismo elemento. Si la página navegó o el elemento desapareció, la cámara se aleja.

El zoom se calcula para que esa área quepa con margen, sin pasar de `render.zoom` (1.6) ni del número que pongas en `zoom`.

`check`/`uncheck` sirven para switches y casillas: hacen clic solo si hace falta y verifican el estado final. Funcionan también cuando el `<input>` está oculto y lo visible es un interruptor dibujado con CSS. El zoom enfoca la fila completa (etiqueta + interruptor), no solo el control.

`type` escribe letra por letra, así que se ve escribir. `fill` también escribe, pero al doble de velocidad; úsalo para datos que no importan.

`hover` y `none` sirven para pasos que solo explican. `hover` lleva el cursor al elemento y hace zoom (pon `"zoom": false` si es una vista general).

## 3. Selectores

Atajos (recomendados, son los que sugiere `tutomatic inspect`):

- `role:button|Guardar factura`: rol ARIA + nombre accesible (texto visible, aria-label o label)
- `role:link|Facturas`, `role:tab|Detalles`, `role:checkbox|Acepto`, `role:combobox|País`
- `label:Correo`: input asociado a ese label
- `placeholder:Buscar…`
- `text:Facturado este mes`: primer elemento que contiene ese texto
- `testid:save-btn`: `data-testid`
- `near:Pago contra entrega|switch`: el control con ese rol dentro del contenedor más cercano que contiene ese texto. Úsalo para switches o casillas cuya etiqueta es un texto vecino, no un `<label>` asociado (muy común en Base UI, Radix, shadcn y MUI). Si no pones rol, se asume `switch`.

También acepta cualquier selector de Playwright o CSS: `#guardar`, `form button[type=submit]`, `text=Facturas`, `.card >> nth=2`.

Si hay varios elementos que coinciden, se usa el primero visible. Si eso no sirve, haz el selector más específico (`role:button|Guardar factura` en vez de `text:Guardar`).

Los nombres accesibles incluyen los emojis y los símbolos visibles: si el link dice "🧾 Facturas", el selector es `role:link|🧾 Facturas`. Cópialo tal cual de la salida de `inspect`.

## 4. Login

```json
"login": {
  "url": "/login",
  "steps": [
    { "action": "fill", "selector": "label:Correo", "value": "${TUTO_USER}" },
    { "action": "fill", "selector": "label:Contraseña", "value": "${TUTO_PASSWORD}" },
    { "action": "click", "selector": "role:button|Ingresar" }
  ],
  "waitFor": "url:**/dashboard",
  "record": false
}
```

- Ocurre fuera de cámara en un contexto aparte. La sesión (cookies y localStorage) se guarda en `build/.auth.json` y se reutiliza durante 30 minutos.
- `record: true` graba el login al inicio del video, sin narración. Úsalo solo si el tutorial trata de iniciar sesión, y con una cuenta de demo.
- SSO, OTP o captcha: no se pueden automatizar. Pide al usuario una cuenta de prueba sin 2FA, o que exporte el estado de sesión.
- App sin login: elimina el bloque `login`.

## 5. Ejemplo completo

`projects/facturin-nueva-factura/storyboard.json` en el repo: 8 pasos, con intro, outro, capítulos y una pregunta respondida. Úsalo como modelo de tono y granularidad. La app de demo se levanta con `npm run demo-app` (http://localhost:4321).

## 6. Cómo se calcula el tiempo

Para cada paso, el grabador:
1. espera a que el selector sea visible y lo trae a la vista,
2. si hay `highlight`, lo resalta,
3. mueve el cursor en curva (0.35–1 s, según la distancia),
4. ejecuta la acción y el `waitFor`,
5. espera hasta que `voiceDelay + duración de la voz + 0.45 s` se cumpla desde el inicio del paso (mínimo 1.6 s), más `pauseAfter`.

En consecuencia:
- Si la acción tarda más que la voz (una página lenta), el paso se alarga y queda silencio. Divide la narración o acepta la pausa.
- Por eso conviene correr `tutomatic voice` antes de `tutomatic record`: así el grabador conoce la duración real de cada frase. `build` ya lo hace en ese orden.
- Si cambias la narración, la voz cambia de duración y hay que volver a grabar. `build` lo hace solo.
