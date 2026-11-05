# Solución de problemas

**`spawn …ffmpeg.exe ENOENT` / "No encuentro FFmpeg".** El binario de `ffmpeg-static` no se descargó (red, antivirus o `npm --ignore-scripts`). Hay tres arreglos:
- `npm rebuild ffmpeg-static ffprobe-static`;
- instalar FFmpeg en el sistema (`winget install Gyan.FFmpeg`), que el CLI usa solo si no encuentra el otro;
- poner `FFMPEG_PATH`/`FFPROBE_PATH` en `.env`.

`build` y `record` verifican FFmpeg antes de grabar. Si falla justo al ensamblar, la grabación queda guardada: `tutomatic record <p> --reassemble` y luego `tutomatic build <p> --skip-record` terminan sin repetir las acciones en la app.

**Un paso falla al grabar (`Timeout … waiting for …`).** El build se detiene y guarda una captura en `build/record-fail/<paso>.png`, con los mensajes que la app mostraba en ese momento. Mira la captura antes de cambiar el storyboard: muchas veces el problema es de la app (un error del servidor, un dato que ya existe) y no del selector. Si el paso enviaba datos (crear, confirmar), revisa en la app si se creó o falló antes de grabar otra vez, para no duplicar registros. La grabación anterior queda intacta.

**`doctor` dice que Chromium no está disponible.** Ejecuta `npx playwright install chromium`. En redes corporativas, define `TUTO_CHROME` con la ruta de un Chrome instalado.

**Remotion se queda descargando el navegador, o falla al iniciarlo.** Define `REMOTION_BROWSER` con la ruta de un Chrome o un chrome-headless-shell, o prueba `--engine hyperframes`.

**HyperFrames: "Chrome Headless Shell is required".** Ejecuta `npx hyperframes browser ensure`, o define `HYPERFRAMES_BROWSER_PATH`.

**El screencast no produjo cuadros.** Cambia a `recorder.mode: playwright` en `tutomatic.config.yaml`. Usa el grabador nativo de Playwright, con menos calidad pero más compatible.

**Render lento / usar la tarjeta gráfica.** `render.gpu: auto` (en `tutomatic.config.yaml`) prueba la GPU con una codificación real de 1 s y la usa si responde:

| Tarjeta | Codificador |
|---|---|
| NVIDIA | `h264_nvenc` |
| AMD | `h264_amf` (Windows), `h264_vaapi` (Linux) |
| Intel | `h264_qsv` (Windows), `h264_vaapi` (Linux) |
| Mac | `h264_videotoolbox` |

Además, Chrome dibuja los cuadros con la GPU (ANGLE). Si tu FFmpeg no trae esos codificadores, `doctor` lo dice: define `FFMPEG_PATH` con un FFmpeg completo (p. ej. el build "full" de gyan.dev en Windows). Para forzar o apagar la GPU usa `--gpu nvenc|amf|qsv|videotoolbox|vaapi|off`. Sin GPU ayudan dos cosas: `--draft` para los borradores y `render.encoderPreset: ultrafast`. La parte más lenta es que Chrome dibuje cada cuadro, así que sube `render.concurrency` si tienes muchos núcleos.

**Un paso abre una pestaña nueva.** El grabador sigue la pestaña original. Usa un `goto` a la URL de la nueva pestaña, o pide que el enlace abra en la misma.

**Animaciones de la app que tardan.** Pon `waitFor` con un selector del contenido final, o un paso `wait` con `ms`.

**Elementos dentro de un iframe.** Usa un selector de Playwright con `>>`: `iframe#pago >> internal:control=enter-frame >> role=button[name="Pagar"]`. Si no funciona, sáltate ese tramo.

**Dropdowns personalizados (no `<select>`).** Usa dos pasos: un `click` en el disparador y otro `click` en la opción (`role:option|Bogotá`).

**El video se ve borroso al hacer zoom.** Baja el viewport (1280×720) o el zoom (1.4). La grabación se escala al marco, así que los zooms de más de 2x sobre 1440×810 pierden nitidez.

**La voz suena cortada al inicio.** El recorte de silencios es agresivo. Agrega `voiceDelay` o empieza la frase con una palabra de arranque.

**Windows y rutas con espacios.** El CLI no usa shell para lanzar procesos, así que las rutas con espacios funcionan. En PowerShell, las variables se definen con `$env:VAR="valor"`.

**Las credenciales aparecen en logs.** No deberían: los valores `${VAR}` se resuelven en memoria. Si ves una contraseña en un archivo del proyecto, avísale al usuario y bórrala.
