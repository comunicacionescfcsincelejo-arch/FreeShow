# vigilante-salidas

**Qué hace:** si una salida se cae (su proceso muere) o se congela (no responde durante 15 s), la recarga sola. Mientras se recarga, una salida invisible (DeckLink, NDI) deja de pintar, así la tarjeta repite el último cuadro bueno: nunca negro ni pantalla de error. Vuelve a pintar cuando la página tiene contenido otra vez y sus animaciones de entrada ya terminaron. Si la interfaz también está caída, repone el contenido desde una copia guardada. Tras 5 caídas en 10 minutos deja de intentar y la salida se queda en el último cuadro.

**Cómo se activa:** solo, al arrancar FreeShow (una línea en `src/electron/index.ts`, ver `CAMBIOS_AL_ORIGINAL.md`). Escribe lo que pasa en la consola (`[VIGILANTE]`) y en `vigilante-salidas.log`, dentro de la carpeta de datos de FreeShow (`%APPDATA%\freeshow`).

**Límite conocido:** una salida en un monitor normal (no invisible) también se recarga, pero no se puede congelar: durante esos 2–3 segundos el monitor puede verse vacío. En la iglesia todas las salidas son DeckLink (invisibles), así que no aplica.

**Para ensayos:** arrancar con `$env:FS_VIGILANTE_PRUEBA=1; npm start`. Entonces `Ctrl+Alt+Shift+K` tumba todas las salidas y `Ctrl+Alt+Shift+J` las congela. Sin esa variable, los atajos no existen.

**Cómo se prueba:**

- `npx vitest run --config config/testing/vitest.config.ts src/modulos` (lógica, simulando caídas y congelamientos).
- Con Electron real (sin DeckLink): `npx tsc -p config/typescript/tsconfig.electron.json`, y luego `npx playwright test --config src/modulos/playwright.config.ts`.
- Con la tarjeta: ver `DIA_DE_PRUEBA.md`.
