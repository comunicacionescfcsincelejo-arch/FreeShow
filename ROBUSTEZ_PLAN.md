# Plan de robustez — Fase 1.5

**Objetivo:** cumplir la regla 1 de CLAUDE.md: *"La salida en vivo nunca se cae por la interfaz. Si algo falla, la salida se queda en el último cuadro, nunca en negro ni con un error."*

**Estado:** solo plan. **No se programa nada hasta que lo apruebes.**

Las estimaciones son en **días de trabajo con IA**. No incluyen el ensayo en el PC de la iglesia, que se cuenta aparte.

---

## Resumen

| # | Problema | Solución | ¿Módulo aparte? | Riesgo | Tiempo |
|---|---|---|---|---|---|
| 1 | Cerrar o congelar la edición afecta las salidas | Confirmación al cerrar + "modo servicio" + recuperar la interfaz sola | Casi todo módulo; 2 enganches de 1 línea | Medio | 3–5 días |
| 2 | Una falla de la DeckLink tumba todo | Mover la DeckLink a un **proceso aparte** que se reinicia solo | No: hay que modificar 3 archivos originales | **Alto** | 8–12 días |
| 3 | Una salida que se cae no vuelve | "Vigilante" que la recarga y le devuelve el último contenido | Casi todo módulo; 1–2 enganches | Bajo-medio | 3–5 días |
| 4 | Audio mal calculado en 1080i59.94 | Calcular las muestras con la duración real del cuadro | No: corrección pequeña en 1 archivo original | Bajo | 1 día |

**Orden recomendado:** 4 → 3 → 1 → 2.

- Van primero los arreglos baratos y de bajo riesgo.
- El punto 2 conviene diseñarlo **junto con el motor de render de la fase 2** (sección final), porque los dos tocan la misma parte del código.

---

## 1. Que cerrar o congelar la ventana de edición NO cierre ni congele las salidas

### Cómo es hoy
- **Congelar la interfaz:** las salidas **ya se quedan con el último cuadro**, y los videos que estaban corriendo siguen. Pero ya no se puede cambiar nada.
- **Cerrar la interfaz:** **cierra todo el programa**, salidas incluidas. Pasa en `src/electron/index.ts` (`mainWindow.once("closed", exitApp)`) y en `src/electron/utils/close.ts` (`exitApp` → `closeAllOutputs()`).
- **Si la interfaz se cae** (se muere su proceso): nadie la vuelve a abrir.

### Solución propuesta (en 3 partes)

**1a. Confirmación al cerrar con salidas activas.**
- Si hay salidas encendidas, cerrar la ventana muestra un aviso grande: *"Hay salidas en vivo. ¿Cerrar todo?"*.
- Con "modo servicio" activo, se pide escribir una palabra o mantener presionado un botón 3 segundos, para evitar cierres accidentales.
- Módulo `src/modulos/robustez/motor/cierreSeguro.ts` + **1 línea** en `callClose()` de `src/electron/utils/close.ts`.

**1b. "Modo servicio": cerrar la ventana de edición la oculta en vez de cerrar el programa.**
- Las salidas siguen al aire.
- Se reabre desde el ícono junto al reloj de Windows o con un atajo de teclado.
- Mismo módulo + **1 línea** en `src/electron/index.ts`, donde se registra `"closed"`.

**1c. Recuperar la interfaz si se cae o se congela.**
- El módulo escucha el evento `render-process-gone` de Electron, que se dispara cuando muere una ventana. No hace falta tocar el original, porque es un evento global de `app`.
- Si muere la ventana de edición, la **recarga sin tocar las salidas**.
- Si se congela más de unos 10 segundos (evento `unresponsive`), ofrece recargarla.

### Lo que hay que verificar antes
- Que al recargar la interfaz **no se borre ni cambie lo que está al aire**. Al arrancar, la interfaz le manda a las salidas su estado inicial (`src/frontend/utils/listeners.ts`, `sendInitialOutputData`). Si ese estado no es igual al que estaba al aire, la salida podría saltar a otra slide o quedar vacía.
- **Plan B si pasa eso:** el motor guarda una copia del último contenido enviado a cada salida (ver punto 3) y la reenvía al terminar la recarga.

### Lo que este punto NO resuelve
- Si se congela o se cae el **proceso principal** (el motor), se cae todo. Eso pasa sobre todo por la DeckLink o la captura, y se ataca en el punto 2.
- Separar del todo "quién manda" (hoy la interfaz es dueña del estado de las salidas) sería una reestructuración grande. **No la recomiendo ahora.**

| Archivos que tocaría | ¿Original? |
|---|---|
| `src/modulos/robustez/` (nuevo) | No |
| `src/electron/utils/close.ts` (1 línea) | Sí |
| `src/electron/index.ts` (1–2 líneas) | Sí |

**Riesgo:** medio, por la verificación de la recarga. **Tiempo:** 3–5 días.

---

## 2. Aislar la librería de la DeckLink (macadam) en un proceso aparte

### Cómo es hoy
- La DeckLink corre en un "hilo trabajador" **dentro del proceso principal**, junto con NDI, OMT y la lectura de cuadros de la GPU. Archivos: `src/electron/capture/SenderThread.ts` y `senderWorker.ts`.
- Si macadam o el driver fallan gravemente, **se cae el programa entero**.

### Solución propuesta
1. **Crear un proceso aparte solo para la DeckLink**, un `utilityProcess` de Electron. FreeShow ya usa uno igual para las **entradas** de video (`src/electron/capture/StreamReceiverHost.ts`), así que hay un modelo probado.
2. **El hilo trabajador actual sigue leyendo los cuadros de la GPU y convirtiéndolos** al formato de la tarjeta. Esa parte debe quedarse donde está, porque la textura de la GPU solo se abre en ese hilo.
3. **Los cuadros pasan al proceso DeckLink por memoria compartida**, sin copiarlos por mensajes.
   - FreeShow ya trae esa herramienta: `osr-capture`, con `shmMap`, `shmWriteAsync` y `shmReadAsync`, ya usada en `src/electron/capture/FrameServer.ts`.
   - Cada cuadro 1080 YUV pesa ~4 MB. Por 4 salidas y 30 cuadros por segundo son ~500 MB/s, así que por mensajes sería demasiado lento.
4. **El proceso DeckLink corre el mismo `BlackmagicSender.ts` de hoy**, casi sin cambios. Las **4 salidas van en el mismo proceso** para conservar el "candado" que evita que la Duo 2 se caiga al iniciar sus 4 conectores a la vez.
5. **Si el proceso DeckLink muere,** el motor lo detecta, lo vuelve a abrir, reconecta los 4 conectores y sigue mandando el último cuadro.

### Advertencia honesta
- Mientras el proceso DeckLink se reinicia (estimo 1 a 3 segundos), **la tarjeta probablemente saca negro**, porque nadie le está mandando cuadros. Hay que medirlo.
- Aun así es mucho mejor que hoy: hoy **se cae todo el programa** y hay que volver a abrirlo y configurar.
- La lectura de la GPU (`osr-capture`) sigue en el proceso principal. Una falla ahí todavía tumbaría todo. Se puede aislar más adelante con el motor de render (sección final).

| Archivos que tocaría | ¿Original? |
|---|---|
| `src/modulos/aislamiento-decklink/` (nuevo: el proceso aparte y su vigilante) | No |
| `src/electron/blackmagic/BlackmagicBridge.ts` (mandar al proceso nuevo en vez de al hilo) | Sí, moderado |
| `src/electron/capture/senderWorker.ts` (escribir el cuadro en memoria compartida en vez de llamar a macadam) | Sí, moderado |
| `src/electron/blackmagic/BlackmagicSender.ts` (ajustes para correr fuera del hilo) | Sí, pequeño |

**Riesgo:** **alto**. Toca la parte más delicada, el "reloj" con que se mandan los cuadros a la tarjeta, y solo se puede probar bien con la Duo 2 real. Puede sumar 1 cuadro de retraso (~33 ms).
**Tiempo:** 8–12 días + 2 ensayos con la tarjeta.

> Es un cambio de arquitectura. Recomiendo **dejarlo de último** y decidirlo junto con el motor de render, porque los dos tocan `senderWorker.ts`.

---

## 3. Que una ventana de salida que se cae se reabra sola, con el último contenido

### Cómo es hoy
- Si el proceso de una salida muere (por memoria, la GPU o un video dañado), **nadie lo detecta**.
- La salida queda en blanco o congelada hasta reiniciar el programa.

### Solución propuesta
1. **Vigilante:** el módulo escucha `render-process-gone` y `unresponsive` en todas las ventanas de salida, sin tocar el original.
2. **Recarga:** si una salida muere, la **recarga en la misma ventana**. Así no se pierde la conexión con la captura ni con la DeckLink.
3. **Último contenido:** al recargarse, la salida le pide sola su contenido a la interfaz (eso ya existe: `REQUEST_DATA_MAIN` en `src/frontend/utils/startup.ts`).
   - Si la interfaz también está caída, el motor le manda **una copia del último contenido** que guardó. Esto necesita **1 línea** en `src/electron/output/helpers/OutputSend.ts` para ir guardando lo que se envía.
4. **Para la DeckLink:** mientras la salida se recarga, la tarjeta **ya repite el último cuadro** (`repeatLastFrame`).
   - Hay que **pausar el envío de cuadros nuevos hasta que la salida esté lista**. Si no, saldrían a SDI 1 o 2 segundos de página en blanco o negro.
   - Eso necesita un enganche pequeño en la captura (`src/electron/capture/helpers/CaptureLifecycle.ts` o `OutputLifecycle.ts`).
5. **Registro:** cada caída se anota en un archivo de log con la hora, para revisarlo después del servicio.

| Archivos que tocaría | ¿Original? |
|---|---|
| `src/modulos/robustez/motor/vigilanteSalidas.ts` (nuevo) | No |
| `src/electron/output/helpers/OutputSend.ts` (1 línea) | Sí |
| Captura: pausa mientras recarga (2–5 líneas) | Sí |

**Riesgo:** bajo-medio. **Tiempo:** 3–5 días.
**Cómo se prueba sin la tarjeta:** forzar la caída de una salida desde el Administrador de tareas de Windows y ver que vuelve sola con la misma slide.

---

## 4. Arreglar el cálculo de audio en 1080i59.94

### El problema
En `src/electron/blackmagic/BlackmagicSender.ts` la cantidad de audio por cuadro se calcula a partir del **nombre** del modo, con la función `resolveFrameRates`:

- "1080i59.94" se lee como 59.94 cuadros por segundo, así que manda 48000 ÷ 59.94 = **801 muestras por cuadro**.
- Pero la tarjeta pide un cuadro completo cada 1/29.97 de segundo, así que necesita **~1601,6 muestras por cuadro**.
- Resultado: **se manda la mitad del audio**, y se oyen cortes o silencios.
- El mismo error afecta a 1080i50, NTSC y PAL.
- Además, aun con la cuenta corregida, usar siempre el mismo número redondeado (1602) haría que el audio se adelante poco a poco. La cuenta exacta reparte **8008 muestras cada 5 cuadros**, alternando 1601 y 1602.

### Solución
1. Tomar la duración del cuadro de **lo que reporta la tarjeta** (`playback.frameRate`, por ejemplo 1001/30000), no del nombre del modo.
2. Llevar una "cuenta acumulada" para que cada cuadro lleve 1601 o 1602 muestras y el total sea exacto.
3. Aplicarlo en los 3 lugares donde se calcula: al iniciar, en `getAudioForFrame` y en `ensureSilentAudioBuffer`.
4. Proponerle el arreglo a FreeShow (un "pull request"). Así, cuando ellos lo incluyan, dejamos de mantener el cambio.

| Archivos que tocaría | ¿Original? |
|---|---|
| `src/electron/blackmagic/BlackmagicSender.ts` (~20 líneas) | Sí. No se puede hacer como módulo, porque el cálculo está adentro. |

**Riesgo:** bajo. **Tiempo:** 1 día + probarlo con la tarjeta: reproducir un tono de prueba y escuchar o medir la salida SDI.
**Prioridad:** **URGENTE**. El audio de la iglesia sale por SDI.

### Estado: programado el 2 de noviembre de 2026, falta la prueba con la tarjeta
- Módulo `src/modulos/audio-decklink/`, con 16 pruebas automáticas para 1080i59.94, 1080p59.94, 1080p29.97, 1080i50, 1080p25/30/60 y 1080p23.98. Cada modo se prueba durante 1 hora simulada sin desfase.
- Cambio en `BlackmagicSender.ts` para usar ese cálculo.
- **Arreglo extra 1:** el audio de los cuadros que la tarjeta salta se descarta. Si no, el audio se iba retrasando respecto al video, hasta 2 segundos.
- **Arreglo extra 2** (`processAudio.ts`): el audio que va a la DeckLink se convierte a 48 kHz. Si Windows tiene el audio a 44,1 kHz, antes salía a la velocidad equivocada.
- Verificado contra el SDK de Blackmagic: la velocidad real de cuadros es `timeScale / frameDuration`, tomada del modo, y en 1080i59.94 es 30000/1001. La secuencia 1602/1601/1602/1601/1602 coincide con la tabla NTSC 29.97 que usa FFmpeg.

### Prueba real con la tarjeta (día sin servicio, unos 60–90 minutos)
1. **Antes:**
   - Cerrar ProPresenter.
   - Tomar fotos de Desktop Video Setup, sin cambiar nada.
   - Anotar el formato del audio de Windows (Configuración → Sonido → dispositivo de salida → Formato).
2. **Conexión:** no se conecta nada nuevo.
   - **SDI 4 (Video)** y **SDI 2 (Redes)** ya llegan al **ATEM**, y el operador elige ahí de qué entrada toma el audio.
   - Se escucha y se mide en **OBS**: con el medidor de audio y, si se puede, con audífonos en el monitoreo de OBS.
3. **Primera prueba: Video (SDI 4).**
   - En FreeShow, crear **una sola** salida Blackmagic "Video" en *DeckLink Duo (4)*, 1080i59.94, 8-bit YUV, SDR activado.
   - Arrancar con `$env:FS_CAP_STATS=1; npm start` para ver las estadísticas.
   - En el ATEM, tomar el audio de la entrada que recibe SDI 4.
4. **Tono de 1 kHz durante 1 minuto:**
   - El medidor de OBS debe quedarse **quieto y parejo**, y el tono debe oírse **continuo y limpio**.
   - Con el error, el medidor tiembla y el tono se oye áspero o entrecortado.
5. **Pitidos cada segundo durante 10 minutos,** junto a un cronómetro: no deben adelantarse ni atrasarse.
6. **5 minutos de música o voz** para revisar la calidad.
7. **Si hay tiempo: repetir en Redes (SDI 2).** Cambiar la salida a *DeckLink Duo (2)* (o crear una salida "Redes") y cambiar en el ATEM la entrada de audio a la de SDI 2. Repetir los pasos 4 a 6.
8. *(Opcional, unos 10 minutos)* Repetir el paso 4 con la versión sin arreglo, para confirmar que el error existía.
9. **Al terminar:** cerrar FreeShow, abrir ProPresenter y comprobar que todo funciona como siempre, incluido el audio en el ATEM.

### Pendiente para fases posteriores
- **Interruptor de audio por salida** (activo / silencio). Por ahora **el audio va a las 4 salidas**: Video y Redes llegan al ATEM, y ahí se elige cuál suena.

---

## Motor de render para la fase 2

### Cómo es hoy
- Cada salida es una página web aparte que dibuja **todo por su cuenta**: decodifica su propio video, dibuja su letra y se captura por separado.
- Con nuestro mapa, el mismo video de fondo se decodifica **2 veces** (SDI 1 Background y SDI 4 Video), y con el mezclador de 2 capas serían 4.
- Además, la mezcla es HTML/CSS. No hay WebGL para modos de mezcla, keys ni ajuste de esquinas.

### Opciones

**A. Seguir como hoy, optimizando** (compartir videos con las "capas de media" que ya tiene FreeShow, y WebGL dentro de cada salida).
- ✅ Poco trabajo y casi no toca la arquitectura.
- ❌ Cada salida sigue dibujando por su cuenta, con video repetido y 4 capturas.
- ❌ No da un "lienzo principal" para el enrutador de la fase 3.
- ❌ Difícil llegar a la meta de rendimiento con 2 capas de video.

**B. Lienzo maestro en una sola página oculta, repartido por GPU.** ⭐ *Recomendada*
- Una sola ventana invisible dibuja un **lienzo grande** (por ejemplo 3840×2160) con WebGL2, dividido en **regiones**: región 1 = solo fondo, región 2 = letra para Redes, región 4 = letra + fondo.
- **Cada video se decodifica una vez** y se usa en todas las regiones que lo necesiten.
- La letra se dibuja en la misma página, encima del WebGL, en las regiones que la llevan.
- FreeShow **ya captura páginas ocultas por GPU** (`osr-capture`) y ya escala y convierte a YUV en la GPU para la DeckLink. Habría que agregar que cada salida **recorte su región** del lienzo maestro.
- Las salidas en monitores normales se "presentan" con el mecanismo que ya existe (`OutputPresenter.ts`).
- **STAGE sigue siendo su propia ventana**, porque no lleva video y su contenido es distinto.
- ✅ Video una sola vez y una sola captura de GPU.
- ✅ Es exactamente el "lienzo principal + recortes por salida" de la fase 3. El ajuste de esquinas sale casi gratis en el shader.
- ✅ Reutiliza mucho de FreeShow.
- ❌ Hay que modificar `osr-capture` (C++, de otro autor) para recortar por región. Es una pieza nativa que tendríamos que mantener en un fork.
- ❌ Una página que dibuja todo es un "punto único": si se cae, se caen las 3 salidas de audiencia. Se mitiga con el vigilante del punto 3, porque recarga en 1 o 2 segundos.
- ❌ Hay que medir en el PC de la iglesia que dibujar 4K a 30 cuadros por segundo con 2 videos rinde.

**C. Motor nativo aparte** (un programa propio en C++ o Rust con DirectX, estilo OBS o Resolume, que decodifica, mezcla y manda directo a la DeckLink; FreeShow solo lo controla).
- ✅ Máximo rendimiento y **máximo aislamiento**: la salida no depende para nada de la interfaz. Es lo que mejor cumple la regla 1.
- ❌ Es otro programa entero, en otro lenguaje: **meses de trabajo**.
- ❌ La letra igual se tiene que dibujar en Chromium y pasarse como imagen.
- ❌ Es mucho más difícil de mantener construyendo con IA y sin programador.

**D. WebGL en cada salida por separado.**
- ✅ Lo más simple de programar.
- ❌ Repite todo el trabajo en cada salida (es lo contrario de lo que buscamos).

### Recomendación: **B, en dos etapas**
1. **Prototipo para medir (1–2 semanas):**
   - Una ventana oculta con un lienzo WebGL2 y 2 videos 1080p.
   - Medir cuadros por segundo y uso de GPU **en el PC de la iglesia** (un día sin servicio).
   - Si no rinde, reconsideramos antes de invertir más.
2. **Integración (4–8 semanas):**
   - Regiones por salida.
   - Recorte en `osr-capture`.
   - Presentación en monitores.
   - Mezclas, crossfade y looks (fase 2).
   - Luego, ajuste de esquinas y escenarios (fase 3).

Si algún día B se queda corto, **C** es el camino de largo plazo. B no se pierde: la interfaz, los looks y el formato JSON siguen sirviendo.

### Fase 3: funciones de ProPresenter que debemos igualar

ProPresenter tiene estas pestañas en cada pantalla de **Audiencia**. Son la meta mínima del enrutador y el mapeo:

| Función ProPresenter | ¿Lo tiene FreeShow hoy? | Cómo lo haríamos |
|---|---|---|
| **Ajuste de esquina** (mover las 4 esquinas de la imagen) | ❌ No. Solo tiene recorte y edge blending. | En el shader del lienzo maestro (opción B): cada salida lleva sus 4 esquinas guardadas en JSON. Si se elige la opción A, con transformación CSS 3D. |
| **Clave alfa** (fill + key por SDI) | ⚠️ Parcial. Existe "Alpha key" para Blackmagic, pero solo en 8-bit ARGB/BGRA, sin elegir entre key interno y externo, y con una conversión en JavaScript. | Ver la nota abajo sobre la Duo 2. |
| **Color** (ajustes de color por pantalla) | ⚠️ Parcial. Hay filtros CSS en los medios y el interruptor SDR en Blackmagic, pero no un ajuste de color por salida. | En el shader del lienzo maestro: brillo, contraste, gama y balance por salida. |
| **Retraso** (cuadros de retraso por pantalla) | ❌ No. | Una cola de N cuadros por salida en el envío a la DeckLink. Hoy todas usan 0, así que es de baja prioridad. |
| **Grupos** (Audiencia / Escenario) | ❌ No. | Un módulo del enrutador: grupos guardados en JSON, que deciden qué capas recibe cada salida. |

**Nota sobre la clave alfa en la Duo 2** (fuente: [SDK DeckLink, perfiles](https://sdk-doc.blackmagicdesign.com/decklink-sdk/HighLevel/profiles.html)):

- Con el perfil actual de **4 conectores independientes**, la tarjeta **no ofrece clave alfa**. Lo comprobé en este PC: los 4 reportan keying interno y externo = no.
- Para fill + key, la Duo 2 tiene que cambiar a un perfil en el que **cada salida con clave usa 2 conectores**: SDI 1 + SDI 2 forman un par y SDI 3 + SDI 4 forman el otro. Así quedarían **máximo 2 salidas** (con clave) en vez de 4.
- **Eso no cabe en el mapa actual de 4 salidas.** Usar clave alfa obligaría a cambiar el perfil en Desktop Video Setup y a redistribuir las pantallas. Sería una decisión tuya, con la configuración anotada antes.
- Lo que sí podemos igualar sin cambiar la tarjeta: que la salida "Redes" vaya con **letra sobre negro o sobre verde/croma**. Eso sirve para un mezclador que haga el key por luminancia o por croma.

### Decisiones que te pediré cuando lleguemos ahí
- **¿WebGL2 "a mano" o una librería como PixiJS?** PixiJS es una dependencia nueva y pesada: ahorra tiempo, pero es otra pieza que mantener.
- **¿Hacer un fork de `osr-capture`** para agregar el recorte por región?

---

## Preguntas abiertas

1. **¿El audio de la iglesia sale por SDI o por la consola de sonido?** En tu mensaje quedó la plantilla sin llenar. Define la prioridad del punto 4.
2. ¿Apruebas el orden 4 → 3 → 1 → 2, o prefieres otro?
3. Para el "modo servicio" (1b), ¿prefieres que la ventana de edición se **oculte** al cerrarla, o que **no se pueda cerrar** hasta desactivar el modo servicio?
