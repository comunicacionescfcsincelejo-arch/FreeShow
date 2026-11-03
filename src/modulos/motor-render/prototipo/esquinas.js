// Ajuste de 4 esquinas (corner pin): homografía del cuadrado unidad a un cuadrilátero, y su inversa.
// Funciones puras (sin WebGL), probadas en esquinas.test.ts.

/**
 * Homografía que lleva el cuadrado unidad (0,0) (1,0) (1,1) (0,1) a las 4 esquinas dadas, en ese orden:
 * arriba-izquierda, arriba-derecha, abajo-derecha, abajo-izquierda. Coordenadas 0..1 del lienzo.
 * Devuelve una matriz 3×3 por filas [a, b, c, d, e, f, g, h, 1].
 */
export function cuadradoACuadrilatero(esquinas) {
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = esquinas
    const dx1 = x1 - x2
    const dx2 = x3 - x2
    const dy1 = y1 - y2
    const dy2 = y3 - y2
    const sx = x0 - x1 + x2 - x3
    const sy = y0 - y1 + y2 - y3

    let g = 0
    let h = 0
    if (Math.abs(sx) > 1e-12 || Math.abs(sy) > 1e-12) {
        const den = dx1 * dy2 - dx2 * dy1
        // esquinas en línea o encimadas: no hay imagen posible
        if (Math.abs(den) < 1e-12) return null
        g = (sx * dy2 - dx2 * sy) / den
        h = (dx1 * sy - sx * dy1) / den
    }

    // filas: [a b c; d e f; g h 1], con (x, y) = ((a·u + b·v + c) / w, (d·u + e·v + f) / w)
    return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1]
}

export function invertir3x3(m) {
    const [a, b, c, d, e, f, g, h, i] = m
    const A = e * i - f * h
    const B = -(d * i - f * g)
    const C = d * h - e * g
    const det = a * A + b * B + c * C
    if (Math.abs(det) < 1e-12) return null
    const inv = [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d]
    return inv.map((v) => v / det)
}

/** aplica una homografía (por filas) a un punto */
export function aplicar(m, [x, y]) {
    const w = m[6] * x + m[7] * y + m[8]
    return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w]
}

/**
 * Matriz para el shader: lleva un punto del lienzo (0..1) a la coordenada de la textura (0..1).
 * En orden de columnas (como la pide WebGL en uniformMatrix3fv sin transponer).
 */
export function matrizLienzoATextura(esquinas) {
    const directa = cuadradoACuadrilatero(esquinas)
    const inv = directa && invertir3x3(directa)
    if (!inv) return null
    const [a, b, c, d, e, f, g, h, i] = inv
    return new Float32Array([a, d, g, b, e, h, c, f, i])
}

export const SIN_AJUSTE = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1]
]
