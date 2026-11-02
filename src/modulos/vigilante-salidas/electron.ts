// Conecta el vigilante con Electron sin tocar el código de salidas de FreeShow:
// escucha los eventos globales de la app y los mensajes OUTPUT/STARTUP que ya existen.

import { app, globalShortcut, ipcMain, type BrowserWindow, type WebContents } from "electron"
import { appendFile } from "fs"
import { join } from "path"
import { OUTPUT, STARTUP } from "../../types/Channels"
import { OutputHelper } from "../../electron/output/OutputHelper"
import { RenderGroups } from "../../electron/output/helpers/RenderGroups"
import { MemoriaContenido, type MensajeSalida } from "./memoriaContenido"
import { AJUSTES, VigilanteSalidas, type Registro, type Reloj, type VentanaVigilada } from "./vigilante"

// si la interfaz no repone el contenido en este tiempo, se usa la copia guardada
const ESPERA_INTERFAZ_MS = 1500
const TERMINAR_ANIMACIONES = "document.getAnimations().forEach((a) => { try { a.finish() } catch (e) {} })"

let iniciado = false

export function iniciarVigilanteSalidas(obtenerVentanaPrincipal: () => BrowserWindow | null) {
    if (iniciado) return
    iniciado = true

    const reloj: Reloj = {
        ahora: () => Date.now(),
        esperar: (ms, fn) => setTimeout(fn, ms),
        cancelar: (t) => clearTimeout(t as NodeJS.Timeout)
    }
    const vigilante = new VigilanteSalidas(reloj, crearRegistro())
    const memoria = new MemoriaContenido()
    const ventanas = new Map<number, VentanaVigilada>()

    function interfaz(): WebContents | null {
        const ventana = obtenerVentanaPrincipal()
        if (!ventana || ventana.isDestroyed() || ventana.webContents.isCrashed()) return null
        return ventana.webContents
    }

    // la ventana de una salida (o su copia oculta de captura) que corresponde a este webContents
    function buscarVentana(contenido: WebContents): VentanaVigilada | null {
        const conocida = ventanas.get(contenido.id)
        if (conocida) return conocida

        for (const salida of OutputHelper.getAllOutputs()) {
            const candidatas = [salida.window, (salida as any).captureWindow] as (BrowserWindow | undefined)[]
            if (candidatas.some((v) => v && !v.isDestroyed() && v.webContents === contenido)) return vigilar(contenido, salida.id)
        }
        return null
    }

    function vigilar(contenido: WebContents, salidaId: string): VentanaVigilada {
        const clave = String(contenido.id)
        const ventana: VentanaVigilada = {
            clave,
            salidaId,
            fueraDePantalla: contenido.isOffscreen(),
            destruida: () => contenido.isDestroyed() || !OutputHelper.getOutput(salidaId),
            recargar: () => contenido.reload(),
            pausarPintado: () => contenido.isOffscreen() && contenido.stopPainting(),
            reanudarPintado: () => {
                if (!contenido.isOffscreen()) return
                contenido.startPainting()
                contenido.invalidate()
            },
            terminarAnimaciones: () => conTiempoLimite(contenido.executeJavaScript(TERMINAR_ANIMACIONES), 1000),
            forzarCaida: () => contenido.forcefullyCrashRenderer(),
            latido: () => conTiempoLimite(contenido.executeJavaScript("1"), AJUSTES.latidoCadaMs)
        }

        ventanas.set(contenido.id, ventana)
        // mientras se recupera, la página nueva no debe pintar aunque Chromium cree una vista nueva
        const congelarSiRecupera = () => vigilante.estaRecuperando(clave) && ventana.pausarPintado()
        contenido.on("did-start-loading", congelarSiRecupera)
        contenido.on("dom-ready", congelarSiRecupera)
        contenido.once("destroyed", () => {
            ventanas.delete(contenido.id)
            vigilante.olvidar(clave)
        })
        return ventana
    }

    function reponerContenido(ventana: VentanaVigilada, contenido: WebContents) {
        if (contenido.isDestroyed() || !memoria.tieneContenido()) return
        for (const mensaje of memoria.mensajesParaReponer()) {
            const copia: MensajeSalida & { seq?: number } = { channel: mensaje.channel, data: mensaje.data }
            // como OutputSend: OUTPUTS solo con la salida propia, y con su número de secuencia
            if (copia.channel === "OUTPUTS" && copia.data?.[ventana.salidaId]) copia.data = { [ventana.salidaId]: copia.data[ventana.salidaId] }
            copia.seq = RenderGroups.stamp(ventana.salidaId)
            contenido.send(OUTPUT, copia)
        }
        crearRegistro().info(`Salida ${ventana.salidaId}: contenido repuesto desde la copia guardada.`)
    }

    app.on("render-process-gone", (_evento, contenido, detalles) => {
        const ventana = buscarVentana(contenido)
        if (ventana) vigilante.alCaer(ventana, detalles?.reason || "desconocido")
    })

    app.on("before-quit", () => vigilante.detener())

    ipcMain.on(STARTUP, (evento, mensaje) => {
        if (mensaje?.channel !== "READY") return
        const ventana = buscarVentana(evento.sender)
        if (ventana) vigilante.alIniciarPagina(ventana.clave)
    })

    ipcMain.on(OUTPUT, (evento, mensaje) => {
        if (!mensaje?.channel) return

        // lo que la interfaz manda a las salidas: se guarda la última versión
        if (evento.sender === interfaz()) return memoria.guardar(mensaje)

        const ventana = buscarVentana(evento.sender)
        if (!ventana) return

        if (mensaje.channel === "RENDER_BUSY") return vigilante.alInformarRender(ventana.clave, mensaje.data)

        // la salida recargada pide su contenido: si la interfaz no está, o no responde a tiempo, se repone la copia
        if (mensaje.channel === "REQUEST_DATA_MAIN" && vigilante.estaRecuperando(ventana.clave)) {
            const contenido = evento.sender
            if (!interfaz()) return reponerContenido(ventana, contenido)
            setTimeout(() => {
                if (vigilante.necesitaContenido(ventana.clave)) reponerContenido(ventana, contenido)
            }, ESPERA_INTERFAZ_MS)
        }
    })

    function todasLasVentanas(): VentanaVigilada[] {
        const lista: VentanaVigilada[] = []
        for (const salida of OutputHelper.getAllOutputs()) {
            for (const v of [salida.window, (salida as any).captureWindow] as (BrowserWindow | undefined)[]) {
                if (v && !v.isDestroyed()) lista.push(ventanas.get(v.webContents.id) || vigilar(v.webContents, salida.id))
            }
        }
        return lista
    }

    const latidos = setInterval(() => vigilante.revisarLatidos(todasLasVentanas()), AJUSTES.latidoCadaMs)
    latidos.unref?.()

    // solo para ensayos: con FS_VIGILANTE_PRUEBA=1, atajos que tumban o congelan las salidas a propósito
    if (process.env.FS_VIGILANTE_PRUEBA === "1") {
        void app.whenReady().then(() => {
            globalShortcut.register("CommandOrControl+Alt+Shift+K", () => {
                crearRegistro().info("PRUEBA: tumbando todas las salidas a propósito.")
                for (const v of todasLasVentanas()) v.forzarCaida()
            })
            globalShortcut.register("CommandOrControl+Alt+Shift+J", () => {
                crearRegistro().info("PRUEBA: congelando todas las salidas a propósito.")
                for (const salida of OutputHelper.getAllOutputs()) {
                    if (salida.window && !salida.window.isDestroyed()) salida.window.webContents.executeJavaScript("setTimeout(() => { while (true) {} }, 0)").catch(() => null)
                }
            })
            crearRegistro().info("PRUEBA activa: Ctrl+Alt+Shift+K tumba las salidas, Ctrl+Alt+Shift+J las congela.")
        })
    }
}

function conTiempoLimite<T>(promesa: Promise<T>, ms: number): Promise<void> {
    return new Promise((resolver, rechazar) => {
        const t = setTimeout(() => rechazar(new Error("sin respuesta")), ms)
        promesa.then(
            () => {
                clearTimeout(t)
                resolver()
            },
            (err) => {
                clearTimeout(t)
                rechazar(err)
            }
        )
    })
}

// a la consola y a vigilante-salidas.log en la carpeta de datos de FreeShow
function crearRegistro(): Registro {
    const escribir = (nivel: string, texto: string) => {
        const linea = `${new Date().toISOString()} ${nivel} ${texto}\n`
        try {
            // si no se puede escribir, queda la consola
            appendFile(join(app.getPath("userData"), "vigilante-salidas.log"), linea, () => null)
        } catch {
            // sin archivo, queda la consola
        }
    }
    return {
        info: (texto) => {
            console.info(`[VIGILANTE] ${texto}`)
            escribir("INFO", texto)
        },
        error: (texto) => {
            console.error(`[VIGILANTE] ${texto}`)
            escribir("ERROR", texto)
        }
    }
}
