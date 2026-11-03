// Escenas del prototipo y medición por cuadro.
//   una:     una salida 1920×1080 (como "Video"): fondo con crossfade A↔B, una capa de video con modo de mezcla y
//            ajuste de esquinas, y la letra encima.
//   maestro: el lienzo maestro 3840×2160 con las 4 salidas del mapa, cada video se decodifica una sola vez.
//   generar: crea los dos videos de prueba 1080p60 (H.264) con el codificador de Chromium.

import { MODOS, MotorRender } from "./motor.js"

const parametros = new URLSearchParams(location.search)
const ESCENA = parametros.get("escena") || "una"
const VER_DATOS = parametros.get("hud") === "1"

const LETRAS = ["Cuán grande es Él", "Mi corazón entona la canción", "Santo, santo, santo", "Digno es el Cordero", "Tu fidelidad es grande"]
const MODOS_EN_ORDEN = ["sumar", "multiplicar", "pantalla", "superponer", "diferencia"]

// ---------------- medición ----------------
const tiempos = []
let ultimo = 0
let arranque = 0
const medir = (ahora) => {
    if (ultimo) tiempos.push(ahora - ultimo)
    ultimo = ahora
}

function percentil(lista, p) {
    if (!lista.length) return 0
    const orden = [...lista].sort((a, b) => a - b)
    return orden[Math.min(orden.length - 1, Math.floor((p / 100) * orden.length))]
}

// al terminar el calentamiento se empieza a contar de cero
let baseVideos = []
window.__reiniciar = () => {
    tiempos.length = 0
    ultimo = 0
    arranque = performance.now()
    if (window.__motor) window.__motor.tiemposGpu.length = 0
    baseVideos = [...document.querySelectorAll("video")].map((v) => v.getVideoPlaybackQuality())
    baseSubidas = videosDelMotor().map((f) => f.subidas)
}
let baseSubidas = []
const videosDelMotor = () => (window.__motor?.fuentes || []).filter((f) => f.elemento instanceof HTMLVideoElement)

window.__estadisticas = () => {
    const segundos = (performance.now() - arranque) / 1000
    const videos = [...document.querySelectorAll("video")].map((v, i) => {
        const q = v.getVideoPlaybackQuality()
        const base = baseVideos[i] || { totalVideoFrames: 0, droppedVideoFrames: 0 }
        const fuente = videosDelMotor()[i]
        return {
            // cuadros nuevos del video que llegaron a la GPU (lo que de verdad se ve)
            cuadrosNuevosPorSegundo: fuente ? +((fuente.subidas - (baseSubidas[i] || 0)) / segundos).toFixed(1) : null,
            decodificadosPorSegundo: +((q.totalVideoFrames - base.totalVideoFrames) / segundos).toFixed(1),
            ancho: v.videoWidth,
            alto: v.videoHeight
        }
    })
    const gpu = window.__motor?.tiemposGpu || []
    return {
        escena: ESCENA,
        tarjeta: window.__motor?.tarjeta,
        segundos,
        cuadros: tiempos.length,
        cps: tiempos.length / segundos,
        msPromedio: tiempos.reduce((a, b) => a + b, 0) / (tiempos.length || 1),
        msP99: percentil(tiempos, 99),
        msMax: Math.max(0, ...tiempos),
        // cuadros que tardaron más de 1,5 veces lo normal (a 60 Hz: más de 25 ms) = saltos visibles
        saltos: tiempos.filter((t) => t > 25).length,
        videos,
        gpuMsPromedio: gpu.length ? gpu.reduce((a, b) => a + b, 0) / gpu.length : null,
        gpuMsP99: gpu.length ? percentil(gpu, 99) : null
    }
}

// ---------------- fuentes ----------------
function crearVideo(nombre) {
    const v = document.createElement("video")
    v.src = `medios/${nombre}`
    v.muted = true
    v.loop = true
    v.playsInline = true
    v.style.display = "none"
    document.body.appendChild(v)
    return v
}

function crearLetra(ancho, alto) {
    const c = document.createElement("canvas")
    c.width = ancho
    c.height = alto
    const ctx = c.getContext("2d")
    let i = 0
    const dibujar = () => {
        ctx.clearRect(0, 0, ancho, alto)
        ctx.font = `bold ${Math.round(alto * 0.085)}px "Segoe UI", sans-serif`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.shadowColor = "rgba(0,0,0,0.85)"
        ctx.shadowBlur = alto * 0.012
        ctx.lineWidth = alto * 0.006
        ctx.strokeStyle = "black"
        ctx.fillStyle = "white"
        const linea = LETRAS[i % LETRAS.length]
        ctx.strokeText(linea, ancho / 2, alto * 0.78)
        ctx.fillText(linea, ancho / 2, alto * 0.78)
        i++
    }
    dibujar()
    return { canvas: c, siguiente: dibujar }
}

function crearReloj(ancho, alto) {
    const c = document.createElement("canvas")
    c.width = ancho
    c.height = alto
    const ctx = c.getContext("2d")
    const dibujar = () => {
        ctx.clearRect(0, 0, ancho, alto)
        ctx.font = `bold ${Math.round(alto * 0.12)}px Consolas, monospace`
        ctx.textAlign = "right"
        ctx.fillStyle = "#ff3b3b"
        ctx.fillText(new Date().toLocaleTimeString(), ancho * 0.96, alto * 0.16)
    }
    dibujar()
    return { canvas: c, siguiente: dibujar }
}

// esquinas que se mueven (como si alguien ajustara un keystone), para medir el peor caso
function esquinasAnimadas(t) {
    const m = 0.06 + 0.04 * Math.sin(t * 0.7)
    return [
        [0.1 + m, 0.08],
        [0.9, 0.08 + m],
        [0.92 - m * 0.5, 0.92],
        [0.08, 0.9 - m]
    ]
}

// ---------------- escenas ----------------
async function iniciarRender() {
    const canvas = document.getElementById("lienzo")
    const maestro = ESCENA === "maestro"
    canvas.width = maestro ? 3840 : 1920
    canvas.height = maestro ? 2160 : 1080

    const motor = new MotorRender(canvas)
    window.__motor = motor

    const videoA = crearVideo("prueba-a.mp4")
    const videoB = crearVideo("prueba-b.mp4")
    await Promise.all([videoA.play(), videoB.play()])

    const A = motor.fuente(videoA)
    const B = motor.fuente(videoB)
    const letra = crearLetra(1920, 1080)
    const L = motor.fuente(letra.canvas)
    const reloj = crearReloj(1920, 1080)
    const R = motor.fuente(reloj.canvas)

    // la letra cambia cada 4 s y el reloj cada segundo (solo entonces se suben a la GPU)
    setInterval(() => {
        letra.siguiente()
        L.nueva = true
    }, 4000)
    setInterval(() => {
        reloj.siguiente()
        R.nueva = true
    }, 1000)

    const hud = document.getElementById("hud")
    arranque = performance.now()

    const cuadro = (ahora) => {
        medir(ahora)
        const t = (ahora - arranque) / 1000
        const cruce = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 8) // crossfade continuo A↔B cada 8 s
        const modo = MODOS[MODOS_EN_ORDEN[Math.floor(t / 3) % MODOS_EN_ORDEN.length]] // cambia cada 3 s
        const fondo = { a: A, b: B, cruce }
        const capaAjustada = { a: B, modo, opacidad: 0.7, esquinas: esquinasAnimadas(t) }
        const capaLetra = { a: L }

        motor.empezarMedicion()
        if (!maestro) {
            const salida = motor.componer("video", 1920, 1080, [fondo, capaAjustada, capaLetra])
            motor.presentar(salida, 0, 0, 1920, 1080)
        } else {
            // el fondo se compone UNA vez y se reutiliza en Background y en Video
            const soloFondo = motor.componer("fondo", 1920, 1080, [fondo])
            const conAjuste = motor.componer("video", 1920, 1080, [{ a: { textura: soloFondo, origenAbajo: true } }, capaAjustada, capaLetra])
            const redes = motor.componer("redes", 1920, 1080, [capaLetra])
            const stage = motor.componer("stage", 1920, 1080, [capaLetra, { a: R }])
            // WebGL cuenta y desde abajo: arriba = 1080
            motor.presentar(soloFondo, 0, 1080, 1920, 1080) // SDI 1 Background
            motor.presentar(redes, 1920, 1080, 1920, 1080) // SDI 2 Redes
            motor.presentar(stage, 0, 0, 1920, 1080) // SDI 3 STAGE
            motor.presentar(conAjuste, 1920, 0, 1920, 1080) // SDI 4 Video
        }
        motor.terminarMedicion()

        if (VER_DATOS && tiempos.length % 30 === 0) {
            const e = window.__estadisticas()
            hud.textContent = `${e.tarjeta}\n${e.cps.toFixed(1)} cps · p99 ${e.msP99.toFixed(1)} ms · saltos ${e.saltos}\nmodo de mezcla: ${MODOS_EN_ORDEN[Math.floor(t / 3) % MODOS_EN_ORDEN.length]} · crossfade ${(cruce * 100).toFixed(0)}%`
        }
        requestAnimationFrame(cuadro)
    }
    requestAnimationFrame(cuadro)
}

// ---------------- generar los videos de prueba ----------------
async function generarVideos() {
    const canvas = document.getElementById("lienzo")
    canvas.width = 1920
    canvas.height = 1080
    const ctx = canvas.getContext("2d")

    const tipos = ["video/mp4;codecs=avc1.640028", "video/mp4;codecs=avc1", "video/webm;codecs=vp9"]
    const tipo = tipos.find((t) => MediaRecorder.isTypeSupported(t))
    if (!tipo) throw new Error("MediaRecorder no puede grabar video aquí")

    for (const [nombre, dibujo] of [
        ["prueba-a.mp4", dibujoA],
        ["prueba-b.mp4", dibujoB]
    ]) {
        const flujo = canvas.captureStream(60)
        const grabador = new MediaRecorder(flujo, { mimeType: tipo, videoBitsPerSecond: 16_000_000 })
        const partes = []
        grabador.ondataavailable = (e) => e.data.size && partes.push(e.data)
        const fin = new Promise((r) => (grabador.onstop = r))
        grabador.start(1000)
        const inicio = performance.now()
        let n = 0
        await new Promise((listo) => {
            const paso = () => {
                const t = (performance.now() - inicio) / 1000
                dibujo(ctx, t, n++)
                if (t < 20) requestAnimationFrame(paso)
                else listo()
            }
            requestAnimationFrame(paso)
        })
        grabador.stop()
        await fin
        const datos = await new Blob(partes, { type: tipo }).arrayBuffer()
        await window.prototipo.guardarVideo(nombre, datos, tipo)
    }
}

// patrón A: franjas de color que se mueven, círculos y contador de cuadros (mucho movimiento, difícil de comprimir)
function dibujoA(ctx, t, n) {
    for (let i = 0; i < 24; i++) {
        ctx.fillStyle = `hsl(${(i * 15 + t * 90) % 360}, 80%, ${40 + 15 * Math.sin(t * 2 + i)}%)`
        ctx.fillRect(((i * 80 + t * 400) % 2000) - 80, 0, 82, 1080)
    }
    for (let i = 0; i < 12; i++) {
        ctx.beginPath()
        ctx.fillStyle = `rgba(255,255,255,${0.15 + 0.1 * Math.sin(t + i)})`
        ctx.arc(960 + 700 * Math.cos(t * 0.8 + i), 540 + 400 * Math.sin(t * 1.1 + i * 2), 60 + 30 * Math.sin(t * 3 + i), 0, Math.PI * 2)
        ctx.fill()
    }
    ctx.fillStyle = "black"
    ctx.fillRect(40, 40, 360, 90)
    ctx.fillStyle = "white"
    ctx.font = "bold 64px Consolas"
    ctx.fillText(`A ${n}`, 60, 110)
}

// patrón B: degradado que gira, rejilla y ruido (para que las mezclas se noten)
function dibujoB(ctx, t, n) {
    const g = ctx.createLinearGradient(960 + 960 * Math.cos(t), 540 + 540 * Math.sin(t), 960 - 960 * Math.cos(t), 540 - 540 * Math.sin(t))
    g.addColorStop(0, `hsl(${(t * 40) % 360}, 90%, 50%)`)
    g.addColorStop(1, `hsl(${(t * 40 + 180) % 360}, 90%, 30%)`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 1920, 1080)
    ctx.strokeStyle = "rgba(255,255,255,0.35)"
    ctx.lineWidth = 3
    const d = (t * 120) % 120
    for (let x = -120; x < 2040; x += 120) {
        ctx.beginPath()
        ctx.moveTo(x + d, 0)
        ctx.lineTo(x + d, 1080)
        ctx.stroke()
    }
    for (let y = -120; y < 1200; y += 120) {
        ctx.beginPath()
        ctx.moveTo(0, y + d)
        ctx.lineTo(1920, y + d)
        ctx.stroke()
    }
    // pocos puntos: con muchos, el Intel no alcanza a dibujar 60 cuadros por segundo mientras graba
    ctx.fillStyle = "rgba(255,255,255,0.4)"
    for (let i = 0; i < 60; i++) ctx.fillRect(Math.random() * 1920, Math.random() * 1080, 8, 8)
    ctx.fillStyle = "black"
    ctx.fillRect(1520, 40, 360, 90)
    ctx.fillStyle = "white"
    ctx.font = "bold 64px Consolas"
    ctx.fillText(`B ${n}`, 1540, 110)
}

if (ESCENA !== "nada")
    (ESCENA === "generar" ? generarVideos() : iniciarRender()).then(
        () => window.prototipo.listo(null),
        (err) => window.prototipo.listo(String(err?.stack || err))
    )
