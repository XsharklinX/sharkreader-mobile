import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { usePorts } from '../ports/index.js';
import { readBookBlob } from '../adapters/SafPicker.js';
import { buildIndexRows, toFtsQuery, INDEXER_VERSION } from './contentIndex.js';

/**
 * Construye el índice de contenido de la biblioteca en segundo plano.
 *
 * ## Por qué se lee el ZIP a mano y no con epub.js
 *
 * epub.js está pensado para *mostrar* un libro: monta iframes, resuelve rutas,
 * calcula paginación. Para indexar no hace falta nada de eso y sí estorba mucho
 * — cada libro costaría segundos y memoria. Aquí solo se necesita el texto, así
 * que se abre el ZIP, se leen los XHTML y se tiran las etiquetas.
 *
 * ## Cuándo se indexa
 *
 * Nunca durante la importación. Añadir veinte libros de golpe ya es lento; si
 * además hubiera que leerlos enteros, la biblioteca tardaría un minuto en
 * aparecer. Se indexa después, con la app ya usable, un libro cada vez y
 * cediendo el hilo entre cada uno.
 */

/** Los PDF y los cómics no se indexan: su texto no está en XHTML. */
const INDEXABLE = new Set(['epub']);

/** Pausa entre libros. Suficiente para que la interfaz responda al dedo. */
const BETWEEN_BOOKS_MS = 60;

/**
 * Texto de los documentos de un EPUB, leyendo el ZIP directamente.
 *
 * El orden del spine se respeta porque es el orden de lectura, y es lo que
 * hace que los resultados de un mismo libro salgan en orden.
 */
export const readEpubChapters = async (blob) => {
    const zip = await JSZip.loadAsync(blob);

    // El OPF dice dónde está todo. Su ruta está en META-INF/container.xml, que
    // es el único fichero cuya ubicación garantiza el estándar.
    const containerFile = zip.file('META-INF/container.xml');
    if (!containerFile) return [];

    const container = await containerFile.async('string');
    const opfPath = container.match(/full-path="([^"]+)"/)?.[1];
    if (!opfPath) return [];

    const opf = await zip.file(opfPath)?.async('string');
    if (!opf) return [];

    // Carpeta del OPF: las rutas del manifiesto son relativas a él, no a la
    // raíz del ZIP. Sin esto no se encuentra ningún capítulo en los EPUB que
    // meten todo en una subcarpeta, que son mayoría.
    const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

    const manifest = {};
    for (const item of opf.matchAll(/<item\b[^>]*>/gi)) {
        const tag = item[0];
        const id = tag.match(/\bid="([^"]+)"/i)?.[1];
        const href = tag.match(/\bhref="([^"]+)"/i)?.[1];
        const type = tag.match(/\bmedia-type="([^"]+)"/i)?.[1] || '';
        if (id && href && type.includes('html')) manifest[id] = href;
    }

    const spine = [...opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"[^>]*>/gi)]
        .map((match) => match[1]);

    const chapters = [];
    for (const id of spine) {
        const href = manifest[id];
        if (!href) continue;
        const file = zip.file(base + decodeURIComponent(href));
        if (!file) continue;
        try {
            chapters.push({ href, html: await file.async('string') });
        } catch {
            // Un capítulo ilegible no puede abortar el libro entero.
        }
    }

    return chapters;
};

export const useContentIndex = (books) => {
    const ports = usePorts();
    const [progress, setProgress] = useState(null);
    const running = useRef(false);
    const cancelled = useRef(false);

    useEffect(() => () => { cancelled.current = true; }, []);

    const booksRef = useRef(books);
    booksRef.current = books;

    /**
     * Indexa lo que falte. Se puede llamar varias veces sin miedo: si ya hay
     * una pasada en marcha, no arranca otra.
     */
    const build = useCallback(async () => {
        if (running.current) return;
        running.current = true;

        try {
            const indexed = await ports.storage.indexedBooks();
            const pending = booksRef.current.filter(
                (book) => INDEXABLE.has(book.type || 'epub')
                    && indexed[book.id] !== INDEXER_VERSION
            );

            if (pending.length === 0) { setProgress(null); return; }

            for (let index = 0; index < pending.length; index += 1) {
                if (cancelled.current) break;
                const book = pending[index];
                setProgress({ done: index, total: pending.length, title: book.name });

                try {
                    const blob = await readBookBlob(book.sourcePath);
                    const chapters = await readEpubChapters(blob);
                    const rows = buildIndexRows(book.id, chapters);
                    await ports.storage.indexBookContent(book.id, rows, INDEXER_VERSION);
                } catch {
                    // Un libro que no se deja leer —fichero movido, DRM, ZIP
                    // roto— se salta. Volverá a intentarse en el próximo
                    // arranque, que es mejor que marcarlo como indexado y que
                    // quede fuera de las búsquedas para siempre.
                }

                // Ceder el hilo: sin esto, indexar cien libros deja la app sin
                // responder al dedo aunque cada libro por separado sea rápido.
                await new Promise((resolve) => setTimeout(resolve, BETWEEN_BOOKS_MS));
            }
        } catch {
            // Sin índice se puede seguir usando la app: solo no se podrá buscar
            // dentro de los libros.
        } finally {
            running.current = false;
            setProgress(null);
        }
    }, [ports]);

    /**
     * Busca en el contenido de todos los libros.
     *
     * Devuelve también `query` para que la pantalla pueda distinguir «no hay
     * resultados» de «lo escrito no es buscable todavía».
     */
    const search = useCallback(async (input, limit) => {
        const query = toFtsQuery(input);
        if (!query) return { query: '', results: [] };
        const results = await ports.storage.searchContent(query, limit);
        return { query, results };
    }, [ports]);

    /**
     * El objeto devuelto es **estable**.
     *
     * Sin `useMemo` se creaba uno nuevo en cada render, y la pantalla de
     * biblioteca lo tenía en las dependencias de un efecto:
     *
     *     useEffect(() => { if (ready) contentIndex.build(); },
     *               [status, books.length, contentIndex]);
     *
     * Así que el efecto se disparaba en cada render, `build()` llamaba a
     * `setProgress`, eso provocaba otro render, y el efecto otra vez. **Bucle
     * infinito**: en el dispositivo se veían cientos de consultas por segundo a
     * `content_index` en el registro, la interfaz se quedaba congelada en negro y
     * la batería se iba. Se vio con la app instalada; ningún test lo detectó.
     */
    return useMemo(() => ({ build, search, progress }), [build, search, progress]);
};
