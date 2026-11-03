// Puente mínimo entre la página del prototipo y su proceso principal.
const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("prototipo", {
    guardarVideo: (nombre, datos, tipo) => ipcRenderer.invoke("guardar-video", nombre, datos, tipo),
    listo: (error) => ipcRenderer.send("listo", error)
})
