# Motores de render: Remotion y HyperFrames

Los dos leen el mismo `build/timeline.json`, que contiene:
- duración total e identidad visual (`brand`),
- el layout del marco de navegador,
- la intro, la grabación y los pasos (con su caja normalizada),
- los keyframes de cámara (zoom/paneo),
- los subtítulos, el outro y el audio mezclado.

El resultado es visualmente equivalente en ambos motores. Elige por flujo de trabajo:

| | Remotion | HyperFrames |
|---|---|---|
| Plantilla | `engines/remotion/src/Tutorial.tsx` (React) | generada por `src/engines/hyperframes.ts` → `build/hyperframes/index.html` (HTML + GSAP) |
| Editar a mano | código React, Remotion Studio (`npx remotion studio engines/remotion/src/index.ts`) | `tutomatic hf-project <p> --preview` abre el Studio de HyperFrames; también tiene skills propias (`npx hyperframes skills`) |
| Ideal para | plantilla de marca fija, reutilizada en muchos videos | retocar un video concreto (agregar un callout, cambiar una animación) sin tocar código |
| Licencia | gratis para individuos y empresas pequeñas; empresas grandes requieren licencia (remotion.dev/license) | Apache-2.0 |
| Navegador | descarga su Chrome headless la primera vez, o usa `REMOTION_BROWSER` | `npx hyperframes browser ensure`, o `HYPERFRAMES_BROWSER_PATH` |

Elige con `--engine` en `render` o `build`, o fija `render.engine` en `tutomatic.config.yaml`. Si renderizas con el motor que no es el predeterminado y ya existe un video, la salida se llama `<proyecto>.<motor>.mp4`, para que puedas comparar.

## Personalizar el look

- **Colores, tipografía, logo y radio de esquinas:** edita `brand.json` del proyecto. Afecta a ambos motores y a la miniatura.
- **Zoom por defecto, subtítulos quemados y marco de navegador:** `render.zoom`, `render.captions` y `render.browserFrame` en `tutomatic.config.yaml`.
- **Estructura** (nuevas escenas, lower thirds distintos, intro animada): Remotion en `Tutorial.tsx`, HyperFrames en `composeHtml()` de `src/engines/hyperframes.ts`. Si cambias uno, replica el cambio en el otro para mantenerlos equivalentes, o documenta que solo un motor lo tiene.
- **Lógica de cámara compartida:** `engines/shared/camera.ts`.

## Cambios puntuales en HyperFrames

`hf-project` escribe `build/hyperframes/` sin renderizar. Puedes editar `index.html` (o pedírselo a las skills de HyperFrames) y renderizar desde esa carpeta:

```bash
npx hyperframes render --quality high --output ../../output/final.mp4
```

Cuidado: `tutomatic render --engine hyperframes` regenera `index.html` desde el timeline y pisa esos cambios. Copia la carpeta si vas a editarla a mano.
