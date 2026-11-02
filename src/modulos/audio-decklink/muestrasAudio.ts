// Cálculo exacto de muestras de audio por cuadro para la DeckLink.
// Sin dependencias de Electron ni de macadam, para poder probarlo solo (ver muestrasAudio.test.ts).

export const FRECUENCIA_AUDIO = 48000

/**
 * Duración de un cuadro completo como número racional: duracion / escala segundos.
 * Es lo mismo que devuelve IDeckLinkDisplayMode::GetFrameRate (frameDuration, timeScale),
 * y lo que macadam entrega como playback.frameRate = [duracion, escala].
 */
export interface TasaCuadro {
    duracion: number
    escala: number
}

/**
 * La tasa real del cuadro. Usa la que reporta la tarjeta y, si no hay, la deduce del nombre del modo.
 * En los modos entrelazados ("1080i59.94", "NTSC", "PAL") el número del nombre son CAMPOS por segundo:
 * un cuadro completo dura el doble.
 */
export function obtenerTasaCuadro(frameRate: unknown, nombreModo = ""): TasaCuadro {
    if (Array.isArray(frameRate) && frameRate.length >= 2) {
        const duracion = Number(frameRate[0])
        const escala = Number(frameRate[1])
        if (Number.isInteger(duracion) && Number.isInteger(escala) && duracion > 0 && escala > 0) return { duracion, escala }
    }

    return tasaDesdeNombre(nombreModo)
}

export function tasaDesdeNombre(nombreModo: string): TasaCuadro {
    const nombre = (nombreModo || "").toLowerCase()

    if (nombre.includes("ntsc")) return { duracion: 1001, escala: 30000 }
    if (nombre.includes("pal")) return { duracion: 1000, escala: 25000 }

    // número después de "p", "i" o "psf": "1080i59.94", "1080p29.97", "2160p5994", "1080PsF23.98"
    const coincidencia = nombre.match(/(?:\d+)(psf|p|i)(\d+(?:\.\d+)?)/)
    if (!coincidencia) return { duracion: 1000, escala: 30000 }

    const tipo = coincidencia[1]
    let numero = Number(coincidencia[2])
    // "5994" → 59.94, "2398" → 23.98
    if (!coincidencia[2].includes(".") && numero > 100) numero = numero / 100

    const porSegundo = tipo === "i" ? numero / 2 : numero
    const fraccional = Math.abs(porSegundo - Math.round(porSegundo)) > 0.001

    // 29.97 = 30000/1001, 59.94 = 60000/1001, 23.976 = 24000/1001
    if (fraccional) return { duracion: 1001, escala: Math.round(porSegundo) * 1000 }
    return { duracion: 1000, escala: Math.round(porSegundo) * 1000 }
}

/** Promedio de muestras por cuadro, por ejemplo 1601.6 en 1080i59.94. */
export function muestrasPromedio(tasa: TasaCuadro, frecuencia = FRECUENCIA_AUDIO): number {
    return (frecuencia * tasa.duracion) / tasa.escala
}

/** Muestras acumuladas desde el cuadro 0 hasta el inicio del cuadro `indice`, redondeadas (aritmética entera). */
function muestrasHasta(indice: number, tasa: TasaCuadro, frecuencia: number): number {
    // redondeo al entero más cercano: floor((2·a + b) / (2·b))
    const a = indice * frecuencia * tasa.duracion
    return Math.floor((2 * a + tasa.escala) / (2 * tasa.escala))
}

/**
 * Muestras que lleva el cuadro número `indice` (contado desde que arranca la reproducción).
 * Como depende del número de cuadro y no de cuántas veces se llamó, el total nunca se desfasa,
 * aunque se salten cuadros. 1080i59.94 da 1602, 1601, 1602, 1601, 1602 (8008 cada 5).
 */
export function muestrasParaCuadro(indice: number, tasa: TasaCuadro, frecuencia = FRECUENCIA_AUDIO): number {
    const n = Math.max(0, Math.floor(indice))
    return muestrasHasta(n + 1, tasa, frecuencia) - muestrasHasta(n, tasa, frecuencia)
}

/** El máximo que puede llevar un cuadro (para reservar el búfer de silencio). */
export function muestrasMaximasPorCuadro(tasa: TasaCuadro, frecuencia = FRECUENCIA_AUDIO): number {
    return Math.ceil(muestrasPromedio(tasa, frecuencia))
}

/** Cuadros por segundo reales (por ejemplo 29.97002997 en 1080i59.94). */
export function cuadrosPorSegundo(tasa: TasaCuadro): number {
    return tasa.escala / tasa.duracion
}
