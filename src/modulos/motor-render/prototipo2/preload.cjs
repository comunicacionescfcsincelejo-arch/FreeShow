// El preload de FreeShow (window.api, que usan sus componentes) más el puente del banco de pruebas.
// Requiere el motor compilado: npx tsc -p config/typescript/tsconfig.electron.json
const { join } = require("path")
require(join(__dirname, "..", "..", "..", "..", "build", "electron", "preload.js"))

const { contextBridge, ipcRenderer } = require("electron")
contextBridge.exposeInMainWorld("prototipo", {
    listo: (error) => ipcRenderer.send("listo", error)
})
