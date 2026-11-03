# motor-render (prototipo, fase 2)

**Qué hace:** prototipo del motor de render por GPU (opción B de `ROBUSTEZ_PLAN.md`), escrito en WebGL2 puro, sin librerías.

- Un lienzo compone capas de video, imagen o texto, con **crossfade** entre dos fondos y **6 modos de mezcla**: normal, sumar, multiplicar, pantalla, superponer y diferencia.
- Aplica **ajuste de 4 esquinas** sobre una capa.
- En modo **maestro** dibuja las 4 salidas del mapa en un lienzo de 3840×2160, decodificando cada video una sola vez.
- Todavía **no está conectado a FreeShow**: corre en una ventana de prueba y **nunca usa la DeckLink**.

**Cómo se usa** (con PowerShell, en `C:\proyectos\FreeShow`):

1. Crear los videos de prueba (1080p, H.264): `npx electron src/modulos/motor-render/prototipo/main.cjs generar --gpu=alta`
2. Verlo funcionar, con los datos en pantalla: `npx electron src/modulos/motor-render/prototipo/main.cjs demo` (agregar `--escena=maestro` para ver las 4 salidas, o `--gpu=alta` para usar la NVIDIA).
3. Medir: `npx electron src/modulos/motor-render/prototipo/main.cjs medir --nombre=x --escena=una --ventana=invisible --captura=30`. El resultado queda en `prototipo/resultados/x.json`.

**Cómo se prueba:** `npx vitest run --config config/testing/vitest.config.ts src/modulos` (la matemática del ajuste de esquinas). Los números medidos están en `PROTOTIPO_RENDER.md`.
