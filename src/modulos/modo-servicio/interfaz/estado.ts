// Parte de la interfaz del modo servicio: el estado (copia del motor) y el paso del aviso en pantalla.

import { get, writable } from "svelte/store"
import { CANAL, INACTIVO, siguientePaso, type AccionAviso, type EstadoModoServicio, type MensajeAlMotor, type MensajeALaInterfaz, type PasoAviso } from "../logica"

export const modoServicio = writable<EstadoModoServicio>({ ...INACTIVO })
export const pasoAviso = writable<PasoAviso>("oculto")

let iniciado = false

function alMotor(mensaje: MensajeAlMotor) {
    // canal propio del módulo (no está en la lista de canales de FreeShow)
    window.api.send(CANAL as any, mensaje)
}

export function iniciarModoServicioInterfaz() {
    if (iniciado) return
    iniciado = true

    window.api.receive(
        CANAL as any,
        (mensaje: MensajeALaInterfaz) => {
            if (mensaje?.tipo === "estado") {
                modoServicio.set(mensaje.estado)
                if (!mensaje.estado.activo) pasoAviso.set("oculto")
            } else if (mensaje?.tipo === "aviso-cierre") aplicar("intento-cerrar")
        },
        "modo-servicio"
    )
    alMotor({ accion: "pedir-estado" })
}

export function aplicar(accion: AccionAviso) {
    const resultado = siguientePaso(get(pasoAviso), accion, get(modoServicio).activo)
    pasoAviso.set(resultado.paso)
    if (resultado.desactivar) alMotor({ accion: "desactivar" })
}

export function activarModoServicio() {
    alMotor({ accion: "activar" })
}

/** se llama antes de que FreeShow empiece a cerrar; true = no cerrar (y se muestra el aviso) */
export function bloquearCierrePorModoServicio(): boolean {
    if (!get(modoServicio).activo) return false
    aplicar("intento-cerrar")
    return true
}
