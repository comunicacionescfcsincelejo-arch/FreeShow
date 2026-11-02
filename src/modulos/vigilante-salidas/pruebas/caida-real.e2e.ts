// Prueba con Electron real (sin DeckLink): una salida invisible se cae y el vigilante la reabre.
// Escenario más difícil: la interfaz también está caída, así que el contenido sale de la copia guardada.
// Ejecutar: ver src/modulos/playwright.config.ts

import { expect, test } from "@playwright/test"
import { abrirFreeShow, cerrarFreeShow, esperar } from "../../pruebasE2E"

test("una salida invisible que se cae se reabre sola, congelada mientras tanto", async () => {
    const { app, lineas } = await abrirFreeShow("[VIGILANTE]")

    try {
        // 1. crear una salida invisible (offscreen, como una DeckLink pero sin tarjeta) y darle contenido como lo haría la interfaz
        const creada = await app.evaluate(async ({ ipcMain }) => {
            const interfaz = (global as any).__interfaz()
            if (!interfaz) return false
            const salida = { id: "prueba", name: "Prueba", enabled: true, active: true, invisible: true, bounds: { x: 0, y: 0, width: 640, height: 360 }, screen: null, out: {} }
            ipcMain.emit("OUTPUT", { sender: interfaz }, { channel: "CREATE", data: salida })
            await new Promise((r) => setTimeout(r, 6000))
            ipcMain.emit("OUTPUT", { sender: interfaz }, { channel: "OUTPUTS", data: { prueba: salida } })
            return true
        })
        expect(creada).toBe(true)
        await esperar(3000)

        const antes = await app.evaluate(({ webContents }) => {
            const w = webContents.getAllWebContents().find((x) => x.isOffscreen())
            return w ? { id: w.id, pid: w.getOSProcessId(), pintando: w.isPainting() } : null
        })
        expect(antes).not.toBeNull()
        expect(antes!.pintando).toBe(true)

        // 2. tumbar la interfaz y luego la salida
        await app.evaluate(({ webContents }, id) => {
            ;(global as any).__interfaz()?.forcefullyCrashRenderer()
            setTimeout(() => webContents.fromId(id)?.forcefullyCrashRenderer(), 500)
        }, antes!.id)
        await esperar(800)

        // 3. mientras se recupera: congelada (sin pintar), así la tarjeta repetiría el último cuadro
        const durante = await app.evaluate(({ webContents }, id) => webContents.fromId(id)?.isPainting(), antes!.id)
        expect(durante).toBe(false)

        // 4. se reabre sola, con proceso nuevo, y vuelve a pintar
        let despues: { pid: number; pintando: boolean; caida: boolean } | null = null
        for (let i = 0; i < 40; i++) {
            await esperar(500)
            despues = await app.evaluate(({ webContents }, id) => {
                const w = webContents.fromId(id)
                return w ? { pid: w.getOSProcessId(), pintando: w.isPainting(), caida: w.isCrashed() } : null
            }, antes!.id)
            if (despues?.pintando) break
        }

        console.log(lineas.join("\n"))
        expect(despues).not.toBeNull()
        expect(despues!.caida).toBe(false)
        expect(despues!.pid).not.toBe(antes!.pid)
        expect(despues!.pintando).toBe(true)
        expect(lineas.some((l) => l.includes("contenido repuesto"))).toBe(true)
        expect(lineas.some((l) => l.includes("recuperada"))).toBe(true)
    } finally {
        await cerrarFreeShow(app)
    }
})
