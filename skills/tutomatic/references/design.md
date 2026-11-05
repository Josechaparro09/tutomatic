# Diseño, animación y creatividad (capa de diseño)

El look base sale de la marca (`tutomatic brand`: colores, logo y fuente de la app) y ya es limpio. Usa la capa de diseño si el usuario pide un video "más bonito", más animado o con una dirección de arte propia: tarjetas de capítulo, intros cinéticas, fondos con profundidad, un CTA final con más fuerza, otra tipografía.

## Cómo funciona

Crea `projects/<p>/design/` con cualquiera de estos archivos. El motor **HyperFrames** los inyecta en cada render, así que nunca se pierden al regenerar:

| Archivo | Qué hace |
|---|---|
| `design.css` | Estilos que se aplican después de los de la plantilla. Puede cambiar cualquier id o clase: `#bg`, `#intro`, `#intro h1`, `#frame`, `.badge`, `.caption span`, `#outro`, `#check`, `#outro-cta`… |
| `design.html` | Marcado extra dentro de `#root` (capas decorativas fijas). |
| `design.js` | Código que corre con `tl` (la línea de tiempo GSAP principal), `gsap` y `TUTO` (los datos del video). Se usa para crear elementos y animarlos en el tiempo. |
| otros (fuentes `.woff2`, `.svg`, `.png`) | Se copian a `build/hyperframes/design/` y se referencian como `design/archivo.ext`. |

`TUTO` trae: `width`, `height`, `duration`, `title`, `subtitle`, `intro {start,end}`, `recording {start,end}`, `outro {start,end,title,subtitle,cta}`, `screen {x,y,w,h}`, `steps [{id,index,title,chapter,start,end,zoom,box,badgeSide}]`, `chapters [{index,total,name,start,stepId}]` y `brand` (primary, secondary, background, surface, text, mutedText, fontFamily, logo, radius).

Estilos listos en `examples/designs/`. Todos toman los colores y el logo de la marca, así que sirven para cualquier app:

| Estilo | Para qué | Capítulos |
|---|---|---|
| `ruta` | Apps de logística o de procesos con pasos. La intro muestra la agenda como una ruta con paradas y el outro la muestra completada. | Tarjeta "Parada N de M" arriba, más un seguimiento de la ruta en la barra del navegador |
| `etiqueta` | Look más gráfico y enérgico: panel de color de marca, etiqueta de envío con datos, sellos. | Etiqueta con número grande arriba, más un chip "CAP 02/06" en la barra |
| `suave` | Minimal y elegante: vidrio y manchas de color en movimiento. | Pastilla en el margen inferior: nunca tapa la app |
| `capitulos` | Ejemplo básico (oscuro) para aprender la capa | Tarjeta centrada |

Para usar uno, copia la carpeta a `projects/<p>/design/`. Para comparar sin renderizar el video, usa `cd projects/<p>/build/hyperframes && npx hyperframes snapshot --at 5,9,<outro+5> --no-end --describe false -o snap .`, que saca cuadros sueltos en segundos. Antes corre `tutomatic hf-project <p>`. Las tarjetas de capítulo esconden el rótulo del paso mientras se ven, para no mostrar dos a la vez. Los estilos traen sus fuentes en `fonts/` (Plus Jakarta Sans y JetBrains Mono, licencia OFL); si la marca usa otra, cámbiala en el `@font-face`.

## Reglas

- **Todo animado va en `tl`** (`tl.fromTo(..., t)`), con tiempos sacados de `TUTO`. Nada de `setTimeout`, `requestAnimationFrame`, `Math.random()` sin semilla ni animaciones CSS infinitas: el render salta a cualquier cuadro y tiene que dar siempre lo mismo.
- Si creas elementos con tiempo, ponles `class="clip"`, `data-start`, `data-duration` y `data-track-index` (≥ 7, para no chocar con la plantilla). Arrancan con `opacity: 0` en CSS.
- **No tapes la app mientras se explica algo.** Las tarjetas de capítulo duran como mucho ~1.8 s y salen antes de la acción del paso. Mira los cuadros con `tutomatic review` o extrae cuadros del mp4.
- Respeta la marca: los colores salen de `TUTO.brand`, nunca inventes una paleta nueva sin preguntar. Contraste legible siempre.
- Después de cambiar la capa, corre `tutomatic hf-project <p>` (genera y hace lint: 0 errores), luego `render <p> --engine hyperframes --draft` y revisa los cuadros antes del render final. Para retocar en vivo: `hf-project <p> --preview`.
- La capa de diseño es solo para HyperFrames. Si el proyecto usa Remotion, cambia a `--engine hyperframes` o personaliza `engines/remotion/src/Tutorial.tsx` (ver `engines.md`).

## Dónde está el criterio de diseño

En `skills/vendor/hyperframes/` están las skills oficiales de HyperFrames (Apache 2.0). Si solo existe `skills/vendor/hyperframes-skills.zip`, descomprímelo ahí mismo: `tar -xf hyperframes-skills.zip` funciona en Windows, Mac y Linux. Léelas antes de diseñar:

1. `hyperframes-creative/references/house-style.md` y `video-composition.md`: los vicios típicos de diseño hecho por IA que hay que evitar, la profundidad del fondo y la escala de video (no de página web). **Obligatorio.**
2. `hyperframes-creative/references/design-picker.md` y `frame-presets/`: estilos listos (Blue Professional, Capsule, Cobalt Grid, Editorial Forest…). Ofrécele al usuario 2 o 3 que encajen con su marca y que elija.
3. `hyperframes-creative/references/typography.md`, `motion-principles.md` y `palettes/clean-corporate.md`.
4. `hyperframes-animation/`: los adaptadores GSAP (`adapters/gsap*.md`), `transitions/` y los blueprints que más sirven en tutoriales: `cursor-ui-demo`, `cta-morph-press` y `kinetic-type-beats`.
5. `hyperframes-registry`: bloques del catálogo (`npx hyperframes add <bloque>`), por ejemplo transiciones y overlays.

Para Remotion, el usuario puede instalar las skills oficiales con `npx skills add remotion-dev/skills` (`remotion-best-practices`, `remotion-markup`).
