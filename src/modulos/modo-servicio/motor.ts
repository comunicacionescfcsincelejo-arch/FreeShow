// Parte del motor (proceso principal) del modo servicio: guarda el estado y bloquea el cierre de la ventana de edición.

import { app, dialog, ipcMain, type BrowserWindow } from "electron"
import { readFileSync, writeFile } from "fs"
import { join } from "path"
import { CANAL, INACTIVO, MENSAJE_BLOQUEO, MENSAJE_CONFIRMAR, activar, decidirCierre, desactivar, leerEstado, serializar, type EstadoModoServicio, type MensajeAlMotor, type MensajeALaInterfaz } from "./logica"

let estado: EstadoModoServicio = { ...INACTIVO }
let obtenerVentana: () => BrowserWindow | null = () => null
let interfazCongelada = false
let vigilandoVentana: BrowserWindow | null = null
let avisoNativoAbierto = false

// junto a la configuración de FreeShow (en las pruebas, en su carpeta temporal)
function archivo() {
    return join(process.env.FS_MOCK_STORE_PATH || app.getPath("userData"), "modo-servicio.json")
}

export function iniciarModoServicio(obtenerVentanaPrincipal: () => BrowserWindow | null) {
    obtenerVentana = obtenerVentanaPrincipal
    try {
        estado = leerEstado(readFileSync(archivo(), "utf8"))
    } catch {
        estado = { ...INACTIVO }
    }
    if (estado.activo) console.info("[MODO SERVICIO] Activo desde el arranque anterior.")

    ipcMain.on(CANAL, (_evento, mensaje: MensajeAlMotor) => {
        vigilarVentana()
        if (mensaje?.accion === "activar") cambiar(activar(new Date()))
        else if (mensaje?.accion === "desactivar") cambiar(desactivar())
        else enviar({ tipo: "estado", estado })
    })
}

export function modoServicioActivo(): boolean {
    return estado.activo
}

/** se llama al intentar cerrar la ventana de edición; true = cierre bloqueado */
export function bloquearCierreModoServicio(evento: { preventDefault(): void }): boolean {
    const ventana = obtenerVentana()
    const decision = decidirCierre(estado, !!ventana && !ventana.webContents.isCrashed() && !interfazCongelada)
    if (decision === "permitir") return false

    evento.preventDefault()
    console.info("[MODO SERVICIO] Cierre bloqueado.")
    if (decision === "aviso-en-interfaz") enviar({ tipo: "aviso-cierre" })
    else void avisoNativo(ventana)
    return true
}

function cambiar(nuevo: EstadoModoServicio) {
    estado = nuevo
    console.info(`[MODO SERVICIO] ${estado.activo ? "Activado" : "Desactivado"}.`)
    writeFile(archivo(), serializar(estado), (err) => {
        if (err) console.error("[MODO SERVICIO] No se pudo guardar el estado:", err)
    })
    enviar({ tipo: "estado", estado })
}

function enviar(mensaje: MensajeALaInterfaz) {
    const ventana = obtenerVentana()
    if (!ventana || ventana.isDestroyed()) return
    ventana.webContents.send(CANAL, mensaje)
}

// saber si la interfaz está congelada, para no esperar que muestre el aviso
function vigilarVentana() {
    const ventana = obtenerVentana()
    if (!ventana || ventana === vigilandoVentana) return
    vigilandoVentana = ventana
    interfazCongelada = false
    ventana.on("unresponsive", () => (interfazCongelada = true))
    ventana.on("responsive", () => (interfazCongelada = false))
}

// el mismo aviso, pero de Windows, para cuando la interfaz no puede mostrarlo
async function avisoNativo(ventana: BrowserWindow | null) {
    if (avisoNativoAbierto) return
    avisoNativoAbierto = true
    try {
        const opciones = { type: "warning" as const, title: "Modo servicio", message: MENSAJE_BLOQUEO, buttons: ["Seguir en servicio", "Desactivar modo servicio"], defaultId: 0, cancelId: 0, noLink: true }
        const aviso = ventana && !ventana.isDestroyed() ? await dialog.showMessageBox(ventana, opciones) : await dialog.showMessageBox(opciones)
        if (aviso.response !== 1) return

        const confirmar = { type: "question" as const, title: "Modo servicio", message: "¿Desactivar el modo servicio?", detail: MENSAJE_CONFIRMAR, buttons: ["Cancelar", "Sí, desactivar"], defaultId: 0, cancelId: 0, noLink: true }
        const respuesta = ventana && !ventana.isDestroyed() ? await dialog.showMessageBox(ventana, confirmar) : await dialog.showMessageBox(confirmar)
        if (respuesta.response === 1) cambiar(desactivar())
    } finally {
        avisoNativoAbierto = false
    }
}
