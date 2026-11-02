# Cambios al código original de FreeShow

Aquí se anota **cada archivo original de FreeShow que modifiquemos**, y por qué. Sirve para poder actualizar el fork cuando FreeShow saque versiones nuevas.

Base del fork: **FreeShow 1.6.8-beta.2** (commit `bed0f247`).

## Archivos originales modificados

| Fecha | Archivo | Rama | Qué se cambió | Por qué |
|---|---|---|---|---|
| 2026-11-02 | `src/electron/blackmagic/BlackmagicSender.ts` | `fase1-5/robustez` | Las muestras de audio por cuadro se calculan con el módulo `src/modulos/audio-decklink`, usando la duración real del cuadro que reporta la tarjeta (`playback.frameRate`) y una cadencia exacta (1602/1601/… en 29.97). El audio de los cuadros que la tarjeta salta se descarta. El silencio se entrega con el tamaño exacto de cada cuadro. | En 1080i59.94 se mandaba la mitad del audio por cuadro (801 en vez de ~1601,6): cortes en el audio por SDI. Sin cadencia, el audio se desfasaba poco a poco, y al saltar cuadros se acumulaba retraso. |
| 2026-11-02 | `src/electron/audio/processAudio.ts` | `fase1-5/robustez` | El audio que va a la DeckLink se convierte a 48 kHz (una sola conversión, compartida con Icecast). | Si Windows tiene el audio a 44,1 kHz, la DeckLink recibía audio a la velocidad equivocada. |
| 2026-11-02 | `config/building/electron-builder.yaml` | `fase1-5/robustez` | Se agregó `build/modulos/**` a los archivos del instalador. | Sin esto, los módulos de `src/modulos/` funcionan con `npm start` pero faltan en el instalador. |

| 2026-11-02 | `src/electron/index.ts` | `fase1-5/robustez` | 2 líneas para importar y arrancar el módulo `src/modulos/vigilante-salidas` (y 1 de comentario). Nada más del archivo cambió. | Vigilante de salidas: recarga sola una salida caída o congelada, manteniendo el último cuadro. Todo lo demás vive en el módulo, que escucha eventos que ya existen (`render-process-gone`, mensajes `OUTPUT`/`STARTUP`) sin tocar el código de salidas. |

| 2026-11-02 | `src/electron/index.ts` | `fase1-5/robustez` | Otras 2 líneas (y 1 de comentario) para importar y arrancar `src/modulos/modo-servicio/motor`. | Modo servicio: guardar su estado y bloquear el cierre. |
| 2026-11-02 | `src/electron/utils/close.ts` | `fase1-5/robustez` | 1 import + 1 línea al inicio de `callClose()`: `if (bloquearCierreModoServicio(e)) return`. | Bloquea la X de Windows / Alt+F4 antes de que FreeShow empiece a cerrar. |
| 2026-11-02 | `src/frontend/utils/save.ts` | `fase1-5/robustez` | 1 import + 1 línea al inicio de `initializeClosing()`: `if (bloquearCierrePorModoServicio()) return`. | Bloquea el botón y el menú "Cerrar" de FreeShow antes de que detenga grabaciones, el control remoto, etc. |
| 2026-11-02 | `src/frontend/MainLayout.svelte` | `fase1-5/robustez` | 1 import + `<ModoServicio />` después del contenido. | Muestra el indicador, el marco rojo y el aviso del modo servicio. |

> Los arreglos de audio conviene proponerlos a FreeShow (pull request), para dejar de mantenerlos aquí.

> Los archivos nuevos del proyecto no cuentan como cambios al original: `CLAUDE.md`, `INSTALAR_WINDOWS.md`, `AUDITORIA.md`, este archivo, los planes `*_PLAN.md` y todo lo que esté en `src/modulos/`.

## Arreglos fuera del repositorio

Estos se hacen dentro de `node_modules`, que no se guarda en Git, y hay que repetirlos tras cada `npm install`. Detalle en `INSTALAR_WINDOWS.md`, sección 3.

- Descarga manual de Electron (`node node_modules\electron\install.js`).
- Recompilar `@discordjs/opus` para Electron 45.

---

## Configuración de referencia de la DeckLink (PC de la iglesia)

Es la configuración **actual**, antes de cualquier cambio, para poder volver a ella. Viene de ProPresenter y de Blackmagic Desktop Video Setup.

> ⚠️ **Este PC es el de la iglesia** (el mismo donde corre ProPresenter). Reglas:
> - Nunca usar la DeckLink mientras ProPresenter esté abierto. Preguntar antes de cada prueba de salida.
> - No cambiar nada en Blackmagic Desktop Video Setup.
> - No tocar ni desinstalar ProPresenter.

- **Tarjeta:** Blackmagic DeckLink Duo 2
- **Conectores:** los 4 configurados como **salida**
- **Modo de video:** **1080i59.94** en los 4 mientras ProPresenter los usa. En reposo muestran **NTSC**, y eso es normal.
- **Driver:** Blackmagic Desktop Video, en `C:\Program Files\Blackmagic Design\Blackmagic Desktop Video\`. Versión del SDK (DeckLink API): **16.5.0**.

| Conector | Nombre en ProPresenter | Grupo | Lleva |
|---|---|---|---|
| SDI 1 | Background | Audiencia | Solo fondo |
| SDI 2 | Redes | Audiencia | Letra para transmisión |
| SDI 3 | STAGE | Escenario | Letra + hora |
| SDI 4 | Video | Audiencia | Letra + fondo |

### Configuración de pantallas en ProPresenter (de capturas de "Configuración de la pantalla")

| Pantalla ProPresenter | Grupo | Dispositivo | Modo | Formato | Retraso | Objetivo |
|---|---|---|---|---|---|---|
| Background | Audiencia | DeckLink Duo (1) | 1080i59.94 | DSE | 0 cuadros | Completo |
| Redes | Audiencia | DeckLink Duo (2) | 1080i59.94 | DSE | 0 cuadros | Completo |
| STAGE | Escenario | DeckLink Duo (3) | 1080i59.94 | DSE | 0 cuadros | Completo |
| Video | Audiencia | DeckLink Duo (4) | 1080i59.94 | DSE | 0 cuadros | Completo |

- Las pantallas de **Audiencia** tienen las pestañas **Hardware, Color, Ajuste de esquina y Clave alfa**. **STAGE** solo tiene **Hardware**.
- También existen **"RESOLUME"** (Audiencia, por NDI) y **"Pantalla del escenario"** (Escenario). Ninguna de las dos usa la DeckLink.
- **"Formato: DSE"** es muy probablemente la traducción al español de **SDR** (rango dinámico estándar, Rec. 709), frente a HDR. Falta confirmarlo abriendo el menú en ProPresenter. El equivalente en FreeShow es el interruptor **"SDR"** de la salida Blackmagic, que viene activado por defecto.
- **Clave alfa:** con el perfil actual (4 conectores independientes), la tarjeta reporta que **ningún conector soporta clave alfa** (comprobado con FreeShow). Así que hoy ProPresenter **no** está sacando fill + key por la DeckLink.

### Lo que detecta FreeShow (2 de noviembre de 2026, solo lectura, sin enviar video, con ProPresenter cerrado)

| Índice | Nombre que muestra FreeShow | ID del dispositivo | Sub-dispositivo | ¿Ofrece 1080i59.94? |
|---|---|---|---|---|
| 0 | DeckLink Duo (1) | `81:0145bbf0:00000000` | 1 de 4 | Sí |
| 1 | DeckLink Duo (2) | `81:0145bbf1:00000000` | 2 de 4 | Sí |
| 2 | DeckLink Duo (3) | `81:0145bbf2:00000000` | 3 de 4 | Sí |
| 3 | DeckLink Duo (4) | `81:0145bbf3:00000000` | 4 de 4 | Sí |

Cada conector ofrece 16 modos de salida y los formatos 8/10-bit YUV, 8-bit ARGB/BGRA y RGB de 10/12 bits.

> FreeShow y ProPresenter muestran **los mismos nombres** ("DeckLink Duo (1)" a "(4)"), así que el mapa se copia directo: Duo (1) → Background, Duo (2) → Redes, Duo (3) → STAGE, Duo (4) → Video.
>
> Falta confirmar que "DeckLink Duo (1)" sea el conector físico **SDI 1**, y así con los demás. En la documentación de Blackmagic, el orden interno de los dispositivos no siempre coincide con el número del conector. Se comprueba en la primera prueba de salida, con permiso y con ProPresenter cerrado.

**Falta anotar el día de la prueba,** con fotos de Desktop Video Setup y sin cambiar nada:

- [ ] Perfil de la Duo 2 (por ejemplo "4 half duplex")
- [ ] Formato de color que usa ProPresenter en cada conector
- [ ] Si el audio sale por SDI
