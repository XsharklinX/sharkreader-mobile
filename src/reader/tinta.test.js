import { describe, expect, it } from 'vitest';
import {
    aLienzo, aPagina, anchoConPresion, borrarEn, cerrarTrazo, comoAnotacionPdf, hayTinta, presionDe, simplificar, tocaTrazo,
} from './tinta.js';

const trazo = (puntos, extra = {}) => ({ herramienta: 'boligrafo', color: '#1f4fd1', ancho: 0.004, puntos, ...extra });

describe('tinta', () => {
    it('pasa de pantalla a página y vuelve, también con recorte', () => {
        const lienzo = { ancho: 400, alto: 600 };
        const recorte = { x: 0.1, y: 0.05, w: 0.8, h: 0.9 };
        const p = aPagina({ x: 200, y: 300 }, lienzo, recorte);
        expect(p.x).toBeCloseTo(0.5);
        expect(p.y).toBeCloseTo(0.5);
        const [x, y] = aLienzo([p.x, p.y], lienzo, recorte);
        expect(x).toBeCloseTo(200);
        expect(y).toBeCloseTo(300);
        expect(aPagina({ x: 0, y: 0 }, lienzo, recorte)).toEqual({ x: 0.1, y: 0.05 });
    });

    it('simplifica una recta a sus extremos y conserva las esquinas', () => {
        const recta = Array.from({ length: 50 }, (_, i) => [i / 100, 0.2, 0.5]);
        expect(simplificar(recta)).toHaveLength(2);
        const ele = [...Array.from({ length: 20 }, (_, i) => [0.1, 0.1 + i / 100, 0.5]), ...Array.from({ length: 20 }, (_, i) => [0.1 + i / 100, 0.3, 0.5])];
        const corto = simplificar(ele);
        expect(corto.length).toBeLessThan(6);
        expect(corto.some(([x, y]) => Math.abs(x - 0.1) < 0.011 && Math.abs(y - 0.3) < 0.011)).toBe(true);
    });

    it('redondea al cerrar', () => {
        const cerrado = cerrarTrazo(trazo([[0.123456, 0.654321, 0.777], [0.5, 0.9, 0.2]]));
        expect(cerrado.puntos[0]).toEqual([0.1235, 0.6543, 0.78]);
    });

    it('solo cree la presión del lápiz', () => {
        expect(presionDe({ pointerType: 'pen', pressure: 0.9 })).toBe(0.9);
        expect(presionDe({ pointerType: 'pen', pressure: 0 })).toBe(0.5);
        expect(presionDe({ pointerType: 'touch', pressure: 1 })).toBe(0.5);
        expect(anchoConPresion(2, 0.5)).toBe(2);
        expect(anchoConPresion(2, 1)).toBe(3);
    });

    it('la goma borra solo lo que toca', () => {
        const a = trazo([[0.1, 0.1], [0.3, 0.1]]);
        const b = trazo([[0.1, 0.8], [0.3, 0.8]]);
        expect(tocaTrazo(a, { x: 0.2, y: 0.11 })).toBe(true);
        expect(tocaTrazo(a, { x: 0.2, y: 0.3 })).toBe(false);
        expect(borrarEn([a, b], { x: 0.2, y: 0.1 })).toEqual([b]);
        expect(tocaTrazo(trazo([[0.5, 0.5]]), { x: 0.505, y: 0.5 })).toBe(true);
    });

    it('sabe si hay algo escrito', () => {
        expect(hayTinta({})).toBe(false);
        expect(hayTinta({ 3: [] })).toBe(false);
        expect(hayTinta({ 3: [trazo([[0, 0]])] })).toBe(true);
    });

    it('convierte un trazo en anotación Ink con su apariencia', () => {
        // Página A4 en puntos, sin giro: y crece hacia arriba en PDF.
        const convertir = (x, y) => [x * 595, (1 - y) * 842];
        const anotacion = comoAnotacionPdf(trazo([[0.1, 0.1, 0.5], [0.2, 0.1, 0.5]]), convertir, 595);
        expect(anotacion.inkList).toEqual([59.5, 757.8, 119, 757.8]);
        expect(anotacion.grosor).toBeCloseTo(2.38);
        expect(anotacion.rect[0]).toBeLessThan(59.5);
        expect(anotacion.rect[3]).toBeGreaterThan(757.8);
        expect(anotacion.apariencia.contenido).toMatch(/RG\n.* w 1 J 1 j\n.* m\n.* l\nS$/);
        expect(anotacion.color[2]).toBeCloseTo(209 / 255);

        const marcador = comoAnotacionPdf(trazo([[0.5, 0.5, 0.5]], { herramienta: 'marcador', color: '#ffd400', ancho: 0.018 }), convertir, 595);
        expect(marcador.opacidad).toBe(0.35);
        expect(marcador.apariencia.contenido.startsWith('/GS0 gs')).toBe(true);
    });
});
