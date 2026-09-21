import { describe, it, expect } from 'vitest';
import { shelfColumns, intoShelves } from './Bookshelf.jsx';

describe('shelfColumns', () => {
    it('cuatro en un móvil normal', () => {
        // Cabían tres cuando debajo de cada libro iban el título y el autor. Sin
        // ese texto la portada puede ser más estrecha y seguir reconociéndose, y
        // un anaquel de cuatro se parece más a una estantería que uno de tres.
        expect(shelfColumns(360)).toBe(4);
        expect(shelfColumns(392)).toBe(4);
        expect(shelfColumns(430)).toBe(4);
    });

    it('tres solo en pantallas muy estrechas', () => {
        expect(shelfColumns(320)).toBe(3);
    });

    it('más en tablet, para no dejar portadas gigantes', () => {
        expect(shelfColumns(760)).toBe(5);
        expect(shelfColumns(1100)).toBe(6);
    });

    it('crece de forma monótona con el ancho', () => {
        let previous = 0;
        for (const width of [320, 400, 500, 700, 950, 1400]) {
            expect(shelfColumns(width)).toBeGreaterThanOrEqual(previous);
            previous = shelfColumns(width);
        }
    });
});

describe('intoShelves', () => {
    const books = Array.from({ length: 7 }, (_, i) => ({ id: `b${i}` }));

    it('reparte en anaqueles del tamaño pedido', () => {
        const shelves = intoShelves(books, 3);
        expect(shelves).toHaveLength(3);
        expect(shelves[0]).toHaveLength(3);
        expect(shelves[2]).toHaveLength(1);
    });

    it('conserva el orden de la biblioteca', () => {
        expect(intoShelves(books, 3)[0].map((b) => b.id)).toEqual(['b0', 'b1', 'b2']);
        expect(intoShelves(books, 3)[2].map((b) => b.id)).toEqual(['b6']);
    });

    it('no pierde ni duplica ningún libro', () => {
        const flat = intoShelves(books, 4).flat();
        expect(flat).toHaveLength(books.length);
        expect(new Set(flat.map((b) => b.id)).size).toBe(books.length);
    });

    it('una biblioteca vacía no genera anaqueles', () => {
        expect(intoShelves([], 3)).toEqual([]);
    });

    it('un tamaño inválido no provoca un bucle infinito', () => {
        // `perShelf <= 0` haría que el índice no avanzara nunca.
        expect(intoShelves(books, 0)).toEqual([]);
        expect(intoShelves(books, -2)).toEqual([]);
    });

    it('con menos libros que hueco hay un solo anaquel', () => {
        expect(intoShelves(books.slice(0, 2), 5)).toHaveLength(1);
    });
});
