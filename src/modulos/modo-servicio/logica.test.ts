import { describe, expect, it } from "vitest"
import { INACTIVO, MENSAJE_BLOQUEO, activar, decidirCierre, desactivar, leerEstado, serializar, siguientePaso, type PasoAviso } from "./logica"

describe("modo servicio: cierre de la ventana de edición", () => {
    it("sin modo servicio, se cierra normal", () => {
        expect(decidirCierre(INACTIVO, true)).toBe("permitir")
        expect(decidirCierre(INACTIVO, false)).toBe("permitir")
    })

    it("con modo servicio, NO se cierra: avisa en la interfaz", () => {
        expect(decidirCierre(activar(new Date()), true)).toBe("aviso-en-interfaz")
    })

    it("con modo servicio y la interfaz caída o congelada, avisa Windows (y tampoco se cierra)", () => {
        expect(decidirCierre(activar(new Date()), false)).toBe("aviso-nativo")
    })

    it("el mensaje es el acordado", () => {
        expect(MENSAJE_BLOQUEO).toBe("Modo servicio activo. Las salidas están al aire. Desactiva el modo servicio para cerrar.")
    })
})

describe("modo servicio: aviso y confirmación", () => {
    // recorre una lista de acciones desde "oculto" y devuelve los pasos y si se desactivó
    function recorrer(acciones: Parameters<typeof siguientePaso>[1][], activo = true) {
        let paso: PasoAviso = "oculto"
        let desactivado = false
        const pasos: PasoAviso[] = []
        for (const accion of acciones) {
            const r = siguientePaso(paso, accion, activo)
            paso = r.paso
            if (r.desactivar) desactivado = true
            pasos.push(paso)
        }
        return { pasos, desactivado }
    }

    it("intentar cerrar muestra el aviso", () => {
        expect(recorrer(["intento-cerrar"]).pasos).toEqual(["aviso"])
    })

    it("desactivar pide confirmación y solo al confirmar se desactiva", () => {
        const r = recorrer(["intento-cerrar", "pedir-desactivar", "confirmar"])
        expect(r.pasos).toEqual(["aviso", "confirmar", "oculto"])
        expect(r.desactivado).toBe(true)
    })

    it("cancelar la confirmación no desactiva", () => {
        const r = recorrer(["intento-cerrar", "pedir-desactivar", "cancelar"])
        expect(r.pasos).toEqual(["aviso", "confirmar", "oculto"])
        expect(r.desactivado).toBe(false)
    })

    it("'Seguir en servicio' cierra el aviso sin desactivar", () => {
        const r = recorrer(["intento-cerrar", "seguir"])
        expect(r.pasos).toEqual(["aviso", "oculto"])
        expect(r.desactivado).toBe(false)
    })

    it("no se puede desactivar sin pasar por la confirmación", () => {
        expect(recorrer(["intento-cerrar", "confirmar"]).desactivado).toBe(false)
        expect(recorrer(["confirmar"]).desactivado).toBe(false)
    })

    it("desde el indicador también pide confirmación", () => {
        const r = recorrer(["pedir-desactivar", "confirmar"])
        expect(r.pasos).toEqual(["confirmar", "oculto"])
        expect(r.desactivado).toBe(true)
    })

    it("otro intento de cierre durante la confirmación no la pierde", () => {
        expect(recorrer(["intento-cerrar", "pedir-desactivar", "intento-cerrar"]).pasos).toEqual(["aviso", "confirmar", "confirmar"])
    })

    it("sin modo servicio no aparece ningún aviso", () => {
        const r = recorrer(["intento-cerrar", "pedir-desactivar", "confirmar"], false)
        expect(r.pasos).toEqual(["oculto", "oculto", "oculto"])
        expect(r.desactivado).toBe(false)
    })
})

describe("modo servicio: estado guardado (JSON legible)", () => {
    it("guarda y lee el estado", () => {
        const estado = activar(new Date("2026-11-08T14:30:00Z"))
        expect(leerEstado(serializar(estado))).toEqual({ activo: true, desde: "2026-11-08T14:30:00.000Z" })
        expect(leerEstado(serializar(desactivar()))).toEqual(INACTIVO)
    })

    it("un archivo vacío, roto o raro cuenta como inactivo", () => {
        for (const texto of [null, undefined, "", "{", "[]", '{"activo":"si"}', '{"activo":1}']) expect(leerEstado(texto)).toEqual(INACTIVO)
    })
})
