// Genera los archivos de audio para la prueba de audio por SDI (DIA_DE_PRUEBA.md, paso 6).
// 48 kHz, estéreo, 16 bits (lo mismo que usa la DeckLink), a -18 dBFS.
// Uso: node src/modulos/audio-decklink/generarTonos.mjs [carpeta]
// Sin carpeta: Documentos\FreeShow\Pruebas de audio

import { mkdirSync, openSync, writeSync, closeSync, existsSync } from "fs"
import { homedir } from "os"
import { join } from "path"

const FRECUENCIA = 48000
const CANALES = 2
const NIVEL = Math.pow(10, -18 / 20) // -18 dBFS

const carpeta = process.argv[2] || join(homedir(), "Documents", "FreeShow", "Pruebas de audio")
mkdirSync(carpeta, { recursive: true })

function escribirWav(nombre, segundos, muestra) {
    const ruta = join(carpeta, nombre)
    if (existsSync(ruta)) {
        console.log(`Ya existe, no se toca: ${ruta}`)
        return
    }
    const total = FRECUENCIA * segundos
    const bytesDatos = total * CANALES * 2

    const cabecera = Buffer.alloc(44)
    cabecera.write("RIFF", 0)
    cabecera.writeUInt32LE(36 + bytesDatos, 4)
    cabecera.write("WAVE", 8)
    cabecera.write("fmt ", 12)
    cabecera.writeUInt32LE(16, 16)
    cabecera.writeUInt16LE(1, 20) // PCM
    cabecera.writeUInt16LE(CANALES, 22)
    cabecera.writeUInt32LE(FRECUENCIA, 24)
    cabecera.writeUInt32LE(FRECUENCIA * CANALES * 2, 28)
    cabecera.writeUInt16LE(CANALES * 2, 32)
    cabecera.writeUInt16LE(16, 34)
    cabecera.write("data", 36)
    cabecera.writeUInt32LE(bytesDatos, 40)

    const archivo = openSync(ruta, "w")
    writeSync(archivo, cabecera)
    // de a 1 segundo, para no tener 115 MB en memoria
    const bloque = Buffer.alloc(FRECUENCIA * CANALES * 2)
    for (let s = 0; s < segundos; s++) {
        for (let i = 0; i < FRECUENCIA; i++) {
            const valor = Math.round(Math.max(-1, Math.min(1, muestra(s * FRECUENCIA + i))) * 32767)
            bloque.writeInt16LE(valor, i * 4)
            bloque.writeInt16LE(valor, i * 4 + 2)
        }
        writeSync(archivo, bloque)
    }
    closeSync(archivo)
    console.log(`Creado: ${ruta} (${segundos} s)`)
}

const seno = (hz, n) => Math.sin((2 * Math.PI * hz * n) / FRECUENCIA)

// 1) tono continuo de 1 kHz: cualquier corte o aspereza se oye y se ve en el medidor
escribirWav("tono-1kHz-1min.wav", 60, (n) => NIVEL * seno(1000, n))

// 2) un pitido de 100 ms al inicio de cada segundo (1 kHz; cada 10 s, más agudo a 2 kHz, para contar)
//    se compara contra un cronómetro: tras 10 minutos no debe ir adelantado ni atrasado
const DURACION_PITIDO = FRECUENCIA / 10
const RAMPA = 240 // 5 ms de subida y bajada, para que no haga clic
escribirWav("pitidos-cada-segundo-10min.wav", 600, (n) => {
    const segundo = Math.floor(n / FRECUENCIA)
    const dentro = n % FRECUENCIA
    if (dentro >= DURACION_PITIDO) return 0
    const envolvente = Math.min(1, dentro / RAMPA, (DURACION_PITIDO - dentro) / RAMPA)
    return NIVEL * envolvente * seno(segundo % 10 === 0 ? 2000 : 1000, n)
})
