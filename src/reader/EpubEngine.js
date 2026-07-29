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
        async open(data, element, { styles, savedLocations, startCfi, gestureHandlers, flow = 'paginated' } = {}) {
            book = ePub(data);
            rendition = book.renderTo(element, {
                // scrolled-doc desplaza en vertical en lugar de paginar.
                flow: flow === 'scrolled' ? 'scrolled-doc' : 'paginated',
                width: '100%',
                height: '100%',
                spread: 'none',
                allowScriptedContent: false,
                // El iframe necesita permiso explícito para que la selección de
                // texto funcione dentro de él en Android.
                snap: false,
            });

            if (styles) rendition.themes.default(styles);

            // Los gestos se registran ANTES de pintar nada. El hook de contenido
            // de epub.js solo se ejecuta para los capítulos que se monten a
            // partir de ese momento: registrarlo después de `display()` deja el
            // primer capítulo sin manejadores, y como el primer capítulo es
            // justo el que ve el usuario al abrir el libro, el lector parece
            // colgado — no responde ni al toque ni al deslizamiento.
            if (gestureHandlers) this.registerContentHooks(gestureHandlers);

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

        /**
         * Registra los gestos **dentro** del iframe de cada capítulo.
         *
         * La alternativa —una capa transparente por encima— bloquea la selección
         * de texto, que es justo lo que hace falta para subrayar. Registrando los
         * eventos en el documento del iframe conviven las dos cosas: el gesto se
         * evalúa y, si hay texto seleccionado, se descarta.
         *
         * El hook se ejecuta con cada capítulo que epub.js monta, así que hay que
         * registrarlo una sola vez y dejar que él lo aplique a todos.
         */
        registerContentHooks(handlers) {
            if (!rendition) return;
            rendition.hooks.content.register((contents) => {
                const doc = contents.document;
                doc.addEventListener('pointerdown', handlers.onPointerDown, { passive: true });
                doc.addEventListener('pointerup', handlers.onPointerUp, { passive: true });
                doc.addEventListener('pointercancel', handlers.onPointerCancel, { passive: true });
            });
        },

        /**
         * Texto de lo que está visible ahora mismo en pantalla.
         *
         * Para la lectura en voz alta hay que leer **exactamente** lo que se ve,
         * no el capítulo entero: si no, la voz seguiría leyendo contenido de
         * páginas que el usuario todavía no tiene delante. Se filtran los
         * elementos cuyo rectángulo cae fuera de la columna visible.
         */
        visibleText() {
            const contents = [].concat(rendition?.getContents?.() || []);
            const parts = [];

            contents.forEach((content) => {
                const doc = content?.document;
                const view = content?.window;
                if (!doc || !view) return;

                const width = view.innerWidth || 0;
                const blocks = doc.querySelectorAll('p, li, blockquote, h1, h2, h3, h4, h5, h6, td');

                blocks.forEach((element) => {
                    const rect = element.getBoundingClientRect();
                    if (rect.width === 0 && rect.height === 0) return;
                    // En modo paginado, epub.js desplaza las columnas: lo visible
                    // es lo que cae dentro del ancho de la ventana del iframe.
                    if (rect.right < 0 || rect.left > width) return;
                    const text = (element.textContent || '').trim();
                    if (text) parts.push(text);
                });
            });

            return parts.join(' ');
        },

        /**
         * Resalta la frase que se está leyendo en voz alta.
         *
         * Se hace envolviendo coincidencias con un `<mark>` propio en lugar de
         * con anotaciones de epub.js: es temporal, no debe persistir ni entrar
         * en el sistema de subrayados del usuario.
         */
        highlightSpoken(sentence) {
            const contents = [].concat(rendition?.getContents?.() || []);

            contents.forEach((content) => {
                const doc = content?.document;
                if (!doc) return;

                doc.querySelectorAll('.sr-speaking').forEach((element) => {
                    element.classList.remove('sr-speaking');
                });

                if (!sentence) return;

                const needle = sentence.trim().slice(0, 60);
                if (needle.length < 8) return;

                const blocks = doc.querySelectorAll('p, li, blockquote, h1, h2, h3, h4, h5, h6, td');
                for (const element of blocks) {
                    if ((element.textContent || '').includes(needle)) {
                        element.classList.add('sr-speaking');
                        break;
                    }
                }
            });
        },

        /**
         * Texto del párrafo que hay bajo un punto de la pantalla.
         *
         * Sirve para que tocar un párrafo mientras se lee en voz alta salte a
         * esa parte. Las coordenadas llegan del documento del iframe, así que se
         * usan tal cual con `elementFromPoint`.
         */
        paragraphAt(x, y) {
            const contents = [].concat(rendition?.getContents?.() || []);
            for (const content of contents) {
                const doc = content?.document;
                if (!doc?.elementFromPoint) continue;
                const element = doc.elementFromPoint(x, y);
                if (!element) continue;
                const block = element.closest?.('p, li, blockquote, h1, h2, h3, h4, h5, h6, td');
                const text = (block?.textContent || '').trim();
                if (text) return text;
            }
            return '';
        },

        /** Texto seleccionado ahora mismo dentro del capítulo visible. */
        selectionText() {
            const contents = rendition?.getContents?.() || [];
            for (const content of [].concat(contents)) {
                const selected = content?.window?.getSelection?.()?.toString?.() || '';
                if (selected.trim()) return selected.trim();
            }
            return '';
        },

        clearSelection() {
            const contents = rendition?.getContents?.() || [];
            [].concat(contents).forEach((content) => {
                try { content?.window?.getSelection?.()?.removeAllRanges?.(); } catch { /* ignorar */ }
            });
        },

        /** Pinta un subrayado. epub.js lo dibuja como overlay SVG sobre el texto. */
        addHighlight(cfiRange, color, onClick) {
            if (!rendition || !cfiRange) return;
            try {
                rendition.annotations.highlight(
                    cfiRange,
                    {},
                    () => onClick?.(cfiRange),
                    `sr-hl-${color}`,
                    { fill: color, 'fill-opacity': '0.32', 'mix-blend-mode': 'multiply' }
                );
            } catch {
                // Un CFI que ya no existe (libro reemplazado) no debe romper la vista.
            }
        },

        removeHighlight(cfiRange) {
            try { rendition?.annotations.remove(cfiRange, 'highlight'); } catch { /* ya no estaba */ }
        },

        /**
         * Vuelve a medir el contenedor. Hace falta al cambiar los márgenes de
         * lectura: como el relleno vive en el contenedor y no en el documento,
         * epub.js tiene que recalcular el ancho de columna.
         */
        resize() {
            try { rendition?.resize(); } catch { /* aún no hay vista */ }
        },

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
