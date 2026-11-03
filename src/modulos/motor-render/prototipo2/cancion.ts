// Una canción de prueba en el formato de FreeShow (el mismo JSON de los archivos .show) y los estilos de salida.

const LETRA = [
    ["Cuán grande es Él", "Mi corazón entona la canción"],
    ["Santo, santo, santo", "Señor omnipotente"],
    ["Digno es el Cordero", "Que fue inmolado"],
    ["Tu fidelidad es grande", "Tu fidelidad incomparable es"]
]

export function cancionDePrueba() {
    const slides: { [id: string]: any } = {}
    LETRA.forEach((lineas, i) => {
        slides[`s${i}`] = {
            group: i % 2 ? "Coro" : "Verso",
            color: i % 2 ? "#f0008c" : "#5825f5",
            settings: {},
            notes: "",
            items: [
                {
                    type: "text",
                    // el cuadro de texto por defecto de FreeShow (1920×1080)
                    style: "left:50px;top:120px;width:1820px;height:840px;",
                    align: "",
                    lines: lineas.map((linea) => ({
                        align: "",
                        text: [{ value: linea, style: "font-size: 100px;font-weight: bold;color: #ffffff;text-shadow: 3px 3px 10px rgb(0 0 0 / 0.8);" }]
                    }))
                }
            ]
        }
    })

    return {
        id: "prueba-cancion",
        diapositivas: LETRA.length,
        show: {
            name: "Canción de prueba",
            category: null,
            settings: { activeLayout: "l1", template: null },
            timestamps: { created: Date.now(), modified: null, used: null },
            quickAccess: {},
            meta: {},
            media: {},
            slides,
            layouts: { l1: { name: "Principal", notes: "", slides: Object.keys(slides).map((id) => ({ id })) } }
        }
    }
}

// solo la capa de letra, fondo transparente: debajo se ve el WebGL
export const ESTILO_LETRA = { id: "prueba-letra", estilo: { name: "Letra sobre WebGL", layers: ["slide"], background: "transparent" } }
// Redes: letra sobre negro
export const ESTILO_REDES = { id: "prueba-redes", estilo: { name: "Redes", layers: ["slide"], background: "#000000" } }
