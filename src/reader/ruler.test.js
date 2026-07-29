import { describe, it, expect } from 'vitest';
import { lineHeightPx, snapToLine, moveByLines, rulerGeometry } from './ruler.js';

describe('lineHeightPx', () => {
    it('calcula el alto de línea con la tipografía actual', () => {
        expect(lineHeightPx({ fontSize: 20, lineHeight: 1.6 })).toBe(32);
    });

    it('nunca devuelve una banda de menos de 12 px', () => {
        // Con valores absurdos la banda sería más fina que el dedo y no se
        // podría agarrar.
        expect(lineHeightPx({ fontSize: 4, lineHeight: 1 })).toBe(12);
    });
});

describe('snapToLine', () => {
    const top = 100;
    const height = 400;
    const line = 30;

    it('encaja la banda en una línea completa', () => {
        // El dedo señala el centro de lo que se quiere leer, así que la banda
        // se centra en él y luego se encaja.
        expect(snapToLine(205, top, height, line)).toBe(190);
    });

    it('centra la banda en el dedo, no la cuelga debajo', () => {
        const result = snapToLine(200, top, height, line);
        expect(result).toBeLessThan(200);
        expect(result + line).toBeGreaterThan(200);
    });

    it('siempre cae en un múltiplo del alto de línea', () => {
        for (const y of [120, 187, 250, 333, 401]) {
            expect((snapToLine(y, top, height, line) - top) % line).toBe(0);
        }
    });

    it('no deja salir la banda por arriba', () => {
        expect(snapToLine(0, top, height, line)).toBe(top);
    });

    it('no deja salir la banda por abajo', () => {
        // Perderla por el borde obligaría a apagar el modo para recuperarla.
        const result = snapToLine(9999, top, height, line);
        expect(result + line).toBeLessThanOrEqual(top + height);
    });

    it('aguanta un área más baja que una línea', () => {
        expect(snapToLine(150, top, 10, line)).toBe(top);
    });

    it('devuelve el borde superior si no hay alto de línea', () => {
        expect(snapToLine(300, top, height, 0)).toBe(top);
    });
});

describe('moveByLines', () => {
    it('avanza exactamente una línea', () => {
        const start = snapToLine(200, 100, 400, 30);
        expect(moveByLines(start, 1, 100, 400, 30)).toBe(start + 30);
    });

    it('retrocede exactamente una línea', () => {
        const start = snapToLine(200, 100, 400, 30);
        expect(moveByLines(start, -1, 100, 400, 30)).toBe(start - 30);
    });

    it('se para en el borde en vez de salirse', () => {
        expect(moveByLines(100, -5, 100, 400, 30)).toBe(100);
    });
});

describe('rulerGeometry', () => {
    it('las tres piezas cubren el área sin dejar huecos', () => {
        const { band, above, below } = rulerGeometry(190, 400, 30, 100);
        expect(above.top + above.height).toBe(band.top);
        expect(band.top + band.height).toBe(below.top);
        expect(below.top + below.height).toBe(500);
    });

    it('no deja sombra superior con la banda arriba del todo', () => {
        const { above } = rulerGeometry(100, 400, 30, 100);
        expect(above.height).toBe(0);
    });

    it('no genera alturas negativas con la banda desbordada', () => {
        const { below } = rulerGeometry(490, 400, 30, 100);
        expect(below.height).toBeGreaterThanOrEqual(0);
    });
});
