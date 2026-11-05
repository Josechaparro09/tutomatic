---
name: tutomatic
description: Produce videos tutoriales de una app web de punta a punta con el CLI tutomatic. Inicia sesión, explora la app, escribe el storyboard, pregunta lo que no entendió y luego graba la pantalla con cursor animado y zoom, genera la voz (Gemini TTS u otro), la música (Lyria), los subtítulos, los capítulos, la identidad visual y la miniatura, y renderiza con Remotion o HyperFrames. Úsala siempre que el usuario quiera un tutorial, walkthrough, demo, how-to, video de onboarding o capacitación de un sitio o app web, "grabar cómo se hace X en mi app", narrar una grabación de pantalla, o mencione Tutomatic, aunque no diga literalmente "video tutorial".
---

# Video tutorial (tutomatic)

Tú eres el director; el CLI `tutomatic` es el equipo de producción: maneja el navegador, pone la voz, graba, mezcla y renderiza. Tu trabajo es entender la app, escribir un buen **storyboard.json**, resolver dudas con el usuario y correr el pipeline. Casi toda la calidad del video sale del storyboard (pasos claros, narración corta y natural, buenos selectores), así que invierte ahí tu esfuerzo.

## 0. Ubicar el CLI

Comprueba que esté instalado con `tutomatic where`, que imprime la carpeta de la herramienta. Si junto a esta skill hay un `TUTOMATIC_HOME.txt`, ahí está escrita esa carpeta. Corre los comandos desde esa carpeta; las rutas `skills/…`, `examples/…` y `projects/…` de esta guía son relativas a ella.

- **Si `tutomatic` no existe:** busca una carpeta con `tutomatic.config.yaml` (o el antiguo `tuto.config.yaml`) y `bin/tutomatic.js`, y usa `node bin/tutomatic.js <comando>`. En el equipo de Jose está en `C:\Users\Jose Chaparro\Videos\tuto-video`. Si no está en ningún lado, pide al usuario que lo instale: `git clone https://github.com/Josechaparro09/tutomatic` y luego `install.ps1` (Windows) o `./install.sh` (Mac/Linux).
- **Configuración:** todo se configura con `tutomatic setup`, un asistente que pregunta y deja listos la voz (Gemini, VoiceStudio, ElevenLabs u OpenAI), la música, el motor, la GPU, el estilo visual, el usuario de la app, Chromium y la skill. Para cambiar solo una parte: `tutomatic setup --only voz|musica|motor|diseño|app|skill`. No edites el `.env` a mano si el asistente puede hacerlo, y pídele al usuario que escriba él mismo las claves y contraseñas en el asistente: nunca las pidas por el chat.
- **Diagnóstico:** `tutomatic doctor` revisa FFmpeg, Chromium, claves, GPU y VoiceStudio. Si algo falla, díselo al usuario con el arreglo que sugiere.
- **Credenciales:** en el storyboard nunca escribas contraseñas; usa `${TUTO_USER}` y `${TUTO_PASSWORD}`, que vienen del `.env`, y no las repitas en el chat.
- **Actualizar:** `tutomatic update` baja la última versión, reinstala las dependencias y actualiza la skill.

## 1. Brief (pregunta solo lo que no puedas inferir)

Necesitas:
- la URL de la app (¿está corriendo el servidor?),
- qué debe enseñar el tutorial (un objetivo por video),
- la audiencia,
- el idioma,
- y cómo es el login.

Si el usuario está presente y falta algo importante, pregúntalo todo en un solo mensaje. Si no, asume lo razonable y déjalo registrado como pregunta en el storyboard (paso 4).

Si la app no está corriendo, pide que la levanten, o levántala tú si sabes cómo (p. ej. `npm run dev` en su proyecto).

## 2. Crear el proyecto y explorar

```bash
tutomatic init <proyecto> --url http://localhost:3000 --title "Cómo …"
```

Ajusta el bloque `login` (los selectores del formulario de ingreso) y explora:

```bash
tutomatic inspect <proyecto> [--path /ruta] [--after <idPaso>]
```

`inspect` inicia sesión, abre la pantalla e imprime tres cosas:
- cada elemento interactivo con un **selector sugerido**,
- las **opciones** de cada `<select>`: el `value` de un paso `select` debe ser una de esas etiquetas, tal cual,
- los **textos visibles** no interactivos (celdas, tarjetas, avisos), que sirven como `text:…` en pasos `hover`/`none`.

También guarda una captura numerada en `build/inspect/<ruta>.png` (la raíz `/` queda como `inicio.png`). Mira esa captura con tu herramienta de lectura de imágenes: necesitas *ver* la interfaz para narrarla bien.

Usa `--after <idPaso>` para inspeccionar el estado al que se llega tras ejecutar el storyboard hasta ese paso (modales, formularios que aparecen tras un clic, etc.). Si tienes un navegador (Playwright MCP, Claude in Chrome) puedes explorar con él, pero toma los selectores de `inspect`, para que el grabador los encuentre.

Recorre todo el flujo, pantalla por pantalla, antes de escribir la narración. Debes entender para qué sirve cada pantalla, no solo dónde están los botones.

## 3. Escribir el storyboard

Lee `skills/tutomatic/references/storyboard.md`: tiene la referencia de todos los campos y un ejemplo completo. Lo esencial:

- **Un paso = una acción visible + una o dos frases cortas.** La voz arranca cuando empieza el paso, y el paso dura lo que dura su narración. Por eso "Haz clic en Guardar" va en el paso que hace clic en Guardar.
- **Selectores:** prefiere los atajos accesibles que sugiere `inspect` (`role:button|Guardar`, `label:Correo`, `text:…`, `testid:…`). Aguantan rediseños mejor que las clases CSS.
  - Para un switch o casilla sin etiqueta accesible (en `inspect` aparece con `≈`), usa `near:<texto de la fila>|switch`. Por ejemplo, `near:Pago Contra Entrega (COD)|switch`.
  - Nunca uses ids generados como `#base-ui-_r_r_` o `#radix-:r3:`: cambian en cada carga.
- **Switches y casillas:** usa `check`/`uncheck`, no `click`. Verifican el estado final y no lo invierten si ya estaba como se pide.
- **Esperas:** pon `waitFor` después de navegar (`"url:**/facturas"` o un selector que aparece), para que el siguiente paso no se adelante a la página.
- **Zoom y resaltado:** el zoom es automático en clics y al escribir.
  - Encuadra el elemento con su etiqueta, la lista que abre y, después de la acción, el modal o el campo resultante.
  - Usa `"zoom": false` en pasos de vista general y `"highlight": true` en los botones clave. El marco de resaltado se ajusta al elemento exacto, aparece mientras llega el cursor y se apaga solo al hacer clic o escribir, o si el elemento desaparece.
  - Si el encuadre automático no muestra lo que quieres, usa `"focus": "<selector del área>"`.
- **Pasos que solo explican:** usa `action: "none"` o `"hover"` cuando solo describes lo que hay en pantalla.
- **Intro y outro:** agrega una narración de intro (qué va a aprender) y un outro (el resultado más un llamado a la acción).

Antes de redactar la narración lee `skills/tutomatic/references/narration.md`. Cubre el tono, la longitud, cómo se leen números y símbolos, y el prompt de estilo de la voz.

## 4. Cubrir cada control y preguntar antes de grabar

### Ningún control se omite en silencio

En cada formulario que el tutorial usa, cada campo, switch, casilla, lista y opción termina en uno de tres destinos, y **el usuario decide cuál** cuando el control no está en el objetivo que te dio:

1. **Usarlo** en el video: llenarlo, activarlo o elegir una opción.
2. **Explicarlo sin tocarlo**: un paso `hover` con narración que dice para qué sirve.
3. **Omitirlo**: no aparece en la narración.

Los switches y casillas que cambian el resultado del negocio exigen preguntar siempre, incluso si el usuario dijo "decide tú": pago contra entrega, notificaciones, impuestos, envíos, permisos, publicar, facturar. No inventes que "no aplica". Tú no conoces su operación, y omitirlo cambia lo que enseña el video.

El sistema te ayuda a cumplir esto:
- `tutomatic inspect` marca los switches y casillas con su estado (`[apagado]`) y los campos obligatorios con `*`.
- `tutomatic rehearse` revisa la **cobertura**: escanea los formularios tras cada paso, incluidos los campos que aparecen al activar algo. Si encuentra controles que el storyboard no toca, agrega una pregunta por cada uno en `questions` (con `"source": "coverage"`), bloqueante para switches, casillas, listas y campos obligatorios.
- `tutomatic build` se niega a grabar si la cobertura está desactualizada o si hay preguntas bloqueantes sin responder.

Presenta esas preguntas al usuario en un solo bloque. Si tienes `AskUserQuestion`, usa opciones como "Activarlo en el video / Explicarlo sin tocarlo / Omitirlo". Luego aplica la respuesta en los pasos:
- para activar o desactivar usa `check`/`uncheck`;
- si al activarlo aparece un campo nuevo (p. ej. "Monto a cobrar"), agrega su paso; el siguiente `rehearse` lo detecta si lo olvidas;
- para explicarlo sin tocarlo usa `hover`.

Escribe en `answer` lo que dijo el usuario.

Si el usuario no está disponible, la opción por defecto es **explicarlo sin tocarlo** ("Si tu cliente paga al recibir, activa Pago contra entrega"). Nunca lo omitas, y en la entrega enumera esos controles para que el usuario confirme.

### Otras dudas

Grabar y renderizar toma minutos y cuesta créditos de API, así que este es el momento de resolver dudas. Pon en `questions` todo lo que no tengas claro y pregúntaselo al usuario. Marca `"blocking": true` si la respuesta cambia los pasos. Ejemplos:
- términos del negocio que no entiendes,
- qué datos de ejemplo usar,
- si una acción destructiva (borrar, enviar, pagar) está permitida en esa cuenta,
- preferencias de marca,
- qué voz prefiere.

Si el usuario no está, responde tú las preguntas que no sean de cobertura con tu mejor criterio, escribe la respuesta en `answer` y después cuéntale qué supuestos tomaste. No ejecutes acciones destructivas o irreversibles en la app real sin confirmación explícita: sugiere una cuenta de prueba o un entorno de staging.

Luego valida y ensaya:

```bash
tutomatic validate <proyecto>     # esquema, preguntas pendientes, duración estimada
tutomatic rehearse <proyecto>     # ejecuta todos los pasos rápido, sin grabar; falla si un selector no existe
```

`rehearse` hace clics y envía formularios de verdad, así que **los datos que cree aparecerán después en la grabación** (p. ej. una factura duplicada en la lista). Para evitarlo tienes tres opciones:
- ensaya con `--until <idPaso>`, que se detiene *antes* del paso que guarda o envía;
- restaura los datos de la app antes de `build`;
- escribe pasos que no dependan de cuántos registros existan (evita `text:#1046`, prefiere `text:Asesoría`).

Si `rehearse` falla, guarda una captura en `build/rehearse/<paso>.png` y sugiere un comando `inspect`. Corrige el paso y vuelve a ensayar hasta que todo pase.

La sesión de login se guarda en `build/.auth.json`. Antes de reutilizarla se verifica que siga sirviendo, así que reiniciar el servidor de la app no rompe nada.

## 5. Producir

Primero un borrador barato: sin costo de API, con voz simulada y render rápido. Así salen los problemas de timing y encuadre antes de gastar créditos.

```bash
tutomatic build <proyecto> --mock --draft
```

`--mock` usa voz y música de prueba; `--draft` renderiza a media resolución con codificación rápida. Ambas funcionan igual en PowerShell, cmd y bash.

La tarjeta gráfica se usa sola (`render.gpu: auto`): NVIDIA, AMD, Intel o Apple, la que responda. Si ninguna funciona, se usa el procesador. `tutomatic doctor` muestra cuál detectó, y `--gpu off` la desactiva si algo falla.

Revisa el resultado tú mismo con `tutomatic review <proyecto>`. Deja en `build/review/` una imagen por paso con tres cuadros (inicio, justo después de la acción y final), más `index.md` con la narración de cada paso. **Mira todas las imágenes** con tu herramienta de lectura de imágenes antes del render final, y corrige lo que falle. Busca:
- datos sobrantes de ensayos,
- zooms que recortan algo importante,
- subtítulos o rótulos que tapan lo que se está explicando,
- narración que no coincide con la pantalla (p. ej. dice "pendiente", pero el estado muestra "Contra entrega");
- un marco de resaltado que tapa más de lo debido o sigue visible después del clic.

El rótulo del paso se mueve a la derecha y el subtítulo sube automáticamente cuando el elemento enfocado está en esa zona. Si aun así algo estorba, parte el paso en dos: una vista general (`"zoom": false`) y luego el detalle.

Después, el build real:

```bash
tutomatic build <proyecto> [--engine remotion|hyperframes] [--ai-thumbnail]
```

`build` corre, en orden: voz → marca → grabación → música → ensamblado (timeline, subtítulos, capítulos, mezcla) → render → miniatura. La voz y la música tienen caché por contenido: si corriges una narración y vuelves a correr, solo se regenera lo que cambió.

Para iterar sobre una sola pieza existen comandos individuales: `voice`, `brand`, `record`, `music`, `assemble`, `render`, `thumbnail` y `status`.

**Motor:** Remotion (por defecto, React) o HyperFrames (HTML + GSAP, editable en su Studio con `hf-project <proyecto> --preview`). Los dos renderizan el mismo `timeline.json` con el mismo look. Lee `skills/tutomatic/references/engines.md` para saber cuándo usar cada uno y cómo personalizar las plantillas.

**Diseño y animación.** Si el usuario quiere un video más bonito o con más animación (tarjetas de capítulo, intro cinética, fondo con profundidad, otro estilo), usa la capa de diseño: `projects/<p>/design/` (`design.css`, `design.js`, `design.html`), que HyperFrames inyecta en cada render. Lee `skills/tutomatic/references/design.md` y, antes de diseñar, las skills de HyperFrames en `skills/vendor/hyperframes/` (house-style y frame-presets). Ofrece 2 o 3 estilos para que el usuario elija y revisa los cuadros: el diseño nunca debe tapar la app mientras se explica.

## 6. Entregar

Todo queda en `projects/<proyecto>/output/`:
- el `.mp4`,
- los subtítulos `.srt` y `.vtt`,
- `chapters.txt` (capítulos para YouTube),
- y `-thumbnail.png`.

Entrega al usuario los archivos, la duración y los supuestos que tomaste. Incluye la lista de controles que se omitieron o solo se explicaron, con la decisión de cada uno. Agrega una sugerencia de mejora solo si hay una real.

## Problemas típicos

- **Narración y acción desfasadas:** la narración del paso es demasiado larga para lo que pasa en pantalla. Pártela en dos pasos o usa `pauseAfter`.
- **Zoom en el lugar equivocado:** el selector encontró otro elemento (revisa con `inspect`), o pon `"zoom": false`.
- **La página no estaba lista o el paso es inestable:** agrega `waitFor` al paso anterior.
- **Colores de marca incorrectos:** edita `brand.json` a mano (nunca se sobrescribe sin `--force`) y vuelve a correr `render`.
- **Falla el login:** `rehearse` vuelve a iniciar sesión. Revisa los selectores de `login.steps` con `inspect <proyecto> --no-login --path /login`.

Hay más en `skills/tutomatic/references/troubleshooting.md`. Si el usuario quiere voz local (VoiceStudio en su PC, sin internet) o agregar otro proveedor de voz o música (Azure, Polly, Suno…), lee `skills/tutomatic/references/providers.md`. Con VoiceStudio, verifica con `doctor` que la app esté abierta antes de `build`.
