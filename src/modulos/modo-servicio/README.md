# modo-servicio

**Qué hace:** mientras el modo servicio está activo, la ventana de edición **no se puede cerrar**. No la cierran la X de Windows, Alt+F4, ni el botón o el menú "Cerrar" de FreeShow.
- Al intentarlo aparece: *"Modo servicio activo. Las salidas están al aire. Desactiva el modo servicio para cerrar."*, con el botón "Desactivar modo servicio", que pide confirmación.
- Si la interfaz está caída o congelada, el mismo aviso lo muestra Windows.
- Se ve claro en pantalla: un marco rojo alrededor de toda la ventana y la etiqueta roja **MODO SERVICIO desde HH:MM**, abajo a la derecha.
- El estado se guarda en `modo-servicio.json` (en `%APPDATA%\freeshow`). Si FreeShow se reinicia, vuelve activo.

**Cómo se activa:** clic en "Activar modo servicio", abajo a la derecha de la ventana de edición. Para desactivarlo: clic en la etiqueta roja → "Sí, desactivar".

**Enganches en el original** (ver `CAMBIOS_AL_ORIGINAL.md`): `src/electron/index.ts`, `src/electron/utils/close.ts`, `src/frontend/utils/save.ts` y `src/frontend/MainLayout.svelte`, con 1 o 2 líneas cada uno.

**Cómo se prueba:**
- `npx vitest run --config config/testing/vitest.config.ts src/modulos` (lógica).
- Con Electron real: `npx tsc -p config/typescript/tsconfig.electron.json`, y luego `npx playwright test --config src/modulos/playwright.config.ts`.
- En el PC de la iglesia: `DIA_DE_PRUEBA.md`.
