# Informe del prototipo del motor de render (fase 2)

**Fecha:** 2 de noviembre de 2026 · **Rama:** `fase2/prototipo-render` · **Código:** `src/modulos/motor-render/`
**Sin DeckLink:** todo corrió en ventanas de prueba. No se tocó ningún archivo original de FreeShow.

---

## Resumen

1. **Los 3 criterios funcionales se cumplen:** 60 fps con 2 capas de video 1080p, crossfade, 5 modos de mezcla y ajuste de 4 esquinas, todo en WebGL2 puro. El uso de procesador es casi nulo: menos del 2% del PC.
2. **Hallazgo importante:** este PC tiene **dos tarjetas de video**. El monitor está conectado a la **Intel UHD 630** (integrada), así que **FreeShow dibuja hoy con la Intel**, no con la NVIDIA GTX 1660 Ti.
   - En la Intel caben **una** salida con video (42–62% de la tarjeta) o **dos** al límite (88%, con picos de 96%).
   - En la NVIDIA sobra espacio: menos del 25%.
3. **Hallazgo importante (riesgo actual):** la librería que copia el cuadro para la DeckLink (`osr-capture`) **siempre abre la tarjeta por defecto (la Intel)**.
   - Si se dibuja con la NVIDIA, la copia falla (`OpenSharedResource failed`).
   - Es decir: si alguien cambia en FreeShow la opción de tarjeta a "alto rendimiento", las salidas DeckLink podrían dejar de funcionar.
4. **El lienzo maestro de 4K (las 4 salidas en una imagen) no sirve en la Intel:** baja a 50 fps, con saltos de hasta 217 ms.
   - En la NVIDIA va a 60 fps y decodifica un 33% menos que el método actual.
5. **Veredicto:** la opción B sigue siendo la correcta en su idea, que es decodificar cada video **una vez** y componer en la GPU. Pero **con tres cambios** (ver "¿Sigue siendo correcta la opción B?").

---

## El PC y la prueba

| | |
|---|---|
| Procesador | Intel Core i7-9700 (8 núcleos), 64 GB de RAM |
| Tarjeta 1 | Intel UHD Graphics 630: **tiene el monitor** (1920×1080, 60 Hz) |
| Tarjeta 2 | NVIDIA GeForce GTX 1660 Ti, sin monitor |
| Electron / Chromium | 45 (el mismo de FreeShow) |
| Videos de prueba | 2 archivos 1080p H.264 creados por el prototipo: **A** a 60 cuadros por segundo y **B** a ~54 (el grabador de Chromium perdió algunos al crearlo) |

**Qué se dibuja en cada cuadro** (escena "una salida", como *Video*):
1. Fondo con **crossfade continuo** entre los videos A y B.
2. El video B como segunda capa, con **opacidad 70%**, **modo de mezcla que cambia cada 3 s** (sumar, multiplicar, pantalla, superponer, diferencia) y **ajuste de 4 esquinas en movimiento**.
3. La **letra** encima.

Es el peor caso: todo a la vez, todo el tiempo.

**Cómo se midió:** cada medición duró 30 segundos, después de 6 segundos de calentamiento.
- **CPU:** con `app.getAppMetrics()` de Electron.
- **GPU:** con los contadores de Windows por proceso (motor 3D y decodificador de video).
- **Tiempo de GPU por cuadro:** con `EXT_disjoint_timer_query`.
- **Copia del cuadro:** "invisible + captura" copia el cuadro con `osr-capture` 30 veces por segundo en formato UYVY, igual que FreeShow para una salida DeckLink en 1080i59.94.

Los datos crudos quedan en `src/modulos/motor-render/prototipo/resultados/` (no se suben al repositorio).

---

## Resultados

| # | Prueba | Tarjeta | Cuadros/s | Peor cuadro | Saltos | Videos A/B (cuadros/s) | GPU 3D | Decodificador | CPU (% de 1 núcleo) | Copia del cuadro |
|---|---|---|---|---|---|---|---|---|---|---|
| m1 | 1 salida, en monitor | Intel | **60,0** | 16,9 ms | 0 | **30 / 30** ⚠️ | 62% | 12% | 3,1 | — |
| m2 | 1 salida, en monitor | NVIDIA | **60,0** | 17,1 ms | 0 | 59 / 54 | 17% | 51% | 3,6 | — |
| m3 | 1 salida invisible (como DeckLink) | Intel | **60,0** | 16,8 ms | 0 | 59 / 54 | 42% | 9% | 4,4 | 3,9 ms (p99 7,4) |
| m4 | 1 salida invisible | NVIDIA | **60,0** | 16,8 ms | 0 | 59 / 54 | 23% | 50% | 3,3 | ❌ falla |
| m5 | **Método actual:** 2 salidas con video, cada una decodifica sus videos | Intel | 60,0 / 60,0 | 16,8 ms | 0 | 59 / 54 | **88%** (pico 96%) | 21% | 13,9 | 9,8 ms (p99 21) |
| m6 | **Método actual**, 2 salidas | NVIDIA | 60,0 / 59,9 | 16,8 ms | 0 | 59 / 54 | 18% | **57%** | 6,0 | ❌ falla |
| m7 | **Opción B:** lienzo maestro 3840×2160 con las 4 salidas | Intel | **49,6** ❌ | 217 ms | 64 | 59 / 54 | **98%** | 8% | 14,3 | 26 ms (p99 50) |
| m8 | **Opción B:** lienzo maestro 4K | NVIDIA | **60,0** | 16,8 ms | 0 | 59 / 54 | 20% | **38%** | 3,3 | ❌ falla |

**Cómo leer la tabla:**
- **Cuadros/s:** cuántas imágenes dibuja el motor por segundo. La meta es 60, y este monitor no permite más.
- **Saltos:** cuadros que tardaron más de 25 ms; se verían como un tirón.
- **Videos A/B:** cuántos cuadros nuevos de cada video llegan por segundo. Lo correcto es 59 y 54, que es lo que traen los archivos.
- **GPU 3D:** qué tan ocupada está la tarjeta dibujando. Por encima de 85% hay poco margen.
- **CPU:** "3,1" significa 3,1% de **un** núcleo. El PC tiene 8, así que es menos del 1% del total.
- ⚠️ **m1:** en la Intel con la ventana en el monitor, el motor dibuja a 60, pero **los videos solo avanzan 30 cuadros por segundo**. Como salida invisible (m3), la Intel sí entrega los videos completos.
- ❌ **"falla" en la copia:** con la NVIDIA, `osr-capture` no puede abrir el cuadro. La razón está en el punto 3 del resumen.
- Las salidas invisibles copiaron ~26 cuadros por segundo de 30. Es una limitación de cómo este banco de pruebas reparte las copias, no del motor. FreeShow las reparte con el reloj de la tarjeta.
- **Repartir el lienzo 4K en 4 salidas** copiando filas (m7) costó **6,6 ms por cuadro** de procesador. Así se puede recortar cada salida **sin modificar** `osr-capture`.

---

## Los 5 criterios

### 1. 60 fps estables con 2 capas de video 1080p — ✅ se cumple, con una condición
- **Una salida** con las 2 capas de video, crossfade, mezcla, ajuste de esquinas y letra: **60,0 cuadros/s sin un solo salto** en las dos tarjetas (m1 a m4). El peor cuadro fue de 17,1 ms.
- **La condición es la tarjeta:**
  - En la **Intel**, una salida ocupa 42–62% y dos salidas con video llegan a **88–96%**: no queda margen para efectos ni para un tercer video.
  - En la **NVIDIA**, cualquier caso queda por debajo de **25%** de dibujo.
- **Un detalle por arreglar:** el primer intento perdía la mitad de los cuadros de video, aunque el decodificador sí los entregaba.
  - La causa era cómo el motor se enteraba de que había un cuadro nuevo (`requestVideoFrameCallback` con videos ocultos).
  - Se cambió a revisar el video en cada cuadro, y ahora llegan todos.

### 2. Mezcla entre dos fondos y al menos 3 modos de mezcla — ✅
- **Crossfade** entre dos videos en el mismo paso de dibujo (shader).
- **6 modos:** normal, **sumar, multiplicar, pantalla, superponer y diferencia**, todos calculados en la GPU.
- **Revisado a ojo** con capturas de pantalla: los colores se comportan como deben. "Sumar" y "pantalla" aclaran, "multiplicar" oscurece, y el crossfade funde un video en el otro.

### 3. Ajuste de 4 esquinas sobre una capa — ✅
- Con perspectiva real: se usa una **homografía**, no un simple estirado. Por eso la imagen no se "dobla" en la diagonal, como pasaría con dos triángulos.
- Se calcula una vez por cuadro en JavaScript (9 números) y la GPU la aplica a cada píxel.
- **6 pruebas automáticas** (`esquinas.test.ts`), entre ellas:
  - cada esquina cae exactamente donde se pidió;
  - en perspectiva, el centro de la imagen cae donde se cruzan las diagonales;
  - unas esquinas imposibles no rompen el cuadro.
- Revisado a ojo: la rejilla del video se ve en perspectiva.

### 4. Consumo de CPU y GPU en este PC — medido (tabla de arriba)
- **CPU:**
  - **3 a 14% de un núcleo**, es decir, **menos del 2% del procesador**. Cumple la regla 4: los píxeles no los toca JavaScript.
  - El reparto del lienzo 4K en 4 salidas sí usa algo de CPU (6,6 ms por cuadro).
- **GPU Intel:**
  - El dibujo es lo que la llena: 42% con una salida, 88% con dos, 98% con el lienzo 4K.
  - El tiempo de GPU por cuadro es de 8,3–10,3 ms, de un presupuesto de 16,7 ms.
- **GPU NVIDIA:**
  - El dibujo apenas la ocupa, entre 17 y 23%.
  - Lo que más ocupa es el **decodificador de video**: 50% para 2 videos 1080p60 de alta calidad. El video B de prueba tiene ~28 Mbps, más que un fondo normal.
  - **Con el lienzo maestro, el decodificador baja de 57% a 38%**, porque cada video se decodifica una sola vez. Es la ventaja principal de la opción B, ahora medida.

### 5. Qué se rompe o se pierde respecto al render actual
El prototipo dibuja **todo** en WebGL. FreeShow hoy dibuja todo como página web (HTML/CSS). Si se reemplazara todo, se perdería:

| Se pierde | Por qué importa | Cómo se evita |
|---|---|---|
| **Texto de las diapositivas**: fuentes, tamaño automático, contornos, sombras, listas, versículos y estilos de FreeShow | Es lo más importante de la proyección | **No reemplazarlo.** Dejar la letra como HTML **encima** del lienzo WebGL, en la misma página. WebGL hace fondos, videos y mezcla; el HTML hace la letra. |
| **Transiciones de la letra y de cada elemento** (las de Svelte) | Fase 2, efectos de letra | Siguen en HTML si la letra sigue en HTML |
| Elementos especiales: relojes, temporizadores, páginas web, cámaras, PDF, PowerPoint | Se usan en servicios | Siguen en HTML. Las cámaras y los videos de elementos pueden pasar a WebGL después |
| Overlays y efectos de partículas (canvas 2D) | Se usan | Un canvas se sube como textura (ya probado con la letra y el reloj) |
| Modos de mezcla **entre la letra (HTML) y el fondo (WebGL)** | Algún efecto de letra | Solo con `mix-blend-mode` de CSS, más limitado. Para letra con mezcla especial, dibujarla en WebGL en un paso posterior |
| Ajuste de esquinas **de la letra** | La fase 3 lo pide por salida | Transformación CSS 3D (`matrix3d`) en la capa de letra, con la misma homografía. No se probó todavía |
| Estilos, resoluciones y proporciones distintas por salida; recorte y edge blending; capas por estilo | El mapa de 4 salidas los usa | El recorte y el edge blending pasan al shader (fácil). Lo demás exige que **una sola página dibuje varias salidas**: es la parte grande del trabajo |
| La "pantalla de escenario" (STAGE con sus layouts) | SDI 3 | Dejarla **como ventana aparte**: no tiene video, y su contenido es distinto |
| Aislamiento entre salidas | Hoy, si se cae una salida, las otras siguen | Con una página para Background y Video, si se cae, se congelan las dos. El vigilante las repone en ~2,6 s |
| Audio de los videos de fondo | Si algún fondo lleva sonido | No se probó: el prototipo tiene videos sin sonido. Revisar dónde suena hoy |
| Recuperación si la tarjeta se reinicia (pérdida de contexto WebGL) | Robustez | Falta programarla |

---

## ¿Sigue siendo correcta la opción B?

**Sí en la idea, con tres cambios basados en lo medido:**

1. **No un lienzo 4K con las 4 salidas, sino un lienzo solo para las salidas con video.**
   - Redes y STAGE son casi solo texto, y meterlas en el lienzo 4K costó dibujar y copiar píxeles de más. En la Intel eso fue justo lo que la tumbó (m7).
   - **Propuesta:** un lienzo de **3840×1080** con *Background* y *Video* (los dos que comparten el fondo), y Redes y STAGE como ventanas livianas aparte.
   - Son la mitad de píxeles que el 4K, y se conserva la ventaja de decodificar una sola vez.
2. **Letra en HTML encima del WebGL**, no dentro del WebGL. Así no se pierde nada del texto ni de las transiciones de FreeShow.
3. **Dibujar con la NVIDIA.** Con la Intel no queda margen ni con el método actual (88–96% con dos salidas con video).
   - Para eso, la copia del cuadro para la DeckLink tiene que abrir **la misma tarjeta** que dibuja. Hay dos caminos:
     - **a) Sin programar:** conectar el monitor del PC a la **NVIDIA**. Así pasa a ser la tarjeta por defecto para Windows, para Chromium y para `osr-capture`. Hay que probarlo un día sin servicio.
     - **b) Con programación:** el **fork de `osr-capture`** que dejamos para después. Habría que cambiar unas 20 líneas en C++ para que elija la tarjeta correcta en vez de la de por defecto.
   - Recomiendo probar **a)** primero. El fork **no** hace falta para recortar las salidas: copiar filas en el procesador costó 6,6 ms por cuadro en el peor caso (4K).

**PixiJS:** no hizo falta. El motor completo son unas 250 líneas de WebGL2 (`motor.js`) y no se complicó. Se puede reevaluar en el paso de integración.

---

## Riesgo para el día de prueba (ya, sin esperar la fase 2)

FreeShow, tal como está, dibuja con la **Intel** en este PC. Con las 4 salidas del mapa y un fondo de video en Background y en Video, esa tarjeta puede quedar al límite (como en m5).

En la parte D del día de prueba, con las 4 salidas, **conviene mirar si los videos se ven fluidos**. Y **no cambiar** la opción de tarjeta de FreeShow a "alto rendimiento": por el punto 3 del resumen, la copia para la DeckLink podría fallar.

---

## Qué sigue (propuesta, sin empezar)

1. **Hacer primero el día de prueba** (`DIA_DE_PRUEBA.md`), como pide CLAUDE.md antes de empezar una fase.
2. **Probar el monitor en la NVIDIA**, un día sin servicio. Hay que anotar antes cómo está conectado todo. Después, repetir m3 a m8 con `--gpu=defecto`: si la copia funciona en la NVIDIA, se evita el fork.
3. **Segundo prototipo:** el lienzo de 3840×1080 para Background y Video, con **la letra real de FreeShow en HTML encima**, copiado y repartido a 2 salidas invisibles. Hay que medir lo mismo y comparar con m5 y m6.
4. Solo después, decidir la integración con FreeShow.

---

## Cómo repetir las mediciones

En PowerShell, en `C:\proyectos\FreeShow`:
```powershell
npx electron src/modulos/motor-render/prototipo/main.cjs generar --gpu=alta
npx electron src/modulos/motor-render/prototipo/main.cjs medir --nombre=m3-una-invisible-intel --escena=una --ventana=invisible --captura=30 --segundos=30
npx electron src/modulos/motor-render/prototipo/main.cjs demo
```
Las opciones `--escena=una|maestro`, `--ventana=visible|invisible`, `--copias=N`, `--captura=0|30` y `--gpu=defecto|alta` reproducen cada fila de la tabla.
