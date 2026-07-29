import { detectSeriesCandidates } from '../core/seriesDetection.js';
import { smartCollectionBookIds, describeSmartRule, SMART_RULE_TYPES } from '../core/smartCollections.js';

export { SMART_RULE_TYPES, describeSmartRule };

/**
 * Colecciones y series.
 *
 * Las **series** se detectan solas: el núcleo compartido ya sabe agrupar por
 * campo `series` y encontrar huecos en la numeración, que es lo que convierte
 * una lista de libros en «te falta el 3».
 *
 * Las **colecciones** las hace el usuario a mano, con nombre y emoji, y viven en
 * los ajustes igual que en el escritorio, para que viajen en el backup.
 */

const KEY = 'collections';

/**
 * @typedef {Object} Collection
 * @property {string} id
 * @property {string} name
 * @property {string} emoji
 * @property {string[]} bookIds
 * @property {number} createdAt
 */

export const loadCollections = async (storage) =>
    (await storage.getSetting(KEY)) || [];

const save = async (storage, collections) => {
    await storage.setSetting(KEY, collections);
    return collections;
};

export const createCollection = async (storage, { name, emoji = '📚' }) => {
    const collections = await loadCollections(storage);
    const collection = {
        id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: String(name || '').trim() || 'Sin nombre',
        emoji,
        bookIds: [],
        createdAt: Date.now(),
    };
    return save(storage, [...collections, collection]);
};

export const renameCollection = async (storage, id, changes) => {
    const collections = await loadCollections(storage);
    return save(storage, collections.map((collection) =>
        collection.id === id ? { ...collection, ...changes } : collection
    ));
};

export const deleteCollection = async (storage, id) => {
    const collections = await loadCollections(storage);
    return save(storage, collections.filter((collection) => collection.id !== id));
};

/** Añade o quita un libro de una colección, según dónde esté. */
export const toggleBookInCollection = async (storage, collectionId, bookId) => {
    const collections = await loadCollections(storage);
    return save(storage, collections.map((collection) => {
        if (collection.id !== collectionId) return collection;
        const has = collection.bookIds.includes(bookId);
        return {
            ...collection,
            bookIds: has
                ? collection.bookIds.filter((id) => id !== bookId)
                : [...collection.bookIds, bookId],
        };
    }));
};

/** Resuelve los ids a libros, descartando los que ya no existen. */
export const booksInCollection = (collection, books) => {
    const byId = new Map(books.map((book) => [book.id, book]));
    return (collection?.bookIds || []).map((id) => byId.get(id)).filter(Boolean);
};

/**
 * Series ya asignadas, con sus huecos.
 *
 * Un hueco es un número que falta entre el primero y el último que tienes: si
 * tienes el 1, el 2 y el 4, falta el 3. Eso es lo que convierte una lista de
 * libros en «te falta uno».
 */
export const buildSeries = (books = []) => {
    const groups = new Map();

    books.forEach((book) => {
        const name = String(book.series || '').trim();
        if (!name) return;
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(book);
    });

    return [...groups.entries()]
        .map(([name, items]) => {
            const sorted = items.slice().sort((a, b) => (a.seriesIndex || 0) - (b.seriesIndex || 0));
            const numbers = sorted.map((book) => Number(book.seriesIndex) || 0).filter(Boolean);

            const gaps = [];
            if (numbers.length > 1) {
                for (let n = Math.min(...numbers); n < Math.max(...numbers); n++) {
                    if (!numbers.includes(n)) gaps.push(n);
                }
            }

            // El siguiente por leer es el primero sin terminar, en orden de serie.
            const next = sorted.find((book) => !book.isFinished) || null;

            return {
                name,
                books: sorted,
                count: sorted.length,
                finished: sorted.filter((book) => book.isFinished).length,
                gaps,
                next,
                complete: gaps.length === 0 && sorted.length > 1,
            };
        })
        .sort((a, b) => b.count - a.count);
};

/**
 * Series **sugeridas**: libros sin campo `series` cuyo título delata que van
 * numerados. El núcleo compartido ya sabe reconocer esos patrones, así que
 * aquí solo se ofrece el resultado para que el usuario confirme.
 */
export const suggestSeries = (books = []) => detectSeriesCandidates(books);

/** Aplica una sugerencia: asigna nombre de serie e índice a cada libro. */
export const applySeriesSuggestion = (candidate) =>
    candidate.books.map((entry) => ({
        id: entry.id,
        changes: {
            series: candidate.suggestedName,
            seriesIndex: entry.detectedIndex,
            metadataUpdatedAt: Date.now(),
        },
    }));

/** Libros que cumplen la regla de una colección inteligente. */
export const resolveSmartCollection = (books, rule) => {
    const ids = new Set(smartCollectionBookIds(books, rule));
    return books.filter((book) => ids.has(book.id));
};
