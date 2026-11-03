// Segundo prototipo: el fondo en WebGL (motor del primer prototipo) y la LETRA REAL de FreeShow encima,
// dibujada por el componente original Output.svelte (sin modificarlo), con sus estilos y transiciones.
// Escenas (?escena=):
//   maestro2:  página 3840×1080 — izquierda Background (solo WebGL), derecha Video (WebGL + letra de FreeShow)
//   sep-fondo: 1920×1080, solo el fondo WebGL (como una salida Background aparte)
//   sep-video: 1920×1080, fondo WebGL + letra de FreeShow (como una salida Video aparte)
//   redes:     1920×1080, solo la letra de FreeShow sobre negro, sin WebGL (salida liviana)

import { currentWindow, outputs, showsCache, styles } from "../../../frontend/stores"
import Output from "../../../frontend/components/output/Output.svelte"
// @ts-expect-error: el motor del primer prototipo es JavaScript sin tipos
import { MODOS, MotorRender } from "../prototipo/motor.js"
import { cancionDePrueba, ESTILO_LETRA, ESTILO_REDES } from "./cancion"

const parametros = new URLSearchParams(location.search)
const ESCENA = parametros.get("escena") || "maestro2"
const CON_WEBGL = ESCENA !== "redes"
const ANCHO = ESCENA === "maestro2" ? 3840 : 1920
const ALTO = 1080
const MODOS_EN_ORDEN = ["sumar", "multiplicar", "pantalla", "superponer", "diferencia"]

// ---------------- medición (igual que el primer prototipo) ----------------
const tiempos: number[] = []
let ultimo = 0
let arranque = 0
const percentil = (l: number[], p: number) => (l.length ? [...l].sort((a, b) => a - b)[Math.min(l.length - 1, Math.floor((p / 100) * l.length))] : 0)
let motor: any = null
let cambiosDeLetra = 0

;(window as any).__reiniciar = () => {
    tiempos.length = 0
    ultimo = 0
    arranque = performance.now()
    if (motor) motor.tiemposGpu.length = 0
    cambiosDeLetra = 0
}
;(window as any).__estadisticas = () => {
    const segundos = (performance.now() - arranque) / 1000
    const videos = [...document.querySelectorAll("video.prototipo")].map((v: any) => ({ ancho: v.videoWidth, alto: v.videoHeight }))
    const gpu = motor?.tiemposGpu || []
    return {
        escena: ESCENA,
        tarjeta: motor?.tarjeta || "(sin WebGL)",
        segundos,
        cuadros: tiempos.length,
        cps: tiempos.length / segundos,
        msP99: percentil(tiempos, 99),
        msMax: Math.max(0, ...tiempos),
        saltos: tiempos.filter((t) => t > 25).length,
        cambiosDeLetra,
        videos,
        gpuMsPromedio: gpu.length ? gpu.reduce((a: number, b: number) => a + b, 0) / gpu.length : null
    }
}

// ---------------- la letra real de FreeShow ----------------
function montarLetra(contenedor: HTMLElement, salidaId: string, estilo: string) {
    const { id, show, diapositivas } = cancionDePrueba()
    showsCache.set({ [id]: show } as any)
    styles.update((s: any) => ({ ...s, [ESTILO_LETRA.id]: ESTILO_LETRA.estilo, [ESTILO_REDES.id]: ESTILO_REDES.estilo }))
    outputs.set({
        [salidaId]: { name: salidaId, enabled: true, active: true, style: estilo, transparent: estilo === ESTILO_LETRA.id, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, screen: null, out: { slide: { id, layout: "l1", index: 0 } } }
    } as any)
    new Output({ target: contenedor, props: { outputId: salidaId, style: "width: 100%; height: 100%;" } })

    // pasar a la siguiente diapositiva cada 4 s, como un operador (FreeShow hace su transición de letra)
    let i = 0
    setInterval(() => {
        i = (i + 1) % diapositivas
        cambiosDeLetra++
        outputs.update((o: any) => {
            o[salidaId] = { ...o[salidaId], out: { ...o[salidaId].out, slide: { ...o[salidaId].out.slide, index: i } } }
            return o
        })
    }, 4000)
}

// ---------------- el fondo WebGL ----------------
async function iniciarWebgl(canvas: HTMLCanvasElement) {
    canvas.width = ANCHO
    canvas.height = ALTO
    motor = new MotorRender(canvas)
    const crearVideo = (nombre: string) => {
        const v = document.createElement("video")
        v.className = "prototipo"
        v.src = `../prototipo/medios/${nombre}`
        v.muted = true
        v.loop = true
        v.style.display = "none"
        document.body.appendChild(v)
        return v
    }
    const videoA = crearVideo("prueba-a.mp4")
    const videoB = crearVideo("prueba-b.mp4")
    await Promise.all([videoA.play(), videoB.play()])
    const A = motor.fuente(videoA)
    const B = motor.fuente(videoB)

    return (t: number) => {
        const cruce = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 8)
        const modo = MODOS[MODOS_EN_ORDEN[Math.floor(t / 3) % MODOS_EN_ORDEN.length]]
        const m = 0.06 + 0.04 * Math.sin(t * 0.7)
        const esquinas = [
            [0.1 + m, 0.08],
            [0.9, 0.08 + m],
            [0.92 - m * 0.5, 0.92],
            [0.08, 0.9 - m]
        ]
        motor.empezarMedicion()
        // el fondo se compone UNA vez y se reutiliza
        const soloFondo = motor.componer("fondo", 1920, 1080, [{ a: A, b: B, cruce }])
        if (ESCENA === "sep-fondo") motor.presentar(soloFondo, 0, 0, 1920, 1080)
        else {
            const video = motor.componer("video", 1920, 1080, [{ a: { textura: soloFondo, origenAbajo: true } }, { a: B, modo, opacidad: 0.7, esquinas }])
            if (ESCENA === "maestro2") {
                motor.presentar(soloFondo, 0, 0, 1920, 1080) // izquierda: Background
                motor.presentar(video, 1920, 0, 1920, 1080) // derecha: Video
            } else motor.presentar(video, 0, 0, 1920, 1080)
        }
        motor.terminarMedicion()
    }
}

async function iniciar() {
    currentWindow.set("output" as any)
    const pagina = document.getElementById("pagina")!
    pagina.style.width = `${ANCHO}px`
    pagina.style.height = `${ALTO}px`

    let dibujar: ((t: number) => void) | null = null
    if (CON_WEBGL) dibujar = await iniciarWebgl(document.getElementById("lienzo") as HTMLCanvasElement)
    else (document.getElementById("lienzo") as HTMLElement).remove()

    // la letra va encima del WebGL, en la región de Video (o en toda la página para Redes)
    if (ESCENA !== "sep-fondo") {
        const letra = document.getElementById("letra")!
        letra.style.left = ESCENA === "maestro2" ? "1920px" : "0px"
        montarLetra(letra, ESCENA === "redes" ? "redes" : "video", ESCENA === "redes" ? ESTILO_REDES.id : ESTILO_LETRA.id)
    }

    arranque = performance.now()
    const cuadro = (ahora: number) => {
        if (ultimo) tiempos.push(ahora - ultimo)
        ultimo = ahora
        dibujar?.((ahora - arranque) / 1000)
        requestAnimationFrame(cuadro)
    }
    requestAnimationFrame(cuadro)
}

iniciar().then(
    () => (window as any).prototipo?.listo(null),
    (err) => (window as any).prototipo?.listo(String(err?.stack || err))
)
