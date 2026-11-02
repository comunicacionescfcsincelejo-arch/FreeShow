// Modo servicio: mientras está activo, la ventana de edición no se puede cerrar.
// Lógica sin dependencias (la usan el motor y la interfaz, y se prueba en logica.test.ts).

export const CANAL = "MODO_SERVICIO"

export const MENSAJE_BLOQUEO = "Modo servicio activo. Las salidas están al aire. Desactiva el modo servicio para cerrar."
export const MENSAJE_CONFIRMAR = "Si lo desactivas, la ventana de edición se podrá cerrar, y al cerrarla se apagan todas las salidas."

export interface EstadoModoServicio {
    activo: boolean
    /** cuándo se activó (ISO), para mostrarlo en pantalla */
    desde: string | null
}

export const INACTIVO: EstadoModoServicio = { activo: false, desde: null }

export function activar(ahora: Date): EstadoModoServicio {
    return { activo: true, desde: ahora.toISOString() }
}

export function desactivar(): EstadoModoServicio {
    return { ...INACTIVO }
}

/** lee el archivo guardado; ante cualquier cosa rara, inactivo */
export function leerEstado(texto: string | null | undefined): EstadoModoServicio {
    try {
        const datos = JSON.parse(texto || "")
        if (datos?.activo !== true) return { ...INACTIVO }
        return { activo: true, desde: typeof datos.desde === "string" ? datos.desde : null }
    } catch {
        return { ...INACTIVO }
    }
}

export function serializar(estado: EstadoModoServicio): string {
    return JSON.stringify({ activo: estado.activo, desde: estado.desde }, null, 4)
}

export type DecisionCierre = "permitir" | "aviso-en-interfaz" | "aviso-nativo"

/** qué hacer cuando alguien intenta cerrar la ventana de edición */
export function decidirCierre(estado: EstadoModoServicio, interfazResponde: boolean): DecisionCierre {
    if (!estado.activo) return "permitir"
    // si la interfaz está caída o congelada, el aviso lo muestra Windows
    return interfazResponde ? "aviso-en-interfaz" : "aviso-nativo"
}

// ---- el aviso en pantalla: oculto → aviso → confirmar → (desactivar) ----

export type PasoAviso = "oculto" | "aviso" | "confirmar"
export type AccionAviso = "intento-cerrar" | "pedir-desactivar" | "confirmar" | "cancelar" | "seguir"

export function siguientePaso(paso: PasoAviso, accion: AccionAviso, activo: boolean): { paso: PasoAviso; desactivar: boolean } {
    if (!activo) return { paso: "oculto", desactivar: false }

    switch (accion) {
        case "intento-cerrar":
            // si ya está pidiendo confirmación, no se pierde ese paso
            return { paso: paso === "confirmar" ? "confirmar" : "aviso", desactivar: false }
        case "pedir-desactivar":
            return { paso: "confirmar", desactivar: false }
        case "confirmar":
            // solo desde la pregunta de confirmación
            return paso === "confirmar" ? { paso: "oculto", desactivar: true } : { paso, desactivar: false }
        case "cancelar":
        case "seguir":
            return { paso: "oculto", desactivar: false }
        default:
            return { paso, desactivar: false }
    }
}

// ---- mensajes entre la interfaz y el motor ----

export type MensajeAlMotor = { accion: "pedir-estado" } | { accion: "activar" } | { accion: "desactivar" }
export type MensajeALaInterfaz = { tipo: "estado"; estado: EstadoModoServicio } | { tipo: "aviso-cierre" }
