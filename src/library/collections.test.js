import { describe, it, expect } from 'vitest';
import {
    loadCollections, createCollection, renameCollection, deleteCollection,
    toggleBookInCollection, booksInCollection, buildSeries,
    suggestSeries, applySeriesSuggestion, resolveSmartCollection,
} from './collections.js';

const fakeStorage = () => {
    const data = new Map();
    return {
        getSetting: async (key) => data.get(key) ?? null,
        setSetting: async (key, value) => { data.set(key, value); },
    };
};

const book = (overrides) => ({
    id: overrides.id,
    name: overrides.name || 'Libro',
    author: overrides.author || 'Autor',
    series: '',
    seriesIndex: 0,
    isFinished: false,
    tags: '',
    progress: 0,
    dateAdded: Date.now(),
    ...overrides,
});

describe('colecciones manuales', () => {
    it('crea una colección vacía con nombre y emoji', async () => {
        const storage = fakeStorage();
        const list = await createCollection(storage, { name: 'Pendientes', emoji: '⏳' });
        expect(list[0]).toMatchObject({ name: 'Pendientes', emoji: '⏳', bookIds: [] });
    });

    it('un nombre en blanco no deja la colección sin identificar', async () => {
        const storage = fakeStorage();
        const list = await createCollection(storage, { name: '   ' });
        expect(list[0].name).toBe('Sin nombre');
    });

    it('renombra sin tocar los libros que contiene', async () => {
        const storage = fakeStorage();
        const [collection] = await createCollection(storage, { name: 'A' });
        await toggleBookInCollection(storage, collection.id, 'libro-1');
        const list = await renameCollection(storage, collection.id, { name: 'B' });

        expect(list[0].name).toBe('B');
        expect(list[0].bookIds).toEqual(['libro-1']);
    });

    it('añadir y quitar es el mismo gesto', async () => {
        const storage = fakeStorage();
        const [collection] = await createCollection(storage, { name: 'A' });

        let list = await toggleBookInCollection(storage, collection.id, 'x');
        expect(list[0].bookIds).toEqual(['x']);

        list = await toggleBookInCollection(storage, collection.id, 'x');
        expect(list[0].bookIds).toEqual([]);
    });

    it('borra una colección sin afectar a las demás', async () => {
        const storage = fakeStorage();
        const [first] = await createCollection(storage, { name: 'A' });
        await createCollection(storage, { name: 'B' });

        const list = await deleteCollection(storage, first.id);
        expect(list).toHaveLength(1);
        expect(list[0].name).toBe('B');
    });

    it('persiste entre lecturas', async () => {
        const storage = fakeStorage();
        await createCollection(storage, { name: 'A' });
        expect(await loadCollections(storage)).toHaveLength(1);
    });

    it('descarta los libros que ya no existen', () => {
        const collection = { bookIds: ['1', 'borrado', '2'] };
        const books = [book({ id: '1' }), book({ id: '2' })];
        expect(booksInCollection(collection, books).map((b) => b.id)).toEqual(['1', '2']);
    });

    it('respeta el orden en que se añadieron', () => {
        const collection = { bookIds: ['2', '1'] };
        const books = [book({ id: '1' }), book({ id: '2' })];
        expect(booksInCollection(collection, books).map((b) => b.id)).toEqual(['2', '1']);
    });
});

describe('series', () => {
    it('agrupa por nombre de serie y ordena por índice', () => {
        const books = [
            book({ id: '3', series: 'Dune', seriesIndex: 3 }),
            book({ id: '1', series: 'Dune', seriesIndex: 1 }),
            book({ id: '2', series: 'Dune', seriesIndex: 2 }),
        ];
        const [serie] = buildSeries(books);
        expect(serie.name).toBe('Dune');
        expect(serie.books.map((b) => b.seriesIndex)).toEqual([1, 2, 3]);
    });

    it('detecta los huecos de numeración', () => {
        const books = [
            book({ id: '1', series: 'Dune', seriesIndex: 1 }),
            book({ id: '2', series: 'Dune', seriesIndex: 2 }),
            book({ id: '4', series: 'Dune', seriesIndex: 4 }),
        ];
        expect(buildSeries(books)[0].gaps).toEqual([3]);
    });

    it('una serie sin huecos se marca completa', () => {
        const books = [
            book({ id: '1', series: 'Dune', seriesIndex: 1 }),
            book({ id: '2', series: 'Dune', seriesIndex: 2 }),
        ];
        expect(buildSeries(books)[0].complete).toBe(true);
    });

    it('señala el siguiente por leer', () => {
        const books = [
            book({ id: '1', series: 'Dune', seriesIndex: 1, isFinished: true }),
            book({ id: '2', series: 'Dune', seriesIndex: 2 }),
        ];
        expect(buildSeries(books)[0].next.id).toBe('2');
    });

    it('una serie terminada entera no tiene siguiente', () => {
        const books = [
            book({ id: '1', series: 'Dune', seriesIndex: 1, isFinished: true }),
            book({ id: '2', series: 'Dune', seriesIndex: 2, isFinished: true }),
        ];
        expect(buildSeries(books)[0].next).toBeNull();
    });

    it('los libros sueltos no forman serie', () => {
        expect(buildSeries([book({ id: '1' })])).toEqual([]);
    });

    it('ordena las series por número de libros', () => {
        const books = [
            book({ id: 'a', series: 'Corta', seriesIndex: 1 }),
            book({ id: 'b', series: 'Larga', seriesIndex: 1 }),
            book({ id: 'c', series: 'Larga', seriesIndex: 2 }),
        ];
        expect(buildSeries(books)[0].name).toBe('Larga');
    });
});

describe('sugerencia de series', () => {
    it('reconoce libros numerados por el título', () => {
        const books = [
            book({ id: '1', name: 'Harry Potter 1', author: 'Rowling' }),
            book({ id: '2', name: 'Harry Potter 2', author: 'Rowling' }),
        ];
        const candidates = suggestSeries(books);
        expect(candidates.length).toBeGreaterThan(0);
        expect(candidates[0].books).toHaveLength(2);
    });

    it('no sugiere lo que ya tiene serie asignada', () => {
        const books = [
            book({ id: '1', name: 'Saga 1', series: 'Saga', seriesIndex: 1 }),
            book({ id: '2', name: 'Saga 2', series: 'Saga', seriesIndex: 2 }),
        ];
        expect(suggestSeries(books)).toEqual([]);
    });

    it('aplicar una sugerencia asigna nombre e índice a cada libro', () => {
        const candidate = {
            suggestedName: 'Fundación',
            books: [
                { id: 'a', detectedIndex: 1 },
                { id: 'b', detectedIndex: 2 },
            ],
        };
        const changes = applySeriesSuggestion(candidate);
        expect(changes[0].changes.series).toBe('Fundación');
        expect(changes[1].changes.seriesIndex).toBe(2);
    });
});

describe('colecciones inteligentes', () => {
    it('filtra por etiqueta', () => {
        const books = [
            book({ id: '1', tags: 'fantasía, épica' }),
            book({ id: '2', tags: 'ensayo' }),
        ];
        const result = resolveSmartCollection(books, { type: 'tag', value: 'fantasía' });
        expect(result.map((b) => b.id)).toEqual(['1']);
    });

    it('filtra por autor', () => {
        const books = [
            book({ id: '1', author: 'Isaac Asimov' }),
            book({ id: '2', author: 'Frank Herbert' }),
        ];
        const result = resolveSmartCollection(books, { type: 'author', value: 'Isaac Asimov' });
        expect(result.map((b) => b.id)).toEqual(['1']);
    });

    it('una regla sin coincidencias devuelve lista vacía, no todo', () => {
        const books = [book({ id: '1', author: 'X' })];
        expect(resolveSmartCollection(books, { type: 'author', value: 'Nadie' })).toEqual([]);
    });
});
