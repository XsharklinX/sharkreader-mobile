import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createEpubEngine } from './EpubEngine.js';
import { createGestureHandlers } from './useGestures.js';
import { buildReaderStyles, DEFAULT_TYPOGRAPHY, READER_THEMES, EINK_OVERRIDES, migrarComposicion } from './typography.js';
import { mapStatus, progressLabel } from './locationMap.js';
import { createRefreshCounter, flashScreen, DEFAULT_REFRESH_EVERY } from './einkRefresh.js';
import Loading from '../ui/Loading.jsx';
import ReadingRuler from './ReadingRuler.jsx';
import ReaderSettingsSheet from './ReaderSettingsSheet.jsx';
import DisplaySheet from './DisplaySheet.jsx';
import BookInfoSheet from './BookInfoSheet.jsx';
import { runTurn, DEFAULT_TRANSITION, normalizeTransition, usesCurl } from './transitions.js';
import PageFold from './PageFold.jsx';
import { iniciar as cronometrar, exponer as exponerPerf, medir as medirPerf } from './perf.js';
import { buildFontFaceCss } from './fontLoader.js';
import { useHistory } from './useHistory.js';
import FootnoteSheet from './FootnoteSheet.jsx';
import ImageViewer from './ImageViewer.jsx';
import { createPageDrag } from './pageDrag.js';
import TocDrawer from './TocDrawer.jsx';
import SelectionToolbar from './SelectionToolbar.jsx';
import AnnotationsPanel from './AnnotationsPanel.jsx';
import SpeechBar from './SpeechBar.jsx';
import SpeechSheet from './SpeechSheet.jsx';
import { useSpeech } from './useSpeech.js';
import { useAutoScroll } from './useAutoScroll.js';
import { useReadingStatus } from './useReadingStatus.js';
import DictionarySheet from './DictionarySheet.jsx';
import { renderQuoteImage } from './quoteImage.js';
import { shareImage } from '../library/backup.js';
import {
    createHighlight, createBookmark, addAnnotation, removeAnnotation, HIGHLIGHT_SWATCHES,
    updateHighlight, findAnnotation, highlightStyle, DEFAULT_HIGHLIGHT_STYLE,
} from './annotations.js';
import { columnsFor, spreadValue, marginForColumns, SPREAD_MIN_WIDTH } from './spread.js';
import { DEFAULT_GESTURE_GRID, normalizeGrid } from './gestureGrid.js';
import GestureGridSheet from './GestureGridSheet.jsx';
import GoToSheet from './GoToSheet.jsx';
import CitationSheet from './CitationSheet.jsx';
import HighlightEditor from './HighlightEditor.jsx';
import { normalizeAnnotationKind } from '../core/annotationExport.js';
import { UNKNOWN_AUTHOR_FALLBACK } from '../core/bookModel.js';
import { readBookBlob } from '../adapters/SafPicker.js';
import { usePorts } from '../ports/index.js';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useBackHandler } from '../ui/useBackHandler.js';
import {
    IconArrowLeft, IconTextSize, IconList, IconBookmark, IconHighlight, IconSearch,
    IconVolume, IconClock, IconSun, IconGoTo,
} from '../ui/icons.jsx';

const LOCATIONS_KEY = (bookId) => `locations:${bookId}`;

export default function ReaderScreen({ book, onClose, onProgress, onAnnotationsChange, onExportAnnotations, preferences = {}, onPreferencesChange }) {
    const ports = usePorts();
    const viewportRef = useRef(null);
    const engineRef = useRef(null);

    const [state, setState] = useState('loading');
    const [error, setError] = useState(null);
    const [chrome, setChrome] = useState(false);
    const [panel, setPanel] = useState(null);
    const [selection, setSelection] = useState(null);
    // La forma de marcar se recuerda dentro de la sesión: quien empieza a
    // subrayar suele seguir subrayando, y volver a elegirla en cada marca
    // convierte dos toques en tres.
    const [estiloMarca, setEstiloMarca] = useState(DEFAULT_HIGHLIGHT_STYLE);
    const [toc, setToc] = useState([]);
    const [dim, setDim] = useState(0);
    // Filtro cálido: quitar azul es distinto de atenuar. De madrugada lo que
    // molesta es el componente azul, no el brillo.
    const [warm, setWarm] = useState(book.readerPreferences?.warm ?? 0);
    const [location, setLocation] = useState({
        cfi: book.lastLocation || null,
        progress: book.progress || 0,
        chapter: '',
        chapterProgress: 0,
    });

    // Un libro empezado antes trae guardada su composición. Si es exactamente la
    // que había por defecto, nadie la eligió: se trae la nueva. Ver
    // `migrarComposicion`.
    const [typography, setTypography] = useState(
        () => ({
            ...DEFAULT_TYPOGRAPHY,
            ...(migrarComposicion(book.readerPreferences?.typography) || {}),
        })
    );
    const [theme, setTheme] = useState(book.readerPreferences?.theme || 'dark');
    // Un libro empezado cuando había siete transiciones puede traer `curl` o
    // `fade` guardados. Ver `normalizeTransition`.
    const [transition, setTransition] = useState(
        () => normalizeTransition(book.readerPreferences?.transition || DEFAULT_TRANSITION)
    );

    // Columnas y orientación. `columns` es el resultado —cuántas caben ahora
    // mismo—, no la preferencia: depende del ancho real y cambia al girar.
    const [spread, setSpread] = useState(book.readerPreferences?.spread || 'auto');
    const [orientation, setOrientation] = useState(book.readerPreferences?.orientation || 'auto');
    const [columns, setColumns] = useState(1);
    const columnsRef = useRef(1);

    // Mapa de posiciones: se construye en segundo plano tras abrir el libro.
    const [locationsReady, setLocationsReady] = useState(false);
    const [mapProgress, setMapProgress] = useState(null);

    const [ruler, setRuler] = useState(book.readerPreferences?.ruler || 'off');

    // ── Doblado de hoja ──────────────────────────────────────────────────────
    //
    // La página que se va se dibuja dos veces —plana y reflejada— con dos copias
    // del capítulo en iframes propios. Ver `PageFold.jsx`.
    const [foldSheet, setFoldSheet] = useState(null);
    const foldRef = useRef(null);

    // ── Medición ─────────────────────────────────────────────────────────────
    //
    // Las dos esperas que se notan al leer —pasar página y abrir el libro— se
    // cronometran cuando se pide. Ver `perf.js`: apagado no guarda nada, y se
    // lee desde el ordenador con `adb logcat` tras llamar a `window.__perf.log()`.
    const cierreAsentada = useRef(null);
    useEffect(() => {
        exponerPerf();
        // Encenderlo desde la URL es lo que permite medir en el teléfono sin
        // recompilar. El acceso va con cautela: no todo entorno tiene `location`.
        if (globalThis.location?.search?.includes?.('perf')) medirPerf(true);
    }, []);

    // Limpieza de pantalla en tinta electrónica. Ver `einkRefresh.js`: se cuenta
    // pasando página, no por tiempo, porque el rastro lo produce el cambio de
    // contenido y no el paso del reloj.
    const [refreshEvery, setRefreshEvery] = useState(
        book.readerPreferences?.einkRefresh ?? DEFAULT_REFRESH_EVERY
    );
    const refreshRef = useRef(null);
    if (!refreshRef.current) refreshRef.current = createRefreshCounter(refreshEvery);

    // Rejilla de gestos. Es una preferencia de la app, no del libro: quien
    // invierte los lados los quiere invertidos en todos.
    const [grid, setGrid] = useState(() => normalizeGrid(preferences.gestureGrid));

    // El modo tinta electrónica impone tema y animación: no son preferencias
    // que convivan con él, son consecuencias del panel. Se calcula aquí en vez
    // de escribirlas en el estado para que al apagarlo vuelvan las de antes en
    // lugar de quedarse las impuestas.
    const eink = Boolean(typography.eink);
    const effectiveTheme = eink ? EINK_OVERRIDES.theme : theme;
    const effectiveTransition = eink ? EINK_OVERRIDES.transition : transition;

    const styles = useMemo(
        () => buildReaderStyles(typography, effectiveTheme),
        [typography, effectiveTheme]
    );
    const palette = READER_THEMES[effectiveTheme] || READER_THEMES.dark;

    // Hora y batería para la línea de estado. Solo se calculan con el chrome
    // oculto, que es cuando esa línea existe: con la barra puesta la hora ya la
    // enseña el sistema.
    const { hora, bateria } = useReadingStatus(!chrome && state === 'ready');

    const progressRef = useRef(onProgress);
    progressRef.current = onProgress;

    // Los gestos se crean una sola vez: el hook de contenido de epub.js los
    // registra durante la carga, antes de cualquier render posterior.
    const gesturesRef = useRef(null);
    if (!gesturesRef.current) {
        gesturesRef.current = createGestureHandlers({
            onNext: () => turnPage('next'),
            onPrev: () => turnPage('prev'),
            shouldIgnore: () => Boolean(engineRef.current?.selectionText()),
            clearSelection: () => engineRef.current?.clearSelection(),
            // El área visible, no el documento del libro.
            //
            // Aquí estaba la raíz de que los gestos no funcionaran: se usaba
            // `window.innerWidth` del iframe creyendo que era el ancho de la
            // página, y epub.js estira ese iframe hasta el ancho de **todas** las
            // columnas del capítulo. Con 15.000 px en vez de 371, las zonas de
            // toque y el umbral del arrastre eran inalcanzables. Ver
            // `EpubEngine.viewportRect`.
            getWidth: () => viewportRef.current?.clientWidth || window.innerWidth,
            getHeight: () => viewportRef.current?.clientHeight || window.innerHeight,
            // La rejilla y el despachador se enchufan más abajo con refs: los
            // manejadores se crean una vez y se registran dentro del iframe
            // durante la carga, así que no pueden capturar estado de React.
        });
    }

    /**
     * Pasa página con su animación. La transición va en el contenedor y no
     * dentro del iframe: epub.js repinta el iframe entero al cambiar de página,
     * así que animar su contenido daría un parpadeo.
     */
    const transitionRef = useRef(effectiveTransition);
    transitionRef.current = effectiveTransition;
    const flowRef = useRef(typography.flow);
    flowRef.current = typography.flow;
    const turnRef = useRef(null);
    const veilRef = useRef(null);

    const einkRef = useRef(false);

    // Quien ha pedido menos movimiento en el sistema no debería recibir una
    // animación por página. Se consulta por medio de una ref porque los gestos
    // se registran una sola vez y no pueden capturar estado.
    const reducedMotionRef = useRef(false);
    useEffect(() => {
        const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        if (!query) return undefined;
        reducedMotionRef.current = query.matches;
        const update = () => { reducedMotionRef.current = query.matches; };
        query.addEventListener?.('change', update);
        return () => query.removeEventListener?.('change', update);
    }, []);

    /**
     * Pasa página.
     *
     * `runTurn` cambia la página **de inmediato** y anima la que entra. La
     * versión anterior animaba una salida y cambiaba después: eso metía hasta
     * 210 ms de latencia en cada toque, y si se tocaba otra vez en esa ventana el
     * segundo toque cancelaba el primero antes de que hubiera cambiado nada. Dos
     * toques seguidos daban cero páginas.
     *
     * @param {'next'|'prev'} direction
     */
    const turnPage = (direction) => {
        const engine = engineRef.current;
        if (!engine) return;

        // Pasar página más rápido de lo que dura la animación cancela la
        // anterior: sin esto, dos animaciones se pelean por el mismo transform.
        turnRef.current?.cancel();

        /**
         * El pliegue se remata aquí, no en el gesto.
         *
         * Por aquí pasan las tres formas de cambiar de página —arrastrar, tocar
         * el borde y los botones de volumen— y solo el arrastre dejaba el pliegue
         * en un estado conocido. Al tocar el borde con una hoja a medio doblar,
         * esa hoja se quedaba clavada en la pantalla enseñando una página que ya
         * no existía. `finish` la lleva hasta el final y la retira; si no había
         * ninguna a medias no hace nada.
         */
        foldRef.current?.finish(direction);

        /**
         * Dos relojes, porque son dos cosas distintas.
         *
         * `pasar-pagina` es lo que el usuario espera: desde que toca hasta que la
         * página nueva está pintada. Se cierra en cuanto el motor ha cambiado de
         * página, más dos fotogramas.
         *
         * `pagina-asentada` es cuándo epub.js termina su propio papeleo y avisa
         * con `relocated`. Va unos sesenta milisegundos por detrás, y durante un
         * tiempo se estuvo midiendo **eso** creyendo que era la espera del
         * usuario: el número salía tres veces peor de lo que era.
         */
        cierreAsentada.current?.();
        cierreAsentada.current = cronometrar('pagina-asentada', { pintado: false });
        const finVuelta = cronometrar('pasar-pagina');

        turnRef.current = runTurn({
            element: viewportRef.current,
            veil: veilRef.current,
            // Desplazando el cambio es instantáneo: el contenedor tiene el
            // desplazamiento nativo y escribirle un transform lo rompería.
            id: flowRef.current === 'scrolled' ? 'none' : transitionRef.current,
            direction,
            reducedMotion: reducedMotionRef.current,
            commit: () => {
                const p = direction === 'next' ? engine.next() : engine.prev();
                // Aquí la página nueva ya está colocada; `perf` espera además dos
                // fotogramas, que es cuando de verdad se ve.
                Promise.resolve(p).then(finVuelta, finVuelta);
                return p;
            },
        });

        // La limpieza de tinta electrónica va cuando la página nueva ya está
        // puesta: parpadear antes dejaría el rastro de la nueva sin limpiar.
        turnRef.current.done.then(() => {
            if (einkRef.current && refreshRef.current.pageTurned()) {
                flashScreen(viewportRef.current?.parentElement);
            }
        }).catch(() => {});
    };

    /**
     * Arrastre de página: la hoja sigue al dedo y vuelve si sueltas antes del
     * umbral. Se desactiva con la animación «ninguna», que es la opción para
     * dispositivos donde 60 fps no es realista.
     */
    const dragRef = useRef(null);
    if (!dragRef.current) {
        /**
         * Mueve la hoja con el dedo.
         *
         * **Aquí estaba el temblor.** Antes se escribía
         * `translateX(${shift}px)` con el desplazamiento crudo del puntero, que
         * viene con decimales, y sin promover la capa. Sin capa compuesta el
         * WebView vuelve a maquetar y a pintar el texto en cada fotograma, y al
         * caer en posiciones fraccionarias cada letra se dibuja distinta cada
         * vez. Por eso solo se notaba arrastrando despacio: es cuando hay
         * decenas de fotogramas seguidos con el texto a medio píxel.
         *
         * Dos cambios: redondear a píxel entero —a 60 fps, un píxel de
         * granularidad es invisible— y `translate3d`, que sube la hoja a una
         * capa de la GPU y la mueve como un mapa de bits ya rasterizado.
         */
        const setShift = (shift, progress, direction) => {
            const node = viewportRef.current;
            if (!node) return;

            /**
             * Con el doblado, la página de debajo **no se mueve**.
             *
             * Lo que se dobla es una copia de la página que se va, encima. Es la
             * diferencia con girar el contenedor entero, que se veía como una
             * puerta abriéndose y no como papel.
             */
            if (foldRef.current) {
                foldRef.current.set(progress, direction);
                return;
            }

            node.classList.add('dragging');
            node.classList.remove('releasing');
            node.style.transform = `translate3d(${Math.round(shift)}px,0,0)`;
        };

        const release = () => {
            // La hoja vuelve a su sitio animándose. Antes saltaba a cero de golpe.
            foldRef.current?.cancel('next');

            const node = viewportRef.current;
            if (!node) return;
            node.classList.remove('dragging');
            node.classList.add('releasing');
            node.style.transform = '';
        };

        dragRef.current = createPageDrag({
            /**
             * La capa se promueve al **empezar** el gesto.
             *
             * Promoverla en el primer `move` fuerza una rasterización a mitad
             * del primer fotograma del arrastre: es el tirón que se notaba justo
             * al empezar a deslizar.
             */
            onStart: () => {
                const node = viewportRef.current;
                if (!node) return;
                node.style.willChange = 'transform';
            },
            onEnd: () => {
                const node = viewportRef.current;
                if (!node) return;
                // Se retira al acabar: una capa compuesta permanente mantiene el
                // texto con otro suavizado que el resto de la app.
                node.style.willChange = '';
            },
            // El ancho visible. Antes se usaba el del iframe, que epub.js estira
            // al ancho de todas las columnas del capítulo: el 35 % de 15.000 px
            // es inalcanzable, así que el arrastre nunca completaba y solo pasaba
            // página el golpe seco —que confirma por velocidad—. Eso era «si vas
            // rápido sí, si vas lento no».
            getWidth: () => viewportRef.current?.clientWidth || window.innerWidth,
            // Desplazando no hay páginas que arrastrar: el gesto vertical es del
            // navegador y el horizontal no significa nada.
            isEnabled: () => flowRef.current !== 'scrolled'
                && transitionRef.current !== 'none'
                && !engineRef.current?.selectionText(),
            onMove: setShift,
            onCancel: release,
            onCommit: (direction) => {
                // El dedo ya ha sacado la página de su sitio, así que la
                // animación se salta la fase de salida: repetirla daría un salto
                // hacia atrás antes de completar el gesto.
                release();
                turnPage(direction);
            },
        });

        // Los gestos de toque y el arrastre comparten los mismos eventos. El
        // arrastre se evalúa primero y, si ha consumido el gesto, el toque no
        // llega a interpretarse.
        gesturesRef.current.onDragDown = dragRef.current.down;
        gesturesRef.current.onDragMove = dragRef.current.move;
        gesturesRef.current.onDragUp = dragRef.current.up;
        gesturesRef.current.onDragCancel = dragRef.current.cancel;
    }

    // ── Carga ────────────────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        const engine = createEpubEngine();
        engineRef.current = engine;

        // Abrir el libro: desde que se pide hasta que se ve la primera página.
        const cierreApertura = cronometrar('abrir-libro');

        const load = async () => {
            try {
                /**
                 * Las tres lecturas van a la vez, y el mapa ni siquiera se espera.
                 *
                 * Iban en fila: el fichero, después el mapa de posiciones
                 * guardado, después las fuentes. Ninguna necesita a la anterior,
                 * así que era medio segundo de espera puesto ahí por el orden en
                 * que estaba escrito.
                 *
                 * El mapa además sale del todo del camino: es lo que permite
                 * decir «vas por el 34 %» y no hace falta para pintar la primera
                 * página. Se recoge cuando el libro ya está en pantalla.
                 */
                const mapaGuardado = ports.storage.getSetting(LOCATIONS_KEY(book.id))
                    .catch(() => null);

                const [blob, fontCss] = await Promise.all([
                    readBookBlob(book.sourcePath),
                    // Las fuentes se preparan antes de abrir: el hook de contenido
                    // debe estar registrado cuando epub.js monte el primer
                    // capítulo, igual que los gestos.
                    buildFontFaceCss().catch(() => ''),
                ]);
                const data = await blob.arrayBuffer();
                if (cancelled) return;

                const result = await engine.open(data, viewportRef.current, {
                    fontCss,
                    hyphenLang: typography.hyphenLang,
                    styles,
                    startCfi: book.lastLocation || undefined,
                    gestureHandlers: gesturesRef.current,
                    flow: typography.flow,
                });
                if (cancelled) return;

                setToc(result.toc);

                // Ahora sí: el texto ya está pintado y el mapa se aplica sin que
                // nadie lo note.
                const hasLocations = engine.loadLocations(await mapaGuardado);
                if (cancelled) return;
                setLocationsReady(hasLocations);

                // El mapa de posiciones se construye **después** de dar el
                // libro por listo. Antes se esperaba a tenerlo entero antes de
                // quitar la pantalla de «Abriendo…», con la primera página ya
                // pintada detrás: varios segundos de espera por un dato que no
                // hace falta para leerla.
                if (!hasLocations) {
                    engine.buildLocations((done, total) => {
                        if (!cancelled) setMapProgress({ done, total });
                    }).then((saved) => {
                        if (cancelled || !saved) return;
                        setLocationsReady(true);
                        setMapProgress(null);
                        ports.storage.setSetting(LOCATIONS_KEY(book.id), saved).catch(() => {});
                    }).catch(() => {});
                }

                // Los subrayados son overlays de epub.js: no viven en el EPUB y
                // hay que volver a pintarlos en cada apertura.
                (book.bookmarks || [])
                    .filter((bookmark) => normalizeAnnotationKind(bookmark) === 'highlight')
                    .forEach((bookmark) => engine.addHighlight(
                        bookmark.cfi,
                        HIGHLIGHT_SWATCHES[bookmark.color] || HIGHLIGHT_SWATCHES.yellow,
                        setEditing,
                        highlightStyle(bookmark)
                    ));

                engine.onSelected((cfiRange) => {
                    const text = engine.selectionText();
                    if (text) setSelection({ cfiRange, text });
                });

                engine.registerFootnotes(setFootnote);
                engine.registerImages(setImage);
                engine.registerHangingPunctuation(Boolean(typography.hangingPunctuation));

                setState('ready');
                cierreApertura();
            } catch (loadError) {
                if (cancelled) return;
                setError(loadError?.message || 'No se pudo abrir el libro.');
                setState('error');
            }
        };

        load();
        return () => {
            cancelled = true;
            engine.destroy();
            engineRef.current = null;
        };
        // La puntuación colgada entra aquí porque se aplica en el hook de
        // contenido, que solo se puede registrar antes de montar los capítulos.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [book.id, typography.flow, typography.hyphenLang, typography.hangingPunctuation]);

    // ── Posición ─────────────────────────────────────────────────────────────
    useEffect(() => {
        const engine = engineRef.current;
        if (!engine || state !== 'ready') return undefined;

        return engine.onRelocated((loc) => {
            const cfi = loc?.start?.cfi;
            if (!cfi) return;
            const progress = engine.progressFromCfi(cfi);
            // La cuenta medida manda sobre la que publica epub.js, que dentro de
            // un capítulo no avanza. Ver `pageInChapter`.
            const measured = engine.chapterPage?.();
            const page = measured?.page ?? (loc?.start?.displayed?.page || 0);
            const total = measured?.total ?? (loc?.start?.displayed?.total || 0);

            setLocation({
                cfi,
                progress,
                chapter: engine.chapterLabel(cfi, toc),
                chapterProgress: total > 0 ? page / total : 0,
                page,
                totalPages: total,
            });
            progressRef.current?.({ cfi, progress });

            // epub.js ha terminado su papeleo: aquí se cierra el segundo reloj.
            cierreAsentada.current?.();
            cierreAsentada.current = null;

            // El capítulo siguiente se carga por adelantado: es el único
            // momento en que pasar página no es instantáneo, y ocurre siempre
            // en el mismo sitio previsible —el final del capítulo—.
            engine.prefetchNext(cfi);

            /**
             * Las copias de la página se preparan **ahora**, no al empezar el gesto.
             *
             * Montar dos iframes con el capítulo cuesta decenas de milisegundos.
             * Hacerlo cuando el dedo ya se apoya metería ese retardo justo donde
             * más se nota; aquí el usuario está leyendo y no espera nada.
             */
            if (usesCurl(transitionRef.current) && !reducedMotionRef.current) {
                prepareFold();
            }
        });
    }, [state, toc]);

    /**
     * La barra de estado del sistema sigue al tema de **lectura**, no al de la app.
     *
     * Dentro del libro manda el tema de lectura: el chrome se pinta con él, así que
     * leyendo en negro con la interfaz en claro la hora y los iconos del sistema
     * salían oscuros sobre negro. Al salir del libro se devuelve al tema de la app,
     * que es de quien vuelve a ser la pantalla.
     *
     * Cada tema declara su `ui` porque no se puede deducir del fondo sin equivocarse
     * en los intermedios: sepia es claro y noche es oscuro, y ambos están a medio
     * camino del gris.
     */
    useEffect(() => {
        const claro = (READER_THEMES[effectiveTheme] || READER_THEMES.dark).ui === 'light';
        StatusBar.setStyle({ style: claro ? Style.Light : Style.Dark }).catch(() => {});

        return () => {
            const appClara = document.documentElement.classList.contains('theme-light');
            StatusBar.setStyle({ style: appClara ? Style.Light : Style.Dark }).catch(() => {});
        };
    }, [effectiveTheme]);

    /**
     * Pantalla completa mientras se lee.
     *
     * Con el chrome oculto, la barra del sistema también se va: son 40 px de
     * pantalla en los que no hay nada que leer, y con el texto justo debajo el
     * ojo tropieza con la hora y la batería en cada salto de línea.
     *
     * Vuelve al sacar el chrome, y al salir del libro se restaura pase lo que
     * pase — una app que se queda sin barra de estado parece colgada.
     */
    useEffect(() => {
        if (state !== 'ready') return undefined;

        if (chrome) StatusBar.show().catch(() => {});
        else StatusBar.hide().catch(() => {});

        return () => { StatusBar.show().catch(() => {}); };
    }, [chrome, state]);

    useEffect(() => {
        if (state === 'ready') engineRef.current?.applyStyles(styles);
    }, [styles, state]);

    useEffect(() => {
        einkRef.current = eink;
        refreshRef.current.setInterval(eink ? refreshEvery : 0);
    }, [eink, refreshEvery]);

    // Cambiar el margen mueve el contenedor, no el documento: epub.js tiene que
    // volver a medir para recalcular el ancho de columna.
    useEffect(() => {
        if (state === 'ready') engineRef.current?.resize();
    }, [typography.margin, state]);

    useEffect(() => {
        if (state !== 'ready') return;
        progressRef.current?.({
            readerPreferences: {
                typography, theme, transition, warm, spread, orientation, ruler,
                einkRefresh: refreshEvery,
            },
        });
    }, [typography, theme, transition, warm, spread, orientation, ruler, refreshEvery, state]);

    // ── Columnas y orientación ───────────────────────────────────────────────

    /**
     * Bloquea o libera la orientación mientras el libro está abierto.
     *
     * Al salir se libera siempre, aunque el usuario la dejara bloqueada: el
     * bloqueo es del lector, no de la app. Salir a la biblioteca con la pantalla
     * clavada en horizontal es un estado del que no se sabe salir.
     */
    useEffect(() => {
        const screen = ports.screen;
        if (!screen) return undefined;
        screen.lock(orientation).catch(() => {});
        return () => { screen.unlock().catch(() => {}); };
    }, [orientation, ports]);

    /**
     * Decide cuántas columnas caben y se lo dice a epub.js.
     *
     * Se mide con un pequeño retraso tras girar: el evento de rotación llega
     * antes de que Android termine la animación, y medir en ese momento devuelve
     * el ancho de la orientación anterior — el libro se quedaría a una columna
     * en horizontal, que es justo el caso que esto arregla.
     */
    useEffect(() => {
        if (state !== 'ready') return undefined;
        let timer = null;

        const measure = () => {
            const width = viewportRef.current?.clientWidth || 0;
            if (!width) return;
            const next = columnsFor(width, spread);
            // La comparación va contra una ref y no dentro del actualizador de
            // estado: repintar el libro es un efecto, y React puede llamar al
            // actualizador dos veces: el libro parpadearía en cada giro.
            if (columnsRef.current === next) return;
            columnsRef.current = next;
            engineRef.current?.setSpread(spreadValue(spread), SPREAD_MIN_WIDTH);
            setColumns(next);
        };

        const scheduleMeasure = () => {
            clearTimeout(timer);
            timer = setTimeout(measure, 220);
        };

        measure();
        window.addEventListener('resize', scheduleMeasure);

        let removeListener;
        ports.screen?.onChange?.(scheduleMeasure)
            .then((remove) => { removeListener = remove; })
            .catch(() => {});

        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', scheduleMeasure);
            removeListener?.();
        };
    }, [state, spread, ports]);

    // Con dos columnas el margen exterior se reduce: el hueco entre columnas ya
    // separa los bloques, y mantenerlo entero deja las columnas estrechas.
    const effectiveMargin = marginForColumns(typography.margin, columns);

    useEffect(() => {
        if (state === 'ready') engineRef.current?.resize();
    }, [effectiveMargin, state]);

    // ── Notas, imágenes e historial ──────────────────────────────────────────
    const [footnote, setFootnote] = useState(null);
    const [image, setImage] = useState(null);
    const history = useHistory();

    const locationRef = useRef(location);
    locationRef.current = location;

    /**
     * Salta a otra parte del libro **guardando dónde estabas**.
     *
     * Solo los saltos deliberados entran en el historial: si cada página
     * entrara, «volver» retrocedería una página y dejaría de significar
     * «llévame de vuelta a donde estaba».
     */
    const jumpTo = useCallback((target) => {
        const from = locationRef.current;
        if (from?.cfi) history.push({ cfi: from.cfi, label: from.chapter || 'donde estabas' });
        engineRef.current?.display(target);
        setPanel(null);
        setFootnote(null);
    }, [history]);

    const goBack = useCallback(() => {
        const entry = history.pop();
        if (entry?.cfi) engineRef.current?.display(entry.cfi);
    }, [history]);

    // ── Barra de progreso arrastrable ────────────────────────────────────────
    const [scrubAt, setScrubAt] = useState(null);

    /** Capítulo al que se llegaría con la posición que se está arrastrando. */
    const scrubChapter = useMemo(() => {
        if (scrubAt === null) return '';
        return engineRef.current?.chapterAtPercent(scrubAt / 100, toc) || '';
    }, [scrubAt, toc]);

    const commitScrub = useCallback(() => {
        if (scrubAt === null) return;
        const target = engineRef.current?.cfiAtPercent(scrubAt / 100);
        // Saltar con la barra también es un salto deliberado: entra en el
        // historial para poder deshacerlo.
        if (target) jumpTo(target);
        setScrubAt(null);
    }, [scrubAt, jumpTo]);

    // ── Lectura en voz alta ──────────────────────────────────────────────────
    const [spokenSentence, setSpokenSentence] = useState('');
    const speech = useSpeech({
        title: book.name,
        chapter: location.chapter,
        // Lee solo lo visible, no el capítulo entero: si no, la voz seguiría
        // leyendo contenido de páginas que el usuario aún no tiene delante.
        getPageText: useCallback(() => engineRef.current?.visibleText() || '', []),
        onSentence: useCallback((sentence) => {
            engineRef.current?.highlightSpoken(sentence);
            // Se guarda también en estado: la hoja de voz la enseña escrita, que
            // es lo que permite seguir la lectura sin volver a la página.
            setSpokenSentence(sentence || '');
        }, []),
        onNextPage: useCallback(async () => {
            const engine = engineRef.current;
            if (!engine) return false;
            await engine.next();
            return true;
        }, []),
    });

    // Tocar un párrafo mientras se lee salta a esa parte. Se conecta a través de
    // una ref porque los gestos se registraron durante la carga, antes de que
    // `speech` existiera.
    const speechRef = useRef(speech);
    speechRef.current = speech;

    useEffect(() => {
        gesturesRef.current.onTapWhileSpeaking = (point) => {
            const api = speechRef.current;
            if (api.state === 'idle') return false;

            const paragraph = engineRef.current?.paragraphAt(point.x, point.y);
            if (!paragraph) return false;

            // Se busca la primera frase de la cola que aparezca en ese párrafo.
            const needle = paragraph.slice(0, 40);
            const target = api.sentences().findIndex((sentence) => paragraph.includes(sentence.slice(0, 30)) || sentence.includes(needle));
            if (target < 0) return false;

            api.speakFrom(target);
            return true;
        };
    }, []);

    // ── Anotaciones ──────────────────────────────────────────────────────────
    const annotationsRef = useRef(book.bookmarks || []);
    annotationsRef.current = book.bookmarks || [];

    // Subrayado que se está editando, por CFI. Tocar un subrayado en el libro
    // abre su editor en vez del panel entero: lo que quieres es *ese*, y en un
    // libro con cien subrayados encontrarlo en la lista es peor que no tenerla.
    const [editing, setEditing] = useState(null);

    const highlightSelection = useCallback((color, comment) => {
        if (!selection) return;
        const annotation = createHighlight({
            cfi: selection.cfiRange, text: selection.text, color, comment, style: estiloMarca,
        });
        onAnnotationsChange?.(addAnnotation(annotationsRef.current, annotation));
        engineRef.current?.addHighlight(selection.cfiRange, HIGHLIGHT_SWATCHES[color], setEditing, estiloMarca);
        engineRef.current?.clearSelection();
        setSelection(null);
    }, [selection, onAnnotationsChange, estiloMarca]);

    /**
     * Guarda los cambios de un subrayado existente.
     *
     * El color se repinta quitando y volviendo a poner el overlay: epub.js no
     * expone una forma de cambiarle el color a una anotación ya dibujada, y sin
     * esto el cambio solo se vería al reabrir el libro.
     */
    const saveHighlight = useCallback(({ color, comment }) => {
        const cfi = editing;
        if (!cfi) return;
        onAnnotationsChange?.(updateHighlight(annotationsRef.current, cfi, { color, comment }));
        const engine = engineRef.current;
        engine?.removeHighlight(cfi);
        // Se conserva la forma con la que se marcó: al cambiar el color no se
        // está pidiendo cambiar de subrayado a relleno.
        engine?.addHighlight(
            cfi,
            HIGHLIGHT_SWATCHES[color],
            setEditing,
            highlightStyle(findAnnotation(annotationsRef.current, cfi))
        );
        setEditing(null);
    }, [editing, onAnnotationsChange]);

    const deleteAnnotation = useCallback((cfi, kind) => {
        onAnnotationsChange?.(removeAnnotation(annotationsRef.current, cfi, kind));
        if (kind === 'highlight') engineRef.current?.removeHighlight(cfi);
    }, [onAnnotationsChange]);

    const isBookmarked = annotationsRef.current.some(
        (bookmark) => bookmark.cfi === location.cfi && normalizeAnnotationKind(bookmark) === 'bookmark'
    );

    const toggleBookmark = useCallback(() => {
        if (!location.cfi) return;
        onAnnotationsChange?.(isBookmarked
            ? removeAnnotation(annotationsRef.current, location.cfi, 'bookmark')
            : addAnnotation(annotationsRef.current, createBookmark({ cfi: location.cfi, label: location.chapter })));
    }, [location.cfi, location.chapter, isBookmarked, onAnnotationsChange]);

    const copySelection = useCallback(async () => {
        if (!selection) return;
        try { await navigator.clipboard.writeText(selection.text); } catch { /* sin portapapeles */ }
        engineRef.current?.clearSelection();
        setSelection(null);
    }, [selection]);

    const cancelSelection = useCallback(() => {
        engineRef.current?.clearSelection();
        setSelection(null);
    }, []);

    // ── Citar y saltar a una posición ────────────────────────────────────────
    const [citing, setCiting] = useState(null);
    const [citationFormat, setCitationFormat] = useState('plain');

    const openCitation = useCallback((text) => {
        // El registro del libro guarda «Autor desconocido» como relleno para la
        // biblioteca. En una cita eso es peor que no poner nada: parece un dato
        // y no lo es.
        const known = book.author && book.author !== UNKNOWN_AUTHOR_FALLBACK ? book.author : '';
        setCiting({
            text,
            title: book.name,
            author: engineRef.current?.bookAuthor() || known,
            chapter: locationRef.current?.chapter || '',
            percent: locationRef.current?.progress ?? 0,
        });
        engineRef.current?.clearSelection();
        setSelection(null);
    }, [book.name, book.author]);

    const copyCitation = useCallback(async (text, format) => {
        setCitationFormat(format);
        try { await navigator.clipboard.writeText(text); } catch { /* sin portapapeles */ }
        setCiting(null);
    }, []);

    /** Salta a lo que el usuario haya escrito: posición, porcentaje o página. */
    const goToTarget = useCallback((target) => {
        const engine = engineRef.current;
        if (!engine) return;
        const cfi = target.kind === 'percent'
            ? engine.cfiAtPercent(target.value)
            : engine.cfiAtLocation(target.value);
        // Sin CFI no se salta: mejor quedarse donde estabas que aterrizar en un
        // sitio arbitrario del libro.
        if (cfi) jumpTo(cfi);
        setPanel(null);
    }, [jumpTo]);

    // ── Avance automático y teclas de volumen ────────────────────────────────
    const autoScroll = useAutoScroll({
        onNext: () => engineRef.current?.next(),
        onPrev: () => engineRef.current?.prev(),
        // La captura de teclas de volumen se desactiva si el usuario la apagó
        // en ajustes: un interruptor que no hace nada es peor que no ofrecerlo.
        // Las teclas de volumen NO pasan página por defecto.
        //
        // Venía activado y era un fallo: subir o bajar el volumen cambiaba de
        // página. En un móvil las teclas de volumen son del volumen —y muy
        // especialmente mientras suena la voz, que es cuando de verdad hacen
        // falta—. Pasar página con ellas es una comodidad de nicho, así que se
        // pide expresamente.
        //
        // Y aunque esté activado, se libera mientras la voz suena: si no, subir
        // el volumen de la narración adelantaría el libro.
        enabled: state === 'ready'
            && preferences.volumeKeys === true
            && speech.state === 'idle',
    });

    // ── Diccionario e imagen de cita ─────────────────────────────────────────
    const [lookup, setLookup] = useState(null);

    const openDictionary = useCallback((text) => {
        setLookup(text);
        engineRef.current?.clearSelection();
        setSelection(null);
    }, []);

    const shareQuote = useCallback(async (text) => {
        setSelection(null);
        engineRef.current?.clearSelection();
        try {
            const blob = await renderQuoteImage({ text, book, theme });
            await shareImage(`cita-${Date.now()}.png`, blob, 'Compartir cita');
        } catch {
            // Si el diálogo de compartir no está disponible, no hay alternativa
            // razonable; se cierra la barra y ya está.
        }
    }, [book, theme]);

    /**
     * Ejecuta la acción que tenga asignada la zona tocada.
     *
     * Se enchufa por ref y no como argumento al crear los manejadores: estos se
     * crean una sola vez y se registran dentro del iframe durante la carga, así
     * que si capturaran el estado de React se quedarían con el de aquel momento
     * — la rejilla no se podría cambiar con el libro abierto y `toggleBookmark`
     * marcaría siempre la posición de apertura.
     */
    useEffect(() => {
        gesturesRef.current.grid = grid;
        gesturesRef.current.onAction = (action) => {
            switch (action) {
                case 'next': turnPage('next'); break;
                case 'prev': turnPage('prev'); break;
                case 'chrome': setChrome((visible) => !visible); break;
                case 'toc': setPanel('toc'); break;
                case 'bookmark': toggleBookmark(); break;
                case 'speech': speech.toggle(); break;
                case 'brightness': setPanel('display'); break;
                case 'goto': setPanel('goto'); break;
                case 'back': if (history.canGoBack) goBack(); break;
                // 'none': la zona está apagada a propósito.
                default: break;
            }
        };
    }, [grid, toggleBookmark, speech, history.canGoBack, goBack]);

    /**
     * Prepara las copias del capítulo con las que se dobla la página.
     *
     * Se hace en tiempo muerto —tras asentarse la página— y con `requestIdleCallback`
     * cuando existe, para no competir con el pintado del capítulo nuevo.
     */
    const prepareFold = useCallback(() => {
        const engine = engineRef.current;
        if (!engine) return;

        const run = () => {
            const sheet = engine.chapterSheet?.();
            if (sheet?.html) setFoldSheet(sheet);
        };

        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(run, { timeout: 900 });
        } else {
            setTimeout(run, 220);
        }
    }, []);

    /**
     * Atrás dentro del libro cierra una capa cada vez.
     *
     * El orden es el de encima hacia abajo, que es el que ve el usuario. Solo
     * cuando no queda nada abierto se devuelve `false` y `App` sale a la
     * biblioteca — antes se salía del libro con el índice todavía abierto,
     * porque los dos manejadores se ejecutaban a la vez.
     *
     * El salto de historial va antes que la barra: si acabas de saltar a una
     * nota, lo que atrás significa es «devuélveme donde estaba», no «cierra la
     * barra de herramientas».
     */
    useBackHandler(() => {
        if (image) { setImage(null); return true; }
        if (citing) { setCiting(null); return true; }
        if (editing) { setEditing(null); return true; }
        if (footnote) { setFootnote(null); return true; }
        if (lookup) { setLookup(null); return true; }
        if (selection) { cancelSelection(); return true; }
        if (panel) { setPanel(null); return true; }
        if (speech.state !== 'idle') { speech.stop(); return true; }
        if (history.canGoBack) { goBack(); return true; }
        if (chrome) { setChrome(false); return true; }
        return false;
    });

    if (state === 'error') {
        return (
            <div className="reader" style={{ '--reader-bg': palette.bg }}>
                <div className="empty">
                    <span className="empty-art">📕</span>
                    <h2 className="empty-title">No se pudo abrir</h2>
                    <p className="empty-body">{error}</p>
                    <button type="button" className="btn btn-primary" onClick={onClose}>
                        Volver a la biblioteca
                    </button>
                </div>
            </div>
        );
    }

    const percent = Math.round((location.progress || 0) * 100);
    const chapterPercent = Math.round((location.chapterProgress || 0) * 100);
    const annotationCount = annotationsRef.current.length;

    // El mapa de localizaciones es lo más parecido a un número de página que
    // tiene un EPUB. Se lee del motor en cada render en lugar de guardarlo en
    // estado: cambia al regenerarse el mapa y no merece un ciclo de render.
    const totalLocations = engineRef.current?.totalLocations() || 0;
    const currentLocationIndex = engineRef.current?.currentLocation(location.cfi) || 0;

    const mapStatusView = mapStatus({ ...(mapProgress || {}), ready: locationsReady });
    // Sin mapa no se sabe por dónde vas en el libro, solo en el capítulo.
    // Enseñar «0 %» durante diez segundos sería mentir sobre justo el dato que
    // se mira para orientarse.
    const progressText = progressLabel({
        ready: locationsReady,
        bookPercent: percent,
        chapterPercent,
    });

    // La interfaz del lector se adapta al tema de lectura: en sepia o papel una
    // barra oscura encima del texto claro sería un golpe visual.
    //
    // Los colores salen del propio tema y no de dos parejas escritas a mano: las
    // que había venían de la paleta anterior, así que desde el cambio de tokens el
    // chrome se pintaba con grises que ya no eran de ningún tema. `color-mix` los
    // saca del fondo y del texto de la página, que es de donde tienen que salir.
    const chromeVars = {
        '--chrome-bg': `color-mix(in srgb, ${palette.bg} 94%, transparent)`,
        '--chrome-text': palette.text,
    };

    return (
        <div
            // `grano` lo pide el propio tema. Ver READER_THEMES: los claros se
            // pintan con textura de papel, los oscuros no — el grano sobre negro
            // no se lee como fibra, se lee como ruido de sensor.
            className={`reader${eink ? ' eink' : ''}${palette.grain ? ' grano' : ''}`}
            style={{
                '--reader-bg': palette.bg,
                '--reader-text': palette.text,
                '--reader-margin': `${effectiveMargin}px`,
                ...chromeVars,
            }}
        >
            {state === 'loading' && (
                <Loading kind="reader" label={`Abriendo ${book.name}`} />
            )}

            {/* Los gestos van dentro del iframe (registerContentHooks), no en una
                capa por encima: así el toque navega y la pulsación larga puede
                seleccionar texto para subrayar. */}
            <div
                className={`reader-viewport${typography.flow === 'scrolled' ? ' scrolled' : ''}${columns === 2 ? ' two-columns' : ''}`}
                ref={viewportRef}
            />

            {/* Velo del color de la página.
                Es lo que se atenúa al pasar página, en lugar de la opacidad del
                texto: fundir el texto obliga al WebView a componer los glifos con
                canal alfa y a cambiar de suavizado subpíxel a escala de grises
                mientras dura, que es lo que hacía temblar las letras. Con un velo
                del mismo color de destino el efecto se ve igual y los glifos no se
                vuelven a rasterizar. */}
            <div className="turn-veil" ref={veilRef} aria-hidden="true" />

            {/* El doblado de hoja.
                Va **después** del contenedor del libro en el DOM: el iframe se
                pinta en su propia capa compuesta y, estando antes, el pliegue
                quedaba debajo por mucho z-index que llevara. */}
            {foldSheet && (
                <PageFold
                    sheet={foldSheet}
                    width={viewportRef.current?.clientWidth || 0}
                    height={viewportRef.current?.clientHeight || 0}
                    controllerRef={foldRef}
                />
            )}

            {/* El doblado de hoja.
                Va **después** del contenedor del libro en el DOM: el iframe se
                pinta en su propia capa compuesta y, estando antes, el pliegue
                quedaba debajo por mucho z-index que llevara. */}

            {/* Atenuador y filtro cálido no se pintan en tinta electrónica: el
                panel no tiene niveles intermedios y una capa semitransparente
                se convierte en una trama de puntos. */}
            {!eink && dim > 0 && <div className="reader-dim" style={{ opacity: dim }} aria-hidden="true" />}
            {!eink && warm > 0 && <div className="reader-warm" style={{ opacity: warm }} aria-hidden="true" />}


            {ruler !== 'off' && state === 'ready' && (
                <ReadingRuler
                    mode={ruler}
                    typography={typography}
                    onClose={() => setRuler('off')}
                />
            )}

            {/* El libro ya se lee; esto solo explica por qué aún no hay
                porcentaje del total. */}
            {mapStatusView.visible && (
                <div className="map-progress" role="status">
                    <span className="map-progress-track">
                        <span
                            className="map-progress-fill"
                            style={{ width: `${mapStatusView.percent}%` }}
                        />
                    </span>
                    <span>{mapStatusView.label}</span>
                </div>
            )}

            {/* ── La línea de estado ───────────────────────────────────────
                Batería, hora, capítulo y porcentaje, siempre visibles mientras se
                lee. Antes aquí solo había «2 / 28» centrado.

                Con la barra del sistema oculta, esto es lo único que dice qué hora
                es. Mirar la hora es la interrupción más común de una sesión de
                lectura, y hasta ahora costaba sacar el chrome. */}
            {!chrome && state === 'ready' && !history.canGoBack && (
                <div className="reader-estado" aria-hidden="true">
                    <span className="re-izq">
                        {bateria !== null && <b className="re-bat">{bateria}</b>}
                        <span>{hora}</span>
                    </span>

                    <span className="re-centro">{location.chapter || ''}</span>

                    <span className="re-der">
                        {location.page > 0 && (
                            <span>{location.page} / {location.totalPages}</span>
                        )}
                        <b>{percent} %</b>
                    </span>
                </div>
            )}

            {/* Solo aparece si hay a dónde volver, así que su presencia ya es la
                información: acabas de saltar y puedes deshacerlo. */}
            {history.canGoBack && (
                <button type="button" className="back-jump" onClick={goBack}>
                    <IconArrowLeft size={16} />
                    <span>Volver a {history.peekLabel()}</span>
                </button>
            )}

            <header className={`reader-top${chrome ? '' : ' hidden'}`}>
                <button type="button" className="icon-btn" onClick={onClose} aria-label="Volver a la biblioteca">
                    <IconArrowLeft size={22} />
                </button>
                {/* El título abre la ficha del libro.
                    
                    Era una etiqueta muerta, y la sinopsis solo se podía leer
                    saliendo del libro y buscando la portada en la biblioteca.
                    «¿De qué iba esto?» se pregunta justo al volver tras unos
                    días, o sea dentro del libro. */}
                <button
                    type="button"
                    className="reader-title"
                    onClick={() => setPanel('info')}
                    aria-label={`Ficha de ${book.name}`}
                >
                    <span className="reader-book">{book.name}</span>
                    {location.chapter && <span className="reader-chapter">{location.chapter}</span>}
                </button>
                {/* Arriba, solo lo que sitúa en el libro: dónde estoy, a dónde
                    voy y qué he marcado. Abajo, los ajustes de lectura.

                    Eran seis iconos del mismo peso en una fila y no se
                    distinguían de un vistazo. El brillo baja a la hoja de
                    Pantalla —donde el usuario espera encontrar lo que cambia el
                    aspecto— y las notas pasan al cajón del índice, junto a las
                    marcas, que es donde ya vivía la otra mitad de lo mismo. */}
                <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setPanel('search')}
                    aria-label="Buscar en el libro"
                >
                    <IconSearch size={20} />
                </button>
                <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setPanel('toc')}
                    aria-label="Índice"
                >
                    <IconList size={21} />
                </button>
                <button
                    type="button"
                    className={`icon-btn${isBookmarked ? ' on' : ''}`}
                    onClick={toggleBookmark}
                    aria-label={isBookmarked ? 'Quitar marcador' : 'Añadir marcador'}
                    aria-pressed={isBookmarked}
                >
                    <IconBookmark size={21} filled={isBookmarked} />
                </button>
            </header>

            {/* Hilo de progreso siempre visible, también con la interfaz
                oculta. Es la única información que se quiere de fondo mientras
                se lee: saber por dónde vas sin tener que invocar nada. */}
            <div className="reader-hairline" aria-hidden="true">
                <span style={{ width: `${percent}%` }} />
            </div>

            <footer className={`reader-bottom${chrome ? '' : ' hidden'}`}>
                <div className="prog">
                    {/* Capítulo y tiempo restante en la misma línea: son las dos
                        preguntas que se hacen a la vez —dónde estoy y cuánto
                        queda— y separarlas obligaba a leer dos veces. */}
                    <div className="prog-head">
                        <span className="prog-chapter">{location.chapter || 'Capítulo'}</span>
                        {/* Siempre el porcentaje, nunca el tiempo restante: ver
                            `locationMap.js`. El tiempo era una estimación sobre
                            una estimación, no respondía a «por dónde voy», y en
                            modo continuo no se podía calcular igual. */}
                        <span className="prog-left">
                            {progressText.text} {progressText.of}
                        </span>
                    </div>

                    {/* Arrastrable: recorrer el libro sin pasar por el índice.
                        Mientras se arrastra se muestra el capítulo de destino,
                        para poder soltar sabiendo a dónde vas. */}
                    <div className={`prog-track${scrubAt !== null ? ' scrubbing' : ''}`}>
                        <span className="prog-book" style={{ width: `${scrubAt ?? percent}%` }} />
                        <span className="prog-knob" style={{ left: `${scrubAt ?? percent}%` }} />
                        <input
                            type="range"
                            className="prog-scrub"
                            min={0}
                            max={100}
                            step={0.5}
                            value={scrubAt ?? percent}
                            onChange={(event) => setScrubAt(Number(event.target.value))}
                            onPointerUp={commitScrub}
                            onTouchEnd={commitScrub}
                            // Sin mapa no hay forma de traducir un porcentaje a
                            // una posición del libro: arrastrar no llevaría a
                            // ninguna parte, y una barra que no responde es peor
                            // que una barra desactivada.
                            disabled={!locationsReady}
                            aria-label="Ir a una posición del libro"
                        />

                        {scrubAt !== null && (
                            <div className="scrub-preview" style={{ left: `${scrubAt}%` }}>
                                <b>{Math.round(scrubAt)}%</b>
                                <span>{scrubChapter || 'del libro'}</span>
                            </div>
                        )}
                    </div>

                    {/* Escribir el destino en vez de arrastrar. Con el pulgar
                        sobre una barra de 300 px cada píxel son varias páginas,
                        así que volver a una posición concreta —la que te han
                        dicho, la de tus notas— es imposible a mano. */}
                    <button type="button" className="prog-goto" onClick={() => setPanel('goto')}>
                        <IconGoTo size={13} />
                        <span>
                            {totalLocations > 0
                                ? `${currentLocationIndex + 1} de ${totalLocations}`
                                : `${percent} % del libro`}
                        </span>
                    </button>
                </div>

                {/* Dock de herramientas.
                    Iconos grandes y sin etiqueta salvo cuando aportan un dato
                    —el número de notas—. La versión anterior metía icono y
                    palabra en 60 px de ancho: el texto salía a 10 px, ilegible,
                    y el objetivo tocable quedaba en la mitad de lo que debería. */}
                {/* Tres, no cuatro: las notas han subido arriba con el resto de
                    lo que sitúa al lector en el libro. */}
                <nav className="reader-dock three" aria-label="Herramientas de lectura">
                    <button
                        type="button"
                        className="dock-btn"
                        onClick={() => setPanel('settings')}
                        aria-label="Texto y tipografía"
                    >
                        <IconTextSize size={23} />
                    </button>
                    <button
                        type="button"
                        className="dock-btn"
                        onClick={() => setPanel('display')}
                        aria-label="Pantalla y lectura"
                    >
                        <IconSun size={23} />
                    </button>
                    <button
                        type="button"
                        className={`dock-btn${speech.state !== 'idle' ? ' on' : ''}`}
                        // Sonando, el botón abre los controles en vez de parar:
                        // pararla de un toque en el mismo sitio donde se arrancó
                        // es la forma más fácil de perder la posición sin querer.
                        onClick={() => (speech.state === 'idle' ? speech.start() : setPanel('speech'))}
                        disabled={!speech.supported}
                        aria-label={speech.state !== 'idle' ? 'Controles de voz' : 'Leer en voz alta'}
                    >
                        <IconVolume size={23} />
                    </button>
                </nav>
            </footer>

            {speech.state !== 'idle' && (
                <SpeechBar
                    speech={speech}
                    onExpand={() => setPanel('speech')}
                    onClose={speech.stop}
                />
            )}

            {panel === 'speech' && (
                <SpeechSheet
                    speech={speech}
                    sentence={spokenSentence}
                    chapter={location.chapter}
                    onClose={() => setPanel(null)}
                />
            )}

            {(panel === 'toc' || panel === 'search') && (
                <TocDrawer
                    toc={toc}
                    initialTab={panel === 'search' ? 'search' : 'toc'}
                    onOpenAnnotations={() => setPanel('annotations')}
                    annotationCount={annotationCount}
                    currentChapter={location.chapter}
                    bookmarks={annotationsRef.current}
                    onSelect={jumpTo}
                    onClose={() => setPanel(null)}
                    // El índice se pasa a la búsqueda para que cada resultado
                    // sepa de qué capítulo sale.
                    onSearch={(query, options) => engineRef.current?.search(query, { ...options, toc })}
                />
            )}

            {panel === 'gestures' && (
                <GestureGridSheet
                    grid={grid}
                    onChange={(next) => {
                        setGrid(next);
                        onPreferencesChange?.({ gestureGrid: next });
                    }}
                    onClose={() => setPanel(null)}
                />
            )}

            {panel === 'goto' && (
                <GoToSheet
                    totalLocations={totalLocations}
                    currentLocation={currentLocationIndex}
                    onGo={goToTarget}
                    onClose={() => setPanel(null)}
                />
            )}

            {panel === 'info' && (
                <BookInfoSheet
                    book={book}
                    location={location}
                    onClose={() => setPanel(null)}
                />
            )}

            {panel === 'display' && (
                <DisplaySheet
                    theme={theme}
                    onChangeTheme={setTheme}
                    dim={dim}
                    onChangeDim={setDim}
                    warm={warm}
                    onChangeWarm={setWarm}
                    flow={typography.flow}
                    onChangeFlow={(flow) => setTypography({ ...typography, flow })}
                    transition={transition}
                    onChangeTransition={setTransition}
                    spread={spread}
                    onChangeSpread={setSpread}
                    columns={columns}
                    orientation={orientation}
                    onChangeOrientation={setOrientation}
                    ruler={ruler}
                    onChangeRuler={setRuler}
                    eink={eink}
                    onChangeEink={(value) => setTypography({ ...typography, eink: value })}
                    onOpenGestures={() => setPanel('gestures')}
                    refreshEvery={refreshEvery}
                    onChangeRefreshEvery={setRefreshEvery}
                    onFlashNow={() => {
                        refreshRef.current.reset();
                        flashScreen(viewportRef.current?.parentElement);
                    }}
                    transitionMode={transition}
                    autoScroll={autoScroll}
                    onClose={() => setPanel(null)}
                />
            )}

            {panel === 'settings' && (
                <ReaderSettingsSheet
                    typography={typography}
                    theme={effectiveTheme}
                    onChangeTypography={setTypography}
                    onClose={() => setPanel(null)}
                />
            )}

            {panel === 'annotations' && (
                <AnnotationsPanel
                    bookmarks={annotationsRef.current}
                    // El capítulo y la posición de cada anotación se resuelven
                    // aquí porque solo el motor sabe traducir un CFI.
                    chapterOf={(cfi) => engineRef.current?.chapterLabel(cfi, toc) || ''}
                    progressOf={(cfi) => engineRef.current?.progressFromCfi(cfi)}
                    onJump={jumpTo}
                    onDelete={deleteAnnotation}
                    onEdit={(cfi) => { setPanel(null); setEditing(cfi); }}
                    onExport={() => onExportAnnotations?.(book)}
                    onClose={() => setPanel(null)}
                />
            )}

            {lookup && (
                <DictionarySheet word={lookup} book={book} onClose={() => setLookup(null)} />
            )}

            {footnote && (
                <FootnoteSheet
                    note={footnote}
                    palette={palette}
                    onGoToNotes={(href) => jumpTo(href)}
                    onClose={() => setFootnote(null)}
                />
            )}

            {image && (
                <ImageViewer src={image.src} alt={image.alt} onClose={() => setImage(null)} />
            )}

            {selection && (
                <SelectionToolbar
                    text={selection.text}
                    onHighlight={highlightSelection}
                    onCopy={copySelection}
                    onCancel={cancelSelection}
                    onLookup={openDictionary}
                    onQuote={shareQuote}
                    onCite={openCitation}
                    estilo={estiloMarca}
                    onEstilo={setEstiloMarca}
                />
            )}

            {citing && (
                <CitationSheet
                    source={citing}
                    initialFormat={citationFormat}
                    onCopy={copyCitation}
                    onClose={() => setCiting(null)}
                />
            )}

            {editing && (
                <HighlightEditor
                    annotation={findAnnotation(annotationsRef.current, editing)}
                    onSave={saveHighlight}
                    onDelete={(cfi) => { deleteAnnotation(cfi, 'highlight'); setEditing(null); }}
                    onClose={() => setEditing(null)}
                />
            )}
        </div>
    );
}
