import { describe, it, expect } from 'vitest';
import { wrapText, fontSizeFor } from './quoteImage.js';

/**
 * El dibujo en canvas no se puede probar en Node, pero sí las dos decisiones
 * que determinan si la imagen queda bien: cómo se parte el texto y qué tamaño
 * de letra se elige.
 */

/** Contexto de canvas de mentira: mide 10 px por carácter. */
const fakeContext = (charWidth = 10) => ({
    measureText: (text) => ({ width: text.length * charWidth }),
});

describe('ajuste de líneas', () => {
    it('parte el texto para que quepa en el ancho dado', () => {
        const lines = wrapText(fakeContext(), 'uno dos tres cuatro cinco', 100);
        lines.forEach((line) => expect(line.length * 10).toBeLessThanOrEqual(100));
        expect(lines.length).toBeGreaterThan(1);
    });

    it('no pierde ni duplica palabras', () => {
        const source = 'el veloz murciélago hindú comía feliz cardillo y kiwi';
        const lines = wrapText(fakeContext(), source, 120);
        expect(lines.join(' ')).toBe(source);
    });

    it('una palabra más larga que la línea no se pierde', () => {
        const lines = wrapText(fakeContext(), 'supercalifragilisticoespialidoso', 50);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toBe('supercalifragilisticoespialidoso');
    });

    it('un texto corto cabe en una sola línea', () => {
        expect(wrapText(fakeContext(), 'corto', 500)).toEqual(['corto']);
    });

    it('un texto vacío no genera líneas vacías', () => {
        expect(wrapText(fakeContext(), '', 200)).toEqual([]);
    });
});

describe('tamaño de letra según longitud', () => {
    it('una cita corta se dibuja grande', () => {
        expect(fontSizeFor(50)).toBeGreaterThan(60);
    });

    it('una cita larga se encoge para caber', () => {
        expect(fontSizeFor(600)).toBeLessThan(40);
    });

    it('el tamaño nunca crece al alargarse la cita', () => {
        const lengths = [10, 100, 200, 350, 600, 1200];
        const sizes = lengths.map(fontSizeFor);
        sizes.forEach((size, index) => {
            if (index > 0) expect(size).toBeLessThanOrEqual(sizes[index - 1]);
        });
    });

    it('siempre devuelve un tamaño legible', () => {
        expect(fontSizeFor(99999)).toBeGreaterThanOrEqual(28);
    });
});
