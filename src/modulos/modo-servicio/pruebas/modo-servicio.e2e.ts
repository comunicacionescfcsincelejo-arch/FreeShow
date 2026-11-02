// Prueba con Electron real (sin DeckLink): con el modo servicio activo, la ventana de edición no se cierra
// ni con la X de Windows (Alt+F4) ni con el botón/menú "Cerrar" de FreeShow; desactivarlo pide confirmación.
// Ejecutar: ver src/modulos/playwright.config.ts

import { expect, test } from "@playwright/test"
import { readFileSync } from "fs"
import { join } from "path"
import { abrirFreeShow, cerrarFreeShow, esperar, paginaInterfaz } from "../../pruebasE2E"

const MENSAJE = "Modo servicio activo. Las salidas están al aire. Desactiva el modo servicio para cerrar."

test("el modo servicio impide cerrar la ventana de edición hasta desactivarlo con confirmación", async () => {
    const { app, carpeta } = await abrirFreeShow("[MODO SERVICIO]")
    const ventanaViva = () => app.evaluate(() => !!(global as any).__interfaz() && !(global as any).__interfaz().isDestroyed())
    const intentarCerrarConLaX = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.fromWebContents((global as any).__interfaz())?.close())
    const estadoGuardado = () => JSON.parse(readFileSync(join(carpeta, "modo-servicio.json"), "utf8"))

    try {
        const pagina = await paginaInterfaz(app)
        const indicador = pagina.locator(".indicador-modo-servicio")

        // 1. activar desde el indicador: se ve claro (texto, marco rojo) y queda guardado
        await expect(indicador).toHaveText(/Activar modo servicio/)
        await indicador.click()
        await expect(indicador).toHaveText(/MODO SERVICIO/)
        await expect(pagina.locator(".marco")).toHaveCount(1)
        await esperar(300)
        expect(estadoGuardado().activo).toBe(true)

        // 2. la X de Windows (o Alt+F4): no se cierra y aparece el aviso con el mensaje acordado
        await intentarCerrarConLaX()
        await esperar(1500)
        expect(await ventanaViva()).toBe(true)
        await expect(pagina.getByText(MENSAJE)).toBeVisible()

        // "Seguir en servicio" cierra el aviso y sigue activo
        await pagina.getByRole("button", { name: "Seguir en servicio" }).click()
        await expect(pagina.getByText(MENSAJE)).toHaveCount(0)
        await expect(indicador).toHaveText(/MODO SERVICIO/)

        // 3. el cierre propio de FreeShow (botón o menú "Cerrar", que empieza en la interfaz): tampoco cierra, y avisa
        await app.evaluate(() => (global as any).__interfaz().send("MAIN", { channel: "CLOSE", data: false }))
        await expect(pagina.getByText(MENSAJE)).toBeVisible()
        await pagina.getByRole("button", { name: "Seguir en servicio" }).click()

        // ...ni la orden final de cierre que la interfaz manda al motor
        await pagina.evaluate(() => (window as any).api.send("MAIN", { channel: "CLOSE" }))
        await esperar(1500)
        expect(await ventanaViva()).toBe(true)
        await pagina.getByRole("button", { name: "Seguir en servicio" }).click()

        // 4. desactivar pide confirmación; "Cancelar" lo deja activo
        await intentarCerrarConLaX()
        await pagina.getByRole("button", { name: "Desactivar modo servicio" }).click()
        await expect(pagina.getByText("¿Desactivar el modo servicio?")).toBeVisible()
        await pagina.getByRole("button", { name: "Cancelar" }).click()
        await expect(indicador).toHaveText(/MODO SERVICIO/)
        expect(estadoGuardado().activo).toBe(true)

        // 5. desactivar de verdad: confirmar
        await indicador.click()
        await pagina.getByRole("button", { name: "Sí, desactivar" }).click()
        await expect(indicador).toHaveText(/Activar modo servicio/)
        await expect(pagina.locator(".marco")).toHaveCount(0)
        await esperar(300)
        expect(estadoGuardado().activo).toBe(false)

        // 6. ahora sí se puede cerrar (FreeShow sigue su cierre normal)
        await intentarCerrarConLaX()
        let cerrada = false
        for (let i = 0; i < 30 && !cerrada; i++) {
            await esperar(500)
            cerrada = await ventanaViva().then(
                (viva) => !viva,
                () => true // la app ya terminó
            )
        }
        expect(cerrada).toBe(true)
    } finally {
        await cerrarFreeShow(app)
    }
})
