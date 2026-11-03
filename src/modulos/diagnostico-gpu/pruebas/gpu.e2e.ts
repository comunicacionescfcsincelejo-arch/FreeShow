// Prueba con Electron real: al arrancar, FreeShow escribe con qué tarjeta de video dibuja.
// Ejecutar: ver src/modulos/playwright.config.ts

import { expect, test } from "@playwright/test"
import { abrirFreeShow, cerrarFreeShow } from "../../pruebasE2E"

test("al arrancar se registra la tarjeta de video que usa FreeShow", async () => {
    const { app, lineas } = await abrirFreeShow("[GPU]")
    try {
        console.log(lineas.join("\n"))
        expect(lineas.some((l) => l.includes("[GPU] FreeShow dibuja con:"))).toBe(true)
    } finally {
        await cerrarFreeShow(app)
    }
})
