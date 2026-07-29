import { describe, it, expect } from 'vitest';
import { selectBooks, SORTS, FILTERS } from './useLibrary.js';

const book = (overrides) => ({
    id: overrides.id,
    name: overrides.name || 'Sin título',
    author: overrides.author || 'Anónimo',
    tags: overrides.tags || '',
    series: '',
    description: '',
    publisher: '',
    progress: 0,
    isFav: false,
    isFinished: false,
    dateAdded: 0,
    lastReadDate: 0,
    ...overrides,
});

const library = [
    book({ id: '1', name: 'Dune', author: 'Frank Herbert', progress: 0.64, lastReadDate: 300, dateAdded: 100 }),
    book({ id: '2', name: 'Neuromante', author: 'William Gibson', progress: 0.23, lastReadDate: 200, dateAdded: 200, isFav: true }),
    book({ id: '3', name: 'Sapiens', author: 'Yuval Harari', progress: 0, dateAdded: 300 }),
    book({ id: '4', name: 'El Hobbit', author: 'J.R.R. Tolkien', progress: 1, isFinished: true, lastReadDate: 100, dateAdded: 50 }),
];

const ids = (result) => result.map((entry) => entry.id);

describe('selectBooks', () => {
    it('sin criterios ordena por actividad reciente', () => {
        // Un libro sin abrir cae a su fecha de importación: Sapiens (añadido el
        // 300) empata con Dune (leído el 300) y va justo detrás. Es deliberado —
        // lo que acabas de importar también es actividad reciente.
        expect(ids(selectBooks(library))).toEqual(['1', '3', '2', '4']);
    });

    it('el filtro "leyendo" excluye los terminados y los no empezados', () => {
        expect(ids(selectBooks(library, { filter: 'reading' }))).toEqual(['1', '2']);
    });

    it('el filtro "sin empezar" solo devuelve los de progreso cero', () => {
        expect(ids(selectBooks(library, { filter: 'unread' }))).toEqual(['3']);
    });

    it('busca por título y por autor', () => {
        expect(ids(selectBooks(library, { query: 'dune' }))).toEqual(['1']);
        expect(ids(selectBooks(library, { query: 'tolkien' }))).toEqual(['4']);
    });

    it('la búsqueda ignora mayúsculas y espacios sobrantes', () => {
        expect(ids(selectBooks(library, { query: '  GIBSON ' }))).toEqual(['2']);
    });

    it('combina filtro y búsqueda', () => {
        expect(ids(selectBooks(library, { filter: 'favorites', query: 'neuro' }))).toEqual(['2']);
        expect(ids(selectBooks(library, { filter: 'favorites', query: 'dune' }))).toEqual([]);
    });

    it('ordena por título con criterio español', () => {
        expect(ids(selectBooks(library, { sort: 'title' }))).toEqual(['1', '4', '2', '3']);
    });

    it('ordena por progreso descendente', () => {
        expect(ids(selectBooks(library, { sort: 'progress' }))).toEqual(['4', '1', '2', '3']);
    });

    it('no modifica el array de entrada', () => {
        const original = [...library];
        selectBooks(library, { sort: 'title' });
        expect(library).toEqual(original);
    });

    it('todos los filtros y ordenaciones declarados son invocables', () => {
        Object.keys(FILTERS).forEach((filter) => {
            expect(() => selectBooks(library, { filter })).not.toThrow();
        });
        Object.keys(SORTS).forEach((sort) => {
            expect(() => selectBooks(library, { sort })).not.toThrow();
        });
    });
});
