// Ayudas para las pruebas de punta a punta de los módulos (Playwright + Electron real).

import { _electron as electron, type ElectronApplication, type Page } from "playwright"
import { spawn } from "child_process"
import tmp from "tmp"

export const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

// globalSetup: arranca Vite una vez para todas las pruebas y lo detiene al final
export default async function arrancarVite() {
    const vite = spawn("npx", ["vite"], { shell: true, stdio: "ignore", env: { ...process.env, NODE_ENV: "development" } })
    for (let i = 0; i < 60; i++) {
        const lista = await fetch("http://localhost:3000").then(
            (r) => r.ok,
            () => false
        )
        if (lista) break
        if (i === 59) throw new Error("Vite no arrancó en el puerto 3000")
        await esperar(1000)
    }
    return async () => {
        if (vite.pid) await matar(vite.pid)
    }
}

function matar(pid: number) {
    return new Promise((r) => spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" }).on("exit", r))
}

/** abre FreeShow con una configuración vacía y temporal; las líneas de consola con `filtro` quedan en `lineas` */
export async function abrirFreeShow(filtro: string) {
    const carpeta = tmp.dirSync({ unsafeCleanup: true })
    const app = await electron.launch({ args: ["."], env: { ...process.env, NODE_ENV: "development", FS_MOCK_STORE_PATH: carpeta.name } })

    const lineas: string[] = []
    const anotar = (d: Buffer) =>
        lineas.push(
            ...String(d)
                .split("\n")
                .filter((l) => l.includes(filtro))
        )
    app.process().stdout?.on("data", anotar)
    app.process().stderr?.on("data", anotar)

    await app.waitForEvent("window")
    await esperar(15000)

    // en el proceso principal: la interfaz es la primera ventana con FreeShow cargado (las salidas se crean después)
    await app.evaluate(({ webContents }) => {
        const ventanas = webContents.getAllWebContents().filter((w) => w.getType() === "window" && !w.isOffscreen() && w.getURL().includes("localhost:3000"))
        const id = Math.min(...ventanas.map((w) => w.id))
        ;(global as any).__interfaz = () => webContents.fromId(id)
    })

    return { app, lineas, carpeta: carpeta.name }
}

/** la página de la interfaz (la que tiene el indicador del modo servicio) */
export async function paginaInterfaz(app: ElectronApplication): Promise<Page> {
    for (let i = 0; i < 20; i++) {
        for (const pagina of app.windows()) {
            if (
                await pagina
                    .locator(".indicador-modo-servicio")
                    .count()
                    .catch(() => 0)
            )
                return pagina
        }
        await esperar(500)
    }
    throw new Error("No se encontró la ventana de la interfaz")
}

/** cierra FreeShow sin el diálogo de "¿guardar?" (con todos sus procesos hijos) */
export async function cerrarFreeShow(app: ElectronApplication) {
    let pid: number | undefined
    try {
        pid = app.process().pid
    } catch {
        return // ya se cerró sola
    }
    if (pid) await matar(pid)
}
