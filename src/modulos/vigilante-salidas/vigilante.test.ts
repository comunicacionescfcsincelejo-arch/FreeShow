import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AJUSTES, VigilanteSalidas, type Reloj, type VentanaVigilada } from "./vigilante"

// Una ventana de salida falsa que anota todo lo que le pasa, en orden.
function ventanaFalsa(opciones: { fueraDePantalla?: boolean; responde?: () => boolean } = {}) {
    const eventos: string[] = []
    const estado = { pintando: true, cerrada: false, recargas: 0 }
    let vigilante: VigilanteSalidas | null = null

    const ventana: VentanaVigilada = {
        clave: "7",
        salidaId: "salida-video",
        fueraDePantalla: opciones.fueraDePantalla ?? true,
        destruida: () => estado.cerrada,
        recargar: () => {
            estado.recargas++
            eventos.push("recargar")
        },
        pausarPintado: () => {
            estado.pintando = false
            eventos.push("pausar")
        },
        reanudarPintado: () => {
            estado.pintando = true
            eventos.push("reanudar")
        },
        terminarAnimaciones: async () => {
            eventos.push("terminar-animaciones")
        },
        forzarCaida: () => {
            eventos.push("forzar-caida")
            // como Electron: forzar la caída dispara render-process-gone
            vigilante?.alCaer(ventana, "killed")
        },
        latido: () => ((opciones.responde?.() ?? true) ? Promise.resolve() : new Promise(() => {}))
    }

    return { ventana, eventos, estado, conectar: (v: VigilanteSalidas) => (vigilante = v) }
}

const reloj: Reloj = {
    ahora: () => Date.now(),
    esperar: (ms, fn) => setTimeout(fn, ms),
    cancelar: (t) => clearTimeout(t as NodeJS.Timeout)
}

function crear() {
    const registro = { info: vi.fn(), error: vi.fn() }
    return { vigilante: new VigilanteSalidas(reloj, registro), registro }
}

// simula que la página recargada arranca y aplica contenido
function paginaRecargadaConContenido(vigilante: VigilanteSalidas, clave: string) {
    vigilante.alIniciarPagina(clave)
    vigilante.alInformarRender(clave, { busy: true, seq: 1 })
    vigilante.alInformarRender(clave, { busy: false, seq: 40 })
}

beforeEach(() => {
    vi.useFakeTimers()
})
afterEach(() => {
    vi.useRealTimers()
})

describe("vigilante de salidas: caída de una salida", () => {
    it("se reabre sola y vuelve a pintar solo cuando tiene contenido", async () => {
        const { vigilante } = crear()
        const f = ventanaFalsa()

        vigilante.alCaer(f.ventana, "crashed")
        // se congela en el acto: la tarjeta repite el último cuadro
        expect(f.eventos).toEqual(["pausar"])
        expect(f.estado.pintando).toBe(false)
        expect(vigilante.estado("7")).toBe("recuperando")

        await vi.advanceTimersByTimeAsync(AJUSTES.esperaRecargaMs[0])
        expect(f.estado.recargas).toBe(1)
        // recargada pero todavía sin contenido: sigue congelada
        expect(f.estado.pintando).toBe(false)

        paginaRecargadaConContenido(vigilante, "7")
        await vi.advanceTimersByTimeAsync(AJUSTES.quietudMs - 1)
        expect(f.estado.pintando).toBe(false)

        await vi.advanceTimersByTimeAsync(1)
        expect(f.estado.pintando).toBe(true)
        expect(vigilante.estado("7")).toBe("normal")
    })

    it("nunca pinta entre la caída y el contenido (orden: congelar → recargar → terminar animaciones → pintar)", async () => {
        const { vigilante } = crear()
        const f = ventanaFalsa()

        vigilante.alCaer(f.ventana, "crashed")
        await vi.advanceTimersByTimeAsync(AJUSTES.esperaRecargaMs[0])
        paginaRecargadaConContenido(vigilante, "7")
        await vi.advanceTimersByTimeAsync(AJUSTES.quietudMs)

        // "pausar" se repite al arrancar la página (la vista nueva podría pintar)
        expect(f.eventos).toEqual(["pausar", "recargar", "pausar", "terminar-animaciones", "reanudar"])
    })

    it("cada cambio de contenido reinicia la espera de quietud", async () => {
        const { vigilante } = crear()
        const f = ventanaFalsa()

        vigilante.alCaer(f.ventana, "crashed")
        await vi.advanceTimersByTimeAsync(AJUSTES.esperaRecargaMs[0])
        vigilante.alIniciarPagina("7")
        vigilante.alInformarRender("7", { busy: false, seq: 3 })
        await vi.advanceTimersByTimeAsync(AJUSTES.quietudMs - 100)
        vigilante.alInformarRender("7", { busy: false, seq: 9 })
        await vi.advanceTimersByTimeAsync(AJUSTES.quietudMs - 100)
        expect(f.estado.pintando).toBe(false)

        await vi.advanceTimersByTimeAsync(100)
        expect(f.estado.pintando).toBe(true)
    })

    it("si la página recargada no recibe contenido, se recarga otra vez y sigue congelada", async () => {
        const { vigilante } = crear()
        const f = ventanaFalsa()

        vigilante.alCaer(f.ventana, "crashed")
        await vi.advanceTimersByTimeAsync(AJUSTES.esperaRecargaMs[0])
        vigilante.alIniciarPagina("7")
        // nunca llega contenido (seq 0)
        await vi.advanceTimersByTimeAsync(AJUSTES.listoMaxMs)
        expect(f.estado.pintando).toBe(false)
        expect(vigilante.estado("7")).toBe("recuperando")

        await vi.advanceTimersByTimeAsync(AJUSTES.esperaRecargaMs[1])
        expect(f.estado.recargas).toBe(2)

        paginaRecargadaConContenido(vigilante, "7")
        await vi.advanceTimersByTimeAsync(AJUSTES.quietudMs)
        expect(f.estado.pintando).toBe(true)
    })

    it("con contenido pero siempre animada (efectos), vuelve a pintar al tiempo máximo", async () => {
        const { vigilante } = crear()
        const f = ventanaFalsa()

        vigilante.alCaer(f.ventana, "crashed")
        await vi.advanceTimersByTimeAsync(AJUSTES.esperaRecargaMs[0])
        vigilante.alIniciarPagina("7")
        // un efecto cambia la página sin parar
        for (let t = 0; t < AJUSTES.listoMaxMs; t += 500) {
            vigilante.alInformarRender("7", { busy: true, seq: 5 + t })
            await vi.advanceTimersByTimeAsync(500)
        }
        expect(f.estado.pintando).toBe(true)
        expect(vigilante.estado("7")).toBe("normal")
    })

    it("tras varias caídas seguidas deja de intentar y se queda en el último cuadro", async () => {
        const { vigilante, registro } = crear()
        const f = ventanaFalsa()

        for (let i = 0; i <= AJUSTES.maxCaidas; i++) {
            vigilante.alCaer(f.ventana, "crashed")
            await vi.advanceTimersByTimeAsync(AJUSTES.esperaRecargaMs[AJUSTES.esperaRecargaMs.length - 1])
        }

        expect(vigilante.estado("7")).toBe("abandonada")
        expect(f.estado.recargas).toBe(AJUSTES.maxCaidas)
        expect(f.estado.pintando).toBe(false)
        expect(registro.error).toHaveBeenCalled()

        // ni más caídas ni más recargas
        vigilante.alCaer(f.ventana, "crashed")
        await vi.advanceTimersByTimeAsync(60000)
        expect(f.estado.recargas).toBe(AJUSTES.maxCaidas)
    })

    it("las caídas viejas no cuentan: tras 10 minutos se vuelve a intentar normal", async () => {
        const { vigilante } = crear()
        const f = ventanaFalsa()

        for (let i = 0; i < AJUSTES.maxCaidas; i++) {
            vigilante.alCaer(f.ventana, "crashed")
            await vi.advanceTimersByTimeAsync(AJUSTES.esperaRecargaMs[AJUSTES.esperaRecargaMs.length - 1])
            paginaRecargadaConContenido(vigilante, "7")
            await vi.advanceTimersByTimeAsync(AJUSTES.quietudMs)
        }
        await vi.advanceTimersByTimeAsync(AJUSTES.ventanaCaidasMs)

        vigilante.alCaer(f.ventana, "crashed")
        expect(vigilante.estado("7")).toBe("recuperando")
    })

    it("si la salida se cerró a propósito, no se recarga", async () => {
        const { vigilante } = crear()
        const f = ventanaFalsa()

        vigilante.alCaer(f.ventana, "crashed")
        f.estado.cerrada = true
        await vi.advanceTimersByTimeAsync(10000)
        expect(f.estado.recargas).toBe(0)
    })

    it("una ventana en pantalla (monitor) se recarga sin tocar el pintado", async () => {
        const { vigilante } = crear()
        const f = ventanaFalsa({ fueraDePantalla: false })

        vigilante.alCaer(f.ventana, "crashed")
        await vi.advanceTimersByTimeAsync(AJUSTES.esperaRecargaMs[0])
        paginaRecargadaConContenido(vigilante, "7")
        await vi.advanceTimersByTimeAsync(AJUSTES.quietudMs)

        expect(f.eventos).toEqual(["recargar", "terminar-animaciones"])
        expect(vigilante.estado("7")).toBe("normal")
    })

    it("necesitaContenido avisa cuando hay que reponer la copia guardada", async () => {
        const { vigilante } = crear()
        const f = ventanaFalsa()

        expect(vigilante.necesitaContenido("7")).toBe(false)
        vigilante.alCaer(f.ventana, "crashed")
        await vi.advanceTimersByTimeAsync(AJUSTES.esperaRecargaMs[0])
        expect(vigilante.necesitaContenido("7")).toBe(true)
        vigilante.alInformarRender("7", { busy: false, seq: 2 })
        expect(vigilante.necesitaContenido("7")).toBe(false)
    })
})

describe("vigilante de salidas: salida congelada", () => {
    it("si deja de responder 15 s, se fuerza su caída y se recupera", async () => {
        const { vigilante } = crear()
        let responde = true
        const f = ventanaFalsa({ responde: () => responde })
        f.conectar(vigilante)

        // responde bien: nada pasa
        for (let i = 0; i < 5; i++) {
            vigilante.revisarLatidos([f.ventana])
            await vi.advanceTimersByTimeAsync(AJUSTES.latidoCadaMs)
        }
        expect(f.eventos).toEqual([])

        // se congela
        responde = false
        for (let i = 0; i < AJUSTES.latidoFallosMax; i++) {
            vigilante.revisarLatidos([f.ventana])
            await vi.advanceTimersByTimeAsync(AJUSTES.latidoCadaMs)
        }
        expect(f.eventos.slice(0, 2)).toEqual(["forzar-caida", "pausar"])
        expect(vigilante.estado("7")).toBe("recuperando")

        responde = true
        await vi.advanceTimersByTimeAsync(AJUSTES.esperaRecargaMs[0])
        expect(f.estado.recargas).toBe(1)
        paginaRecargadaConContenido(vigilante, "7")
        await vi.advanceTimersByTimeAsync(AJUSTES.quietudMs)
        expect(f.estado.pintando).toBe(true)
    })

    it("una pausa corta (menos de 15 s) no reinicia la salida", async () => {
        const { vigilante } = crear()
        let responde = false
        const f = ventanaFalsa({ responde: () => responde })
        f.conectar(vigilante)

        for (let i = 0; i < AJUSTES.latidoFallosMax - 1; i++) {
            vigilante.revisarLatidos([f.ventana])
            await vi.advanceTimersByTimeAsync(AJUSTES.latidoCadaMs)
        }
        responde = true
        vigilante.revisarLatidos([f.ventana])
        await vi.advanceTimersByTimeAsync(AJUSTES.latidoCadaMs)
        vigilante.revisarLatidos([f.ventana])
        await vi.advanceTimersByTimeAsync(AJUSTES.latidoCadaMs)

        expect(f.eventos).toEqual([])
    })
})
