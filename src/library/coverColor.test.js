import { describe, it, expect } from 'vitest';
import {
    colorDominante, tonoDeLomo, anchoDeLomo, SATURACION_MINIMA,
} from './coverColor.js';

/** Pinta una portada falsa a partir de una lista de [color, cuántos píxeles]. */
const portada = (tramos) => {
    const total = tramos.reduce((suma, [, n]) => suma + n, 0);
    const data = new Uint8ClampedArray(total * 4);
    let i = 0;
    for (const [[r, g, b], n] of tramos) {
        for (let k = 0; k < n; k += 1) {
            data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
            i += 4;
        }
    }
    return { data, width: total, height: 1 };
};

describe('colorDominante', () => {
    it('encuentra el color que manda', () => {
        const img = portada([[[200, 40, 40], 400], [[40, 60, 200], 100]]);
        expect(colorDominante(img)).toMatch(/^#c8/i);
    });

    it('el blanco del fondo no gana', () => {
        // **Esto es lo que hace inútil un promedio.** Casi toda portada tiene más
        // blanco que color, y si contara, todos los lomos saldrían blancos.
        const img = portada([[[255, 255, 255], 2000], [[30, 90, 170], 300]]);
        const color = colorDominante(img);
        expect(color).not.toBe('#ffffff');
        expect(color).toMatch(/^#1e5a/i);
    });

    it('el negro del texto tampoco', () => {
        const img = portada([[[0, 0, 0], 2000], [[210, 150, 40], 300]]);
        expect(colorDominante(img)).toMatch(/^#d2/i);
    });

    it('no promedia colores distintos en un barro', () => {
        // Rojo y azul a partes iguales promedian a morado, que no está en la
        // portada. Tiene que ganar uno de los dos.
        const img = portada([[[220, 30, 30], 500], [[30, 30, 220], 480]]);
        const color = colorDominante(img);
        expect(['#dc1e1e', '#1e1edc']).toContain(color);
    });

    it('una portada en blanco y negro devuelve su gris, no un color inventado', () => {
        const img = portada([[[128, 128, 128], 500]]);
        expect(colorDominante(img)).toMatch(/^#80/i);
    });

    it('sin imagen no revienta', () => {
        expect(colorDominante(null)).toMatch(/^#/);
        expect(colorDominante({ data: new Uint8ClampedArray(0), width: 0, height: 0 })).toMatch(/^#/);
    });

    it('los píxeles transparentes no cuentan', () => {
        const data = new Uint8ClampedArray(8);
        // Uno rojo opaco y uno verde transparente.
        data.set([200, 40, 40, 255, 40, 200, 40, 0]);
        expect(colorDominante({ data, width: 2, height: 1 })).toMatch(/^#c8/i);
    });
});

describe('tonoDeLomo', () => {
    it('conserva el tono del libro', () => {
        // El tono es lo que identifica: un libro rojo sigue siendo rojo.
        const { fondo } = tonoDeLomo('#E03030');
        const n = parseInt(fondo.slice(1), 16);
        const r = (n >> 16) & 255;
        const b = n & 255;
        expect(r).toBeGreaterThan(b);
    });

    it('un amarillo fluorescente se apaga hasta poder leerse encima', () => {
        const { fondo, tinta } = tonoDeLomo('#FFFF00');
        const n = parseInt(fondo.slice(1), 16);
        const luz = (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 3;
        expect(luz).toBeLessThan(210);
        expect(tinta).toMatch(/^#/);
    });

    it('un azul casi negro se aclara hasta despegarse del fondo', () => {
        const { fondo } = tonoDeLomo('#050914');
        const n = parseInt(fondo.slice(1), 16);
        const luz = (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 3;
        expect(luz).toBeGreaterThan(40);
    });

    it('sin color válido da un lomo neutro en vez de fallar', () => {
        expect(tonoDeLomo(undefined).fondo).toMatch(/^#/);
        expect(tonoDeLomo('rojo').fondo).toMatch(/^#/);
    });

    it('la tinta siempre contrasta con su fondo', () => {
        for (const color of ['#E03030', '#FFFF00', '#050914', '#2E4A6B', '#7C3550']) {
            const { fondo, tinta } = tonoDeLomo(color);
            // La fórmula de contraste de verdad, con la corrección gamma de sRGB.
            // Sin ella, un rojo saturado parece mucho más claro de lo que es y la
            // comprobación da un número que no significa nada.
            const luzDe = (h) => {
                const n = parseInt(h.slice(1), 16);
                const canal = (v) => {
                    const c = v / 255;
                    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
                };
                return 0.2126 * canal((n >> 16) & 255)
                    + 0.7152 * canal((n >> 8) & 255)
                    + 0.0722 * canal(n & 255);
            };
            const a = luzDe(fondo);
            const b = luzDe(tinta);
            const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            expect(ratio, color).toBeGreaterThan(4.5);
        }
    });
});

describe('anchoDeLomo', () => {
    it('un tocho es más ancho que una novela corta', () => {
        expect(anchoDeLomo({ pageCount: 900 })).toBeGreaterThan(anchoDeLomo({ pageCount: 120 }));
    });

    it('sin páginas usa el tamaño del fichero', () => {
        expect(anchoDeLomo({ fileSize: 4_000_000 })).toBeGreaterThan(anchoDeLomo({ fileSize: 300_000 }));
    });

    it('sin datos da un lomo normal, no uno de cero', () => {
        const ancho = anchoDeLomo({});
        expect(ancho).toBeGreaterThan(15);
        expect(ancho).toBeLessThan(50);
    });

    it('nunca se sale del rango tocable', () => {
        // Un lomo de tres píxeles no se puede tocar, y uno de doscientos deja de
        // ser un lomo.
        expect(anchoDeLomo({ pageCount: 100000 })).toBeLessThanOrEqual(46);
        expect(anchoDeLomo({ pageCount: 1 })).toBeGreaterThanOrEqual(18);
    });
});

describe('el umbral de gris', () => {
    it('es lo bastante alto para descartar un gris azulado', () => {
        // Los fondos «casi grises» de muchas portadas modernas tienen algo de
        // tono. Si contaran, ganarían por cantidad y el lomo saldría gris.
        expect(SATURACION_MINIMA).toBeGreaterThan(0.12);
    });
});
