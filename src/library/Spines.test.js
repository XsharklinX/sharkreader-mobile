import { describe, it, expect } from 'vitest';
import { repartir, altoDeLomo, ALTO, VARIACION } from './Spines.jsx';

const libro = (id, ancho) => ({ id, ancho });
const anchoDe = (l) => l.ancho;

describe('repartir', () => {
    it('llena la balda hasta donde cabe y salta a la siguiente', () => {
        const baldas = repartir(
            [libro('a', 40), libro('b', 40), libro('c', 40)],
            100,
            anchoDe
        );
        expect(baldas.map((b) => b.map((l) => l.id))).toEqual([['a', 'b'], ['c']]);
    });

    it('suma grosores en vez de contar libros', () => {
        // Con un número fijo por fila, una balda de tochos desbordaría y una de
        // novelas cortas quedaría medio vacía.
        const baldas = repartir(
            [libro('gordo', 90), libro('fino', 20), libro('fino2', 20)],
            100,
            anchoDe
        );
        expect(baldas[0].map((l) => l.id)).toEqual(['gordo']);
        expect(baldas[1].map((l) => l.id)).toEqual(['fino', 'fino2']);
    });

    it('un libro más ancho que la balda no se queda fuera', () => {
        // Va solo en su balda, desbordando un poco, que es mejor que no aparecer.
        const baldas = repartir([libro('enorme', 500)], 100, anchoDe);
        expect(baldas).toHaveLength(1);
        expect(baldas[0][0].id).toBe('enorme');
    });

    it('sin libros no hay baldas vacías', () => {
        expect(repartir([], 100, anchoDe)).toEqual([]);
    });

    it('no pierde ni repite ningún libro', () => {
        const libros = Array.from({ length: 37 }, (_, i) => libro(`l${i}`, 20 + (i % 5) * 6));
        const baldas = repartir(libros, 300, anchoDe);
        const ids = baldas.flat().map((l) => l.id);
        expect(ids).toHaveLength(37);
        expect(new Set(ids).size).toBe(37);
        expect(ids).toEqual(libros.map((l) => l.id));
    });
});

describe('altoDeLomo', () => {
    it('el mismo libro mide siempre lo mismo', () => {
        // Con altura al azar, la estantería temblaría al desplazarse.
        expect(altoDeLomo('libro-1')).toBe(altoDeLomo('libro-1'));
    });

    it('libros distintos no miden todos igual', () => {
        const alturas = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(altoDeLomo));
        expect(alturas.size).toBeGreaterThan(1);
    });

    it('la variación se queda en un rango creíble', () => {
        // Un lomo el doble de alto que su vecino no parece una estantería, parece
        // un error.
        for (const id of ['a', 'zzz', 'libro-137', '']) {
            expect(altoDeLomo(id)).toBeGreaterThanOrEqual(ALTO - VARIACION);
            expect(altoDeLomo(id)).toBeLessThanOrEqual(ALTO + VARIACION);
        }
    });
});
