// Motor de render del prototipo: WebGL2 puro.
// Un "lienzo" compone capas (video, imagen o texto) con modos de mezcla, crossfade entre dos fuentes y ajuste de 4 esquinas.
// Todo el trabajo con píxeles lo hace la GPU (shaders); JavaScript solo dice qué dibujar.

import { SIN_AJUSTE, matrizLienzoATextura } from "./esquinas.js"

export const MODOS = { normal: 0, sumar: 1, multiplicar: 2, pantalla: 3, superponer: 4, diferencia: 5 }

const VERTICES = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
    vUv = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
}`

// una capa sobre lo que ya hay (uDestino): ajuste de esquinas, crossfade A→B, opacidad y modo de mezcla
const CAPA = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 color;
uniform sampler2D uDestino;
uniform sampler2D uFuenteA;
uniform sampler2D uFuenteB;
uniform float uCruce;      // 0 = solo A, 1 = solo B
uniform float uOpacidad;
uniform int uModo;
uniform mat3 uLienzoATextura;
uniform bool uVolteada;    // videos e imágenes llegan con el origen arriba

vec3 mezclar(vec3 d, vec3 s, int modo) {
    if (modo == 1) return min(d + s, 1.0);
    if (modo == 2) return d * s;
    if (modo == 3) return 1.0 - (1.0 - d) * (1.0 - s);
    if (modo == 4) return mix(2.0 * d * s, 1.0 - 2.0 * (1.0 - d) * (1.0 - s), step(0.5, d));
    if (modo == 5) return abs(d - s);
    return s;
}

void main() {
    vec3 d = texture(uDestino, vUv).rgb;
    // el lienzo tiene el origen abajo; las esquinas se dan con el origen arriba
    vec3 q = uLienzoATextura * vec3(vUv.x, 1.0 - vUv.y, 1.0);
    vec2 uv = q.xy / q.z;
    float dentro = step(0.0, q.z) * step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    if (!uVolteada) uv.y = 1.0 - uv.y;
    vec4 s = mix(texture(uFuenteA, uv), texture(uFuenteB, uv), uCruce);
    float a = s.a * uOpacidad * dentro;
    color = vec4(mix(d, mezclar(d, s.rgb, uModo), a), 1.0);
}`

// copia una parte de una textura a una parte de la pantalla (para repartir el lienzo maestro)
const COPIAR = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 color;
uniform sampler2D uTextura;
void main() { color = vec4(texture(uTextura, vUv).rgb, 1.0); }`

export class MotorRender {
    constructor(canvas) {
        const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" })
        if (!gl) throw new Error("Este equipo no tiene WebGL2")
        this.gl = gl
        this.canvas = canvas

        this.pCapa = this.programa(CAPA)
        this.pCopiar = this.programa(COPIAR)

        // un triángulo que cubre todo
        this.vao = gl.createVertexArray()
        gl.bindVertexArray(this.vao)
        const buffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
        gl.enableVertexAttribArray(0)
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

        this.negro = this.texturaColor([0, 0, 0, 255])
        this.transparente = this.texturaColor([0, 0, 0, 0])
        this.lienzos = new Map()

        // tiempo de GPU por cuadro, si el equipo lo permite
        this.timer = gl.getExtension("EXT_disjoint_timer_query_webgl2")
        this.consultas = []
        this.tiemposGpu = []

        const info = gl.getExtension("WEBGL_debug_renderer_info")
        this.tarjeta = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    }

    programa(fragmento) {
        const gl = this.gl
        const compilar = (tipo, fuente) => {
            const s = gl.createShader(tipo)
            gl.shaderSource(s, fuente)
            gl.compileShader(s)
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
            return s
        }
        const p = gl.createProgram()
        gl.attachShader(p, compilar(gl.VERTEX_SHADER, VERTICES))
        gl.attachShader(p, compilar(gl.FRAGMENT_SHADER, fragmento))
        gl.bindAttribLocation(p, 0, "aPos")
        gl.linkProgram(p)
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p))
        const u = {}
        const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS)
        for (let i = 0; i < n; i++) {
            const nombre = gl.getActiveUniform(p, i).name
            u[nombre] = gl.getUniformLocation(p, nombre)
        }
        return { p, u }
    }

    nuevaTextura() {
        const gl = this.gl
        const t = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D, t)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        return t
    }

    texturaColor(rgba) {
        const gl = this.gl
        const t = this.nuevaTextura()
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba))
        return t
    }

    /** una fuente que cambia (video o canvas de texto): se sube a la GPU solo cuando hay un cuadro nuevo */
    fuente(elemento) {
        const gl = this.gl
        const f = { elemento, textura: this.nuevaTextura(), nueva: true, subidas: 0 }
        ;(this.fuentes ||= []).push(f)
        const esVideo = elemento instanceof HTMLVideoElement
        // Un video se revisa en cada cuadro: si avanzó, se sube. (Esperar a requestVideoFrameCallback pierde
        // cuadros con videos ocultos: medido, llegaban 29 de 54 aunque el decodificador entregaba todos.)
        let ultimoTiempo = -1
        f.actualizar = () => {
            if (esVideo) {
                if (elemento.readyState < 2 || elemento.currentTime === ultimoTiempo) return
                ultimoTiempo = elemento.currentTime
            } else if (!f.nueva) return
            gl.bindTexture(gl.TEXTURE_2D, f.textura)
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, elemento)
            f.nueva = false
            f.subidas++
        }
        return f
    }

    /** dos texturas que se turnan (ping-pong) para componer capa sobre capa */
    lienzo(nombre, ancho, alto) {
        let l = this.lienzos.get(nombre)
        if (l) return l
        const gl = this.gl
        const crear = () => {
            const t = this.nuevaTextura()
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, ancho, alto, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
            const fb = gl.createFramebuffer()
            gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0)
            return { t, fb }
        }
        l = { ancho, alto, a: crear(), b: crear() }
        this.lienzos.set(nombre, l)
        return l
    }

    /**
     * Compone capas en un lienzo y devuelve la textura resultado.
     * capa: { a: fuente, b?: fuente, cruce?: 0..1, opacidad?: 0..1, modo?: MODOS.x, esquinas?: [[x,y]×4] }
     */
    componer(nombre, ancho, alto, capas, fondo = this.negro) {
        const gl = this.gl
        const l = this.lienzo(nombre, ancho, alto)
        const { p, u } = this.pCapa
        gl.useProgram(p)
        gl.bindVertexArray(this.vao)
        gl.viewport(0, 0, ancho, alto)
        gl.uniform1i(u.uDestino, 0)
        gl.uniform1i(u.uFuenteA, 1)
        gl.uniform1i(u.uFuenteB, 2)

        let destino = fondo
        let escribir = l.a
        for (const capa of capas) {
            // esquinas imposibles: la capa no se dibuja (en vez de romper el cuadro)
            const matriz = matrizLienzoATextura(capa.esquinas || SIN_AJUSTE)
            if (!matriz) continue
            capa.a.actualizar?.()
            capa.b?.actualizar?.()
            gl.bindFramebuffer(gl.FRAMEBUFFER, escribir.fb)
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, destino)
            gl.activeTexture(gl.TEXTURE1)
            gl.bindTexture(gl.TEXTURE_2D, capa.a.textura)
            gl.activeTexture(gl.TEXTURE2)
            gl.bindTexture(gl.TEXTURE_2D, (capa.b || capa.a).textura)
            gl.uniform1f(u.uCruce, capa.b ? (capa.cruce ?? 0) : 0)
            gl.uniform1f(u.uOpacidad, capa.opacidad ?? 1)
            gl.uniform1i(u.uModo, capa.modo ?? MODOS.normal)
            // videos y canvas llegan con el origen arriba; el resultado de otro lienzo, con el origen abajo
            gl.uniform1i(u.uVolteada, capa.a.origenAbajo ? 0 : 1)
            gl.uniformMatrix3fv(u.uLienzoATextura, false, matriz)
            gl.drawArrays(gl.TRIANGLES, 0, 3)
            destino = escribir.t
            escribir = escribir === l.a ? l.b : l.a
        }
        return destino
    }

    /** dibuja una textura en un rectángulo de la pantalla (x, y desde abajo-izquierda, en píxeles) */
    presentar(textura, x, y, ancho, alto) {
        const gl = this.gl
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.viewport(x, y, ancho, alto)
        gl.useProgram(this.pCopiar.p)
        gl.bindVertexArray(this.vao)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, textura)
        gl.uniform1i(this.pCopiar.u.uTextura, 0)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    // ---- tiempo de GPU por cuadro (si existe la extensión) ----
    empezarMedicion() {
        if (!this.timer) return
        const gl = this.gl
        this.leerMediciones()
        if (this.consultaActual) return
        this.consultaActual = gl.createQuery()
        gl.beginQuery(this.timer.TIME_ELAPSED_EXT, this.consultaActual)
    }
    terminarMedicion() {
        if (!this.timer || !this.consultaActual) return
        const gl = this.gl
        gl.endQuery(this.timer.TIME_ELAPSED_EXT)
        this.consultas.push(this.consultaActual)
        this.consultaActual = null
    }
    leerMediciones() {
        const gl = this.gl
        while (this.consultas.length) {
            const q = this.consultas[0]
            if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break
            if (!gl.getParameter(this.timer.GPU_DISJOINT_EXT)) this.tiemposGpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6)
            gl.deleteQuery(q)
            this.consultas.shift()
        }
    }
}
