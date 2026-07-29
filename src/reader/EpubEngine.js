import ePub from 'epubjs';
import { SECTION_PAUSE_MS } from './locationMap.js';

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
        async open(data, element, {
            styles, savedLocations, startCfi, gestureHandlers,
            flow = 'paginated', fontCss, hyphenLang,
        } = {}) {
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
            if (fontCss) this.injectFonts(fontCss);
            if (hyphenLang) this.setHyphenLanguage(hyphenLang);

            await rendition.display(startCfi || undefined);
            await book.ready;

            // El mapa de posiciones NO se espera aquí. Ver `locationMap.js`: la
            // primera página ya está pintada detrás de la pantalla de carga, y
            // hacer esperar al usuario varios segundos por un dato que no hace
            // falta para leerla era el verdadero coste. Si ya se calculó en una
            // sesión anterior se restaura al instante, que sí es gratis.
            let hasLocations = false;
            if (savedLocations) {
                try {
                    book.locations.load(savedLocations);
                    hasLocations = (book.locations.total || 0) > 0;
                } catch {
                    hasLocations = false;
                }
            }

            const navigation = await book.loaded.navigation;

            return {
                toc: flattenToc(navigation?.toc || []),
                hasLocations,
                totalLocations: book.locations.total || 0,
            };
        },

        /**
         * Construye el mapa de posiciones en segundo plano.
         *
         * Se llama después de abrir, con el libro ya en pantalla. Devuelve el
         * mapa serializado para guardarlo, o null si se canceló.
         *
         * @param {(done: number, total: number) => void} [onProgress]
         */
        async buildLocations(onProgress) {
            if (!book || destroyed) return null;
            if ((book.locations.total || 0) > 0) return null;

            // Los 100 ms de serie entre capítulos son cuatro segundos muertos en
            // un libro de cuarenta. 24 ms sigue dejando hueco para pintar.
            book.locations.pause = SECTION_PAUSE_MS;

            const total = book.spine?.spineItems?.filter((item) => item.linear).length || 0;
            let done = 0;

            // El progreso se cuenta enganchándose a cada capítulo procesado.
            // `generate()` no informa por sí solo, y sin cuenta atrás el aviso
            // sería un indicador indeterminado eterno.
            const original = book.locations.process.bind(book.locations);
            book.locations.process = (section) => original(section).then((result) => {
                done += 1;
                if (!destroyed) onProgress?.(done, total);
                return result;
            });

            try {
                await book.locations.generate(LOCATIONS_CHARS);
                if (destroyed) return null;
                return book.locations.save();
            } catch {
                // Un libro con un capítulo ilegible se queda sin mapa: se puede
                // leer igual, solo sin porcentaje global.
                return null;
            } finally {
                book.locations.process = original;
            }
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
                // `passive: false` es obligatorio en `pointermove` y `touchmove`.
                // Un oyente pasivo **no puede llamar a `preventDefault()`**, y sin
                // eso no hay forma de decirle al WebView «este arrastre es mío»:
                // sigue con lo suyo —extender la selección de texto, rebotar el
                // documento— y el gesto se pierde. Es la mitad del motivo por el
                // que deslizar no funcionaba.
                doc.addEventListener('pointerdown', handlers.onPointerDown, { passive: true });
                doc.addEventListener('pointermove', handlers.onPointerMove, { passive: false });
                doc.addEventListener('pointerup', handlers.onPointerUp, { passive: true });
                doc.addEventListener('pointercancel', handlers.onPointerCancel, { passive: true });

                // Y además los eventos táctiles. En el WebView de Android los
                // punteros se sintetizan a partir de los táctiles y hay
                // versiones que dejan de emitir `pointermove` en cuanto el
                // sistema decide que el gesto es suyo. `touchmove` sí llega, y
                // es el que puede cancelarlo.
                doc.addEventListener('touchmove', handlers.onTouchMove, { passive: false });
            });
        },

        /**
         * Inyecta las fuentes empaquetadas dentro del iframe de cada capítulo.
         *
         * Las `@font-face` de la aplicación no llegan al documento del libro:
         * es otro documento, con otra base de URLs. Sin esto, elegir Literata
         * no cambiaba absolutamente nada en el texto.
         */
        injectFonts(css) {
            if (!rendition || !css) return;
            rendition.hooks.content.register((contents) => {
                const doc = contents.document;
                if (doc.getElementById('sr-fonts')) return;
                const style = doc.createElement('style');
                style.id = 'sr-fonts';
                style.textContent = css;
                doc.head?.appendChild(style);
            });
        },

        /**
         * Fija el idioma del documento para la partición de palabras.
         *
         * `hyphens: auto` no hace nada si el navegador no sabe en qué idioma
         * está el texto, y muchos EPUB no declaran `lang` o lo declaran mal.
         * El resultado es un justificado lleno de ríos blancos.
         */
        setHyphenLanguage(lang) {
            if (!rendition || !lang || lang === 'auto') return;
            rendition.hooks.content.register((contents) => {
                const html = contents.document?.documentElement;
                if (html) {
                    html.setAttribute('lang', lang);
                    html.setAttribute('xml:lang', lang);
                }
            });
        },

        /**
         * Hace tocables las imágenes del libro.
         *
         * Se ignoran las decorativas —menos de 120 px— para que tocar una
         * viñeta o un icono de lista no abra el visor a pantalla completa.
         */
        registerImages(onImage) {
            if (!rendition) return;
            rendition.hooks.content.register((contents) => {
                contents.document.querySelectorAll('img').forEach((image) => {
                    image.style.cursor = 'zoom-in';
                    image.addEventListener('click', (event) => {
                        const rect = image.getBoundingClientRect();
                        if (rect.width < 120 && rect.height < 120) return;
                        event.preventDefault();
                        event.stopPropagation();
                        onImage({ src: image.currentSrc || image.src, alt: image.alt || '' });
                    }, true);
                });
            });
        },

        /**
         * Precarga el capítulo siguiente.
         *
         * epub.js no carga un capítulo hasta que hace falta mostrarlo, así que
         * la última página de un capítulo tiene siempre un tirón: se pasa
         * página y hay que esperar a que se descomprima, se parsee y se
         * pagine el siguiente. Es el único momento en que pasar página no es
         * instantáneo, y como pasa en el sitio más previsible del libro —el
         * final del capítulo— se nota más.
         *
         * Se carga y se deja cargado. `unload` lo hará epub.js cuando toque;
         * forzarlo aquí devolvería el tirón.
         */
        prefetchNext(cfi) {
            if (!book || !cfi) return;
            try {
                const current = book.spine.get(cfi);
                if (!current) return;
                const next = book.spine.get(current.index + 1);
                // `loaded` lo marca epub.js al terminar: no se repite trabajo
                // aunque se llame en cada cambio de página.
                if (!next || next.document) return;
                next.load(book.load.bind(book)).catch(() => {});
            } catch {
                // La precarga es una optimización: si falla, se lee igual.
            }
        },

        /**
         * Cuelga la puntuación de apertura fuera del margen.
         *
         * Cuando un párrafo empieza por comilla o raya de diálogo, el bloque de
         * texto se ve mellado: esos signos son casi todo espacio en blanco y el
         * ojo lee el borde izquierdo por donde empieza la *letra*, no por donde
         * empieza el carácter. En una página de diálogo, con una raya por
         * párrafo, el margen izquierdo parece torcido.
         *
         * `hanging-punctuation` en CSS haría esto solo, pero solo lo implementa
         * Safari: en el WebView de Android no haría nada y el ajuste sería una
         * promesa vacía. Así que se marca cada párrafo afectado y se compensa
         * con una sangría negativa proporcional al signo.
         */
        registerHangingPunctuation(enabled) {
            if (!rendition) return;
            rendition.hooks.content.register((contents) => {
                const doc = contents.document;
                doc.querySelectorAll('p, blockquote > p, li').forEach((element) => {
                    element.classList.remove('sr-hang-quote', 'sr-hang-dash');
                    if (!enabled) return;
                    const hang = hangingClassFor(element.textContent || '');
                    if (hang) element.classList.add(hang);
                });
            });
        },

        /**
         * Ancho del documento del libro, en sus propias coordenadas.
         *
         * Los eventos de toque se escuchan **dentro** del iframe, así que sus
         * coordenadas van de 0 al ancho del iframe. El contenedor es más ancho:
         * lleva los márgenes de lectura como relleno. Dividir una x del iframe
         * entre el ancho del contenedor descuadraba las zonas de toque — la
         * izquierda salía más grande que la derecha y un toque a la izquierda
         * del centro retrocedía página.
         *
         * También descuadraba el umbral del arrastre, que se medía contra un
         * ancho mayor que el real y exigía deslizar de más.
         */
        contentWidth() {
            const contents = [].concat(rendition?.getContents?.() || []);
            for (const content of contents) {
                const width = content?.window?.innerWidth;
                if (width > 0) return width;
            }
            return 0;
        },

        /** Alto del documento del libro, para las filas de la rejilla de gestos. */
        contentHeight() {
            const contents = [].concat(rendition?.getContents?.() || []);
            for (const content of contents) {
                const height = content?.window?.innerHeight;
                if (height > 0) return height;
            }
            return 0;
        },

        /** Idioma declarado por el EPUB, para poder ofrecerlo como sugerencia. */
        bookLanguage() {
            return book?.packaging?.metadata?.language || '';
        },

        /**
         * Intercepta los enlaces internos que apuntan a una nota.
         *
         * Sin esto, tocar un número volado navega al final del capítulo: pierdes
         * la página, lees dos líneas y tienes que volver a mano. En un ensayo
         * con doscientas notas eso hace el libro inservible.
         *
         * Se distingue una nota de un enlace normal por dos señales: el atributo
         * `epub:type` de EPUB 3, y —para los EPUB 2, que son mayoría— que el
         * destino esté dentro del mismo documento y su texto sea corto.
         */
        registerFootnotes(onFootnote) {
            if (!rendition) return;

            rendition.hooks.content.register((contents) => {
                const doc = contents.document;

                doc.querySelectorAll('a[href]').forEach((link) => {
                    const href = link.getAttribute('href') || '';
                    if (!href.includes('#')) return;

                    const type = (link.getAttribute('epub:type') || link.getAttribute('type') || '').toLowerCase();
                    const looksLikeNote = type.includes('noteref')
                        || link.closest('sup, sub')
                        || /^[[(]?\d{1,3}[\])]?$/.test((link.textContent || '').trim());

                    if (!looksLikeNote) return;

                    link.addEventListener('click', (event) => {
                        const id = href.split('#')[1];
                        const target = id && doc.getElementById(id);
                        // Si el destino no está en este mismo documento se deja
                        // pasar el enlace: será una referencia cruzada, no una
                        // nota, y forzar una ventana emergente confundiría.
                        if (!target) return;

                        event.preventDefault();
                        event.stopPropagation();

                        onFootnote({
                            label: (link.textContent || '').trim(),
                            text: extractNoteText(target),
                            href,
                        });
                    }, true);
                });
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
         * Resalta **la frase exacta** que se está leyendo en voz alta.
         *
         * Antes se marcaba el párrafo entero. En un párrafo de doce líneas eso
         * no dice nada útil: sabes en qué párrafo va la voz, que es lo que ya
         * sabías. Para seguir la lectura con la vista —el motivo por el que
         * alguien mira la pantalla mientras escucha— hace falta la frase.
         *
         * Se envuelve con Range sobre los nodos de texto, no reescribiendo
         * `innerHTML`: reescribir el HTML del párrafo destruiría los nodos
         * sobre los que epub.js tiene calculados los CFI, y con ellos los
         * subrayados del usuario y la posición guardada.
         */
        highlightSpoken(sentence) {
            const contents = [].concat(rendition?.getContents?.() || []);

            contents.forEach((content) => {
                const doc = content?.document;
                if (!doc) return;

                clearSpokenMarks(doc);
                if (!sentence) return;

                const needle = sentence.trim().replace(/\s+/g, ' ');
                if (needle.length < 6) return;

                const blocks = doc.querySelectorAll('p, li, blockquote, h1, h2, h3, h4, h5, h6, td');
                for (const element of blocks) {
                    const flat = (element.textContent || '').replace(/\s+/g, ' ');
                    if (!flat.includes(needle.slice(0, 60))) continue;

                    // Si no se consigue envolver la frase concreta —texto
                    // partido entre cursivas, una nota al pie en medio— se
                    // marca el bloque entero, que es lo que se hacía siempre.
                    // Peor, pero nunca deja de indicarse nada.
                    if (!markSentence(doc, element, needle)) {
                        element.classList.add('sr-speaking');
                    }
                    return;
                }
            });
        },

        /**
         * Cambia entre una y dos columnas sin recargar el libro.
         *
         * `spread()` solo reconfigura: hay que volver a mostrar la posición
         * actual para que epub.js recalcule las columnas, o el cambio no se ve
         * hasta que pasas de capítulo.
         */
        setSpread(value, minWidth) {
            if (!rendition) return;
            try {
                rendition.spread(value, minWidth);
                const cfi = rendition.currentLocation()?.start?.cfi;
                if (cfi) rendition.display(cfi);
            } catch { /* aún no hay vista montada */ }
        },

        /** CFI de una localización del mapa, para saltar escribiendo un número. */
        cfiAtLocation(index) {
            const total = book?.locations?.total || 0;
            if (!total) return null;
            try {
                return book.locations.cfiFromLocation(
                    Math.min(total - 1, Math.max(0, Math.round(index)))
                );
            } catch {
                return null;
            }
        },

        /** Localización actual: el «número de página» que se muestra abajo. */
        currentLocation(cfi) {
            if (!book?.locations || !cfi) return 0;
            try {
                const value = book.locations.locationFromCfi(cfi);
                return Number.isFinite(value) ? value : 0;
            } catch {
                return 0;
            }
        },

        totalLocations() {
            return book?.locations?.total || 0;
        },

        /** Autor declarado por el EPUB, para componer citas. */
        bookAuthor() {
            const creator = book?.packaging?.metadata?.creator;
            return typeof creator === 'string' ? creator : '';
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

        /** CFI correspondiente a un porcentaje del libro, para la barra arrastrable. */
        cfiAtPercent(percent) {
            if (!book?.locations?.total) return null;
            try {
                return book.locations.cfiFromPercentage(Math.min(1, Math.max(0, percent)));
            } catch {
                return null;
            }
        },

        /** Capítulo al que corresponde un porcentaje, para la vista previa. */
        chapterAtPercent(percent, toc = []) {
            const cfi = this.cfiAtPercent(percent);
            return cfi ? this.chapterLabel(cfi, toc) : '';
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

        /**
         * Busca en todo el libro. Recorre el spine capítulo a capítulo.
         *
         * Cada resultado lleva su capítulo. Una lista de cuarenta fragmentos
         * sueltos no se puede usar: todos se parecen, porque todos contienen la
         * palabra buscada. Lo que distingue uno de otro es dónde está, y sin el
         * capítulo hay que ir abriéndolos de uno en uno para averiguarlo.
         *
         * @param {string} query
         * @param {Object} [options]
         * @param {number} [options.limit]
         * @param {Array}  [options.toc]      Índice, para etiquetar cada resultado.
         * @param {(found: number) => void} [options.onProgress]
         *   Se llama al terminar cada capítulo. Buscar en un libro largo tarda
         *   varios segundos y sin esto la pantalla se queda muda.
         */
        async search(query, options = {}) {
            // Firma antigua: search(query, 60). Se mantiene porque la usan los
            // tests y la pantalla del PDF.
            const { limit = 60, toc = [], onProgress } =
                typeof options === 'number' ? { limit: options } : options;

            if (!book || !query || query.trim().length < 2) return [];
            const needle = query.trim();
            const results = [];

            for (const item of book.spine.spineItems) {
                if (results.length >= limit || destroyed) break;
                try {
                    await item.load(book.load.bind(book));
                    const found = item.find(needle) || [];
                    // El capítulo se resuelve una vez por documento, no por
                    // resultado: en un capítulo con treinta coincidencias sería
                    // treinta veces la misma búsqueda en el índice.
                    const chapter = toc.find(
                        (entry) => entry.href.split('#')[0] === (item.href || '').split('#')[0]
                    )?.label || '';

                    found.slice(0, limit - results.length).forEach((hit) => {
                        results.push({ cfi: hit.cfi, excerpt: hit.excerpt, chapter });
                    });
                } catch {
                    // Un capítulo ilegible no debe abortar la búsqueda.
                } finally {
                    item.unload();
                }
                onProgress?.(results.length);
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

/**
 * Qué compensación necesita un párrafo según el signo con el que abre.
 *
 * Dos clases y no una porque los signos no ocupan lo mismo: una raya de diálogo
 * es casi un cuadratín y una comilla simple apenas un tercio. Colgarlas por
 * igual dejaría el margen torcido en el otro sentido, que es peor que no hacer
 * nada porque además parece intencionado.
 *
 * @returns {'sr-hang-quote'|'sr-hang-dash'|null}
 */
export const hangingClassFor = (text) => {
    const first = String(text || '').trimStart()[0];
    if (!first) return null;
    // Rayas y guiones largos: diálogo. Son los anchos.
    if ('—–-'.includes(first)) return 'sr-hang-dash';
    // Comillas de todo tipo: latinas, inglesas, rectas y simples.
    if ('«"“”\'‘’'.includes(first)) return 'sr-hang-quote';
    return null;
};

// ── Resaltado de la frase hablada ────────────────────────────────────────────
//
// Se intentan dos técnicas, en este orden:
//
//  1. **CSS Custom Highlight API.** Pinta un rango sin tocar el DOM. Es la
//     opción correcta aquí: los CFI de epub.js —y por tanto los subrayados del
//     usuario y la posición guardada— se calculan sobre la estructura de nodos
//     del capítulo, así que cualquier cosa que la modifique es una bomba de
//     relojería. Disponible en WebView reciente.
//  2. **Envolver en `<mark>`.** Para WebView antiguo. Sí toca el DOM, pero solo
//     nodos de texto y siempre deshaciéndolo con `normalize()`, que devuelve el
//     árbol al estado exacto anterior.

const SPOKEN_HIGHLIGHT = 'sr-spoken';

/** Nodos de texto de un bloque, en orden. */
const textNodesOf = (doc, element) => {
    const walker = doc.createTreeWalker(element, 4 /* NodeFilter.SHOW_TEXT */);
    const nodes = [];
    let node = walker.nextNode();
    while (node) {
        if (node.nodeValue) nodes.push(node);
        node = walker.nextNode();
    }
    return nodes;
};

/**
 * Localiza la frase dentro del bloque y devuelve un Range.
 *
 * La frase que llega del troceador viene con los espacios ya normalizados, pero
 * el HTML del libro tiene saltos de línea e indentación por todas partes. Por
 * eso se construye una versión aplanada del texto guardando, para cada carácter,
 * de qué nodo y qué posición salió: buscar sobre el texto aplanado y volver
 * después a las coordenadas reales.
 */
const rangeForSentence = (doc, element, needle) => {
    const nodes = textNodesOf(doc, element);
    if (nodes.length === 0) return null;

    let flat = '';
    const map = []; // map[i] = { node, offset } del carácter i de `flat`

    nodes.forEach((node) => {
        const value = node.nodeValue;
        for (let i = 0; i < value.length; i += 1) {
            const char = value[i];
            if (/\s/.test(char)) {
                // Una tirada de espacios cuenta como uno solo, igual que al
                // normalizar la frase; si no, nunca coincidirían.
                if (flat.endsWith(' ') || flat === '') continue;
                flat += ' ';
            } else {
                flat += char;
            }
            map.push({ node, offset: i });
        }
    });

    const start = flat.indexOf(needle);
    if (start === -1 || map.length === 0) return null;
    const end = Math.min(start + needle.length, map.length) - 1;
    if (end < start) return null;

    try {
        const range = doc.createRange();
        range.setStart(map[start].node, map[start].offset);
        range.setEnd(map[end].node, map[end].offset + 1);
        return range;
    } catch {
        return null;
    }
};

/** @returns {boolean} true si se consiguió marcar la frase concreta. */
export const markSentence = (doc, element, needle) => {
    const range = rangeForSentence(doc, element, needle);
    if (!range) return false;

    const view = doc.defaultView;
    if (view?.CSS?.highlights && view.Highlight) {
        try {
            view.CSS.highlights.set(SPOKEN_HIGHLIGHT, new view.Highlight(range));
            return true;
        } catch {
            // Sigue al plan B.
        }
    }

    try {
        const mark = doc.createElement('mark');
        mark.className = 'sr-speaking-sentence';
        range.surroundContents(mark);
        return true;
    } catch {
        // `surroundContents` lanza si el rango cruza la frontera de un elemento
        // —una frase que empieza fuera de una cursiva y acaba dentro—. No es
        // recuperable y el llamante marcará el bloque entero.
        return false;
    }
};

/** Quita cualquier marca de lectura y deja el DOM como estaba. */
export const clearSpokenMarks = (doc) => {
    try { doc.defaultView?.CSS?.highlights?.delete(SPOKEN_HIGHLIGHT); } catch { /* no soportado */ }

    doc.querySelectorAll('.sr-speaking').forEach((element) => {
        element.classList.remove('sr-speaking');
    });

    doc.querySelectorAll('mark.sr-speaking-sentence').forEach((mark) => {
        const parent = mark.parentNode;
        if (!parent) return;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        // Sin esto quedarían nodos de texto partidos donde antes había uno, y
        // los CFI que epub.js calcule a partir de ahora no cuadrarían con los
        // guardados.
        parent.normalize();
    });
};

/**
 * Texto de una nota a partir de su ancla.
 *
 * Los EPUB no se ponen de acuerdo en cómo marcan las notas: unos ponen el id en
 * el propio párrafo, otros en un `<aside>`, y otros en un `<li>` de una lista al
 * final del capítulo. Se sube por los ancestros hasta encontrar un bloque con
 * texto suficiente, y se limpia el número de vuelta que suele abrirlo.
 */
export const extractNoteText = (target) => {
    let node = target;
    let text = (node.textContent || '').trim();

    // Si el ancla es solo el número, el contenido está en el bloque que la
    // contiene.
    let hops = 0;
    while (text.length < 20 && node.parentElement && hops < 3) {
        node = node.parentElement;
        text = (node.textContent || '').trim();
        hops += 1;
    }

    return text
        // Quita el número de nota y la flecha de retorno del principio.
        .replace(/^[[(]?\d{1,3}[\])]?[.:\s]*/, '')
        .replace(/^[↑←⏎]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1200);
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
