import { describe, expect, it } from "vitest"
// @ts-expect-error: el prototipo es JavaScript sin tipos
import { SIN_AJUSTE, aplicar, cuadradoACuadrilatero, invertir3x3, matrizLienzoATextura } from "./esquinas.js"

const cerca = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9))

describe("ajuste de 4 esquinas (homografía)", () => {
    it("sin ajuste, la imagen queda igual", () => {
        const h = cuadradoACuadrilatero(SIN_AJUSTE)
        for (const p of [
            [0, 0],
            [0.3, 0.7],
            [1, 1]
        ])
            cerca(aplicar(h, p), p)
    })

    it("cada esquina de la imagen cae exactamente en la esquina pedida", () => {
        const esquinas = [
            [0.12, 0.05],
            [0.93, 0.11],
            [0.88, 0.97],
            [0.04, 0.9]
        ]
        const h = cuadradoACuadrilatero(esquinas)
        cerca(aplicar(h, [0, 0]), esquinas[0])
        cerca(aplicar(h, [1, 0]), esquinas[1])
        cerca(aplicar(h, [1, 1]), esquinas[2])
        cerca(aplicar(h, [0, 1]), esquinas[3])
    })

    it("con perspectiva (keystone), el centro de la imagen cae donde se cruzan las diagonales", () => {
        const esquinas = [
            [0.3, 0.1],
            [0.7, 0.1],
            [1, 1],
            [0, 1]
        ]
        const h = cuadradoACuadrilatero(esquinas)
        // diagonales: (0.3,0.1)-(1,1) y (0.7,0.1)-(0,1) se cruzan en (0.5, 0.1 + 0.9·2/7)
        const [x, y] = aplicar(h, [0.5, 0.5])
        expect(x).toBeCloseTo(0.5, 9)
        expect(y).toBeCloseTo(0.1 + (0.9 * 2) / 7, 9)
        // y NO a media altura (0.55), que sería un simple estirado sin perspectiva
        expect(Math.abs(y - 0.55)).toBeGreaterThan(0.1)
    })

    it("la inversa devuelve cada punto a su lugar", () => {
        const h = cuadradoACuadrilatero([
            [0.1, 0.2],
            [0.8, 0.05],
            [0.95, 0.85],
            [0.2, 0.99]
        ])
        const inv = invertir3x3(h)
        for (const p of [
            [0.1, 0.1],
            [0.5, 0.5],
            [0.9, 0.3]
        ])
            cerca(aplicar(inv, aplicar(h, p)), p)
    })

    it("la matriz para el shader va en orden de columnas", () => {
        const m = matrizLienzoATextura(SIN_AJUSTE)
        cerca(Array.from(m), [1, 0, 0, 0, 1, 0, 0, 0, 1])
    })

    it("esquinas imposibles (todas en un punto) no rompen: devuelve null", () => {
        expect(
            matrizLienzoATextura([
                [0.5, 0.5],
                [0.5, 0.5],
                [0.5, 0.5],
                [0.5, 0.5]
            ])
        ).toBeNull()
    })
})
