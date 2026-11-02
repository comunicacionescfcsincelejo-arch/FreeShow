# audio-decklink

**Qué hace:** calcula cuántas muestras de audio (48 kHz) lleva cada cuadro que se manda a la DeckLink, usando la duración real del cuadro que reporta la tarjeta. En 1080i59.94 y 1080p29.97 da la secuencia 1602/1601/1602/1601/1602 (8008 cada 5 cuadros); en 1080p59.94, 4004 cada 5. Nunca se desfasa.

**Por qué:** FreeShow calculaba el audio desde el nombre del modo, y en los modos entrelazados ("1080i59.94") mandaba la mitad del audio por cuadro.

**Cómo se activa:** solo, con cualquier salida Blackmagic. Lo usa `src/electron/blackmagic/BlackmagicSender.ts` (ver `CAMBIOS_AL_ORIGINAL.md`).

**Cómo se prueba:** `npx vitest run --config config/testing/vitest.config.ts src/modulos`. La prueba con la tarjeta real está descrita en `ROBUSTEZ_PLAN.md`, punto 4.
