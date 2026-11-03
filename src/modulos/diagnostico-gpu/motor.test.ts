import { describe, expect, it, vi } from "vitest"

// el módulo importa electron; en las pruebas solo se usan las funciones puras
vi.mock("electron", () => ({ app: {} }))
const { lineasDiagnostico, nombreTarjeta } = await import("./motor")

const INTEL = { vendorId: 0x8086, deviceId: 0x3e98 }
const NVIDIA = { vendorId: 0x10de, deviceId: 0x2182 }

describe("registro de la tarjeta de video al arrancar", () => {
    it("toma el nombre del texto de ANGLE", () => {
        expect(nombreTarjeta(INTEL, "ANGLE (Intel, Intel(R) UHD Graphics 630 (0x00003E98) Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe("Intel(R) UHD Graphics 630 (8086:3e98)")
        expect(nombreTarjeta(NVIDIA, "ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti (0x00002182) Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe("NVIDIA GeForce GTX 1660 Ti (10de:2182)")
    })

    it("sin texto de ANGLE, usa el fabricante", () => {
        expect(nombreTarjeta(NVIDIA)).toBe("NVIDIA (10de:2182)")
        expect(nombreTarjeta(undefined)).toBe("desconocida (?)")
    })

    it("con dos tarjetas (como en el PC de la iglesia) avisa no cambiar la GPU antes de la Parte G", () => {
        const lineas = lineasDiagnostico([{ ...INTEL, active: true }, NVIDIA], "ANGLE (Intel, Intel(R) UHD Graphics 630 (0x00003E98) Direct3D11 vs_5_0 ps_5_0, D3D11)")
        expect(lineas[0]).toBe("[GPU] FreeShow dibuja con: Intel(R) UHD Graphics 630 (8086:3e98)")
        expect(lineas[1]).toContain("NVIDIA (10de:2182)")
        expect(lineas[2]).toContain("NO cambiar la GPU de FreeShow antes de la Parte G")
    })

    it("con una sola tarjeta, solo dice cuál es", () => {
        expect(lineasDiagnostico([{ ...NVIDIA, active: true }])).toEqual(["[GPU] FreeShow dibuja con: NVIDIA (10de:2182)"])
    })

    it("el render por software de Windows (1414) no cuenta como otra tarjeta", () => {
        expect(
            lineasDiagnostico([
                { ...INTEL, active: true },
                { vendorId: 0x1414, deviceId: 0x8c }
            ])
        ).toEqual(["[GPU] FreeShow dibuja con: Intel (8086:3e98)"])
    })
})
