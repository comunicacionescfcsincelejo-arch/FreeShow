# Día de prueba en el PC de la iglesia

Pruebas de la fase 1.5 con la DeckLink real: **conectores**, **audio**, **vigilante** y **modo servicio**, en una sola sesión.

- **Cuándo:** un día **sin servicio**, con tiempo. ProPresenter sigue siendo el respaldo.
- **Duración total:** unas **2 horas y 15 minutos**, más 1 hora si se hace la Parte G (opcional).
- **Qué se conecta:** **nada nuevo.** Los 4 cables SDI se quedan como están hoy (LED, ATEM, monitores de escenario, distribuidor). Solo se mira y se escucha en los equipos que ya existen.
- **Personas:** una en el PC y otra mirando el LED, los monitores de escenario y el ATEM/OBS.
- **Para anotar:** papel o el celular para los resultados de cada paso. Al final se pasan a `CAMBIOS_AL_ORIGINAL.md`.

---

## A. Preparación (20 min)

1. **Confirmar** que hoy no hay servicio ni ensayo, y que nadie va a usar ProPresenter.
2. **Cerrar ProPresenter por completo.** Comprobarlo en PowerShell:
   ```powershell
   Get-Process | Where-Object { $_.ProcessName -eq "ProPresenter" }
   ```
   Debe quedar vacío. Los "ProPresenter Helper" pueden seguir abiertos: no usan la tarjeta.
3. **Tomar fotos de *Blackmagic Desktop Video Setup*:** la pantalla de la Duo 2 y la de cada conector, con perfil, modo de video y formato. **No cambiar nada.** Sirven para volver atrás.
4. **Anotar el formato del audio de Windows:** Configuración → Sistema → Sonido → el dispositivo de salida → Formato. Por ejemplo, "48000 Hz".
5. **Encender** el LED, el ATEM, el PC de OBS y los monitores de escenario, como en un servicio.
6. **Preparar el material de prueba en FreeShow:**
   - Una canción con fondo de video y letra.
   - Una presentación con 4 diapositivas que digan en grande **DUO 1**, **DUO 2**, **DUO 3** y **DUO 4**.
   - Los dos archivos de tono, ya creados en `Documentos\FreeShow\Pruebas de audio\`:
     - `tono-1kHz-1min.wav`: tono continuo de 1 kHz, 1 minuto.
     - `pitidos-cada-segundo-10min.wav`: un pitido al inicio de cada segundo, y cada 10 segundos uno más agudo para contar, durante 10 minutos.

     Los dos son 48 kHz, estéreo y -18 dBFS. Si faltan, se crean con:
     ```powershell
     cd C:\proyectos\FreeShow; node src/modulos/audio-decklink/generarTonos.mjs
     ```
7. **Arrancar FreeShow en modo ensayo:**
   ```powershell
   cd C:\proyectos\FreeShow; git checkout fase1-5/robustez; git pull; $env:FS_VIGILANTE_PRUEBA=1; $env:FS_CAP_STATS=1; npm start
   ```
   Espera entre 20 y 40 segundos.

   En la consola debe aparecer `[GPU] FreeShow dibuja con: Intel(R) UHD Graphics 630`. Anota lo que diga.

   > ⚠️ **NO cambiar la GPU de FreeShow antes de la Parte G** (Configuración → Otro → Dispositivo gráfico debe quedar en **Automático**). La razón: `osr-capture` abre la Intel, y si FreeShow dibuja con la NVIDIA las salidas DeckLink podrían fallar.

   **Desde el paso 8 se usa la DeckLink:** confírmame antes de seguir.

## B. ¿Qué conector físico es cada "DeckLink Duo (1)–(4)"? (20 min)

8. **Crear una salida de prueba:** en FreeShow → Configuración → Salidas → **+** → Blackmagic.
   - Dispositivo: **DeckLink Duo (1)**.
   - Modo: **1080i59.94**.
   - Formato: **8-bit YUV**, con SDR activado.
   - Mostrar la diapositiva **DUO 1**.
9. **Mirar dónde aparece "DUO 1":** en el LED, en qué entrada del ATEM, en los monitores de escenario o en la central y las laterales. Anotarlo.
10. **Repetir con las otras tres:** cambiar el dispositivo de la misma salida a **Duo (2)**, **Duo (3)** y **Duo (4)**, con su diapositiva. Anotar dónde aparece cada una.
11. **Comparar con lo esperado:**

    | Dispositivo | Debe llegar a |
    |---|---|
    | Duo (1) | SDI 1 → LED (Background) |
    | Duo (2) | SDI 2 → ATEM (Redes) |
    | Duo (3) | SDI 3 → monitores de escenario (STAGE) |
    | Duo (4) | SDI 4 → central, laterales y ATEM (Video) |

    **Si alguno no coincide,** no se mueven cables. Solo se anota, y en los pasos siguientes se usa el dispositivo que realmente llega a cada lugar.
12. **Borrar la salida de prueba.**

## C. Prueba de audio (35 min)

13. **Crear la salida "Video":** Blackmagic en el dispositivo que llega a **SDI 4**, normalmente *DeckLink Duo (4)*, con 1080i59.94, 8-bit YUV y SDR activado.
    - En el **ATEM**, tomar el audio de la entrada que recibe SDI 4.
    - En **OBS**, mirar el medidor de audio y, si se puede, escuchar con audífonos en el monitoreo.
14. **Tono de 1 kHz, 1 minuto:**
    - El medidor de OBS debe quedarse **quieto y parejo**.
    - El tono debe oírse **limpio y continuo**, sin aspereza ni cortes.
15. **Pitidos cada segundo, 10 minutos,** junto a un cronómetro: al final no deben ir adelantados ni atrasados.
16. **5 minutos de música o voz:** el sonido debe ser normal.
17. **Si hay tiempo, repetir en Redes (SDI 2):**
    - Crear la salida "Redes" en el dispositivo que llega a **SDI 2**, normalmente *Duo (2)*.
    - Cambiar en el ATEM la entrada de audio a la de SDI 2.
    - Repetir el tono 1 minuto y la música 2 minutos.

## D. Prueba del vigilante de salidas (20 min)

18. **Preparar:** en la salida "Video", poner la canción con fondo de video y letra. Mirar en el ATEM o en OBS.
19. **Caída:** presionar **Ctrl + Alt + Shift + K**.
    - La imagen debe **quedarse quieta en el último cuadro, sin negro**, y volver a moverse en unos **3 segundos**.
    - Mientras tanto, **el audio sigue** en el medidor de OBS.
    - Repetir 3 veces.
20. **Cambio durante la caída:** presionar **Ctrl + Alt + Shift + K** y, enseguida, pasar a la siguiente diapositiva. Al recuperarse debe mostrar **la diapositiva nueva**.
21. **Congelamiento:** presionar **Ctrl + Alt + Shift + J**. La imagen se queda quieta, y a los **~15 segundos** se reinicia sola y vuelve a moverse.
22. *(Si hay tiempo)* **Cuatro salidas:**
    - Crear las 4 salidas del mapa con los dispositivos encontrados en la parte B: Background, Redes, STAGE y Video.
    - Presionar **Ctrl + Alt + Shift + K**.
    - Las 4 deben congelarse y recuperarse: LED, escenario, ATEM y central.

## E. Prueba del modo servicio (10 min)

23. **Activar:** clic en **"Activar modo servicio"**, abajo a la derecha. Desde el puesto del operador debe verse claro el **marco rojo** y la etiqueta **MODO SERVICIO desde HH:MM**.
24. **Intentar cerrar de tres formas:**
    - La **X** de la ventana.
    - **Alt + F4**.
    - El menú **Carpeta → Salir** de FreeShow (puede decir "Cerrar").

    En los tres casos debe aparecer: *"Modo servicio activo. Las salidas están al aire. Desactiva el modo servicio para cerrar."*, y **las salidas siguen al aire** (mirar el LED y el ATEM).
25. **Seguir en servicio:** presionar **"Seguir en servicio"**. El aviso se cierra y sigue activo.
26. **Cancelar la desactivación:** clic en la etiqueta roja → **"Cancelar"**. Sigue activo.
27. **Desactivar:** clic en la etiqueta roja → **"Sí, desactivar"**. El marco rojo desaparece.

## F. Cierre y vuelta a ProPresenter (15 min)

28. **Guardar el registro** del vigilante en el escritorio, para enviármelo junto con lo anotado:
    ```powershell
    Copy-Item "$env:APPDATA\freeshow\vigilante-salidas.log" "$env:USERPROFILE\Desktop\"
    ```
29. **Cerrar FreeShow:** el modo servicio debe estar desactivado. Cerrar la ventana y, en PowerShell, presionar **Ctrl + C**.
30. **Comprobar** que no quedó nada de FreeShow abierto:
    ```powershell
    Get-Process electron -ErrorAction SilentlyContinue
    ```
    Debe quedar vacío. Si aparece algo, cerrarlo desde el Administrador de tareas.
31. **Abrir ProPresenter.**
    - En **Configuración de la pantalla**, comprobar que las 4 pantallas siguen igual que en las fotos: DeckLink Duo (1)–(4), 1080i59.94, formato DSE.
    - Mostrar una diapositiva y un fondo: deben verse en el LED, el escenario, la central y el ATEM.
    - El audio debe llegar al ATEM como siempre.
32. **Si algo no quedó igual,** dejar ProPresenter como en las fotos de Desktop Video Setup y avisarme antes del siguiente servicio.
33. **Enviarme:** los resultados de cada paso, la tabla de conectores de la parte B y el archivo `vigilante-salidas.log` del escritorio.

## G. (Opcional) Dibujar con la NVIDIA conectando el monitor a ella (60 min)

**Solo si:**
- las partes A–F salieron bien;
- queda tiempo;
- hoy **no hay servicio** (y mañana tampoco, por si algo no vuelve a quedar bien).

**Por qué:** hoy el monitor está en la Intel, así que Windows, FreeShow y `osr-capture` usan la Intel, y esa tarjeta queda al límite (ver `PROTOTIPO_RENDER.md`). Si el monitor pasa a la NVIDIA, las tres cosas deberían usar la NVIDIA sin programar nada. Esta parte comprueba si es así.

**Antes de empezar:** ProPresenter y FreeShow cerrados (pasos 29 y 30).

**Anotar cómo está todo hoy (para poder volver):**

34. **Tomar foto de la parte de atrás del PC**, donde se vea en qué conector está el cable del monitor.
    - Hoy está en una salida **de la placa madre** (la Intel). Normalmente son las que están **más arriba**, junto al USB.
    - Las salidas de la NVIDIA normalmente están **más abajo**, en la tarjeta horizontal.
    - Si no está claro cuál es cuál, no adivinar: mándame la foto antes de seguir.
35. **Anotar la pantalla actual.** Pega esto y toma foto del resultado:
    ```powershell
    Get-CimInstance Win32_VideoController | Select-Object Name, CurrentHorizontalResolution, CurrentVerticalResolution, CurrentRefreshRate | Format-Table -AutoSize
    ```
    Hoy, la Intel muestra **1920 × 1080 a 60 Hz** y la NVIDIA aparece vacía.

**Cambiar:**

36. **Apagar el PC** (Inicio → Apagar).
37. **Pasar el cable del monitor a una salida de la NVIDIA** del mismo tipo (HDMI con HDMI, DisplayPort con DisplayPort). Si no hay del mismo tipo, **no usar adaptadores hoy**: volver al paso 44.
38. **Encender el PC.**
    - Puede que la pantalla del inicio (el logo del fabricante) no se vea y que la imagen aparezca recién al cargar Windows.
    - Si **después de 2 minutos** no hay imagen: apagar con el botón (mantenerlo presionado 5 s) e ir al paso 44.
39. **Comprobar** con el mismo comando del paso 35: ahora la **NVIDIA** debe mostrar 1920 × 1080 a 60 Hz.
    - Si la resolución o la frecuencia no son esas, **no cambiarlas hoy**: anotarlo y seguir.
40. **Abrir *Blackmagic Desktop Video Setup* solo para mirar,** sin cambiar nada. Deben seguir los 4 conectores. Cerrarlo.

**Probar:**

41. **Arrancar FreeShow** como en el paso 7. La consola debe decir ahora `[GPU] FreeShow dibuja con: NVIDIA GeForce GTX 1660 Ti`. Anotarlo.
42. **Confírmame antes de este paso:** crear la salida "Video" en el dispositivo de SDI 4, con 1080i59.94, y poner la canción con fondo de video.
    - **Si la imagen se ve en el ATEM y en la central**, la copia para la DeckLink funciona con la NVIDIA.
    - **Si se ve en negro o congelada,** o la consola muestra `OpenSharedResource failed`, anotarlo, cerrar FreeShow e ir al paso 44.
43. **Si funcionó:**
    - Crear las 4 salidas del mapa y mirar si los videos se ven **más fluidos que en la parte D**.
    - Medir con el prototipo (5 minutos, sin DeckLink):
      ```powershell
      cd C:\proyectos\FreeShow; git checkout fase2/prototipo-render
      npx electron src/modulos/motor-render/prototipo/main.cjs medir --nombre=g5-actual2salidas --escena=una --ventana=invisible --captura=30 --copias=2
      npx electron src/modulos/motor-render/prototipo/main.cjs medir --nombre=g7-maestro --escena=maestro --ventana=invisible --captura=30
      git checkout fase1-5/robustez
      ```
      Cerrar FreeShow.

**Volver a la configuración actual (siempre, aunque todo haya funcionado):**

44. **Apagar el PC.**
45. **Volver a poner el cable del monitor en la salida de la placa madre (Intel)**, igual que en la foto del paso 34.
46. **Encender el PC** y comprobar con el comando del paso 35: la **Intel** debe mostrar otra vez **1920 × 1080 a 60 Hz**, como en la foto.
47. **Abrir ProPresenter** y repetir la comprobación del paso 31:
    - las 4 pantallas igual que en las fotos;
    - imagen en el LED, el escenario, la central y el ATEM;
    - audio en el ATEM.
48. **Si algo no quedó como antes, avisarme antes del siguiente servicio.**
49. **Enviarme:** lo anotado en los pasos 39, 41 y 42, y los archivos `g5-actual2salidas.json` y `g7-maestro.json` de `src\modulos\motor-render\prototipo\resultados\` (si se hicieron).

> Aunque funcione, el PC queda **como hoy** (monitor en la Intel). Pasar a la NVIDIA de forma permanente se decide después, con estos resultados.
