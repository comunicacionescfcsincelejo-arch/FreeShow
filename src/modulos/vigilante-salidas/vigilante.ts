// Vigilante de salidas: si una salida se cae o se congela, la recarga sola.
// Mientras se recarga, una salida fuera de pantalla (DeckLink, NDI) deja de pintar, así la tarjeta repite el último cuadro.
// Solo vuelve a pintar cuando la página tiene contenido otra vez, con sus animaciones de entrada ya terminadas.
// Sin dependencias de Electron: el adaptador está en electron.ts y las pruebas en vigilante.test.ts.

export interface VentanaVigilada {
    /** identificador único de la ventana (el id de su webContents) */
    clave: string
    salidaId: string
    /** ventana invisible (offscreen): se puede congelar en el último cuadro */
    fueraDePantalla: boolean
    destruida(): boolean
    recargar(): void
    pausarPintado(): void
    reanudarPintado(): void
    terminarAnimaciones(): Promise<void>
    forzarCaida(): void
    /** resuelve si la página responde */
    latido(): Promise<void>
}

export interface Reloj {
    ahora(): number
    esperar(ms: number, fn: () => void): unknown
    cancelar(temporizador: unknown): void
}

export interface Registro {
    info(texto: string): void
    error(texto: string): void
}

export const AJUSTES = {
    /** espera antes de cada recarga, según el número de caídas seguidas */
    esperaRecargaMs: [250, 1000, 2000, 4000, 8000],
    /** más caídas que esto dentro de la ventana de tiempo: se deja de intentar */
    maxCaidas: 5,
    ventanaCaidasMs: 10 * 60 * 1000,
    /** la página debe quedarse quieta este tiempo (sin cambios) antes de volver a pintar */
    quietudMs: 1500,
    /** tiempo máximo para que la página recargada tenga contenido */
    listoMaxMs: 10000,
    latidoCadaMs: 5000,
    /** latidos seguidos sin respuesta para dar la salida por congelada (3 × 5 s = 15 s) */
    latidoFallosMax: 3
}

export type EstadoVentana = "normal" | "recuperando" | "abandonada"

interface Seguimiento {
    ventana: VentanaVigilada
    estado: EstadoVentana
    caidas: number[]
    paginaLista: boolean
    seq: number
    inicio: number
    temporizadorRecarga: unknown
    temporizadorListo: unknown
    temporizadorQuietud: unknown
    latidoEnCurso: boolean
    latidoFallos: number
}

export class VigilanteSalidas {
    private seguimientos = new Map<string, Seguimiento>()
    private detenido = false

    constructor(
        private reloj: Reloj,
        private registro: Registro,
        private ajustes = AJUSTES
    ) {}

    estado(clave: string): EstadoVentana {
        return this.seguimientos.get(clave)?.estado || "normal"
    }

    estaRecuperando(clave: string): boolean {
        return this.estado(clave) === "recuperando"
    }

    /** recuperando y todavía sin contenido: hay que mandarle el último contenido guardado */
    necesitaContenido(clave: string): boolean {
        const s = this.seguimientos.get(clave)
        return !!s && s.estado === "recuperando" && s.seq === 0
    }

    /** la ventana se cayó (proceso terminado) */
    alCaer(ventana: VentanaVigilada, motivo: string) {
        if (this.detenido || ventana.destruida()) return

        const s = this.seguir(ventana)
        this.limpiarTemporizadores(s)
        if (s.estado === "abandonada") return

        const ahora = this.reloj.ahora()
        s.caidas = s.caidas.filter((t) => ahora - t < this.ajustes.ventanaCaidasMs)
        s.caidas.push(ahora)

        // primero congelar: la tarjeta sigue repitiendo el último cuadro bueno
        if (ventana.fueraDePantalla) ventana.pausarPintado()

        if (s.caidas.length > this.ajustes.maxCaidas) {
            s.estado = "abandonada"
            this.registro.error(`Salida ${ventana.salidaId}: se cayó ${s.caidas.length} veces seguidas (${motivo}). Se deja de intentar; ${ventana.fueraDePantalla ? "se queda en el último cuadro" : "la ventana queda como está"}. Apaga y enciende la salida para reintentar.`)
            return
        }

        s.estado = "recuperando"
        s.paginaLista = false
        s.seq = 0
        s.inicio = ahora
        s.latidoFallos = 0

        const esperas = this.ajustes.esperaRecargaMs
        const espera = esperas[Math.min(s.caidas.length - 1, esperas.length - 1)]
        this.registro.info(`Salida ${ventana.salidaId}: se cayó (${motivo}). Recargando en ${espera} ms (intento ${s.caidas.length} de ${this.ajustes.maxCaidas}).`)

        s.temporizadorRecarga = this.reloj.esperar(espera, () => {
            s.temporizadorRecarga = null
            if (this.detenido || ventana.destruida()) return this.olvidar(ventana.clave)
            ventana.recargar()
            s.temporizadorListo = this.reloj.esperar(this.ajustes.listoMaxMs, () => this.alAgotarTiempo(s))
        })
    }

    /** la página recargada avisó que arrancó (STARTUP READY) */
    alIniciarPagina(clave: string) {
        const s = this.seguimientos.get(clave)
        if (!s || s.estado !== "recuperando") return
        s.paginaLista = true
        // la vista nueva puede arrancar pintando: se congela otra vez
        if (s.ventana.fueraDePantalla) s.ventana.pausarPintado()
    }

    /** la página informó su estado de render (RENDER_BUSY): seq > 0 significa que ya aplicó contenido */
    alInformarRender(clave: string, datos: { busy?: boolean; seq?: number }) {
        const s = this.seguimientos.get(clave)
        if (!s || s.estado !== "recuperando") return
        const seq = Number(datos?.seq) || 0
        if (seq <= 0) return
        s.seq = seq

        // cada cambio reinicia la espera: se vuelve a pintar cuando el contenido deja de cambiar
        if (s.temporizadorQuietud) this.reloj.cancelar(s.temporizadorQuietud)
        s.temporizadorQuietud = this.reloj.esperar(this.ajustes.quietudMs, () => {
            s.temporizadorQuietud = null
            void this.finalizar(s, "contenido listo")
        })
    }

    /** revisa que cada ventana responda; si no responde varias veces seguidas, se fuerza su caída para recargarla */
    revisarLatidos(ventanas: VentanaVigilada[]) {
        if (this.detenido) return

        for (const ventana of ventanas) {
            if (ventana.destruida()) continue
            const s = this.seguir(ventana)
            if (s.estado !== "normal" || s.latidoEnCurso) continue

            s.latidoEnCurso = true
            let respondio = false
            const limite = this.reloj.esperar(this.ajustes.latidoCadaMs, () => {
                if (respondio) return
                s.latidoEnCurso = false
                s.latidoFallos++
                if (s.latidoFallos < this.ajustes.latidoFallosMax || ventana.destruida()) return

                s.latidoFallos = 0
                this.registro.error(`Salida ${ventana.salidaId}: no responde desde hace ${(this.ajustes.latidoFallosMax * this.ajustes.latidoCadaMs) / 1000} s. Se reinicia.`)
                ventana.forzarCaida()
            })

            ventana.latido().then(
                () => {
                    respondio = true
                    this.reloj.cancelar(limite)
                    s.latidoEnCurso = false
                    s.latidoFallos = 0
                },
                () => {
                    // ventana cerrándose o recargando: el límite de tiempo decide
                }
            )
        }
    }

    olvidar(clave: string) {
        const s = this.seguimientos.get(clave)
        if (s) this.limpiarTemporizadores(s)
        this.seguimientos.delete(clave)
    }

    detener() {
        this.detenido = true
        for (const s of this.seguimientos.values()) this.limpiarTemporizadores(s)
    }

    private alAgotarTiempo(s: Seguimiento) {
        s.temporizadorListo = null
        if (s.estado !== "recuperando") return
        if (s.seq > 0) {
            void this.finalizar(s, "tiempo máximo, con contenido")
            return
        }

        // sin contenido no se muestra nada: se intenta otra vez y se sigue en el último cuadro
        s.estado = "normal"
        this.alCaer(s.ventana, "la página recargada no recibió contenido")
    }

    private async finalizar(s: Seguimiento, motivo: string) {
        if (s.estado !== "recuperando") return
        this.limpiarTemporizadores(s)

        try {
            await s.ventana.terminarAnimaciones()
        } catch {
            // si no se puede, se pinta igual
        }

        if (s.estado !== "recuperando" || s.ventana.destruida()) return
        if (s.ventana.fueraDePantalla) s.ventana.reanudarPintado()
        s.estado = "normal"
        s.latidoFallos = 0
        this.registro.info(`Salida ${s.ventana.salidaId}: recuperada en ${this.reloj.ahora() - s.inicio} ms (${motivo}).`)
    }

    private seguir(ventana: VentanaVigilada): Seguimiento {
        let s = this.seguimientos.get(ventana.clave)
        if (!s) {
            s = { ventana, estado: "normal", caidas: [], paginaLista: false, seq: 0, inicio: 0, temporizadorRecarga: null, temporizadorListo: null, temporizadorQuietud: null, latidoEnCurso: false, latidoFallos: 0 }
            this.seguimientos.set(ventana.clave, s)
        }
        s.ventana = ventana
        return s
    }

    private limpiarTemporizadores(s: Seguimiento) {
        for (const nombre of ["temporizadorRecarga", "temporizadorListo", "temporizadorQuietud"] as const) {
            if (s[nombre]) this.reloj.cancelar(s[nombre])
            s[nombre] = null
        }
    }
}
