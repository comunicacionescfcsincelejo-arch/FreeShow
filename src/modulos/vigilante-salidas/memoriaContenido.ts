// Guarda el último contenido que la interfaz mandó a las salidas, para reponerlo si una salida se recarga
// y la interfaz no puede responder (caída o congelada). Sin dependencias de Electron.

// Canales de estado (los mismos que manda sendInitialOutputData en src/frontend/utils/listeners.ts, más algunos de estado vivo).
// No se guardan eventos de un momento (audio, metrónomo, reproducción) porque repetirlos haría cosas viejas.
export const CANALES_ESTADO = [
    "LANGUAGE",
    "STYLES",
    "TRANSITION",
    "SHOWS",
    "CATEGORIES",
    "TEMPLATES",
    "OVERLAYS",
    "EVENTS",
    "GROUPS",
    "DRAW",
    "DRAW_TOOL",
    "DRAW_SETTINGS",
    "VISUALIZER_DATA",
    "MEDIA",
    "EFFECTS",
    "TIMERS",
    "ACTIVE_TIMERS",
    "VARIABLES",
    "TIME_FORMAT",
    "SPECIAL",
    "SYNCED_OUTPUTS",
    "SLIDE_TIMELINE_SPEED_MULTIPLIER",
    "PLAYER_VIDEOS",
    "STAGE",
    "PROJECTS",
    "ACTIVE_PROJECT",
    "SHOWS_DATA",
    "CUSTOM_METADATA",
    "CUSTOM_CREDITS",
    "GLOBAL_REGEXES",
    "OUT_SLIDE_CACHE",
    "COLORBARS",
    "VOLUME",
    "OUTPUTS",
    "ALL_OUTPUTS"
]

// van al final, como en sendInitialOutputData: lo que está al aire se aplica con todo lo demás ya cargado
const AL_FINAL = ["OUTPUTS", "ALL_OUTPUTS"]

export interface MensajeSalida {
    channel: string
    data?: any
}

export class MemoriaContenido {
    private canales = new Set(CANALES_ESTADO)
    private ultimos = new Map<string, MensajeSalida>()

    guardar(mensaje: MensajeSalida | undefined) {
        if (!mensaje?.channel || !this.canales.has(mensaje.channel)) return
        this.ultimos.set(mensaje.channel, { channel: mensaje.channel, data: mensaje.data })
    }

    /** hay algo que reponer (sin OUTPUTS la salida no sabe qué mostrar) */
    tieneContenido(): boolean {
        return this.ultimos.has("OUTPUTS")
    }

    mensajesParaReponer(): MensajeSalida[] {
        const primero = [...this.ultimos.values()].filter((m) => !AL_FINAL.includes(m.channel))
        const despues = AL_FINAL.map((canal) => this.ultimos.get(canal)).filter((m): m is MensajeSalida => !!m)
        return [...primero, ...despues]
    }
}
