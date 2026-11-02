// Prueba con Electron real (sin DeckLink): una salida invisible se cae y el vigilante la reabre.
// Escenario más difícil: la interfaz también está caída, así que el contenido sale de la copia guardada.
// Requiere el motor compilado: npx tsc -p config/typescript/tsconfig.electron.json (la interfaz la sirve Vite, como en npm start)
// Ejecutar: npx playwright test --config src/modulos/vigilante-salidas/pruebas/playwright.config.ts

import { _electron as electron } from "playwright"
import { expect, test } from "@playwright/test"
import { spawn, type ChildProcess } from "child_process"
import tmp from "tmp"

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

let vite: ChildProcess | null = null
test.beforeAll(async () => {
    vite = spawn("npx", ["vite"], { shell: true, stdio: "ignore", env: { ...process.env, NODE_ENV: "development" } })
    for (let i = 0; i < 60; i++) {
        const lista = await fetch("http://localhost:3000").then(
            (r) => r.ok,
            () => false
        )
        if (lista) return
        await esperar(1000)
    }
    throw new Error("Vite no arrancó en el puerto 3000")
})
test.afterAll(async () => {
    if (!vite?.pid) return
    const fin = spawn("taskkill", ["/pid", String(vite.pid), "/T", "/F"], { stdio: "ignore" })
    await new Promise((r) => fin.on("exit", r))
})

test("una salida invisible que se cae se reabre sola, congelada mientras tanto", async () => {
    const carpeta = tmp.dirSync({ unsafeCleanup: true })
    const app = await electron.launch({ args: ["."], env: { ...process.env, NODE_ENV: "development", FS_MOCK_STORE_PATH: carpeta.name } })

    const lineas: string[] = []
    const anotar = (d: Buffer) =>
        lineas.push(
            ...String(d)
                .split("\n")
                .filter((l) => l.includes("[VIGILANTE]"))
        )
    app.process().stdout?.on("data", anotar)
    app.process().stderr?.on("data", anotar)

    try {
        await app.waitForEvent("window")
        await esperar(15000)

        // en el proceso principal: la interfaz es la primera ventana con FreeShow cargado (las salidas se crean después)
        await app.evaluate(({ webContents }) => {
            const ventanas = webContents.getAllWebContents().filter((w) => w.getType() === "window" && !w.isOffscreen() && w.getURL().includes("localhost:3000"))
            const id = Math.min(...ventanas.map((w) => w.id))
            ;(global as any).__interfaz = () => webContents.fromId(id)
        })

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
        // cerrar sin el diálogo de "¿guardar?" de FreeShow (con todos sus procesos hijos)
        const pid = app.process().pid
        if (pid) await new Promise((r) => spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" }).on("exit", r))
    }
})
