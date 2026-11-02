# CLAUDE.md — Presentador (nombre provisional)

Programa de proyección para iglesias: lo mejor de ProPresenter + FreeShow + el manejo de señales de Resolume, gratis y de código abierto.

## Quién trabaja aquí

- El dueño del proyecto (Isaac) **no es programador**. Construye con IA.
- Explica siempre en **español**, en pasos numerados y con comandos listos para copiar y pegar en **PowerShell**.
- Antes de una decisión grande (cambiar arquitectura, borrar código, agregar una dependencia pesada), **explica en 3 líneas y pregunta**.
- Al terminar cada tarea: qué cambió, cómo probarlo y qué sigue. Sin relleno.

## Base técnica

- Base: **fork de FreeShow** (https://github.com/ChurchApps/FreeShow). TypeScript + Svelte + Vite, aplicación de escritorio.
- Licencia: **GPL-3.0**. Este proyecto también debe ser GPL-3.0 y de código abierto. Se puede cobrar por servicios (instalación, soporte, nube), no por cerrar el código. Mantén los créditos y la licencia original.
- Sistema operativo objetivo: **Windows** primero (el PC de la iglesia). macOS después.
- Mantén el fork actualizable: los cambios propios van en **módulos separados** y se toca lo mínimo del código original. Anota en `CAMBIOS_AL_ORIGINAL.md` cada archivo de FreeShow que modifiques y por qué.

## Hardware real de la iglesia (CCMG)

- Tarjeta **Blackmagic DeckLink Duo 2**: 4 conectores SDI, usados como 4 salidas, hoy en 1080i59.94.
- Mapa actual (copiado de ProPresenter):

| Salida | Nombre | Grupo | Lleva | Pantalla física |
|---|---|---|---|---|
| SDI 1 | Background | Audiencia | Solo fondo | LED 6×2 (2016×672, gabinetes de 336×336) [por confirmar] |
| SDI 2 | Redes | Audiencia | Letra para transmisión | Streaming |
| SDI 3 | STAGE | Escenario | Letra + hora | 2 monitores al fondo de la sala [por confirmar] |
| SDI 4 | Video | Audiencia | Letra + fondo | Central + 2 laterales con distribuidor [por confirmar] |

- Por ahora **solo estas 4 salidas**. No hay NDI ni Resolume en el diseño actual.
- La DeckLink **no aparece como monitor en Windows**: se maneja con el Blackmagic Desktop Video SDK.

## Arquitectura (reglas que no se rompen)

1. **La salida en vivo nunca se cae por la interfaz.** El render de las salidas corre aparte de la ventana de edición. Si algo falla, la salida se queda en el último cuadro, nunca en negro ni con un error.
2. **Formato abierto:** canciones, looks, servicios y mapeos se guardan en JSON legible.
3. **Todo nuevo es un módulo** en `src/modulos/<nombre>/`, con su propio README de 10 líneas: qué hace, cómo se activa y cómo se prueba.
4. **Video por GPU** (WebGL) para mezcla, efectos y mapeo. Nada de procesar píxeles en JavaScript cuadro por cuadro.
5. **Rendimiento:** 60 cuadros por segundo estables con 2 capas de video 1080p en el PC de la iglesia. Si una función baja de eso, no entra.

## Fases

1. **Fase 1 — Base y auditoría:** el fork compila y corre en Windows. Auditoría de cómo FreeShow maneja salidas. Las 4 salidas DeckLink funcionan con el mapa de arriba.
2. **Fase 2 — Mezclador de fondos y efectos de letra:** capas, modos de mezcla, crossfade, efectos de entrada y salida de la letra, looks.
3. **Fase 3 — Enrutador y mapeo:** lienzo principal, recortes por salida, ajuste de esquinas, matriz de capas por salida, escenarios guardados.
4. **Fase 4 — IA:** letra a slides, bosquejo a slides, versículo en vivo con Whisper local, y Planning Center.
5. **Fase 5 — Equipo y nube:** modo voluntario, roles, control remoto, sincronización y biblioteca compartida.

No empieces una fase sin que la anterior esté probada en un ensayo real.

## Seguridad en vivo

- **Nunca** pruebes en el PC de la iglesia durante un servicio. ProPresenter sigue instalado como respaldo hasta que este programa pase al menos 4 ensayos sin fallas.
- Antes de cambiar la configuración de la DeckLink, anota la configuración actual para poder volver a ella.

## Git

- Una rama por tarea: `fase1/auditoria`, `fase1/salidas-decklink`, etc.
- Commits pequeños, con mensajes en español.
- Nunca subas claves, contraseñas ni datos de la iglesia al repositorio.
