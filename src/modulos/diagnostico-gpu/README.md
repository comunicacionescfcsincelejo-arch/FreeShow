# diagnostico-gpu

**Qué hace:** al arrancar FreeShow, escribe en la consola (y en `%APPDATA%\freeshow\diagnostico-gpu.log`) con qué tarjeta de video dibuja. Por ejemplo: `[GPU] FreeShow dibuja con: Intel(R) UHD Graphics 630 (8086:3e98)`. Si el PC tiene más de una tarjeta, lo dice y avisa: **no cambiar la GPU de FreeShow antes de la Parte G** de `DIA_DE_PRUEBA.md`.

**Por qué:** en el PC de la iglesia hay una Intel (con el monitor) y una NVIDIA. `osr-capture`, que copia el cuadro para la DeckLink, abre siempre la tarjeta por defecto de Windows. Si FreeShow dibuja con otra, las salidas DeckLink podrían fallar. Ver `PROTOTIPO_RENDER.md`.

**Cómo se activa:** solo, al arrancar (2 líneas en `src/electron/index.ts`, ver `CAMBIOS_AL_ORIGINAL.md`).

**Cómo se prueba:** `npx vitest run --config config/testing/vitest.config.ts src/modulos`. Al hacer `npm start`, buscar la línea `[GPU]` en la consola.
