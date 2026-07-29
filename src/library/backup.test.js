import { describe, it, expect } from 'vitest';
import { mergeIntoLibrary, isBookReadable } from './backup.js';
import { buildPortableBackup } from '../core/backupMerge.js';
import { toStoredBookRecord } from '../core/bookModel.js';

/**
 * Estos tests cubren el camino que importa de verdad: traer un backup del
 * escritorio a un móvil que ya tiene libros. Lo que se comprueba es que el
 * merge no pisa lo que hay, porque perder progreso de lectura al restaurar es
 * el peor fallo posible en una app de este tipo.
 */

const HOUR = 3_600_000;
const now = Date.now();

const desktopBook = (overrides = {}) => toStoredBookRecord({
    id: overrides.id,
    originalTitle: overrides.title || 'Dune',
    originalAuthor: 'Frank Herbert',
    type: 'epub',
    progress: overrides.progress ?? 0,
    lastLocation: overrides.location || null,
    bookmarks: overrides.bookmarks || [],
    dateAdded: now - 10 * HOUR,
    updatedAt: overrides.updatedAt ?? now,
    progressUpdatedAt: overrides.progressUpdatedAt ?? overrides.updatedAt ?? now,
    annotationsUpdatedAt: overrides.annotationsUpdatedAt ?? overrides.updatedAt ?? now,
    metadataUpdatedAt: overrides.updatedAt ?? now,
}, {}, { includeFile: false });

const backupOf = (books) => buildPortableBackup({
    books,
    deletedBooks: {},
    categories: [],
    collections: [],
    stats: { timeRead: 500, streak: 12 },
    user: {},
    workshop: {},
    achievements: { first_open: { unlockedAt: now - 100 * HOUR } },
    settingsUpdatedAt: now,
});

describe('importar un backup en una biblioteca vacía', () => {
    it('trae todos los libros', () => {
        const incoming = backupOf([desktopBook({ id: 'a' }), desktopBook({ id: 'b', title: 'Sapiens' })]);
        const result = mergeIntoLibrary(incoming, [], {});

        expect(result.summary.total).toBe(2);
        expect(result.summary.added).toBe(2);
        expect(result.summary.updated).toBe(0);
    });

    it('los libros llegan ya hidratados, listos para la rejilla', () => {
        const incoming = backupOf([desktopBook({ id: 'a' })]);
        const [book] = mergeIntoLibrary(incoming, [], {}).books;

        expect(book.name).toBe('Dune');
        expect(book.author).toBe('Frank Herbert');
        expect(book.color).toBeTruthy();
    });

    it('trae las estadísticas y los logros del escritorio', () => {
        const incoming = backupOf([desktopBook({ id: 'a' })]);
        const result = mergeIntoLibrary(incoming, [], {});

        expect(result.stats.streak).toBe(12);
        expect(result.achievements).toHaveProperty('first_open');
    });
});

describe('importar sobre una biblioteca con progreso', () => {
    it('el progreso más reciente gana, venga de donde venga', () => {
        const local = [{
            ...desktopBook({ id: 'a', progress: 0.8, progressUpdatedAt: now }),
            name: 'Dune',
            author: 'Frank Herbert',
            bookmarks: [],
        }];
        // El backup del escritorio es más antiguo: no debe pisar el móvil.
        const incoming = backupOf([desktopBook({ id: 'a', progress: 0.2, progressUpdatedAt: now - 5 * HOUR })]);

        const result = mergeIntoLibrary(incoming, local, {});
        expect(result.books[0].progress).toBeCloseTo(0.8);
    });

    it('si el escritorio va más adelantado, ese progreso se adopta', () => {
        const local = [{
            ...desktopBook({ id: 'a', progress: 0.2, progressUpdatedAt: now - 5 * HOUR }),
            name: 'Dune',
            author: 'Frank Herbert',
            bookmarks: [],
        }];
        const incoming = backupOf([desktopBook({ id: 'a', progress: 0.8, progressUpdatedAt: now })]);

        const result = mergeIntoLibrary(incoming, local, {});
        expect(result.books[0].progress).toBeCloseTo(0.8);
    });

    it('un libro que solo está en el móvil no se pierde al importar', () => {
        const local = [{
            ...desktopBook({ id: 'solo-movil', title: 'Neuromante' }),
            name: 'Neuromante',
            author: 'William Gibson',
            bookmarks: [],
        }];
        const incoming = backupOf([desktopBook({ id: 'a' })]);

        const result = mergeIntoLibrary(incoming, local, {});
        expect(result.books.map((book) => book.name)).toContain('Neuromante');
        expect(result.summary.total).toBe(2);
    });

    it('cuenta por separado los libros añadidos y los actualizados', () => {
        const local = [{
            ...desktopBook({ id: 'a' }),
            name: 'Dune',
            author: 'Frank Herbert',
            bookmarks: [],
        }];
        const incoming = backupOf([desktopBook({ id: 'a' }), desktopBook({ id: 'b', title: 'Sapiens' })]);

        const result = mergeIntoLibrary(incoming, local, {});
        expect(result.summary.added).toBe(1);
        expect(result.summary.updated).toBe(1);
    });
});

describe('libros sin fichero', () => {
    it('un libro importado de un JSON suelto no se puede abrir', () => {
        const incoming = backupOf([desktopBook({ id: 'a' })]);
        const [book] = mergeIntoLibrary(incoming, [], {}).books;
        expect(isBookReadable(book)).toBe(false);
    });

    it('un libro con fichero local sí se puede abrir', () => {
        expect(isBookReadable({ sourcePath: '/data/books/a.epub' })).toBe(true);
    });
});
