import { describe, expect, it } from "vitest"
import { MemoriaContenido } from "./memoriaContenido"

describe("memoria del último contenido de las salidas", () => {
    it("guarda solo la última versión de cada canal de estado", () => {
        const m = new MemoriaContenido()
        m.guardar({ channel: "SHOWS", data: { a: 1 } })
        m.guardar({ channel: "SHOWS", data: { a: 2 } })
        m.guardar({ channel: "OUTPUTS", data: { s1: { out: { slide: 3 } } } })

        expect(m.mensajesParaReponer()).toEqual([
            { channel: "SHOWS", data: { a: 2 } },
            { channel: "OUTPUTS", data: { s1: { out: { slide: 3 } } } }
        ])
    })

    it("no guarda eventos de un momento (audio, metrónomo, reproducción)", () => {
        const m = new MemoriaContenido()
        for (const channel of ["AUDIO_DATA", "METRONOME", "PLAYING_VIDEO_STATE", "LIVE_PREPARE", "ALGO_RARO"]) m.guardar({ channel, data: 1 })
        m.guardar(undefined)
        expect(m.mensajesParaReponer()).toEqual([])
        expect(m.tieneContenido()).toBe(false)
    })

    it("repone OUTPUTS y ALL_OUTPUTS al final, como al abrir una salida", () => {
        const m = new MemoriaContenido()
        m.guardar({ channel: "OUTPUTS", data: 1 })
        m.guardar({ channel: "ALL_OUTPUTS", data: 2 })
        m.guardar({ channel: "STYLES", data: 3 })
        m.guardar({ channel: "MEDIA", data: 4 })

        expect(m.mensajesParaReponer().map((x) => x.channel)).toEqual(["STYLES", "MEDIA", "OUTPUTS", "ALL_OUTPUTS"])
        expect(m.tieneContenido()).toBe(true)
    })
})
