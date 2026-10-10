import { describe, it, expect } from 'vitest';
import { detectarVinetas, colorDelPapel, encuadre } from './vinetas.js';

/**
 * Página sintética: papel de un color y rectángulos rellenos de otro.
 * Cada rectángulo es una viñeta; dentro lleva un hueco blanco pequeño, como el
 * cielo de un dibujo, que no debe confundirse con un canalón.
 */
const pagina = (ancho, alto, rectangulos, { papel = 255, tinta = 40 } = {}) => {
    const data = new Uint8ClampedArray(ancho * alto * 4).fill(papel);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    for (const [x0, y0, x1, y1] of rectangulos) {
        for (let y = y0; y < y1; y += 1) {
            for (let x = x0; x < x1; x += 1) {
                const enHueco = x > x0 + 5 && x < x0 + 9 && y > y0 + 5 && y < y0 + 9;
                const v = enHueco ? papel : tinta;
                const i = (y * ancho + x) * 4;
                data[i] = v; data[i + 1] = v; data[i + 2] = v;
            }
        }
    }
    return { data, width: ancho, height: alto };
};

describe('colorDelPapel', () => {
    it('lo saca de los bordes', () => {
        expect(colorDelPapel(pagina(100, 140, [[10, 10, 90, 130]]))).toBe(255);
        expect(colorDelPapel(pagina(100, 140, [[10, 10, 90, 130]], { papel: 0, tinta: 200 }))).toBe(0);
    });
});

describe('detectarVinetas', () => {
    // Una rejilla clásica: arriba una viñeta ancha, abajo dos.
    const rejilla = pagina(200, 300, [
        [10, 10, 190, 140],
        [10, 150, 95, 290],
        [105, 150, 190, 290],
    ]);

    it('encuentra las tres viñetas en orden de lectura', () => {
        const v = detectarVinetas(rejilla);
        expect(v).toHaveLength(3);
        expect(v[0].w).toBeGreaterThan(0.8);
        expect(v[1].x).toBeLessThan(v[2].x);
    });

    it('en manga, la fila de abajo se lee de derecha a izquierda', () => {
        const v = detectarVinetas(rejilla, { rtl: true });
        expect(v[1].x).toBeGreaterThan(v[2].x);
    });

    it('funciona con canalones negros', () => {
        const oscura = pagina(200, 300, [[10, 10, 190, 140], [10, 150, 190, 290]], { papel: 0, tinta: 220 });
        expect(detectarVinetas(oscura)).toHaveLength(2);
    });

    it('una ilustración a sangre se queda entera', () => {
        expect(detectarVinetas(pagina(200, 300, [[0, 0, 200, 300]]))).toEqual([]);
    });

    it('las cajas son proporciones de la página', () => {
        const [primera] = detectarVinetas(rejilla);
        expect(primera.x).toBeCloseTo(10 / 200, 2);
        expect(primera.y).toBeCloseTo(10 / 300, 2);
    });
});

describe('encuadre', () => {
    it('amplía la viñeta para que quepa y la centra', () => {
        const caja = { x: 0.5, y: 0.5, w: 0.5, h: 0.25 };
        const e = encuadre(caja, { ancho: 1000, alto: 1600 }, { ancho: 400, alto: 800 }, 0);
        // 500 × 400 px de viñeta en 400 × 800: manda el ancho.
        expect(e.escala).toBeCloseTo(0.8);
        // El centro de la viñeta (750, 1000) × 0,8 = (600, 800) → a (200, 400).
        expect(e.x).toBe(-400);
        expect(e.y).toBe(-400);
    });
});
