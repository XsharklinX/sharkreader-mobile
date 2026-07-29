import ePub from 'epubjs';

/**
 * Envoltorio sobre epub.js.
 *
 * Aísla del resto de la app las particularidades de la librería: que renderiza
 * dentro de un iframe, que las posiciones son CFI, y que calcular el mapa de
 * localizaciones (lo que permite decir "vas por el 34%") es una operación cara
 * que conviene hacer una sola vez por libro.
 *
 * Seguridad: `allowScriptedContent` va a false. Un EPUB puede traer JavaScript
 * incrustado y no hay razón para ejecutarlo — es la misma postura que la
 * versión de escritorio.
 */

/** Un carácter cada N para el mapa de localizaciones. Más bajo = más preciso y más lento. */
const LOCATIONS_CHARS = 1024;

export const createEpubEngine = () => {
    let book = null;
    let rendition = null;
    let destroyed = false;

    return {
        /**
         * @param {ArrayBuffer} data
         * @param {HTMLElement} element
         * @param {Object} options
         */
        async open(data, element, { styles, savedLocations, startCfi } = {}) {
            book = ePub(data);
            rendition = book.renderTo(element, {
                flow: 'paginated',
                width: '100%',
                height: '100%',
                spread: 'none',
                allowScriptedContent: false,
                // El iframe necesita permiso explícito para que la selección de
                // texto funcione dentro de él en Android.
                snap: false,
            });

            if (styles) rendition.themes.default(styles);

            await rendition.display(startCfi || undefined);
            await book.ready;

            // El mapa de localizaciones es lo caro. Si ya se calculó en una
            // sesión anterior se restaura al instante; si no, se genera y el
            // llamante decide guardarlo.
            let generatedLocations = null;
            if (savedLocations) {
                try {
                    book.locations.load(savedLocations);
                } catch {
                    generatedLocations = await book.locations.generate(LOCATIONS_CHARS);
                }
            } else {
                generatedLocations = await book.locations.generate(LOCATIONS_CHARS);
            }

            const navigation = await book.loaded.navigation;

            return {
                toc: flattenToc(navigation?.toc || []),
                generatedLocations: generatedLocations ? book.locations.save() : null,
                totalLocations: book.locations.total || 0,
            };
        },

        next: () => rendition?.next(),
        prev: () => rendition?.prev(),

        display: (target) => rendition?.display(target),

        applyStyles(styles) {
            if (!rendition) return;
            rendition.themes.default(styles);
            // epub.js no repinta el iframe al cambiar el tema por sí solo.
            const current = rendition.currentLocation();
            const cfi = current?.start?.cfi;
            if (cfi) rendition.display(cfi);
        },

        onRelocated(handler) {
            rendition?.on('relocated', handler);
            return () => rendition?.off('relocated', handler);
        },

        onSelected(handler) {
            rendition?.on('selected', handler);
            return () => rendition?.off('selected', handler);
        },

        /** Porcentaje leído (0–1) a partir de un CFI. */
        progressFromCfi(cfi) {
            if (!book?.locations || !cfi) return 0;
            try {
                const value = book.locations.percentageFromCfi(cfi);
                return Number.isFinite(value) ? value : 0;
            } catch {
                return 0;
            }
        },

        /** Etiqueta del capítulo actual, buscando hacia atrás en el índice. */
        chapterLabel(cfi, toc = []) {
            if (!book || !cfi) return '';
            try {
                const spineItem = book.spine.get(cfi);
                if (!spineItem) return '';
                const href = spineItem.href;
                const match = toc.find((entry) => entry.href.split('#')[0] === href.split('#')[0]);
                return match?.label || '';
            } catch {
                return '';
            }
        },

        /** Busca en todo el libro. Recorre el spine capítulo a capítulo. */
        async search(query, limit = 60) {
            if (!book || !query || query.trim().length < 2) return [];
            const needle = query.trim();
            const results = [];

            for (const item of book.spine.spineItems) {
                if (results.length >= limit || destroyed) break;
                try {
                    await item.load(book.load.bind(book));
                    const found = item.find(needle) || [];
                    found.slice(0, limit - results.length).forEach((hit) => {
                        results.push({ cfi: hit.cfi, excerpt: hit.excerpt });
                    });
                } catch {
                    // Un capítulo ilegible no debe abortar la búsqueda.
                } finally {
                    item.unload();
                }
            }
            return results;
        },

        destroy() {
            destroyed = true;
            try { rendition?.destroy(); } catch { /* ya destruido */ }
            try { book?.destroy(); } catch { /* ya destruido */ }
            rendition = null;
            book = null;
        },
    };
};

/** Aplana el índice anidado conservando el nivel, para poder indentarlo. */
export const flattenToc = (items, depth = 0, output = []) => {
    items.forEach((item) => {
        output.push({
            id: item.id || item.href,
            label: (item.label || '').trim(),
            href: item.href || '',
            depth,
        });
        if (item.subitems?.length) flattenToc(item.subitems, depth + 1, output);
    });
    return output;
};
