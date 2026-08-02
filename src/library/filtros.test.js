import { describe, it, expect } from 'vitest';
import { selectBooks, FILTERS, SORTS } from './useLibrary.js';

/**
 * Filtros y orden de la biblioteca.
 *
 * Se prueban aquí porque son lo que decide qué libros ve el usuario, y porque el
 * fallo que motivó esto no estaba en la lógica sino en la pantalla: los filtros
 * solo existían mientras buscabas, así que tocar uno cambiaba el diseño entero en
 * vez de filtrar. La lógica hay que dejarla dicha para que la pantalla pueda
 * confiar en ella.
 */

const libro = (extra) => ({
    id: extra.id || Math.random().toString(36),
    name: 'Sin título',
    author: 'Anónimo',
    progress: 0,
    dateAdded: 0,
    ...extra,
});

const biblioteca = [
    libro({ id: 'a', name: 'Los demonios', author: 'Dostoyevski', progress: 0.4 }),
    libro({ id: 'b', name: 'Troya', author: 'Fry', progress: 1, isFinished: true }),
    libro({ id: 'c', name: 'Carmilla', author: 'Le Fanu' }),
    libro({ id: 'd', name: 'Ciudad Medialuna', author: 'Maas', progress: 0.9, isFav: true }),
];

describe('filtros', () => {
    const ids = (filter) => selectBooks(biblioteca, { filter }).map((b) => b.id).sort();

    it('todos, son todos', () => {
        expect(ids('all')).toEqual(['a', 'b', 'c', 'd']);
    });

    it('leyendo deja fuera los terminados', () => {
        // Un libro terminado tiene progress 1, así que sin la condición extra
        // aparecería como el que más ha avanzado.
        expect(ids('reading')).toEqual(['a', 'd']);
    });

    it('terminados son solo los marcados', () => {
        expect(ids('finished')).toEqual(['b']);
    });

    it('sin empezar no incluye los terminados', () => {
        expect(ids('unread')).toEqual(['c']);
    });

    it('cada filtro sabe cuántos hay sin tener que aplicarlo', () => {
        // Es lo que enseña el número dentro de la pastilla.
        const cuenta = (id) => biblioteca.filter((b) => FILTERS[id].match(b)).length;
        expect(cuenta('favorites')).toBe(1);
        expect(cuenta('finished')).toBe(1);
    });
});

describe('orden por serie', () => {
    const saga = [
        libro({ id: '2', name: 'Casa de flama', series: 'Ciudad Medialuna', seriesIndex: 2 }),
        libro({ id: 'x', name: 'Carmilla' }),
        libro({ id: '1', name: 'Casa de cielo', series: 'Ciudad Medialuna', seriesIndex: 1 }),
        libro({ id: 'z', name: 'Alas de sangre', series: 'Empíreo', seriesIndex: 1 }),
    ];

    it('agrupa por serie y ordena por número dentro de ella', () => {
        const orden = [...saga].sort(SORTS.serie.compare).map((b) => b.id);
        expect(orden.slice(0, 3)).toEqual(['1', '2', 'z']);
    });

    it('los libros sueltos van al final', () => {
        // Una lista ordenada por serie que empieza por lo que no pertenece a
        // ninguna no está ordenada por serie.
        const orden = [...saga].sort(SORTS.serie.compare).map((b) => b.id);
        expect(orden[orden.length - 1]).toBe('x');
    });
});

describe('búsqueda y filtro a la vez', () => {
    it('se aplican los dos, no uno u otro', () => {
        const resultado = selectBooks(biblioteca, { query: 'ciudad', filter: 'reading' });
        expect(resultado.map((b) => b.id)).toEqual(['d']);
    });

    it('un filtro sin resultados devuelve lista vacía, no todo', () => {
        expect(selectBooks(biblioteca, { query: 'troya', filter: 'unread' })).toEqual([]);
    });
});
