# Proveedores de voz, música e imagen

Configúralos en `tutomatic.config.yaml` (`providers.tts`, `providers.music`, `providers.image`). Cada storyboard puede sobreescribir la voz y la música (`voice.provider`, `voice.voice`, `music.provider`, `music.prompt`…).

| tipo | proveedor | modelo por defecto | clave |
|---|---|---|---|
| voz | `google` | `gemini-3.8-flash-tts` (o `gemini-3.8-flash-lite-tts`, más barato) | `GEMINI_API_KEY` |
| voz | `elevenlabs` | `eleven_multilingual_v2` (`voice` = voice_id) | `ELEVENLABS_API_KEY` |
| voz | `openai` | `gpt-4o-mini-tts` (`style` → instructions) | `OPENAI_API_KEY` |
| voz | `voicestudio` | local, sin internet: `omnivoice` (o `voxcpm2`, `cosyvoice`…); `voice` = id del perfil clonado | — (la app VoiceStudio abierta) |
| música | `google` | `lyria-3.5` (pista larga) o `lyria-3-clip-preview` (30 s, se repite en bucle) | `GEMINI_API_KEY` |
| imagen | `google` | configurable (fondo de miniatura con `--ai`) | `GEMINI_API_KEY` |
| todos | `mock` | audio sintético, sin costo; sirve para ensayar timing | — |

`TUTO_PROVIDER=mock` fuerza mock en todo, sin tocar la configuración.

Los modelos de Google cambian seguido. Si un modelo da error 404 o "not found", revisa los nombres vigentes en https://ai.google.dev/gemini-api/docs/models y cámbialos en `tutomatic.config.yaml`. El código usa la Interactions API de `@google/genai` (`client.interactions.create`).

## VoiceStudio (voz local)

VoiceStudio corre en el PC del usuario y expone `POST /v1/audio/speech`, compatible con OpenAI, en `http://localhost:3900/v1`. Para usarlo:

```yaml
providers:
  tts:
    provider: voicestudio
    model: omnivoice                  # motor de VoiceStudio
    voice: <id del perfil>            # `tutomatic voices` lista los perfiles
    language: es                      # fijo, nunca "auto": evita que cambie de acento
    params: { guidance_scale: 2.5, num_step: 32, denoise: true }   # se envían tal cual a la API
    # url: http://localhost:3900/v1   # o VOICESTUDIO_URL en .env
    # instruct: "female, young adult, moderate pitch"   # opcional, en inglés; el `style` de Gemini no se envía
```

- Para usarlo una sola vez sin cambiar la configuración: `tutomatic build <p> --tts voicestudio` o `tutomatic voice <p> --tts voicestudio`.
- Un storyboard puede fijar su propia voz (`"voice": {"provider": "voicestudio", "voice": "<id>"}`), pero solo si el usuario pide otra voz para ese video. Si no, deja `voice.provider` y `voice.voice` fuera del storyboard: así cambiar de proveedor en `tutomatic.config.yaml` aplica a todos los proyectos.
- `tutomatic doctor` dice si VoiceStudio está abierto, y `tutomatic voices` lista sus voces. Si la app está cerrada, la voz falla con un mensaje claro. Antes de `build`, pide al usuario que la abra.
- `params` acepta cualquier campo que la app documente en Settings → OpenAPI Reference: `guidance_scale` (CFG), `num_step`, `denoise`, `duration`, `chunk_duration`, `chunk_threshold` y otros. Si cambias `params`, se regenera la voz (la caché los incluye).
- Licencia: los pesos por defecto de OmniVoice son CC BY-NC (no comerciales). Para videos de una empresa, avisa al usuario y sugiere un motor con licencia comercial o Gemini.
- El MCP de VoiceStudio (`http://localhost:3900/mcp`) sirve para que el agente pruebe voces o clone una (`clone_voice`, `generate_speech`, `list_voices`). El pipeline del video usa la API REST.

## Agregar un proveedor

1. Implementa la interfaz en `src/providers/types.ts` (`TTSProvider.synthesize`, `MusicProvider.generate` o `ImageProvider.generate`). El contrato es escribir un `.wav` (o `.png`) en `outFile`. Para normalizar cualquier formato, usa `ffmpeg([... '-ar','48000','-ac','2', outFile])`.
2. Regístralo en `src/providers/index.ts`.
3. Úsalo con `provider: <nombre>` en la configuración.

`src/providers/others.ts` (ElevenLabs y OpenAI con `fetch`, sin SDK) sirve de plantilla.

## Costos (orden de magnitud)

- Un tutorial de 1 minuto son unos 900 caracteres de narración. Con Gemini Flash TTS cuesta centavos de dólar.
- La caché por hash evita pagar dos veces la misma frase. `tutomatic voice --force` regenera todo.
- La música se genera una vez por prompt y se reutiliza (en bucle si es corta).
