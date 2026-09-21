import { describe, it, expect } from 'vitest';
import {
    fondoDe, cajaDeContenido, unirCajas, recorteRelativo, MINIMO_UTIL,
} from './pdfCrop.js';

/**
 * Pinta una página falsa: fondo liso y un rectángulo de «tinta» dentro.
 */
const pagina = ({
    width = 100, height = 140, fondo = 255, tinta = 0,
    caja = { x: 20, y: 30, w: 60, h: 70 }, motas = [],
} = {}) => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
        data[i * 4] = fondo;
        data[i * 4 + 1] = fondo;
        data[i * 4 + 2] = fondo;
        data[i * 4 + 3] = 255;
    }
    const poner = (x, y, v) => {
        const i = (y * width + x) * 4;
        data[i] = v; data[i + 1] = v; data[i + 2] = v;
    };
    if (caja) {
        for (let y = caja.y; y < caja.y + caja.h; y += 1) {
            for (let x = caja.x; x < caja.x + caja.w; x += 1) poner(x, y, tinta);
        }
    }
    motas.forEach(([x, y]) => poner(x, y, tinta));
    return { data, width, height };
};

describe('fondoDe', () => {
    it('no supone blanco: lo deduce de las esquinas', () => {
        // Hay PDF con fondo crema y escaneados grisáceos. Suponer blanco
        // recortaría la página entera en cuanto el fondo no lo fuera.
        expect(fondoDe(pagina({ fondo: 210 }))).toBeCloseTo(210, 0);
    });

    it('funciona igual en negativo', () => {
        expect(fondoDe(pagina({ fondo: 12, tinta: 240 }))).toBeCloseTo(12, 0);
    });
});

describe('cajaDeContenido', () => {
    it('encuentra el bloque de texto y deja fuera el margen', () => {
        const caja = cajaDeContenido(pagina({ caja: { x: 20, y: 30, w: 60, h: 70 } }));
        expect(caja).toEqual({ x: 20, y: 30, w: 60, h: 70 });
    });

    it('una mota suelta no cuenta como contenido', () => {
        // **Aquí es donde estas cosas fallan en silencio.** Un escaneado tiene
        // motas, y con una sola bastaría para no recortar nada y parecer que el
        // ajuste no hace nada.
        const caja = cajaDeContenido(pagina({
            caja: { x: 30, y: 40, w: 40, h: 50 },
            motas: [[2, 3], [97, 136]],
        }));
        expect(caja.x).toBe(30);
        expect(caja.y).toBe(40);
    });

    it('una página en blanco no tiene caja', () => {
        expect(cajaDeContenido(pagina({ caja: null }))).toBeNull();
    });

    it('una página sin tamaño no revienta', () => {
        expect(cajaDeContenido({ data: new Uint8ClampedArray(0), width: 0, height: 0 })).toBeNull();
    });

    it('funciona con texto claro sobre fondo oscuro', () => {
        const caja = cajaDeContenido(pagina({ fondo: 20, tinta: 230, caja: { x: 10, y: 10, w: 30, h: 40 } }));
        expect(caja).toEqual({ x: 10, y: 10, w: 30, h: 40 });
    });
});

describe('unirCajas', () => {
    it('se queda con la unión, no con el promedio', () => {
        // Una caja que no quepa recortaría texto, y cortar una línea es un fallo
        // mucho peor que dejar un dedo de margen.
        const union = unirCajas([
            { x: 20, y: 30, w: 40, h: 40 },
            { x: 10, y: 35, w: 60, h: 50 },
        ]);
        expect(union).toEqual({ x: 10, y: 30, w: 60, h: 55 });
    });

    it('ignora las páginas en blanco', () => {
        expect(unirCajas([null, { x: 1, y: 2, w: 3, h: 4 }, undefined]))
            .toEqual({ x: 1, y: 2, w: 3, h: 4 });
    });

    it('sin ninguna caja no inventa una', () => {
        expect(unirCajas([])).toBeNull();
        expect(unirCajas([null])).toBeNull();
    });
});

describe('recorteRelativo', () => {
    it('devuelve proporciones, para que valga a cualquier zoom', () => {
        const r = recorteRelativo({ x: 25, y: 35, w: 50, h: 70 }, 100, 140, { aire: 0 });
        expect(r).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    });

    it('deja un poco de aire alrededor del texto', () => {
        const r = recorteRelativo({ x: 25, y: 35, w: 50, h: 70 }, 100, 140, { aire: 0.05 });
        expect(r.x).toBeLessThan(0.25);
        expect(r.w).toBeGreaterThan(0.5);
    });

    it('no se sale de la página', () => {
        const r = recorteRelativo({ x: 0, y: 0, w: 100, h: 140 }, 100, 140, { aire: 0.2, minimo: 2 });
        expect(r.x).toBe(0);
        expect(r.y).toBe(0);
        expect(r.w).toBeLessThanOrEqual(1);
        expect(r.h).toBeLessThanOrEqual(1);
    });

    it('si apenas hay margen que quitar, no recorta', () => {
        // Recortar un dos por ciento no compensa volver a pintar, y suele
        // significar que no se ha detectado nada de verdad.
        const casi = { x: 1, y: 1, w: 98, h: 138 };
        expect(recorteRelativo(casi, 100, 140, { aire: 0 })).toBeNull();
        expect(MINIMO_UTIL).toBeGreaterThan(0.9);
    });

    it('sin caja no hay recorte', () => {
        expect(recorteRelativo(null, 100, 140)).toBeNull();
    });
});
