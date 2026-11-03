// Banco de pruebas del prototipo del motor de render (Electron 45, el mismo de FreeShow). Nunca usa la DeckLink.
//
//   npx electron src/modulos/motor-render/prototipo/main.cjs generar
//   npx electron src/modulos/motor-render/prototipo/main.cjs demo [--gpu=alta] [--escena=maestro]
//   npx electron src/modulos/motor-render/prototipo/main.cjs medir --nombre=x [--escena=una|maestro] [--ventana=visible|invisible]
//        [--copias=1] [--captura=0|30|60] [--gpu=defecto|alta] [--segundos=30]
//
// "invisible" = ventana fuera de pantalla con textura compartida, como las salidas DeckLink de FreeShow.
// "captura" = cuántas veces por segundo se copia el cuadro de la GPU a la memoria con osr-capture (en UYVY, como para SDI).

const { app, BrowserWindow, ipcMain } = require("electron")
const { spawn } = require("child_process")
const { mkdirSync, writeFileSync } = require("fs")
const { join } = require("path")

const [tarea = "demo", ...resto] = process.argv.slice(process.defaultApp ? 2 : 1).filter((a) => !a.endsWith("main.cjs") && a !== ".")
const op = Object.fromEntries(resto.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")))
const ESCENA = op.escena || "una"
const VENTANA = op.ventana || "visible"
const COPIAS = Number(op.copias || 1)
const CAPTURA = Number(op.captura || 0)
const SEGUNDOS = Number(op.segundos || 30)
const CALENTAMIENTO = 6
const MEDIOS = join(__dirname, "medios")
const RESULTADOS = join(__dirname, "resultados")

if (op.gpu === "alta") app.commandLine.appendSwitch("force_high_performance_gpu")
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required")
// datos de esta prueba aparte (no tocan los de FreeShow)
app.setPath("userData", join(app.getPath("temp"), "freeshow-prototipo-render"))

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

function abrir({ escena, invisible, hud }) {
    const [ancho, alto] = escena === "maestro" ? [3840, 2160] : [1920, 1080]
    const ventana = new BrowserWindow({
        width: invisible ? ancho : 1280,
        height: invisible ? alto : 720,
        show: !invisible,
        backgroundColor: "#000000",
        webPreferences: {
            preload: join(__dirname, "preload.cjs"),
            contextIsolation: true,
            backgroundThrottling: false,
            offscreen: invisible ? { useSharedTexture: true } : false
        }
    })
    if (invisible) {
        ventana.webContents.setFrameRate(60)
        // como FreeShow: al crearla se recorta al tamaño de la pantalla; después no
        for (const ms of [0, 10, 80]) setTimeout(() => !ventana.isDestroyed() && ventana.setBounds({ x: 0, y: 0, width: ancho, height: alto }), ms)
    }
    ventana.webContents.on("console-message", (e) => e.level !== "debug" && console.log(`[página] ${e.message}`))
    ventana.webContents.on("render-process-gone", (_e, d) => console.log(`[página] se cayó: ${d.reason}`))
    ventana.loadFile(join(__dirname, "index.html"), { query: { escena, hud: hud ? "1" : "0" } })
    return { ventana, ancho, alto }
}

// ---- copia del cuadro (la "captura actual" de FreeShow para DeckLink) ----
function capturar(ventana, clave, porSegundo, repartirEn4) {
    const osr = require("osr-capture")
    const datos = { pintados: 0, copiados: 0, saltados: 0, msCopia: [], msReparto: [], error: null }
    let ocupado = false
    let ultimaCopia = 0
    const intervalo = porSegundo > 0 ? 1000 / porSegundo : Infinity
    const partes = repartirEn4 ? [0, 1, 2, 3].map(() => Buffer.alloc(1920 * 2 * 1080)) : []

    ventana.webContents.on("paint", (evento) => {
        const textura = evento.texture
        if (!textura) return
        datos.pintados++
        const ahora = performance.now()
        if (ocupado || ahora - ultimaCopia < intervalo - 2) {
            if (ocupado && ahora - ultimaCopia >= intervalo - 2) datos.saltados++
            textura.release()
            return
        }
        const info = textura.textureInfo
        const handle = info.handle?.ntHandle ?? info.handle?.dxgiHandle ?? info.handle?.handle
        const { width, height } = info.codedSize
        ocupado = true
        ultimaCopia = ahora
        osr.readback(handle, width, height, 1, clave).then(
            (buffer) => {
                datos.msCopia.push(performance.now() - ahora)
                datos.copiados++
                if (repartirEn4) {
                    // del lienzo maestro 3840×2160 (UYVY = 2 bytes por píxel) a 4 salidas 1920×1080, copiando filas
                    const t = performance.now()
                    const fila = 1920 * 2
                    for (let r = 0; r < 4; r++) {
                        const x0 = (r % 2) * fila
                        const y0 = Math.floor(r / 2) * 1080
                        for (let y = 0; y < 1080; y++) buffer.copy(partes[r], y * fila, (y0 + y) * width * 2 + x0, (y0 + y) * width * 2 + x0 + fila)
                    }
                    datos.msReparto.push(performance.now() - t)
                }
                textura.release()
                ocupado = false
            },
            (err) => {
                datos.error = String(err)
                textura.release()
                ocupado = false
            }
        )
    })
    return datos
}

// ---- uso de GPU (contadores de Windows por proceso; los nombres de WMI no cambian con el idioma) ----
function medirGpu() {
    const muestras = []
    const ps = spawn("powershell", ["-NoProfile", "-Command", "while ($true) { Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine | Where-Object { $_.UtilizationPercentage -gt 0 } | Select-Object Name, UtilizationPercentage | ConvertTo-Json -Compress; Start-Sleep -Milliseconds 700 }"], { stdio: ["ignore", "pipe", "ignore"] })
    let resto = ""
    ps.stdout.on("data", (d) => {
        resto += d
        const lineas = resto.split("\n")
        resto = lineas.pop()
        for (const l of lineas) {
            try {
                const j = JSON.parse(l)
                muestras.push(Array.isArray(j) ? j : [j])
            } catch {
                // línea incompleta
            }
        }
    })
    return { muestras, detener: () => ps.kill() }
}

function resumirGpu(muestras, pids) {
    // por tarjeta (luid) y por motor (3D, VideoDecode, Copy...), solo de los procesos de esta prueba
    const sumas = {}
    for (const muestra of muestras) {
        const enEsta = {}
        for (const { Name, UtilizationPercentage } of muestra) {
            const m = /pid_(\d+)_luid_(0x[0-9A-Fa-f]+_0x[0-9A-Fa-f]+)_.*engtype_(.+)$/.exec(Name || "")
            if (!m || !pids.has(Number(m[1]))) continue
            const clave = `${m[2]} ${m[3]}`
            enEsta[clave] = (enEsta[clave] || 0) + Number(UtilizationPercentage)
        }
        for (const [clave, v] of Object.entries(enEsta)) (sumas[clave] ||= []).push(v)
    }
    const n = muestras.length || 1
    return Object.fromEntries(Object.entries(sumas).map(([k, v]) => [k, { promedio: +(v.reduce((a, b) => a + b, 0) / n).toFixed(1), maximo: Math.max(...v) }]))
}

function percentil(lista, p) {
    if (!lista.length) return 0
    const o = [...lista].sort((a, b) => a - b)
    return o[Math.min(o.length - 1, Math.floor((p / 100) * o.length))]
}

async function medir() {
    const ventanas = []
    for (let i = 0; i < COPIAS; i++) ventanas.push(abrir({ escena: ESCENA, invisible: VENTANA === "invisible" }))
    const listas = ventanas.map(({ ventana }) => new Promise((r) => ipcMain.once("listo", (_e, err) => r(err))))
    const errores = (await Promise.all(listas)).filter(Boolean)
    if (errores.length) throw new Error(errores.join("\n"))
    console.log(`[banco] ${ventanas.length} ventana(s) listas; calentando ${CALENTAMIENTO} s`)

    const capturas = VENTANA === "invisible" && CAPTURA > 0 ? ventanas.map(({ ventana }, i) => capturar(ventana, `prueba-${i}`, CAPTURA, ESCENA === "maestro")) : []

    await esperar(CALENTAMIENTO * 1000)
    for (const { ventana } of ventanas) await ventana.webContents.executeJavaScript("window.__reiniciar()")
    for (const c of capturas) Object.assign(c, { pintados: 0, copiados: 0, saltados: 0, msCopia: [], msReparto: [] })

    const gpu = medirGpu()
    app.getAppMetrics() // la primera lectura de CPU no cuenta
    const cpu = []
    const reloj = setInterval(() => cpu.push(app.getAppMetrics()), 1000)
    await esperar(SEGUNDOS * 1000)
    clearInterval(reloj)
    gpu.detener()

    const paginas = []
    for (const { ventana } of ventanas) paginas.push(await ventana.webContents.executeJavaScript("window.__estadisticas()"))

    const pids = new Set(cpu.flat().map((p) => p.pid))
    const porTipo = {}
    for (const lectura of cpu) {
        const suma = {}
        for (const p of lectura) suma[p.type] = (suma[p.type] || 0) + p.cpu.percentCPUUsage
        for (const [tipo, v] of Object.entries(suma)) (porTipo[tipo] ||= []).push(v)
    }
    const cpuPromedio = Object.fromEntries(Object.entries(porTipo).map(([t, v]) => [t, +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)]))
    const cpuTotal = +Object.values(cpuPromedio)
        .reduce((a, b) => a + b, 0)
        .toFixed(1)

    const resultado = {
        nombre: op.nombre || "sin-nombre",
        fecha: new Date().toISOString(),
        opciones: { escena: ESCENA, ventana: VENTANA, copias: COPIAS, captura: CAPTURA, gpu: op.gpu || "defecto", segundos: SEGUNDOS },
        gpuActiva: (await app.getGPUInfo("basic")).gpuDevice?.find((d) => d.active),
        paginas,
        cpu: { porTipo: cpuPromedio, total: cpuTotal, nota: "% de un núcleo (este PC tiene 8 núcleos = 800%)" },
        gpu: resumirGpu(gpu.muestras, pids),
        captura: capturas.map((c) => ({
            pintadosPorSegundo: +(c.pintados / SEGUNDOS).toFixed(1),
            copiadosPorSegundo: +(c.copiados / SEGUNDOS).toFixed(1),
            saltados: c.saltados,
            msCopiaPromedio: +(c.msCopia.reduce((a, b) => a + b, 0) / (c.msCopia.length || 1)).toFixed(2),
            msCopiaP99: +percentil(c.msCopia, 99).toFixed(2),
            msRepartoPromedio: c.msReparto.length ? +(c.msReparto.reduce((a, b) => a + b, 0) / c.msReparto.length).toFixed(2) : null,
            error: c.error
        }))
    }
    mkdirSync(RESULTADOS, { recursive: true })
    writeFileSync(join(RESULTADOS, `${resultado.nombre}.json`), JSON.stringify(resultado, null, 2))
    console.log(JSON.stringify(resultado, null, 2))
}

// fotos de la escena en momentos distintos (cada 3 s cambia el modo de mezcla), para revisar a ojo que se vea bien
async function tomarFotos(carpeta) {
    if (!carpeta) throw new Error("Falta --carpeta=<ruta completa>")
    mkdirSync(carpeta, { recursive: true })
    for (const escena of ["una", "maestro"]) {
        const { ventana } = abrir({ escena, invisible: false, hud: true })
        const err = await new Promise((r) => ipcMain.once("listo", (_e, e) => r(e)))
        if (err) throw new Error(err)
        const veces = escena === "una" ? [1.5, 4.5, 7.5, 10.5, 13.5] : [4.5]
        let antes = 0
        for (const [i, t] of veces.entries()) {
            await esperar((t - antes) * 1000)
            antes = t
            const imagen = await ventana.webContents.capturePage()
            const ruta = join(carpeta, `${escena}-${i + 1}.png`)
            writeFileSync(ruta, imagen.toPNG())
            console.log(`Foto: ${ruta}`)
        }
        ventana.destroy()
    }
}

// cuántos cuadros por segundo entrega cada video de prueba, visible y oculto (display:none)
async function revisarVideos() {
    const ventana = new BrowserWindow({ width: 800, height: 500, show: true, backgroundColor: "#000000" })
    await ventana.loadFile(join(__dirname, "index.html"), { query: { escena: "nada" } })
    const resultado = await ventana.webContents.executeJavaScript(`(async () => {
        const out = {}
        for (const [nombre, estilo] of [["prueba-a.mp4", "width:320px"], ["prueba-a.mp4", "display:none"], ["prueba-b.mp4", "width:320px"], ["prueba-b.mp4", "display:none"]]) {
            const v = document.createElement("video")
            v.src = "medios/" + nombre; v.muted = true; v.loop = true; v.style.cssText = estilo
            document.body.appendChild(v); await v.play(); await new Promise((r) => setTimeout(r, 1500))
            let n = 0, t0 = 0, m0 = 0, m1 = 0
            const q0 = v.getVideoPlaybackQuality()
            await new Promise((res) => { const cb = (ahora, md) => { if (!t0) { t0 = ahora; m0 = md.mediaTime } n++; m1 = md.mediaTime; if (ahora - t0 < 4000) v.requestVideoFrameCallback(cb); else res() }; v.requestVideoFrameCallback(cb) })
            const q = v.getVideoPlaybackQuality()
            out[nombre + " (" + estilo + ")"] = { cuadrosMostradosPorSegundo: +(n / 4).toFixed(1), segundosDeVideo: +(m1 - m0).toFixed(2), perdidosEn4s: q.droppedVideoFrames - q0.droppedVideoFrames, decodificadosEn4s: q.totalVideoFrames - q0.totalVideoFrames }
            v.remove()
        }
        return out
    })()`)
    console.log(JSON.stringify(resultado, null, 2))
}

ipcMain.handle("guardar-video", (_e, nombre, datos, tipo) => {
    mkdirSync(MEDIOS, { recursive: true })
    writeFileSync(join(MEDIOS, nombre), Buffer.from(datos))
    console.log(`Video creado: ${nombre} (${tipo}, ${(datos.byteLength / 1e6).toFixed(1)} MB)`)
})

// el banco decide cuándo terminar (por defecto Electron cierra al cerrar la última ventana)
app.on("window-all-closed", () => null)

app.whenReady().then(async () => {
    try {
        if (tarea === "generar") {
            abrir({ escena: "generar", invisible: false })
            const err = await new Promise((r) => ipcMain.once("listo", (_e, e) => r(e)))
            if (err) throw new Error(err)
        } else if (tarea === "medir") {
            await medir()
        } else if (tarea === "videos") {
            await revisarVideos()
        } else if (tarea === "fotos") {
            await tomarFotos(op.carpeta)
        } else {
            abrir({ escena: ESCENA, invisible: false, hud: true })
            return // la demo queda abierta
        }
        app.quit()
    } catch (err) {
        console.error("ERROR:", err)
        app.exit(1)
    }
})
