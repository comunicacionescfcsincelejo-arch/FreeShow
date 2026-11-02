import { describe, expect, it } from "vitest"
import { muestrasMaximasPorCuadro, muestrasParaCuadro, muestrasPromedio, obtenerTasaCuadro, tasaDesdeNombre, type TasaCuadro } from "./muestrasAudio"

// Tasas tal como las reporta la DeckLink (IDeckLinkDisplayMode::GetFrameRate → [frameDuration, timeScale])
const MODOS: { nombre: string; frameRate: [number, number]; promedio: number }[] = [
    { nombre: "1080i59.94", frameRate: [1001, 30000], promedio: 1601.6 },
    { nombre: "1080p59.94", frameRate: [1001, 60000], promedio: 800.8 },
    { nombre: "1080p29.97", frameRate: [1001, 30000], promedio: 1601.6 },
    { nombre: "1080i50", frameRate: [1000, 25000], promedio: 1920 },
    { nombre: "1080p25", frameRate: [1000, 25000], promedio: 1920 },
    { nombre: "1080p30", frameRate: [1000, 30000], promedio: 1600 },
    { nombre: "1080p60", frameRate: [1000, 60000], promedio: 800 },
    { nombre: "1080p23.98", frameRate: [1001, 24000], promedio: 2002 }
]

function secuencia(tasa: TasaCuadro, desde: number, cantidad: number): number[] {
    return Array.from({ length: cantidad }, (_, i) => muestrasParaCuadro(desde + i, tasa))
}

describe("muestras de audio por cuadro (48 kHz)", () => {
    it("1080i59.94: secuencia 1602/1601/1602/1601/1602, 8008 cada 5 cuadros", () => {
        const tasa = obtenerTasaCuadro([1001, 30000], "1080i59.94")
        expect(secuencia(tasa, 0, 5)).toEqual([1602, 1601, 1602, 1601, 1602])
        // la secuencia se repite igual en cada bloque de 5
        expect(secuencia(tasa, 5, 5)).toEqual([1602, 1601, 1602, 1601, 1602])
        expect(secuencia(tasa, 1000, 5)).toEqual([1602, 1601, 1602, 1601, 1602])
    })

    it("1080p29.97 usa la misma secuencia que 1080i59.94", () => {
        expect(secuencia(obtenerTasaCuadro([1001, 30000], "1080p29.97"), 0, 5)).toEqual([1602, 1601, 1602, 1601, 1602])
    })

    it("1080p59.94: 4004 muestras cada 5 cuadros, cada cuadro con 800 u 801", () => {
        const sec = secuencia(obtenerTasaCuadro([1001, 60000], "1080p59.94"), 0, 5)
        expect(sec.reduce((a, b) => a + b, 0)).toBe(4004)
        for (const n of sec) expect([800, 801]).toContain(n)
    })

    for (const modo of MODOS) {
        it(`${modo.nombre}: promedio ${modo.promedio} y sin desfase en 1 hora`, () => {
            const tasa = obtenerTasaCuadro(modo.frameRate, modo.nombre)
            expect(muestrasPromedio(tasa)).toBeCloseTo(modo.promedio, 6)

            // una hora de cuadros: el total debe ser exactamente 48000 × 3600 (o diferir en menos de 1 muestra)
            const cuadrosEnUnaHora = Math.round((3600 * tasa.escala) / tasa.duracion)
            let total = 0
            for (let i = 0; i < cuadrosEnUnaHora; i++) total += muestrasParaCuadro(i, tasa)
            const exacto = (cuadrosEnUnaHora * 48000 * tasa.duracion) / tasa.escala
            expect(Math.abs(total - exacto)).toBeLessThan(1)

            // ningún cuadro se aleja más de 1 muestra del promedio
            for (let i = 0; i < 100; i++) expect(Math.abs(muestrasParaCuadro(i, tasa) - modo.promedio)).toBeLessThan(1)
            expect(muestrasMaximasPorCuadro(tasa)).toBe(Math.ceil(modo.promedio))
        })
    }

    it("sigue exacto después de muchas horas (índices grandes)", () => {
        const tasa = obtenerTasaCuadro([1001, 30000], "1080i59.94")
        // ~10 días al aire
        const inicio = 30 * 60 * 60 * 24 * 10 - ((30 * 60 * 60 * 24 * 10) % 5)
        expect(secuencia(tasa, inicio, 5)).toEqual([1602, 1601, 1602, 1601, 1602])
    })
})

describe("tasa deducida del nombre del modo (si la tarjeta no la reporta)", () => {
    it("entrelazado: el número del nombre son campos, el cuadro dura el doble", () => {
        expect(tasaDesdeNombre("1080i59.94")).toEqual({ duracion: 1001, escala: 30000 })
        expect(tasaDesdeNombre("1080i5994")).toEqual({ duracion: 1001, escala: 30000 })
        expect(tasaDesdeNombre("1080i50")).toEqual({ duracion: 1000, escala: 25000 })
        expect(tasaDesdeNombre("1080i60")).toEqual({ duracion: 1000, escala: 30000 })
        expect(tasaDesdeNombre("NTSC")).toEqual({ duracion: 1001, escala: 30000 })
        expect(tasaDesdeNombre("PAL")).toEqual({ duracion: 1000, escala: 25000 })
    })

    it("progresivo", () => {
        expect(tasaDesdeNombre("1080p59.94")).toEqual({ duracion: 1001, escala: 60000 })
        expect(tasaDesdeNombre("1080p29.97")).toEqual({ duracion: 1001, escala: 30000 })
        expect(tasaDesdeNombre("1080p23.98")).toEqual({ duracion: 1001, escala: 24000 })
        expect(tasaDesdeNombre("4K2160p25")).toEqual({ duracion: 1000, escala: 25000 })
        expect(tasaDesdeNombre("1080PsF29.97")).toEqual({ duracion: 1001, escala: 30000 })
    })

    it("la tasa de la tarjeta tiene prioridad sobre el nombre", () => {
        expect(obtenerTasaCuadro([1001, 30000], "nombre raro")).toEqual({ duracion: 1001, escala: 30000 })
        expect(obtenerTasaCuadro(undefined, "1080i59.94")).toEqual({ duracion: 1001, escala: 30000 })
        expect(obtenerTasaCuadro([0, 0], "1080p59.94")).toEqual({ duracion: 1001, escala: 60000 })
    })

    it("el cálculo viejo de FreeShow daba la mitad en 1080i59.94 (por eso el arreglo)", () => {
        const viejo = Math.round(48000 / 59.94)
        expect(viejo).toBe(801)
        expect(muestrasPromedio(obtenerTasaCuadro([1001, 30000], "1080i59.94"))).toBeCloseTo(viejo * 2, -1)
    })
})
