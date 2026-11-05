# Tutomatic

CLI para que un agente de IA (Claude, u otro con terminal) **grabe y produzca videos tutoriales de una app web**: inicia sesión, sigue un guion (storyboard), graba con cursor animado y zoom, genera la voz y la música con IA, subtítulos, capítulos, identidad visual y miniatura, y renderiza con **Remotion** o **HyperFrames**.

```
storyboard.json ──► voz (Gemini TTS) ──► grabación (Playwright, sincronizada con la voz)
                                       └► marca (colores/logo/fuente de la app)
                 ──► música (Lyria) ──► mezcla con ducking (-16 LUFS) + subtítulos + capítulos
                 ──► timeline.json ──► render: Remotion | HyperFrames ──► MP4 + SRT/VTT + miniatura
```

## Instalación

**Windows**

```powershell
git clone https://github.com/Josechaparro09/tutomatic
cd tutomatic
.\install.cmd
```

También puedes dar doble clic en `install.cmd`. El instalador:
- instala Node.js y Git si faltan (con winget);
- instala las dependencias;
- registra el comando `tutomatic`;
- abre el asistente de configuración.

**Mac / Linux**

```bash
git clone https://github.com/Josechaparro09/tutomatic
cd tutomatic
./install.sh
```

El repositorio es privado: la primera vez, Git te pide que inicies sesión en GitHub.

## Configuración: `tutomatic setup`

Un asistente con menús te pregunta todo y lo guarda por ti en `tutomatic.config.yaml` y `.env`. Ninguno de los dos se sube a git.

| Sección | Qué configura |
|---|---|
| requisitos | Node, FFmpeg (ofrece instalarlo) y Chromium |
| voz | Google Gemini (clave + voz), **VoiceStudio** local (detecta tus voces clonadas), ElevenLabs u OpenAI |
| musica | Lyria (Google) o sin música |
| motor | **HyperFrames** o Remotion, tarjeta gráfica y calidad |
| diseño | estilo por defecto: Ruta, Etiqueta, Suave o ninguno; lo puede aplicar a tus proyectos |
| app | el usuario y la contraseña de la app que vas a grabar (la contraseña se escribe oculta) |
| skill | instala la skill para Claude Code y genera `tutomatic.skill` para la app de Claude |

Para cambiar solo una parte: `tutomatic setup --only voz` (o `musica`, `motor`, `diseño`, `app`, `skill`; varias separadas por comas).

| Comando | Para qué |
|---|---|
| `tutomatic doctor` | Revisa que todo funcione |
| `tutomatic demo` | Hace un video de prueba con la app de ejemplo, gratis |
| `tutomatic update` | Baja la última versión y actualiza la skill |
| `tutomatic where` | Dice dónde está instalado |

## La skill para Claude

- **Claude Code:** `tutomatic setup --only skill` (o `tutomatic skill`) la copia a `~/.claude/skills/tutomatic`.
- **App de Claude (web o escritorio):** sube `tutomatic.skill`, que se crea en la carpeta del proyecto, en Configuración → Capacidades → Skills. Con hacerlo una vez en tu cuenta queda disponible en todos tus equipos.

Luego pídele a Claude algo como: *"Haz un tutorial de cómo crear un envío en mi app"*.

## Pruébalo con la app de demo (sin claves, gratis)

```bash
tutomatic demo          # levanta la app de ejemplo, ensaya y renderiza un borrador
```

O paso a paso: `npm run demo-app` (http://localhost:4321) y en otra terminal `tutomatic rehearse facturin-nueva-factura`, seguido de `tutomatic build facturin-nueva-factura --mock --draft`.

El resultado queda en `projects/facturin-nueva-factura/output/`. Con `--mock` la voz y la música son sintéticas (sirven para revisar tiempos) y `--draft` renderiza rápido a media resolución. Quita ambas para el video final con Gemini y Lyria.

**Tarjeta gráfica:** `render.gpu: auto` detecta y usa NVIDIA (NVENC), AMD (AMF), Intel (QSV), Mac (VideoToolbox) o VA-API en Linux. Si ninguna responde, usa el procesador. `tutomatic doctor` muestra cuál encontró.

## Comandos

| comando | qué hace |
|---|---|
| `init <p> --url <url>` | crea `projects/<p>/storyboard.json` |
| `inspect <p> [--path /x] [--after paso]` | lista elementos con selectores sugeridos, opciones de los select, textos visibles y una captura numerada |
| `validate <p>` | valida el esquema, muestra preguntas pendientes y la duración estimada |
| `rehearse <p> [--until paso]` | ejecuta los pasos rápido, sin grabar, para validar selectores, y revisa la **cobertura**: cada campo, switch o casilla de los formularios usados que el tutorial no toca se convierte en una pregunta para el usuario |
| `brand <p>` | extrae la identidad visual de la app → `brand.json` (editable) |
| `voice <p>` | narración, con caché por frase |
| `record <p> [--headed]` | graba sincronizado con la voz (el login ocurre fuera de cámara) |
| `music <p>` | música de fondo |
| `assemble <p>` | timeline, subtítulos SRT/VTT, capítulos y mezcla de audio |
| `render <p> [--engine remotion\|hyperframes] [--quality draft\|standard\|high]` | video final |
| `hf-project <p> [--preview]` | escribe la composición HyperFrames para editarla en su Studio |
| `thumbnail <p> [--ai]` | miniatura 1280×720 |
| `build <p>` | todo lo anterior, en orden |
| `status <p>` | qué piezas existen |

**Diseño propio (HyperFrames):** pon `design.css`, `design.js` o `design.html` en `projects/<p>/design/` y se inyectan en cada render: tarjetas de capítulo, fondos animados, intro y CTA a medida. Tienes un ejemplo en `examples/designs/capitulos/` y la guía en `skills/tutomatic/references/design.md`. Las skills oficiales de HyperFrames (diseño y animación) vienen en `skills/vendor/hyperframes/`.

## Usarlo con Claude

La skill está en `skills/tutomatic/` (también como `tutomatic.skill`). Con la skill instalada, basta con pedirle a Claude algo como: *"Hazme un tutorial de cómo crear un usuario en mi app, que corre en localhost:3000"*. Claude explora la app, escribe el storyboard, te hace preguntas y corre el pipeline.

## Configuración

- `tutomatic.config.yaml`: proveedores y modelos (voz, música, imagen), grabador y render (motor, fps, zoom, subtítulos, marco de navegador).
- `projects/<p>/storyboard.json`: el guion. Esquema en `schema/storyboard.schema.json`; referencia en `skills/tutomatic/references/storyboard.md`.
- `projects/<p>/brand.json`: colores, fuente y logo.

## Proveedores

Voz: `google` (Gemini 3.8 Flash TTS), `voicestudio` (local en tu PC, sin internet: `tutomatic voices` lista los perfiles; `--tts voicestudio` para usarlo una vez), `elevenlabs`, `openai`, `mock`. Música: `google` (Lyria 3.5), `mock`. Para agregar más, implementa una interfaz de `src/providers/types.ts` y regístrala en `src/providers/index.ts`.

## Estructura

```
bin/tutomatic.js            punto de entrada (TypeScript vía tsx, sin compilar; bin/tuto.js es un alias)
src/cli.ts                  comandos
src/recorder/               Playwright: login, cursor, screencast CDP, inspect, brand
src/providers/              Google, ElevenLabs, OpenAI, mock
src/post/                   voz/música, timeline, subtítulos, mezcla, miniatura
src/engines/                runners de Remotion y HyperFrames
engines/remotion/           plantilla React del video
engines/shared/             tipos del timeline y cámara virtual (compartidos)
skills/tutomatic/      skill para Claude
examples/demo-app/          app de prueba "Facturín"
projects/                   tus tutoriales
```

Licencias: Remotion es gratis para individuos y empresas pequeñas, y requiere licencia para empresas grandes (remotion.dev/license). HyperFrames es Apache-2.0.
