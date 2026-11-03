// Al arrancar, escribe con qué tarjeta de video dibuja FreeShow.
// Importa en este PC: tiene Intel (con el monitor) y NVIDIA, y osr-capture (la copia para la DeckLink)
// abre siempre la tarjeta por defecto de Windows. Ver PROTOTIPO_RENDER.md y DIA_DE_PRUEBA.md (Parte G).

import { app } from "electron"
import { appendFile } from "fs"
import { join } from "path"

const FABRICANTES: { [id: number]: string } = { 0x8086: "Intel", 0x10de: "NVIDIA", 0x1002: "AMD" }

export interface TarjetaGpu {
    vendorId: number
    deviceId: number
    active?: boolean
}

/** nombre legible de la tarjeta: del texto de ANGLE si está ("ANGLE (Intel, Intel(R) UHD Graphics 630 ...") o del fabricante */
export function nombreTarjeta(tarjeta: TarjetaGpu | undefined, glRenderer?: string): string {
    const angle = /^ANGLE \([^,]+, ([^,]+?)(?: \(0x[0-9A-Fa-f]+\))? Direct3D/.exec(glRenderer || "")
    const id = tarjeta ? `${tarjeta.vendorId.toString(16).padStart(4, "0")}:${tarjeta.deviceId.toString(16).padStart(4, "0")}` : "?"
    if (angle) return `${angle[1].trim()} (${id})`
    return `${(tarjeta && FABRICANTES[tarjeta.vendorId]) || "desconocida"} (${id})`
}

/** las líneas del registro (separado para poder probarlo) */
export function lineasDiagnostico(tarjetas: TarjetaGpu[], glRenderer?: string): string[] {
    const activa = tarjetas.find((t) => t.active) || tarjetas[0]
    const lineas = [`[GPU] FreeShow dibuja con: ${nombreTarjeta(activa, glRenderer)}`]
    // 0x1414 = render por software de Microsoft (no es una tarjeta)
    const otras = tarjetas.filter((t) => t !== activa && t.vendorId !== 0x1414)
    if (otras.length) {
        lineas.push(`[GPU] Otras tarjetas en este PC: ${otras.map((t) => nombreTarjeta(t)).join(", ")}`)
        lineas.push("[GPU] Las salidas DeckLink (osr-capture) abren la tarjeta por defecto de Windows (la del monitor principal). NO cambiar la GPU de FreeShow antes de la Parte G de DIA_DE_PRUEBA.md.")
    }
    return lineas
}

export function registrarGpuAlArrancar() {
    void app.whenReady().then(async () => {
        try {
            const basica: any = await app.getGPUInfo("basic")
            const completa: any = await app.getGPUInfo("complete").catch(() => null)
            const lineas = lineasDiagnostico(basica?.gpuDevice || [], completa?.auxAttributes?.glRenderer)
            const carpeta = process.env.FS_MOCK_STORE_PATH || app.getPath("userData")
            const texto = lineas.map((l) => `${new Date().toISOString()} ${l}`).join("\n") + "\n"
            for (const l of lineas) console.info(l)
            appendFile(join(carpeta, "diagnostico-gpu.log"), texto, () => null)
        } catch (err) {
            console.warn("[GPU] No se pudo saber qué tarjeta usa FreeShow:", err)
        }
    })
}
