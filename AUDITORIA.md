# Auditoría de FreeShow — Fase 1

Versión revisada: **FreeShow 1.6.8-beta.2** (Electron 45), en la rama `fase1/auditoria`.
Escrita para alguien que no programa. Los nombres de archivo están entre `comillas` por si un programador necesita ir directo al lugar.

---

## Resumen en 6 puntos

1. **FreeShow ya soporta la DeckLink.** Puede manejar las 4 salidas SDI de la Duo 2, cada una como una salida independiente. No hay que programar el soporte desde cero.
2. **Ya soporta NDI** (y OMT, otro protocolo de red). Por ahora no lo usamos.
3. **La proyección está en parte separada de la interfaz.** Si la ventana de edición se congela, las salidas se quedan en el último cuadro, sin irse a negro. Hay tres puntos débiles, explicados en la sección 4.
4. **Encontré un probable error de audio en modos entrelazados como 1080i59.94**, que es justo el modo de la iglesia. Hay que comprobarlo con la tarjeta real.
5. **Todo se dibuja como página web** (HTML/CSS). No hay un motor WebGL para mezclar capas. Las fases 2 y 3 tendrán que agregarlo.
6. **Los módulos nuevos se pueden agregar en `src/modulos/` tocando pocas líneas del original.**

---

## 1. Cómo está organizado FreeShow

FreeShow es una aplicación **Electron**, es decir, una página web empaquetada como programa de escritorio. Funciona con dos tipos de procesos:

- **El proceso principal**, que es el "motor": abre ventanas, guarda archivos y habla con la DeckLink.
- **Las ventanas**: la de edición y una por cada salida. Cada una es como una pestaña de navegador independiente.

| Carpeta | Para qué sirve |
|---|---|
| `src/electron/` | El motor (proceso principal). Abre ventanas, guarda datos, maneja salidas, DeckLink, NDI, audio y servidores. |
| `src/electron/output/` | Crea y administra las **ventanas de salida**. |
| `src/electron/capture/` | **Captura** cada cuadro de una salida para mandarlo a la DeckLink, NDI o streaming. |
| `src/electron/blackmagic/` | Todo lo de **Blackmagic DeckLink**. |
| `src/electron/ndi/`, `src/electron/omt/` | Envío por **NDI** y por **OMT**. |
| `src/electron/data/` | Guardado de configuración y datos. |
| `src/frontend/` | La **interfaz** que ve el operador, y también lo que se dibuja dentro de cada salida. Está hecha en Svelte. |
| `src/frontend/components/output/` | Cómo se dibuja una salida, por capas: fondo, letra, efectos, overlays. |
| `src/frontend/components/stage/` | La pantalla de escenario (Stage). |
| `src/frontend/components/settings/` | Las pantallas de configuración, incluida la de Salidas. |
| `src/server/` | Páginas web que se abren desde otro dispositivo: control remoto (puerto 5510), escenario (5511), controlador (5512) y otras. |
| `src/types/` | La "forma" de los datos: qué campos tiene una salida, una canción, etc. |
| `public/` | Archivos fijos: página base, idiomas, fuentes, íconos. |
| `scripts/` | Programas que arrancan y compilan el proyecto (`npm start`, `npm run build`). |
| `config/` | Configuración de compilación, empaquetado del instalador, TypeScript y revisión de código. |

**Tamaño:** cerca de 1.040 archivos de código (487 `.ts` y 550 `.svelte`).

### Dónde se guardan los datos (todo en JSON legible ✅)

- **Canciones:** archivos `.show` en `Documentos\FreeShow\Shows\`. Cada uno es texto JSON.
- **Configuración y salidas:** `settings.json` en `%APPDATA%\freeshow\`.
- **Layouts de escenario, overlays, plantillas y proyectos:** `Documentos\FreeShow\Config\`.

Esto ya cumple la regla de "formato abierto" del proyecto.

---

## 2. Cómo crea y maneja las ventanas de salida

1. Cada salida configurada (en **Configuración → Salidas**) es **su propia ventana**. Corre en su propio proceso, separado de la ventana de edición.
   - El archivo que las crea es `src/electron/output/helpers/OutputLifecycle.ts`.
2. Una salida puede ser de varios tipos:
   - **Ventana normal** en un monitor de Windows.
   - **Invisible**: no se muestra en ningún monitor y solo se captura para enviarla. Las salidas **Blackmagic siempre son invisibles**, porque la DeckLink no es un monitor.
   - Además, a cualquier salida se le puede sumar una salida de red (NDI, OMT, WebRTC o RTMP).
3. **Cómo llega el contenido a la salida:** cuando el operador cambia de slide en la ventana de edición, esa ventana envía el cambio al motor y el motor lo reenvía a cada salida. Cada salida se dibuja sola con esa información.
   - Archivos: `src/frontend/utils/listeners.ts`, `src/electron/output/helpers/OutputSend.ts` y `src/frontend/utils/receivers.ts`.
4. **Cómo se dibuja una salida**, de abajo hacia arriba: fondo del estilo → fondo (video o imagen) → efectos → overlays de fondo → **letra** → efectos encima → overlays.
   - Archivo: `src/frontend/components/output/Output.svelte`.
5. **Estilos:** cada salida usa un "estilo" que define qué capas muestra: *fondo*, *letra* y/o *overlays*. **Así se arma nuestro mapa**, que es lo que en ProPresenter haces con los "Looks":

   | Salida | Capas que muestra |
   |---|---|
   | SDI 1 Background | solo *fondo* |
   | SDI 2 Redes | solo *letra* (y overlays) |
   | SDI 3 STAGE | es una salida tipo **Stage**, con un layout que muestra letra + hora |
   | SDI 4 Video | *fondo* + *letra* |

6. **Grupos de salidas (Audiencia / Escenario):** **FreeShow no tiene grupos como ProPresenter.** Los nombres se pueden poner igual, pero el "grupo" no existe como tal. Si hace falta, sería un módulo nuestro (fase 3, en el enrutador).
7. **Lo que ya existe para el mapeo:**
   - **Recorte** por salida (arriba, abajo, izquierda, derecha).
   - **Edge blending**, el degradado en los bordes para unir proyectores.
   - **Resolución forzada.**
   - **No existe** ajuste de esquinas (corner pin ni keystone), ni deformación.

---

## 3. Soporte de Blackmagic DeckLink y NDI

### DeckLink: **sí, ya está soportada** ✅

- Usa la librería **`macadam`**, que habla con el driver Blackmagic Desktop Video. Archivos:
  - `src/electron/blackmagic/` (`BlackmagicSender.ts`, `BlackmagicManager.ts`, `bmdTalk.ts`, `bmdFormats.ts`).
  - Configuración en pantalla: `src/frontend/components/settings/tabs/Outputs.svelte`.
  - Al crear la salida: `src/frontend/components/main/popups/OutputSetup.svelte`.
- **Cada conector de la Duo 2 aparece como un dispositivo aparte.** Así podemos tener **4 salidas FreeShow → 4 SDI**.
  - FreeShow no deja que dos salidas usen el mismo conector.
  - **Requisito:** en *Blackmagic Desktop Video Setup*, la Duo 2 debe estar en el perfil de **4 conectores independientes** (*half duplex*). FreeShow no cambia ese perfil: se hace en el programa de Blackmagic, que es lo mismo que exige ProPresenter.
- **Modos de video:** soporta **1080i59.94** (el que usa la iglesia), 1080i50, 1080p, 720p, 4K y más. Solo ofrece los modos que la tarjeta reporta.
- **Formatos de color:** 8 y 10 bits YUV, RGB, ARGB/BGRA.
  - **Recomendado: 8-bit YUV.** Es el que convierte la tarjeta de video (GPU) y no gasta procesador.
  - Los formatos RGB de 10/12 bits se convierten en JavaScript, lo que va contra la regla 4 del proyecto.
- **Key (transparencia):** existe la opción "Alpha key" si la tarjeta lo soporta. Solo funciona en 8-bit ARGB/BGRA y no deja escoger entre key interno y externo. En el mapa actual no la necesitamos.
- **Audio:** manda audio estéreo a 48 kHz por las salidas Blackmagic. Las 4 reciben la misma mezcla.
- **Si llegan cuadros tarde,** la DeckLink **repite el último cuadro** en vez de irse a negro ✅.

### ⚠️ Probable error con 1080i59.94 (hay que confirmarlo con la tarjeta)

- **En 1080i59.94 el audio de la DeckLink podría sonar cortado o con silencios.**
- **Por qué:** cada cuadro dura 1/29.97 de segundo, pero FreeShow calcula el audio como si durara 1/59.94. Así manda la mitad del audio necesario por cuadro.
  - Dónde está: `src/electron/blackmagic/BlackmagicSender.ts`, función `resolveFrameRates` y donde se usa `expectedAudioSampleCount`.
- **Solo afecta si mandamos audio por SDI.** Si el audio va por la consola de sonido y no por la DeckLink, no importa.
- **Qué hacer:** probarlo en un ensayo (no en un servicio). Si se confirma, corregirlo en la fase `fase1/salidas-decklink` y reportarlo a FreeShow para que lo arreglen también allá.

### Otros detalles de video entrelazado

FreeShow dibuja cuadros completos a 29.97 por segundo y los manda como entrelazados. **Los dos campos de cada cuadro son del mismo instante**, así que el movimiento se ve como "1080 PsF".

- En **letra y fondos lentos** no se nota.
- En **videos con mucho movimiento** se puede ver un poco menos fluido que una fuente entrelazada real.
- Vale la pena comparar con ProPresenter en el ensayo.

### NDI: **sí, ya está soportado** ✅

- Usa la librería **`grandiose`**. Archivos: `src/electron/ndi/`. También soporta **OMT** (`src/electron/omt/`).
- Detalle: en NDI solo deja escoger cuadros por segundo enteros (30, 60…), no 29.97 ni 59.94. No nos afecta, porque no usamos NDI por ahora.

---

## 4. ¿La salida en vivo corre separada de la interfaz?

**Respuesta corta: en parte sí, pero no del todo. Hay tres riesgos reales.**

### Lo que está bien ✅
- Cada salida es su **propio proceso**, separado de la ventana de edición.
- Si la ventana de edición **se congela o se cae**, las salidas **se quedan mostrando lo último** (los videos que estaban corriendo siguen corriendo). **No se van a negro.**
- La DeckLink tiene su propio "reloj": si no llega un cuadro nuevo, **repite el último**.

### Los riesgos ⚠️

1. **Si se cierra la ventana de edición, se cierran todas las salidas.** Pasa si alguien la cierra sin querer, o si el programa se cierra por un error.
   - Archivo: `src/electron/utils/close.ts`.
2. **El envío a la DeckLink corre dentro del proceso principal** (en un "hilo trabajador" compartido con NDI). Si la librería de la DeckLink o la de captura **falla gravemente**, **se cae el programa entero**: interfaz y salidas juntas.
   - En ese caso las salidas SDI quedarían como las deje la tarjeta, probablemente en negro.
3. **Nadie vigila las ventanas.** FreeShow no detecta si una salida o la interfaz "se murió" y no las vuelve a abrir solo.
   - Si la interfaz se cae, las salidas siguen con el último cuadro, pero **ya no se puede cambiar nada** hasta reiniciar el programa.

### Qué significa para nosotros

- La **regla 1** del proyecto ("la salida nunca se cae por la interfaz") **no se cumple al 100% hoy**.
- Se puede mejorar en pasos, con módulos propios:
  - **(a)** Un "vigilante" que detecte ventanas caídas y las reabra.
  - **(b)** Pedir confirmación antes de cerrar la ventana de edición durante un servicio.
  - **(c)** Más adelante, mover el envío a la DeckLink a un proceso aparte. FreeShow ya hace eso para las **entradas** (`src/electron/capture/StreamReceiverHost.ts`), así que existe un modelo a seguir.
- **(a)** y **(b)** son cambios pequeños. **(c)** es un cambio grande, y lo consultaría antes de hacerlo.

---

## 5. Dónde agregar nuestros módulos (`src/modulos/`)

- **FreeShow no tiene sistema de plugins.** Pero la compilación incluye cualquier archivo que se "importe" desde el código original. Así que se puede crear `src/modulos/<nombre>/` y conectarlo con **una línea de importación** en el lugar correcto.
- **Puntos de enganche recomendados** (cada uno es 1 a 3 líneas en el original, y se anota en `CAMBIOS_AL_ORIGINAL.md`):

  | Para… | Se engancha en |
  |---|---|
  | Lógica del motor (vigilante de ventanas, DeckLink, enrutador) | `src/electron/index.ts`, al arrancar |
  | Comunicación interfaz ↔ motor | un canal propio con `ipcMain.on`, como ya hace `src/electron/streaming/WebRtcHost.ts`. Así no hay que tocar la lista central de mensajes. |
  | Capas nuevas en la salida (mezclador GPU, efectos de letra) | `src/frontend/components/output/Output.svelte`: una línea que inserte nuestro componente |
  | Pantallas de configuración propias | `src/frontend/values/tabs.ts` y `src/frontend/components/settings/Settings.svelte` |

- **Para que la revisión de tipos y de estilo incluya la carpeta,** hay que agregar `../modulos` en dos archivos de configuración de TypeScript y en los comandos de revisión. Son cambios de configuración pequeños.
- **Regla práctica:** separar en cada módulo lo que corre en el motor (`motor/`) de lo que corre en la interfaz o la salida (`interfaz/`). El compilador del motor no entiende archivos `.svelte`.

---

## 6. Riesgos y limitaciones para las fases 2 y 3

### Fase 2 — Mezclador de fondos por GPU y efectos de letra

1. **No hay motor WebGL.** Fondos y letra son elementos de página web (`<video>`, `<img>`, texto con CSS).
   - El navegador ya los dibuja con la GPU, pero no permite mezclas por shader, keys ni efectos a medida.
   - **Plan:** un módulo con un lienzo WebGL como **capa nueva** dentro de `Output.svelte`, que reemplace la capa de fondo cuando esté activo.
2. **Ya existen cosas parecidas que podemos aprovechar:**
   - Fundido entre dos fondos (`Background.svelte`).
   - Modos de mezcla y filtros CSS en videos.
   - Transiciones de letra: fade, blur, spin, scale, slide (`src/frontend/utils/transitions.ts`).
   - Efectos de partículas en canvas 2D (`src/frontend/components/output/effects/`). No es GPU real, ojo con el rendimiento.
3. **Cada salida decodifica su propio video.** Con 4 salidas, un fondo puede decodificarse hasta 4 veces.
   - FreeShow ya intenta compartir el render entre salidas iguales y tiene "capas de media compartidas" (`src/electron/output/helpers/MediaLayers.ts`), pero **las salidas Blackmagic no comparten render**.
   - **Es el mayor riesgo para la meta de 60 cps con 2 videos 1080p.** Hay que medirlo en el PC de la iglesia antes de diseñar el mezclador.
4. **Cuadros por segundo:** con 1080i59.94, cada salida SDI se dibuja a ~30 cuadros por segundo (29.97 reales). La meta de "60 estables" aplica a la interfaz y a salidas en monitores. Para SDI, la meta real es **29.97 sin saltos**.
5. **La captura cuesta.** Cada salida DeckLink se dibuja fuera de pantalla y se copia de la GPU. Con 4 salidas, son 4 copias por cuadro. Hay que medirlo.

### Fase 3 — Enrutador y mapeo con ajuste de esquinas

1. **No existe ajuste de esquinas ni deformación.** Solo hay recorte y edge blending.
   - El ajuste de esquinas se puede hacer con una transformación CSS 3D (rápida y por GPU) o dentro del lienzo WebGL de la fase 2. **Conviene decidirlo al diseñar la fase 2**, para no hacerlo dos veces.
2. **No hay "lienzo principal" con recortes por salida.** Hoy cada salida dibuja todo por su cuenta.
   - El enrutador (un lienzo grande que se reparte en salidas) es un **cambio de arquitectura**: lo ideal sería dibujar una vez y repartir.
   - FreeShow ya tiene una pieza parecida (una ventana que se dibuja una vez y se "presenta" en otras: `OutputPresenter.ts` y `RenderGroups.ts`) que podríamos aprovechar.
3. **No hay grupos de salidas ni "escenarios guardados" de enrutamiento.** Es todo nuevo, pero encaja bien como módulo con su propio JSON.

### Riesgo general — Mantener el fork actualizable

- FreeShow saca versiones muy seguido y archivos como `Output.svelte` y `OutputLifecycle.ts` cambian mucho entre versiones.
- **Cuanto menos los toquemos, más fácil actualizar.** Por eso todo enganche debe ser de pocas líneas y quedar anotado en `CAMBIOS_AL_ORIGINAL.md`.

---

## 7. Notas de instalación encontradas en esta fase

- Con **Node 26 / npm 11.20**, npm bloquea pasos automáticos de instalación. Hubo que descargar Electron y recompilar Opus (audio) a mano.
- **Recomendado: Node 22 LTS.** Detalle completo en `INSTALAR_WINDOWS.md`.
- Para diagnosticar la DeckLink, FreeShow tiene un modo de estadísticas: arrancar con la variable `FS_CAP_STATS=1` muestra cada segundo cuántos cuadros se envían y se pierden.

---

## 8. Conclusión para el paso 4

**FreeShow ya soporta DeckLink**, así que el siguiente paso es la rama `fase1/salidas-decklink`: configurar las 4 salidas del mapa.

Antes de tocar la tarjeta hay que:

1. **Anotar la configuración actual de la DeckLink** en Blackmagic Desktop Video Setup (perfil, modo de video y formato de cada conector).
2. **Confirmar** que no hay servicio ni uso de ProPresenter en ese momento.
3. **Probar** si el audio por SDI en 1080i59.94 tiene el problema de la sección 3.
