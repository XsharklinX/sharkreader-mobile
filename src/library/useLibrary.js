import { useCallback, useEffect, useMemo, useState } from 'react';
import { hydrateStoredBook, toStoredBookRecord, getBookSearchIndex, getBookTitleDedupKey } from '../core/bookModel.js';
import { usePorts } from '../ports/index.js';
import { importPickedBooks } from './importBooks.js';

/**
 * Estado de la biblioteca: carga desde SQLite, importación y mutaciones.
 *
 * Los libros se mantienen en memoria en su forma "hidratada" (la que usan las
 * vistas) y se persisten en su forma "almacenada". Esa es exactamente la misma
 * separación que hace el escritorio, así que las dos apps comparten
 * `hydrateStoredBook` y `toStoredBookRecord` sin divergir.
 */
export const useLibrary = () => {
    const ports = usePorts();
    const [books, setBooks] = useState([]);
    const [status, setStatus] = useState('loading');
    const [error, setError] = useState(null);
    const [importing, setImporting] = useState(null);

    useEffect(() => {
        let alive = true;
        const load = async () => {
            try {
                await ports.storage.init();
                const stored = await ports.storage.listBooks();
                if (alive) {
                    setBooks(stored.map(hydrateStoredBook));
                    setStatus('ready');
                }
            } catch (loadError) {
                if (alive) {
                    setError(loadError?.message || 'No se pudo abrir la biblioteca.');
                    setStatus('error');
                }
            }
        };
        load();
        return () => { alive = false; };
    }, [ports]);

    const persist = useCallback(async (book) => {
        const record = toStoredBookRecord(book, {}, { includeFile: false });
        await ports.storage.putBook(record);
    }, [ports]);

    /** Ejecuta el selector indicado y añade a la biblioteca lo que devuelva. */
    const runImport = useCallback(async (mode) => {
        setImporting({ done: 0, total: 0, name: '', phase: 'picking' });
        try {
            const picker = mode === 'folder' ? ports.filePicker.pickFolder : ports.filePicker.pickBooks;
            const picked = await picker();

            if (!picked?.books?.length) {
                setImporting(null);
                return { imported: 0, duplicates: 0, failed: 0, cancelled: !!picked?.cancelled };
            }

            setImporting({ done: 0, total: picked.books.length, name: '', phase: 'reading' });

            const result = await importPickedBooks(picked.books, books, (progress) => {
                setImporting({ ...progress, phase: 'reading' });
            });

            if (result.imported.length) {
                await ports.storage.putBooks(result.imported);
                setBooks((current) => [...result.imported.map(hydrateStoredBook), ...current]);
            }

            setImporting(null);
            return {
                imported: result.imported.length,
                duplicates: result.duplicates.length,
                failed: result.failed.length + (picked.failed || 0),
            };
        } catch (importError) {
            setImporting(null);
            setError(importError?.message || 'La importación falló.');
            return { imported: 0, duplicates: 0, failed: 0, error: true };
        }
    }, [ports, books]);

    /**
     * Importa el libro que otra app pidió abrir y devuelve su id.
     *
     * Si ya está en la biblioteca no se duplica: se devuelve el que hay. Esto es
     * lo que hace que abrir dos veces el mismo fichero desde el gestor de
     * archivos no llene la biblioteca de copias.
     */
    const openExternal = useCallback(async () => {
        const pending = await ports.filePicker.consumePendingOpen().catch(() => null);
        const picked = pending?.book;
        if (!picked) return null;

        const result = await importPickedBooks([picked], books);

        if (result.duplicates.length) {
            const key = getBookTitleDedupKey({
                originalTitle: result.duplicates[0].title,
                type: picked.type,
            });
            const existing = books.find((book) => getBookTitleDedupKey(book) === key);
            if (existing) return existing.id;
        }

        if (!result.imported.length) return null;

        const record = { ...result.imported[0], fileSize: picked.size };
        await ports.storage.putBooks([record]);
        setBooks((current) => [hydrateStoredBook(record), ...current]);
        return record.id;
    }, [ports, books]);

    const updateBook = useCallback(async (id, changes) => {
        let updated = null;
        setBooks((current) => current.map((book) => {
            if (book.id !== id) return book;
            updated = { ...book, ...changes, updatedAt: Date.now() };
            return updated;
        }));
        if (updated) await persist(updated);
    }, [persist]);

    const removeBook = useCallback(async (id) => {
        const book = books.find((candidate) => candidate.id === id);
        setBooks((current) => current.filter((candidate) => candidate.id !== id));
        await ports.storage.deleteBook(id);
        if (book?.sourcePath) {
            await ports.filePicker.deleteBookFile(book.sourcePath).catch(() => {
                // Si el binario no se puede borrar, el registro ya no está: el
                // fichero huérfano se limpia en el mantenimiento de biblioteca.
            });
        }
    }, [ports, books]);

    /**
     * Aplica el resultado de fusionar un backup: reemplaza la lista en memoria y
     * persiste todos los registros de una vez.
     */
    const replaceAll = useCallback(async (mergedBooks) => {
        setBooks(mergedBooks);
        await ports.storage.putBooks(
            mergedBooks.map((book) => toStoredBookRecord(book, {}, { includeFile: false }))
        );
    }, [ports]);

    return {
        books,
        status,
        error,
        importing,
        importFiles: () => runImport('files'),
        importFolder: () => runImport('folder'),
        /**
         * Importa un libro descargado de un catálogo OPDS.
         *
         * Se guarda en el almacenamiento privado y a partir de ahí sigue el
         * mismo camino que cualquier otro: de dónde vino el fichero no debe
         * cambiar cómo se procesa, ni dejarlo con metadatos distintos.
         */
        importDownloaded: async (name, blob) => {
            const { saveDownloadedBook } = await import('../adapters/SafPicker.js');
            const picked = await saveDownloadedBook(name, blob);
            const result = await importPickedBooks([picked], books);

            if (result.imported.length) {
                await ports.storage.putBooks(result.imported);
                setBooks((current) => [...result.imported.map(hydrateStoredBook), ...current]);
            }
            if (result.duplicates.length) {
                throw new Error('Ese libro ya está en tu biblioteca.');
            }
            if (!result.imported.length) {
                throw new Error('No se pudo leer el libro descargado.');
            }
        },
        updateBook,
        removeBook,
        replaceAll,
        openExternal,
        setError,
        clearError: () => setError(null),
        exportNotes: async (book) => {
            const { exportAnnotations } = await import('./backup.js');
            try {
                await exportAnnotations(books, book?.id);
            } catch (exportError) {
                setError(exportError?.message || 'No se pudieron exportar las anotaciones.');
            }
        },
    };
};

/** Filtrado, búsqueda y orden. Puro, para poder probarlo sin montar React. */
export const SORTS = {
    recent: { label: 'Recientes', compare: (a, b) => (b.lastReadDate || b.dateAdded) - (a.lastReadDate || a.dateAdded) },
    added: { label: 'Añadidos', compare: (a, b) => b.dateAdded - a.dateAdded },
    title: { label: 'Título', compare: (a, b) => a.name.localeCompare(b.name, 'es') },
    author: { label: 'Autor', compare: (a, b) => a.author.localeCompare(b.author, 'es') },
    progress: { label: 'Progreso', compare: (a, b) => (b.progress || 0) - (a.progress || 0) },

    /**
     * Por serie, y dentro de cada serie por número.
     *
     * Sustituye a la sección «Series» que había en la portada de la biblioteca.
     * Una sección aparte obligaba a mantener dos sitios donde aparecen los mismos
     * libros; como orden hace lo mismo —los deja juntos y en su orden— sin sacar
     * nada de la lista.
     */
    serie: {
        label: 'Serie',
        compare: (a, b) => {
            const sa = String(a.series || '').trim();
            const sb = String(b.series || '').trim();
            // Los sueltos, al final: una lista ordenada por serie que empieza por
            // lo que no pertenece a ninguna no está ordenada por serie.
            if (!sa && !sb) return a.name.localeCompare(b.name, 'es');
            if (!sa) return 1;
            if (!sb) return -1;
            const porNombre = sa.localeCompare(sb, 'es');
            return porNombre !== 0 ? porNombre : (a.seriesIndex || 0) - (b.seriesIndex || 0);
        },
    },
};

export const FILTERS = {
    all: { label: 'Todos', match: () => true },
    reading: { label: 'Leyendo', match: (book) => book.progress > 0 && !book.isFinished },
    favorites: { label: 'Favoritos', match: (book) => book.isFav },
    finished: { label: 'Terminados', match: (book) => book.isFinished },
    unread: { label: 'Sin empezar', match: (book) => !book.progress },
};

export const selectBooks = (books, { query = '', filter = 'all', sort = 'recent' } = {}) => {
    const needle = query.trim().toLowerCase();
    const matchesFilter = FILTERS[filter]?.match || FILTERS.all.match;
    const compare = SORTS[sort]?.compare || SORTS.recent.compare;

    return books
        .filter((book) => matchesFilter(book))
        .filter((book) => !needle || getBookSearchIndex(book).includes(needle))
        .sort(compare);
};

/** Etiquetas presentes en la biblioteca, para los filtros. */
export const useLibraryTags = (books) => useMemo(() => {
    const counts = new Map();
    books.forEach((book) => {
        String(book.tags || '')
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean)
            .forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
}, [books]);
