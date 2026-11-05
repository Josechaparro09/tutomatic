# Guía de narración

La voz es lo que más delata un tutorial hecho a la carrera. Escribe como hablaría una persona que le muestra la app a un colega, no como un manual.

## Reglas

- **Una idea por frase.** Mejor entre 8 y 20 palabras. Si un paso necesita más de dos frases, probablemente son dos pasos.
- **Di para qué, no solo qué.** En lugar de "Haz clic en Exportar", di "Para llevarte el reporte a Excel, haz clic en Exportar". El *para qué* es lo que el usuario recuerda.
- **Nombra la interfaz como se ve.** Si el botón dice "Nueva factura", di "Nueva factura", no "el botón de crear".
- **Segunda persona, tuteo o usteo según la audiencia.** Para Colombia, el tuteo suena cercano; el usteo, formal. Pregúntale al usuario si no es obvio y sé consistente.
- **Nada de muletillas de manual**, como "A continuación procederemos a…" o "Como podemos observar…".
- **No narres lo obvio** ("ahora movemos el mouse"). Narra la intención y el resultado.
- **Intro de 1 o 2 frases:** qué va a aprender y por qué le sirve. **Outro de 1 o 2 frases:** qué logró y el siguiente paso.

## Cómo se leen números y símbolos

El texto de la voz es una transcripción literal: el modelo lee lo que escribes.

- Dinero: escribe "novecientos cincuenta mil pesos", o al menos "950.000 pesos". Si escribes "$950000", el modelo puede leer mal.
- Siglas: "N.º" → "número"; "COP" → "pesos colombianos"; "IVA" se lee bien.
- URLs: no las dictes completas. Di "en la página de ajustes".
- Emojis y símbolos de la UI (🧾, ＋): nunca en la narración, solo en los selectores.

## Pausas y énfasis (Gemini TTS)

- En Gemini 3.x TTS puedes usar etiquetas en línea para momentos puntuales: `<short pause>`, `<laugh>`, `<sigh>`. Úsalas con moderación; una pausa antes del resultado clave funciona bien.
- El tono sostenido no va en el texto: va en `voice.style` (storyboard) o en `providers.tts.style` (tutomatic.config.yaml). Ejemplo:
  `"Narrador de tutorial: cálido, claro, ritmo pausado, español latinoamericano neutro, sonriendo."`
- Voces prebuilt de Gemini (30): Kore (firme, clara), Puck (animada), Charon (informativa), Aoede (ligera), Leda (juvenil), Orus (firme), Zephyr (brillante), Achird (amable), Sulafat (cálida), entre otras. Kore y Charon funcionan bien para tutoriales.

## Ritmo

A unas 14 letras por segundo, una frase de 60 caracteres dura unos 4 segundos. Un tutorial de 8 a 12 pasos queda en 45–90 s: ese es el punto ideal. Si pasa de 3 minutos, propón dividirlo en varios videos (un objetivo por video).

## Subtítulos

Los subtítulos se generan de la narración, partidos en líneas de 42 caracteres como máximo. Si quieres un corte limpio, usa frases cortas con puntuación; el divisor respeta los puntos, comas y signos de interrogación.
