import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createEpubEngine, textoPropio } from './EpubEngine.js';
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
import { atenuacionDe, brilloVisible } from './brilloGesto.js';
import { cuerpoPorPellizco, escalaVisual } from './pellizco.js';
import { createHojaReal } from './hojaReal.js';
import { paginaSintetica, paginaImpresa, localizacionDePagina } from './paginasLibro.js';
import { grabadorGestos, exponerGrabador } from './grabadorGestos.js';
import { crearDibujoPliegue, createPliegue } from './pliegueGL.js';
import { createConfortLuz, ajustesPara, describir } from './confortLuz.js';
import PosicionRemotaSheet from './PosicionRemotaSheet.jsx';
import PersonajesSheet from './PersonajesSheet.jsx';
import TraduccionSheet from './TraduccionSheet.jsx';
import ResumenSheet from './ResumenSheet.jsx';
import { idiomaDe, traducirParrafo, mensajeDeError, DESTINO_POR_DEFECTO } from './traducir.js';
import { cargarConocidas, palabrasDificiles } from './glosas.js';
import { rangosDe, pintarCapa, quitarCapa, glosaCorta, CSS_GLOSAS, CLASE_ACTIVA } from './glosasCapa.js';
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
import { fraseConPalabra } from './anki.js';
import { renderQuoteImage } from './quoteImage.js';
import { shareImage } from '../library/backup.js';
import {
    createHighlight, createBookmark, addAnnotation, removeAnnotation, HIGHLIGHT_SWATCHES,
    updateHighlight, findAnnotation, highlightStyle, DEFAULT_HIGHLIGHT_STYLE,
} from './annotations.js';
import { columnsFor, spreadValue, marginForColumns, SPREAD_MIN_WIDTH } from './spread.js';
import { DEFAULT_GESTURE_GRID, normalizeGrid, PRESETS_GRID, presetDe, sugerirUnaMano } from './gestureGrid.js';
import GestureGridSheet from './GestureGridSheet.jsx';
import GoToSheet from './GoToSheet.jsx';
import CitationSheet from './CitationSheet.jsx';
import HighlightEditor from './HighlightEditor.jsx';
import { normalizeAnnotationKind } from '../core/annotationExport.js';
import { UNKNOWN_AUTHOR_FALLBACK } from '../core/bookModel.js';
import { readBookBlob } from '../adapters/SafPicker.js';
import { usePorts } from '../ports/index.js';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useBackHandler } from '../ui/useBackHandler.js';
import {
    IconArrowLeft, IconTextSize, IconList, IconBookmark, IconHighlight, IconSearch,
    IconVolume, IconClock, IconSun, IconGoTo, IconPeople,
} from '../ui/icons.jsx';

const LOCATIONS_KEY = (bookId) => `locations:${bookId}`;

export default function ReaderScreen({
    book, onClose, onProgress, onAnnotationsChange, onExportAnnotations, preferences = {}, onPreferencesChange,
    posicionRemota, onPosicionRemotaVista,
}) {
    const ports = usePorts();
    const viewportRef = useRef(null);
    const engineRef = useRef(null);
    // Las páginas sombra y quien pasa página con ellas. Ver `hojaReal.js`.
    const sombraSigRef = useRef(null);
    const sombraAntRef = useRef(null);
    const sombrasRef = useRef({ next: null, prev: null });
    const hojaRef = useRef(null);
    /** Cuánto se ha movido la hoja con el dedo, para seguir desde ahí al soltar. */
    const desplazamientoRef = useRef(0);
    /** Sube con cada apertura del motor: las sombras se rehacen con él. */
    const [motor, setMotor] = useState(0);
    // El pliegue en la GPU. Ver `pliegueGL.js`. Sin WebGL queda `PageFold`.
    const lienzoRef = useRef(null);
    const dibujoRef = useRef(null);
    const pliegueRef = useRef(null);
    /** Para qué posición está subida la foto de la página a la textura. */
    const fotoParaRef = useRef(null);
    const [sinWebGL, setSinWebGL] = useState(false);

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

    /**
     * El brillo mientras se ajusta con el pulgar.
     *
     * `null` cuando no se está ajustando. Se guarda también de dónde se partía,
     * porque el gesto es **relativo**: lo que mueve el dedo es la diferencia, no
     * un valor absoluto. Sin eso, volver a tocar la franja saltaría al valor que
     * corresponda a la altura del dedo, que se siente como un tirón.
     */
    const [ajustandoBrillo, setAjustandoBrillo] = useState(null);
    const brilloDesde = useRef(0);

    // El valor vivo, para los manejadores del gesto: se registran una sola vez y
    // sin esto verían siempre la atenuación que había al montar.
    const dimRef = useRef(0);
    dimRef.current = dim;
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
    /**
     * Sentido del pliegue que está tapando la pantalla, o `null`.
     *
     * Mientras vale algo, la página de verdad **ya ha cambiado** y lo que se ve
     * es la copia de la que se va. Ver `armarPliegue`.
     */
    const pliegueArmado = useRef(null);
    /**
     * Dónde se tocó por última vez, en coordenadas de la hoja.
     *
     * Tocando el borde para pasar página, el pliegue tiene que levantarse desde
     * la esquina que toca —si tocas arriba, la de arriba— y no siempre desde la
     * misma, que se nota como una animación enlatada.
     */
    const ultimoToque = useRef(null);

    // ── Medición ─────────────────────────────────────────────────────────────
    //
    // Las dos esperas que se notan al leer —pasar página y abrir el libro— se
    // cronometran cuando se pide. Ver `perf.js`: apagado no guarda nada, y se
    // lee desde el ordenador con `adb logcat` tras llamar a `window.__perf.log()`.
    /**
     * Si estamos en la primera o en la última página del libro.
     *
     * epub.js lo publica en cada cambio de posición. Sirve para que el arrastre
     * se **resista** en los bordes en lugar de no hacer nada: la diferencia entre
     * «se ha roto» y «aquí se acaba». Ver `dragOffset`.
     */
    const bordes = useRef({ inicio: false, fin: false });

    /** Temporizador que retira la sombra del canto al asentarse la hoja. */
    const cantoRef = useRef(0);

    const cierreAsentada = useRef(null);
    /** Recolocar las glosas de vocabulario; se enchufa más abajo. */
    const repintarGlosasRef = useRef(null);
    /** Recolocar las páginas sombra; se enchufa más abajo. */
    const colocarSombrasRef = useRef(null);
    useEffect(() => {
        exponerPerf();
        // `__gestos` en la consola del WebView: grabar gestos reales. Ver `grabadorGestos.js`.
        exponerGrabador();
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
    // El color del papel, para el dorso del pliegue, que se dibuja fuera de React.
    const paletteRef = useRef(palette);
    paletteRef.current = palette;

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
            atStart: () => bordes.current.inicio,
            atEnd: () => bordes.current.fin,
            getHeight: () => viewportRef.current?.clientHeight || window.innerHeight,
            // La rejilla y el despachador se enchufan más abajo con refs: los
            // manejadores se crean una vez y se registran dentro del iframe
            // durante la carga, así que no pueden capturar estado de React.
        });
        // Apagado no hace nada; encendido graba cada gesto tal como llega.
        grabadorGestos.envolver(gesturesRef.current);
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
    const turnPage = (direction, impulso = 0) => {
        const engine = engineRef.current;
        if (!engine) return;

        /**
         * **Que el pliegue no pueda dejar el libro clavado.**
         *
         * Mientras `pliegueArmado` vale algo, todo lo de abajo cree que hay un
         * gesto en marcha y no pasa página. Si por lo que sea ese gesto no llega
         * a rematarse —una animación que no arranca, un capítulo que tarda—, el
         * libro se queda sin responder y hay que salir y volver a entrar. Es el
         * síntoma que se ha visto y no se ha conseguido reproducir.
         *
         * Así que aquí se comprueba contra el propio pliegue en vez de fiarse de
         * la bandera: si él dice que ya no está tapando la pantalla, el gesto
         * terminó y la bandera está de más.
         */
        if (pliegueArmado.current && foldRef.current?.armed?.() === false) {
            pliegueArmado.current = null;
        }

        // El pliegue en la GPU: avanzando con un toque, la hoja se dobla sola
        // desde la esquina tocada. Retrocediendo se desliza (abajo).
        if (usesCurl(transitionRef.current) && !reducedMotionRef.current && flowRef.current !== 'scrolled') {
            if (direction === 'next' && !pliegueRef.current?.activo() && pliegueListoRef.current?.()) {
                const finVuelta = cronometrar('pasar-pagina');
                elevarSombra('next');
                pliegueRef.current.toque(ultimoToque.current).then(finVuelta, finVuelta);
                return;
            }
            if (direction === 'prev' && pliegueRef.current && sombraListaRef.current?.('prev')) {
                hojaRef.current.pasar('prev', { desde: desplazamientoRef.current, impulso, animar: true });
                desplazamientoRef.current = 0;
                return;
            }
        }

        /**
         * Con la página sombra lista, se pasa descubriéndola.
         *
         * Vale para deslizar y para «ninguna»: con «ninguna» la hoja se aparta
         * de golpe en vez de deslizarse, pero se sigue ganando lo importante —
         * cruzar de capítulo sin espera, porque lo que se ve mientras tanto es
         * la sombra—. El doblado tiene su propio camino.
         */
        if (!usesCurl(transitionRef.current) && flowRef.current !== 'scrolled' && sombraListaRef.current?.(direction)) {
            turnRef.current?.cancel();
            const finVuelta = cronometrar('pasar-pagina');
            hojaRef.current.pasar(direction, {
                desde: desplazamientoRef.current,
                impulso,
                animar: transitionRef.current === 'slide' && !reducedMotionRef.current,
            }).then(finVuelta, finVuelta).then(() => {
                if (einkRef.current && refreshRef.current.pageTurned()) {
                    flashScreen(viewportRef.current?.parentElement);
                }
            });
            desplazamientoRef.current = 0;
            return;
        }

        // Pasar página más rápido de lo que dura la animación cancela la
        // anterior: sin esto, dos animaciones se pelean por el mismo transform.
        turnRef.current?.cancel();

        /**
         * Tocando el borde, el pliegue se recorre solo.
         *
         * Es el mismo mecanismo que con el dedo —tapar, cambiar por debajo,
         * levantar la hoja— solo que el recorrido lo hace la animación. Sin esto,
         * tocar con el doblado elegido cambiaba de página de golpe y el efecto
         * solo existía arrastrando.
         */
        if (foldRef.current && usesCurl(transitionRef.current)
            && !reducedMotionRef.current && !pliegueArmado.current
            && flowRef.current !== 'scrolled') {
            armarPliegue(direction, ultimoToque.current);
            foldRef.current.finish(direction, soltarPliegue);
            return;
        }

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
            impulso,
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
        const setShift = (shift, progress, direction, punto) => {
            const node = viewportRef.current;
            if (!node) return;

            /**
             * El pliegue en la GPU, avanzando: la esquina sigue al dedo y debajo
             * está la página siguiente de verdad. Retrocediendo se desliza
             * descubriendo la anterior, que también está pintada.
             */
            const pliegue = pliegueRef.current;
            if (usesCurl(transitionRef.current) && direction === 'next'
                && (pliegue?.activo() || pliegueListoRef.current?.())) {
                elevarSombra('next');
                pliegue.seguir(puntoEnHoja(punto));
                return;
            }

            /**
             * Con el doblado, la página de debajo **no se mueve**.
             *
             * Lo que se dobla es una copia de la página que se va, encima. Es la
             * diferencia con girar el contenedor entero, que se veía como una
             * puerta abriéndose y no como papel.
             */
            if (foldRef.current) {
                // El primer movimiento tapa la pantalla y cambia de página por
                // debajo. A partir de ahí el sentido ya no se discute: si el dedo
                // se vuelve, lo que hace es deshacer el pliegue, no empezar otro.
                if (!pliegueArmado.current) armarPliegue(direction, puntoEnHoja(punto));
                foldRef.current.set(puntoEnHoja(punto));
                return;
            }

            node.classList.add('dragging');
            node.classList.remove('releasing');
            // De qué lado entra la página, para poner ahí la sombra del canto.
            clearTimeout(cantoRef.current);
            node.dataset.canto = direction === 'next' ? 'derecha' : 'izquierda';
            node.style.transform = `translate3d(${Math.round(shift)}px,0,0)`;
            // Debajo, la sombra del lado hacia el que se va: es la página que
            // el dedo está descubriendo.
            desplazamientoRef.current = Math.round(shift);
            elevarSombra(direction);
        };

        const release = () => {
            if (pliegueRef.current?.activo()) {
                pliegueRef.current.cancelar();
                return;
            }
            const armado = pliegueArmado.current;
            if (armado && foldRef.current) {
                // La hoja vuelve a su sitio y, ya tapada del todo, se deshace el
                // cambio de página. El usuario no llega a ver nada de esto.
                foldRef.current.cancel(armado, () => {
                    const engine = engineRef.current;
                    Promise.resolve(armado === 'next' ? engine?.prev() : engine?.next())
                        .catch(() => {})
                        .then(() => soltarPliegue());
                });
                return;
            }

            const node = viewportRef.current;
            desplazamientoRef.current = 0;
            if (!node) return;
            node.classList.remove('dragging');
            node.classList.add('releasing');
            node.style.transform = '';

            /**
             * La sombra del canto se retira cuando la hoja se ha asentado.
             *
             * `.releasing` se queda puesta hasta el siguiente arrastre —es lo que
             * lleva la transición de vuelta— así que sin esto la sombra quedaría
             * pintada en el borde para siempre después del primer gesto, y eso se
             * ve como una raya oscura que no se va.
             *
             * El plazo es el de esa transición. Se guarda para poder cancelarlo:
             * si empieza otro arrastre antes, la sombra tiene que seguir.
             */
            clearTimeout(cantoRef.current);
            cantoRef.current = setTimeout(() => {
                if (viewportRef.current === node) delete node.dataset.canto;
            }, 260);
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
                // Un gesto nuevo encima de otro que todavía se estaba rematando
                // dejaba el pliegue armado del anterior: el segundo arrastre movía
                // la hoja pero no pasaba página, porque creía que ya la había
                // pasado. Se cierra el anterior antes de empezar.
                if (pliegueArmado.current) {
                    pliegueArmado.current = null;
                    foldRef.current?.disarm();
                }

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
            /**
             * **Arrastrar no depende de la animación elegida.**
             *
             * Lo hacía, y era un fallo de diseño: un libro con «ninguna» guardada
             * —que fue el valor por defecto durante días— se quedaba sin poder
             * arrastrar, sin que nada lo explicara. Desde fuera eso se lee como
             * «el deslizar funciona en unos libros sí y en otros no», que es
             * exactamente lo que se reportó.
             *
             * El arrastre es un gesto, no un efecto. Lo que la animación decide es
             * qué pasa **al soltar**, no si el dedo mueve la página.
             */
            isEnabled: () => flowRef.current !== 'scrolled'
                && !engineRef.current?.selectionText(),
            onMove: setShift,
            onCancel: release,
            onCommit: (direction, impulso) => {
                grabadorGestos.decision(`arrastre:${direction}`);
                if (pliegueRef.current?.activo()) {
                    pliegueRef.current.confirmar();
                    return;
                }
                const armado = pliegueArmado.current;
                if (armado && foldRef.current) {
                    // La página ya cambió al empezar el gesto: aquí solo queda
                    // terminar de doblar la hoja vieja y retirarla.
                    foldRef.current.finish(armado, soltarPliegue);
                    return;
                }

                // Con la sombra lista, la hoja sigue desde donde la dejó el dedo
                // hasta salir: no vuelve a su sitio para luego saltar.
                if (sombraListaRef.current?.(direction)) {
                    turnPage(direction, impulso);
                    return;
                }

                // El dedo ya ha sacado la página de su sitio, así que la
                // animación se salta la fase de salida: repetirla daría un salto
                // hacia atrás antes de completar el gesto.
                release();
                // El impulso viaja hasta la animación: una página soltada de un
                // golpe tiene que salir más rápido que una empujada despacio.
                turnPage(direction, impulso);
            },
        });

        // Los gestos de toque y el arrastre comparten los mismos eventos. El
        // arrastre se evalúa primero y, si ha consumido el gesto, el toque no
        // llega a interpretarse.
        gesturesRef.current.onTapPoint = (punto) => { ultimoToque.current = puntoEnHoja(punto); };
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
                engine.registerDropCapDetection();

                setState('ready');
                setMotor((n) => n + 1);
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

    // ── Números de página de la edición impresa ──────────────────────────────
    //
    // Se calculan una vez por libro, cuando el lector ya está abierto, y se
    // guardan. Un libro sin paginación impresa guarda una lista vacía y usa las
    // páginas sintéticas.
    const [paginasImpresas, setPaginasImpresas] = useState([]);
    const paginasImpresasRef = useRef([]);
    paginasImpresasRef.current = paginasImpresas;
    useEffect(() => {
        if (state !== 'ready' || !engineRef.current) return undefined;
        let vivo = true;
        const clave = `paginas-impresas:${book.id}`;
        ports.storage.getSetting(clave).then(async (guardadas) => {
            if (Array.isArray(guardadas)) {
                if (vivo) setPaginasImpresas(guardadas);
                return;
            }
            const lista = await engineRef.current?.paginacionImpresa?.() || [];
            if (!vivo) return;
            setPaginasImpresas(lista);
            ports.storage.setSetting(clave, lista).catch(() => {});
        }).catch(() => {});
        return () => { vivo = false; };
        // Solo al abrir el libro.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [motor]);

    // ── Páginas sombra ───────────────────────────────────────────────────────
    //
    // Se crean con cada apertura del motor y solo paginando: desplazando no hay
    // páginas que descubrir. En móviles con poca memoria, solo la siguiente,
    // que es la que se usa nueve de cada diez veces.
    const colocarSombras = useCallback(() => {
        const engine = engineRef.current;
        const cfi = engine?.posicionActual?.();
        if (!cfi) return;
        const { next, prev } = sombrasRef.current;
        const colocar = () => {
            next?.colocar(cfi, 1);
            prev?.colocar(cfi, -1);
        };
        // En tiempo muerto: colocar una sombra cuesta lo mismo que pasar una
        // página, y no debe competir con el pintado de la real.
        if (typeof requestIdleCallback === 'function') requestIdleCallback(colocar, { timeout: 600 });
        else setTimeout(colocar, 120);
    }, []);

    const elevarSombra = useCallback((direccion) => {
        const arriba = direccion === 'next' ? sombraSigRef.current : sombraAntRef.current;
        const abajo = direccion === 'next' ? sombraAntRef.current : sombraSigRef.current;
        if (arriba) arriba.style.zIndex = '1';
        if (abajo) abajo.style.zIndex = '0';
    }, []);

    useEffect(() => {
        const engine = engineRef.current;
        if (state !== 'ready' || !engine || typography.flow === 'scrolled') return undefined;

        const pocaMemoria = (globalThis.navigator?.deviceMemory || 4) <= 2;
        const sombras = {
            next: engine.crearSombra?.(sombraSigRef.current) || null,
            prev: pocaMemoria ? null : (engine.crearSombra?.(sombraAntRef.current) || null),
        };
        sombrasRef.current = sombras;

        // Los subrayados también, o aparecerían de golpe al soltar.
        (book.bookmarks || [])
            .filter((marca) => normalizeAnnotationKind(marca) === 'highlight')
            .forEach((marca) => {
                const color = HIGHLIGHT_SWATCHES[marca.color] || HIGHLIGHT_SWATCHES.yellow;
                sombras.next?.marcar(marca.cfi, color, highlightStyle(marca));
                sombras.prev?.marcar(marca.cfi, color, highlightStyle(marca));
            });

        // Se espera al `relocated` de la real: hasta entonces la página nueva no
        // está pintada y volver la hoja enseñaría la vieja.
        const avanzarReal = (direccion) => new Promise((listo) => {
            const quitar = engineRef.current?.onRelocated(() => { quitar?.(); listo(); });
            Promise.resolve(direccion === 'next' ? engineRef.current?.next() : engineRef.current?.prev())
                .catch(() => { quitar?.(); listo(); });
        });

        // El pliegue en la GPU, si el teléfono tiene WebGL.
        const dibujo = lienzoRef.current ? crearDibujoPliegue(lienzoRef.current) : null;
        dibujoRef.current = dibujo;
        setSinWebGL(!dibujo);
        pliegueRef.current = dibujo ? createPliegue({
            dibujo,
            lienzo: lienzoRef.current,
            hoja: () => viewportRef.current,
            avanzar: () => avanzarReal('next'),
            papel: () => paletteRef.current?.bg,
        }) : null;

        hojaRef.current = createHojaReal({
            hoja: () => viewportRef.current,
            avanzar: avanzarReal,
            lista: (direccion) => Boolean(sombrasRef.current[direccion]?.listaPara(engineRef.current?.posicionActual?.())),
            elevar: elevarSombra,
            alTerminar: () => {
                const nodo = viewportRef.current;
                nodo?.classList.remove('dragging', 'releasing');
                if (nodo) delete nodo.dataset.canto;
            },
        });

        colocarSombras();
        return () => {
            sombras.next?.destroy();
            sombras.prev?.destroy();
            sombrasRef.current = { next: null, prev: null };
            hojaRef.current = null;
            dibujo?.destruir();
            dibujoRef.current = null;
            pliegueRef.current = null;
            fotoParaRef.current = null;
        };
        // Las sombras siguen al motor, no al libro: se rehacen cuando él se rehace.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [motor, typography.flow]);

    colocarSombrasRef.current = colocarSombras;

    /** ¿Se puede doblar la hoja en la GPU ahora mismo? Foto y sombra listas para esta página. */
    const pliegueListoRef = useRef(null);
    pliegueListoRef.current = () => {
        const cfi = engineRef.current?.posicionActual?.();
        return Boolean(pliegueRef.current && cfi && fotoParaRef.current === cfi
            && sombrasRef.current.next?.listaPara(cfi));
    };
    // `turnPage` y el arrastre se crean una vez; leen esto por referencia.
    const sombraListaRef = useRef(null);
    sombraListaRef.current = (direccion) => sombraLista(direccion);

    /** ¿Se puede pasar página descubriendo la sombra? */
    const sombraLista = (direccion) => Boolean(
        hojaRef.current
        && (hojaRef.current.ocupada() || sombrasRef.current[direccion]?.listaPara(engineRef.current?.posicionActual?.()))
    );

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

            bordes.current = {
                inicio: Boolean(loc?.atStart),
                fin: Boolean(loc?.atEnd),
            };

            // epub.js ha terminado su papeleo: aquí se cierra el segundo reloj.
            cierreAsentada.current?.();
            cierreAsentada.current = null;

            // El capítulo siguiente se carga por adelantado: es el único
            // momento en que pasar página no es instantáneo, y ocurre siempre
            // en el mismo sitio previsible —el final del capítulo—.
            engine.prefetchNext(cfi);

            // La página ha podido cambiar de forma (otra letra, otro margen):
            // las glosas se recolocan sobre sus palabras.
            repintarGlosasRef.current?.();

            // Y las sombras, una página por delante y otra por detrás de esta.
            colocarSombrasRef.current?.();

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

    /**
     * Cambiar la composición repagina, y repaginar mueve la posición.
     *
     * Por eso el cambio va envuelto: se apunta dónde estabas antes y se vuelve
     * ahí después. Ver `reanchor`. El primer pintado se salta —no hay nada que
     * recuperar y un `display` extra al abrir es tiempo regalado.
     */
    const stylesMontado = useRef(false);

    useEffect(() => {
        if (state !== 'ready') return;
        const engine = engineRef.current;
        if (!engine) return;

        // Las sombras con los mismos estilos: se recolocan solas con el
        // `relocated` que provoca el cambio.
        const { next, prev } = sombrasRef.current;
        next?.estilos(styles);
        prev?.estilos(styles);

        if (!stylesMontado.current) {
            stylesMontado.current = true;
            engine.applyStyles(styles);
            return;
        }

        engine.reanchor(() => engine.applyStyles(styles));
    }, [styles, state]);

    useEffect(() => {
        einkRef.current = eink;
        refreshRef.current.setInterval(eink ? refreshEvery : 0);
    }, [eink, refreshEvery]);

    // Cambiar el margen mueve el contenedor, no el documento: epub.js tiene que
    // volver a medir para recalcular el ancho de columna. Y como eso repagina,
    // también hay que volver a donde estabas.
    useEffect(() => {
        if (state !== 'ready') return;
        const engine = engineRef.current;
        sombrasRef.current.next?.resize();
        sombrasRef.current.prev?.resize();
        engine?.reanchor(() => engine.resize());
    }, [typography.margin, typography.marginTop, typography.marginBottom, state]);

    useEffect(() => {
        if (state !== 'ready') return;
        progressRef.current?.({
            readerPreferences: {
                typography, theme, transition, warm, spread, ruler,
                einkRefresh: refreshEvery,
            },
        });
    }, [typography, theme, transition, warm, spread, ruler, refreshEvery, state]);

    /**
     * La pantalla no se apaga mientras el libro está abierto.
     *
     * El tiempo de apagado del sistema son treinta segundos y está pensado para
     * apps que se tocan. Leyendo no se toca nada: una página larga se lee en más
     * de medio minuto sin mover un dedo, y se apaga a mitad de párrafo.
     *
     * Se suelta al salir del libro, **siempre**, aunque el ajuste esté puesto: el
     * bloqueo es de la lectura, no de la app. Dejar la pantalla encendida en la
     * biblioteca sería gastar batería sin que nada lo explique.
     */
    useEffect(() => {
        const awake = ports.awake;
        if (!awake) return undefined;
        awake.set(preferences.keepAwake !== false).catch(() => {});
        return () => { awake.set(false).catch(() => {}); };
    }, [preferences.keepAwake, ports]);

    // ── Columnas ─────────────────────────────────────────────────────────────

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
            sombrasRef.current.next?.spread(spreadValue(spread), SPREAD_MIN_WIDTH);
            sombrasRef.current.prev?.spread(spreadValue(spread), SPREAD_MIN_WIDTH);
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

    /**
     * Por dónde ibas en otra app (KOReader guarda el porcentaje).
     *
     * Un porcentaje solo se puede convertir en posición con el mapa del libro,
     * así que se espera a tenerlo. Se lee una vez al abrir: el guardado de
     * preferencias del lector lo quita, así que no vuelve a saltar.
     */
    const irAPorcentaje = useRef(book.readerPreferences?.irAPorcentaje || null);
    useEffect(() => {
        if (state !== 'ready' || !locationsReady || !irAPorcentaje.current) return;
        const cfi = engineRef.current?.cfiAtPercent(irAPorcentaje.current);
        irAPorcentaje.current = null;
        if (cfi) jumpTo(cfi);
    }, [state, locationsReady, jumpTo]);

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

    /**
     * El brillo con el pulgar, en el borde izquierdo.
     *
     * De noche el brillo se toca constantemente y los controles están detrás de
     * dos toques, así que la mitad de las veces no se ajusta y se lee incómodo.
     * Ver `brilloGesto.js` para por qué no choca con pasar página.
     */
    useEffect(() => {
        gesturesRef.current.onBrilloEmpieza = () => {
            brilloDesde.current = dimRef.current;
            setAjustandoBrillo(brilloVisible(dimRef.current));
        };

        gesturesRef.current.onBrilloMueve = (dy) => {
            const alto = viewportRef.current?.clientHeight || window.innerHeight;
            const valor = atenuacionDe(brilloDesde.current, dy, alto);
            dimRef.current = valor;
            setDim(valor);
            setAjustandoBrillo(brilloVisible(valor));
        };

        gesturesRef.current.onBrilloTermina = () => {
            // El número se queda un momento y se va solo: mientras el dedo está
            // puesto tapa el texto, y en cuanto se levanta ya no informa de nada.
            setTimeout(() => setAjustandoBrillo(null), 450);
            // Con la adaptación a la luz puesta, el brillo elegido con el dedo
            // es lo que se quiere para esta luz.
            aprenderLuzRef.current?.({ dim: dimRef.current });
        };
    }, []);

    // ── La página se adapta a la luz ─────────────────────────────────────────
    //
    // Ver `confortLuz.js`. Aquí solo se aplica lo que decide: tema, atenuación y
    // filtro cálido, con un aviso que deja deshacerlo. Deshacer y corregir a mano
    // enseñan: lo elegido se guarda para esa situación de luz.
    const [avisoLuz, setAvisoLuz] = useState(null);
    const luzRef = useRef({ nivel: null, base: null, aprendidos: {}, temporizador: 0 });
    const themeRef = useRef(theme);
    themeRef.current = theme;
    const warmRef = useRef(warm);
    warmRef.current = warm;
    const confortActivo = state === 'ready' && preferences.confortLuz === true && !eink && Boolean(ports.luz);

    useEffect(() => {
        if (!confortActivo) return undefined;
        const ctx = luzRef.current;
        ctx.base = { theme: themeRef.current, dim: dimRef.current, warm: warmRef.current };
        ctx.nivel = null;
        ports.storage.getSetting('confort-luz').then((guardado) => {
            ctx.aprendidos = guardado && typeof guardado === 'object' ? guardado : {};
        }).catch(() => {});

        const confort = createConfortLuz({
            alCambiar: (nivel) => {
                ctx.nivel = nivel;
                const previo = { theme: themeRef.current, dim: dimRef.current, warm: warmRef.current };
                const ajustes = ajustesPara(nivel, { base: ctx.base, aprendidos: ctx.aprendidos });
                const igual = ajustes.theme === previo.theme
                    && Math.abs((ajustes.dim ?? 0) - previo.dim) < 0.01
                    && Math.abs((ajustes.warm ?? 0) - previo.warm) < 0.01;
                if (igual) return;

                if (ajustes.theme) setTheme(ajustes.theme);
                setDim(ajustes.dim ?? 0);
                setWarm(ajustes.warm ?? 0);

                clearTimeout(ctx.temporizador);
                setAvisoLuz({
                    texto: describir(nivel, ajustes, (id) => READER_THEMES[id]?.label || id),
                    previo,
                    nivel,
                });
                ctx.temporizador = setTimeout(() => setAvisoLuz(null), 6000);
            },
        });

        let cortar = null;
        let vivo = true;
        ports.luz.escuchar((lux) => confort.leer(lux)).then((fin) => {
            if (vivo) cortar = fin;
            else fin?.();
        });
        return () => {
            vivo = false;
            cortar?.();
            clearTimeout(ctx.temporizador);
        };
        // `ports` no cambia mientras el libro está abierto.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [confortActivo]);

    /** Guarda lo elegido a mano para la situación de luz actual. */
    const aprenderLuz = useCallback((cambio) => {
        const ctx = luzRef.current;
        if (!confortActivo || !ctx.nivel) return;
        const actual = { theme: themeRef.current, dim: dimRef.current, warm: warmRef.current, ...cambio };
        ctx.aprendidos = { ...ctx.aprendidos, [ctx.nivel]: actual };
        if (ctx.nivel === 'interior') ctx.base = actual;
        ports.storage.setSetting('confort-luz', ctx.aprendidos).catch(() => {});
    }, [confortActivo, ports]);

    const aprenderLuzRef = useRef(aprenderLuz);
    aprenderLuzRef.current = aprenderLuz;

    const deshacerLuz = useCallback(() => {
        const aviso = avisoLuz;
        if (!aviso) return;
        setTheme(aviso.previo.theme);
        setDim(aviso.previo.dim);
        setWarm(aviso.previo.warm);
        aprenderLuz(aviso.previo);
        setAvisoLuz(null);
    }, [avisoLuz, aprenderLuz]);

    /**
     * Pellizcar el texto cambia la letra.
     *
     * Mientras los dedos se mueven, la hoja solo se escala; el cuerpo nuevo se
     * aplica al soltar, una vez, por el mismo `setTypography` que usa la hoja de
     * Texto, que ya conserva la frase de arriba al repaginar. Ver `pellizco.js`.
     */
    const [pellizco, setPellizco] = useState(null);
    const typographyRef = useRef(typography);
    typographyRef.current = typography;

    useEffect(() => {
        let base = 18;
        const escalar = (escala) => {
            const node = viewportRef.current;
            if (!node) return;
            node.style.transformOrigin = '50% 40%';
            node.style.transform = escala === 1 ? '' : `scale(${escala})`;
        };

        gesturesRef.current.onPinchStart = () => {
            // Con un pliegue a medias, la hoja que se ve es una copia: escalar
            // debajo de ella no se vería y al soltar cambiaría la letra a ciegas.
            if (pliegueArmado.current) return;
            base = typographyRef.current.fontSize || 18;
            setPellizco({ base, cuerpo: base });
        };

        gesturesRef.current.onPinchMove = (escala) => {
            const cuerpo = cuerpoPorPellizco(base, escala);
            escalar(escalaVisual(base, cuerpo));
            setPellizco((actual) => (actual && actual.cuerpo === cuerpo ? actual : { base, cuerpo }));
        };

        gesturesRef.current.onPinchEnd = (escala) => {
            const cuerpo = cuerpoPorPellizco(base, escala);
            escalar(1);
            if (cuerpo !== base) {
                setTypography((actual) => ({ ...actual, fontSize: cuerpo }));
            }
            // La cifra se queda un instante: es la confirmación de lo que se ha
            // aplicado, y desaparecer a la vez que los dedos no da tiempo a leerla.
            setTimeout(() => setPellizco(null), 600);
        };
    }, []);

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
        sombrasRef.current.next?.marcar(selection.cfiRange, HIGHLIGHT_SWATCHES[color], estiloMarca);
        sombrasRef.current.prev?.marcar(selection.cfiRange, HIGHLIGHT_SWATCHES[color], estiloMarca);
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
        for (const sombra of [sombrasRef.current.next, sombrasRef.current.prev]) {
            sombra?.desmarcar(cfi);
            sombra?.marcar(cfi, HIGHLIGHT_SWATCHES[color], highlightStyle(findAnnotation(annotationsRef.current, cfi)));
        }
        setEditing(null);
    }, [editing, onAnnotationsChange]);

    const deleteAnnotation = useCallback((cfi, kind) => {
        onAnnotationsChange?.(removeAnnotation(annotationsRef.current, cfi, kind));
        if (kind === 'highlight') {
            engineRef.current?.removeHighlight(cfi);
            sombrasRef.current.next?.desmarcar(cfi);
            sombrasRef.current.prev?.desmarcar(cfi);
        }
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
        let cfi;
        if (target.kind === 'pagina') {
            // La página impresa, si el libro la trae; si no, la sintética, que
            // es una cada 1.500 caracteres del mapa de posiciones.
            const impresa = paginasImpresasRef.current.find((p) => String(p.pagina).toLowerCase() === target.value);
            cfi = impresa?.cfi || (/^\d+$/.test(target.value)
                ? engine.cfiAtLocation(localizacionDePagina(Number(target.value)))
                : null);
        } else {
            cfi = target.kind === 'percent'
                ? engine.cfiAtPercent(target.value)
                : engine.cfiAtLocation(target.value);
        }
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

    // ── Personajes y lugares ─────────────────────────────────────────────────
    // `buscado` es el nombre seleccionado con «¿Quién es?»: abre su ficha
    // directamente en vez de la lista.
    const [buscado, setBuscado] = useState(null);
    const preguntarQuien = useCallback((texto) => {
        setBuscado(texto);
        setPanel('personajes');
        engineRef.current?.clearSelection();
        setSelection(null);
    }, []);

    // ── Leer a dos idiomas ───────────────────────────────────────────────────
    //
    // Con «Traducir al tocar» puesto, un toque en el centro de la página pone la
    // traducción del párrafo justo debajo, y otro la quita. Las franjas de
    // arriba y abajo del centro siguen abriendo los controles. La traducción se
    // hace en el teléfono (ver `traducir.js`).
    const ajustesTraduccion = useRef(preferences.traduccion || {});
    ajustesTraduccion.current = preferences.traduccion || {};
    const [traduciendo, setTraduciendo] = useState(null);

    const traducirAqui = useCallback(async (texto) => {
        const engine = engineRef.current;
        const de = idiomaDe(engine?.visibleText() || texto, engine?.bookLanguage());
        return traducirParrafo({ traduccion: ports.traduccion, texto, de, ajustes: ajustesTraduccion.current });
    }, [ports]);

    useEffect(() => {
        gesturesRef.current.onTapTexto = (punto, accion, alto) => {
            if (!ajustesTraduccion.current.activo || accion !== 'chrome' || !alto) return false;
            const fila = punto.y / alto;
            if (fila < 0.18 || fila > 0.82) return false;
            return Boolean(engineRef.current?.alternarTraduccion(punto.x, punto.y, traducirAqui));
        };
    }, [traducirAqui]);

    // ── Ayudas de vocabulario ────────────────────────────────────────────────
    //
    // Encima de las palabras difíciles para el nivel elegido, su traducción. Se
    // calcula por capítulo al montarse, se traduce en el teléfono por tandas y
    // se pinta en una capa que no toca el texto (ver `glosasCapa.js`). La capa
    // se recoloca en cada cambio de página o de letra.
    const ajustesGlosas = useRef(preferences.glosas || {});
    ajustesGlosas.current = preferences.glosas || {};
    const glosasPorDoc = useRef(new Map());
    const [avisoGlosas, setAvisoGlosas] = useState(null);

    const repintarGlosas = useCallback(() => {
        for (const [doc, estado] of glosasPorDoc.current) {
            if (!doc.defaultView) { glosasPorDoc.current.delete(doc); continue; }
            if (estado?.entradas) pintarCapa(doc, estado.entradas, estado.glosas, estado.idioma);
        }
    }, []);

    const procesarGlosas = useCallback(async (doc) => {
        const ajustes = ajustesGlosas.current;
        if (!ajustes.activo || !doc?.body || glosasPorDoc.current.has(doc) || !ports.traduccion) return;
        glosasPorDoc.current.set(doc, null);

        const engine = engineRef.current;
        const de = idiomaDe(textoPropio(doc.body).slice(0, 6000), engine?.bookLanguage());
        const destino = ajustesTraduccion.current.a || DESTINO_POR_DEFECTO();
        if (!de || de === destino) return;
        const conocidas = await cargarConocidas(de, ajustes.nivel || 'b2');
        if (!conocidas) return;

        const elegidas = new Map();
        const yaGlosadas = new Set();
        doc.querySelectorAll('p, li, blockquote').forEach((parrafo) => {
            const palabras = palabrasDificiles(textoPropio(parrafo), conocidas, yaGlosadas, de);
            if (palabras.length) elegidas.set(parrafo, palabras);
        });
        const unicas = [...yaGlosadas];
        if (!unicas.length) return;

        if (!doc.getElementById('sr-glosas-css')) {
            const estilo = doc.createElement('style');
            estilo.id = 'sr-glosas-css';
            estilo.textContent = CSS_GLOSAS;
            doc.head?.appendChild(estilo);
        }

        const estado = { entradas: rangosDe(doc, elegidas), glosas: new Map(), idioma: de };
        glosasPorDoc.current.set(doc, estado);

        // El interlineado extra repagina: se hace conservando la frase de arriba.
        await engine?.reanchor(() => {
            doc.documentElement.classList.add(CLASE_ACTIVA);
            engine.resize();
        });

        // Por tandas: las primeras glosas salen enseguida y no al final de
        // traducir el capítulo entero.
        for (let i = 0; i < unicas.length; i += 40) {
            if (!ajustesGlosas.current.activo || !doc.defaultView) return;
            const tanda = unicas.slice(i, i + 40);
            try {
                const traducidas = await ports.traduccion.traducir(de, destino, tanda, {
                    soloWifi: ajustesTraduccion.current.soloWifi !== false,
                });
                tanda.forEach((palabra, j) => estado.glosas.set(palabra, glosaCorta(traducidas[j])));
            } catch (error) {
                setAvisoGlosas(mensajeDeError(error, de));
                setTimeout(() => setAvisoGlosas(null), 6000);
                return;
            }
            pintarCapa(doc, estado.entradas, estado.glosas, de);
        }
    }, [ports]);

    repintarGlosasRef.current = repintarGlosas;
    const procesarGlosasRef = useRef(procesarGlosas);
    procesarGlosasRef.current = procesarGlosas;
    const glosasRegistradas = useRef(false);
    const nivelPintado = useRef(preferences.glosas?.nivel);

    useEffect(() => {
        if (state !== 'ready' || !engineRef.current) return;
        // Otro nivel: lo pintado ya no vale y se vuelve a calcular.
        if (nivelPintado.current !== preferences.glosas?.nivel) {
            nivelPintado.current = preferences.glosas?.nivel;
            glosasPorDoc.current.forEach((_, doc) => quitarCapa(doc));
            glosasPorDoc.current.clear();
        }
        if (preferences.glosas?.activo) {
            if (!glosasRegistradas.current) {
                glosasRegistradas.current = true;
                engineRef.current.procesarCapitulos((doc) => procesarGlosasRef.current(doc));
            } else {
                engineRef.current.documentos().forEach((doc) => procesarGlosasRef.current(doc));
            }
            return;
        }
        // Apagadas: se quitan de lo que está montado y se recupera el interlineado.
        if (glosasPorDoc.current.size) {
            const docs = [...glosasPorDoc.current.keys()];
            glosasPorDoc.current.clear();
            engineRef.current.reanchor(() => {
                docs.forEach((doc) => quitarCapa(doc));
                engineRef.current?.resize();
            });
        }
    }, [state, preferences.glosas?.activo, preferences.glosas?.nivel]);

    // ── Diccionario e imagen de cita ─────────────────────────────────────────
    const [lookup, setLookup] = useState(null);
    const [lookupFrase, setLookupFrase] = useState('');

    const openDictionary = useCallback((text) => {
        // La frase se toma ahora, mientras la selección aún dice dónde está la
        // palabra: es lo que acompaña a la palabra si se guarda en el vocabulario.
        const cfiRange = selection?.cfiRange;
        setLookupFrase(cfiRange ? fraseConPalabra(engineRef.current?.parrafoDeRango?.(cfiRange), text) : '');
        setLookup(text);
        engineRef.current?.clearSelection();
        setSelection(null);
    }, [selection]);

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
    // ── Hojear: el dedo quieto en el borde pasa páginas solo ─────────────────
    //
    // Cada vez más deprisa —de tres a diez páginas por segundo—, sin animación
    // y con un contador. Al soltar, el salto entra en el historial: «Volver a…»
    // devuelve a donde se empezó. Ver `HOJEAR_MS` en `useGestures.js`.
    const [hojeo, setHojeo] = useState(null);
    const hojeoRef = useRef(null);

    useEffect(() => {
        if (preferences.hojear === false) {
            gesturesRef.current.onHojear = null;
            return undefined;
        }
        gesturesRef.current.onHojear = (fase, direccion) => {
            const engine = engineRef.current;
            if (!engine) return;

            if (fase === 'empieza') {
                const inicio = { cfi: locationRef.current?.cfi, capitulo: locationRef.current?.chapter };
                // Mientras se hojea no se selecciona texto: el dedo quieto
                // encima de un párrafo es lo que el WebView entiende como
                // «seleccionar».
                engine.clearSelection();
                engine.documentos?.().forEach((doc) => { if (doc.body) doc.body.style.userSelect = 'none'; });
                const estado = { direccion, paginas: 0, inicio, capitulo: inicio.capitulo, vivo: true };
                hojeoRef.current = estado;
                setHojeo({ paginas: 0, direccion });

                const paso = async () => {
                    if (!estado.vivo) return;
                    await (direccion === 'next' ? engine.next() : engine.prev());
                    estado.paginas += 1;
                    const capitulo = locationRef.current?.chapter;
                    if (capitulo && capitulo !== estado.capitulo) {
                        estado.capitulo = capitulo;
                        Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
                    }
                    setHojeo({ paginas: estado.paginas, direccion });
                    // De 330 ms a 100 ms: se acelera durante el primer segundo y medio.
                    const espera = Math.max(100, 330 - estado.paginas * 18);
                    estado.temporizador = setTimeout(paso, espera);
                };
                paso();
                return;
            }

            const estado = hojeoRef.current;
            if (!estado) return;
            estado.vivo = false;
            clearTimeout(estado.temporizador);
            hojeoRef.current = null;
            engine.documentos?.().forEach((doc) => { if (doc.body) doc.body.style.userSelect = ''; });
            // El salto se puede deshacer, como cualquier otro.
            if (estado.paginas > 0 && estado.inicio.cfi) {
                history.push({ cfi: estado.inicio.cfi, label: estado.inicio.capitulo || 'donde estabas' });
            }
            setTimeout(() => setHojeo(null), 500);
        };
        return undefined;
    }, [preferences.hojear, history]);

    // ── Modo una mano: se ofrece si casi todos los toques caen en un lado ──────
    const ladosRef = useRef({ izquierda: 0, derecha: 0 });
    const [sugerenciaMano, setSugerenciaMano] = useState(null);

    useEffect(() => {
        gesturesRef.current.grid = grid;
        gesturesRef.current.onAction = (action) => {
            if ((action === 'next' || action === 'prev') && !preferences.unaManoSugerida
                && presetDe(grid) === 'normal' && ultimoToque.current) {
                const ancho = viewportRef.current?.clientWidth || 1;
                ladosRef.current[ultimoToque.current.x < ancho / 2 ? 'izquierda' : 'derecha'] += 1;
                const propuesta = sugerirUnaMano(ladosRef.current);
                if (propuesta) setSugerenciaMano(propuesta);
            }
            grabadorGestos.decision(action);
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
    }, [grid, toggleBookmark, speech, history.canGoBack, goBack, preferences.unaManoSugerida]);

    /**
     * Pasa un punto de la ventana a coordenadas de la hoja.
     *
     * El dedo llega en coordenadas de pantalla y el pliegue se dibuja dentro del
     * contenedor del lector, que tiene sus márgenes. Sin esta traducción la
     * esquina se doblaría desplazada respecto al dedo, que es justo lo que mata
     * la sensación de estar tocando papel.
     */
    const puntoEnHoja = useCallback((punto) => {
        const caja = viewportRef.current?.getBoundingClientRect();
        if (!caja || !punto) return { x: 0, y: 0 };
        return { x: punto.x - caja.left, y: punto.y - caja.top };
    }, []);

    /**
     * Tapa la pantalla con la página que se va y cambia de página por debajo.
     *
     * **Sin esto el pliegue no puede funcionar.** epub.js monta un solo
     * documento: hasta que el giro se confirma, no existe la página siguiente en
     * ninguna parte. Así que al levantar la hoja aparecía debajo la misma página
     * que encima, media al derecho y media al revés — que es el desastre que se
     * veía.
     *
     * La copia plana, sin doblar, ocupa la hoja entera y es idéntica a lo que ya
     * había. Con la pantalla tapada se cambia de página de verdad, y al mover el
     * dedo la hoja se levanta y deja ver la nueva, que es lo que hace Moon+.
     *
     * Si el gesto se cancela se deshace igual de tapado, así que tampoco se ve.
     */
    const armarPliegue = useCallback((direction, punto) => {
        const engine = engineRef.current;
        const fold = foldRef.current;
        if (!engine || !fold || pliegueArmado.current) return false;

        fold.arm(direction, punto);
        pliegueArmado.current = direction;
        Promise.resolve(direction === 'next' ? engine.next() : engine.prev()).catch(() => {});
        return true;
    }, []);

    /** Destapa la pantalla y vuelve a dejar el pliegue listo para el siguiente. */
    const soltarPliegue = useCallback(() => {
        pliegueArmado.current = null;
        foldRef.current?.disarm();
        prepararTrasGesto.current?.();
    }, []);

    const prepararTrasGesto = useRef(null);

    // Los puertos, por referencia: `prepareFold` se crea una sola vez y no debe
    // volver a crearse porque cambie el objeto de puertos.
    const portsRef = useRef(ports);
    portsRef.current = ports;

    /**
     * Prepara las copias del capítulo con las que se dobla la página.
     *
     * Se hace en tiempo muerto —tras asentarse la página— y con `requestIdleCallback`
     * cuando existe, para no competir con el pintado del capítulo nuevo.
     */
    const prepareFold = useCallback(() => {
        const engine = engineRef.current;
        if (!engine) return;

        // A mitad de gesto, no. Las copias llevan la página que se está doblando
        // y rehacerlas ahora las pondría a enseñar la nueva: la hoja levantada
        // cambiaría de contenido en la mano.
        if (pliegueArmado.current) return;

        const run = async () => {
            const sheet = engine.chapterSheet?.();

            /**
             * La foto de la página, si el teléfono sabe hacerla.
             *
             * Se pide **aquí**, en tiempo muerto y con la página ya asentada, no
             * al empezar el gesto: dibujar la vista y comprimirla cuesta decenas
             * de milisegundos y dentro del arrastre eso es un tirón que se ve.
             *
             * Con foto, la hoja que se dobla lleva sus ilustraciones. Sin ella
             * —en el navegador, o si la captura falla— se sigue usando la copia
             * de HTML, que es la que perdía las imágenes. Ver `PageCapture.js`.
             */
            const foto = await Promise.resolve(portsRef.current?.capture?.take?.())
                .catch(() => null);

            // Entre pedir la foto y recibirla puede haberse empezado un gesto: la
            // hoja levantada lleva la página anterior y cambiarla ahora la haría
            // mudar de contenido en la mano.
            if (pliegueArmado.current) return;

            if (foto?.image) {
                const caja = viewportRef.current?.getBoundingClientRect?.();

                // El pliegue en la GPU usa la misma foto como textura. Se apunta
                // para qué página es: con la foto de otra página, mejor no doblar.
                const dibujo = dibujoRef.current;
                const cfi = engine.posicionActual?.();
                if (dibujo && caja && foto.width && foto.height) {
                    const ratio = window.devicePixelRatio || 1;
                    const recorte = [
                        (caja.left * ratio) / foto.width,
                        (caja.top * ratio) / foto.height,
                        (caja.width * ratio) / foto.width,
                        (caja.height * ratio) / foto.height,
                    ];
                    dibujo.cargar(foto.image, recorte)
                        .then(() => { fotoParaRef.current = cfi; })
                        .catch(() => { fotoParaRef.current = null; });
                }

                setFoldSheet({
                    ...(sheet || {}),
                    image: foto.image,
                    imageWidth: foto.width,
                    imageHeight: foto.height,
                    // La foto es de la pantalla entera; la hoja es un trozo de
                    // ella. Esto es dónde empieza ese trozo.
                    imageOffsetX: Math.round(caja?.left || 0),
                    imageOffsetY: Math.round(caja?.top || 0),
                });
                return;
            }

            if (sheet?.html) setFoldSheet(sheet);
        };

        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(run, { timeout: 900 });
        } else {
            setTimeout(run, 220);
        }
    }, []);

    // `soltarPliegue` se define antes que `prepareFold` y necesita llamarlo: se
    // enlazan por referencia para no tener que reordenar medio componente.
    prepararTrasGesto.current = prepareFold;

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

    /**
     * El número de página estable: el de la edición impresa si el libro lo
     * trae, o uno sintético por texto. Ver `paginasLibro.js`.
     */
    const paginaEstable = paginasImpresas.length
        ? paginaImpresa(paginasImpresas, location.cfi, (a, b) => engineRef.current?.compararPosiciones?.(a, b) ?? 0)
        : (locationsReady ? paginaSintetica(currentLocationIndex, totalLocations) : null);

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
                '--reader-margin-top': `${typography.marginTop ?? 28}px`,
                '--reader-margin-bottom': `${typography.marginBottom ?? 34}px`,
                ...chromeVars,
            }}
        >
            {state === 'loading' && (
                <Loading kind="reader" label={`Abriendo ${book.name}`} />
            )}

            {/* Las páginas sombra: la siguiente y la anterior, ya pintadas,
                detrás de la real. Ver `hojaReal.js`. Van antes en el DOM y con
                la misma geometría, así que la real las tapa hasta que se mueve. */}
            {typography.flow !== 'scrolled' && (
                <>
                    <div
                        className={`reader-viewport sombra${columns === 2 ? ' two-columns' : ''}`}
                        ref={sombraSigRef}
                        aria-hidden="true"
                    />
                    <div
                        className={`reader-viewport sombra${columns === 2 ? ' two-columns' : ''}`}
                        ref={sombraAntRef}
                        aria-hidden="true"
                    />
                </>
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
            {/* El pliegue en la GPU: encima de la página real y de las sombras,
                debajo del grano del papel. Oculto hasta que se dobla. */}
            {typography.flow !== 'scrolled' && (
                <canvas className="pliegue-gl" ref={lienzoRef} hidden aria-hidden="true" />
            )}

            {/* El pliegue anterior, solo donde no hay WebGL. */}
            {foldSheet && sinWebGL && (
                <PageFold
                    sheet={foldSheet}
                    width={viewportRef.current?.clientWidth || 0}
                    height={viewportRef.current?.clientHeight || 0}
                    controllerRef={foldRef}
                    tinte={palette.bg}
                    onStuck={() => {
                        // El pliegue se destapó solo. La página de verdad ya es la
                        // siguiente —se cambió al armar—, así que aquí solo hay que
                        // dejar de creer que hay un gesto en marcha.
                        pliegueArmado.current = null;
                        prepareFold();
                    }}
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

            {/* Lo que se está ajustando, mientras se ajusta. Sin esto el gesto es
                adivinar: se ve que la pantalla cambia pero no cuánto ni si va a
                llegar donde quieres. */}
            {ajustandoBrillo !== null && (
                <div className="brillo-aviso" role="status">
                    <span className="brillo-cifra">{ajustandoBrillo}</span>
                    <span className="brillo-barra"><i style={{ height: `${ajustandoBrillo}%` }} /></span>
                </div>
            )}
            {!eink && warm > 0 && <div className="reader-warm" style={{ opacity: warm }} aria-hidden="true" />}

            {hojeo && (
                <div className="hojeo-aviso" role="status">
                    <b>{hojeo.direccion === 'next' ? '+' : '−'}{hojeo.paginas}</b>
                    <span>{location.chapter || ' '}</span>
                    <small>suelta para quedarte</small>
                </div>
            )}

            {sugerenciaMano && (
                <div className="mano-aviso" role="dialog" aria-label="Modo una mano">
                    <span className="mano-texto">
                        Pasas página casi siempre por la {sugerenciaMano === 'diestro' ? 'derecha' : 'izquierda'}.
                        ¿Probar el modo una mano? Volver atrás quedará en la esquina del pulgar.
                    </span>
                    <span className="mano-botones">
                        <button
                            type="button"
                            className="btn"
                            onClick={() => {
                                setSugerenciaMano(null);
                                onPreferencesChange?.({ unaManoSugerida: true });
                            }}
                        >
                            No, gracias
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => {
                                const nueva = [...PRESETS_GRID[sugerenciaMano]];
                                setGrid(nueva);
                                setSugerenciaMano(null);
                                onPreferencesChange?.({ gestureGrid: nueva, unaManoSugerida: true });
                            }}
                        >
                            Probar
                        </button>
                    </span>
                </div>
            )}

            {avisoGlosas && (
                <div className="luz-aviso" role="status">
                    <span className="luz-texto">{avisoGlosas}</span>
                </div>
            )}

            {avisoLuz && (
                <div className="luz-aviso" role="status">
                    <span className="luz-punto" aria-hidden="true" />
                    <span className="luz-texto">{avisoLuz.texto}</span>
                    <button type="button" className="luz-deshacer" onClick={deshacerLuz}>Deshacer</button>
                </div>
            )}

            {pellizco && (
                <div className="pellizco-aviso" role="status">
                    <b>{pellizco.cuerpo}</b>
                    {pellizco.cuerpo !== pellizco.base && <span>antes {pellizco.base}</span>}
                </div>
            )}


            {ruler !== 'off' && state === 'ready' && (
                <ReadingRuler
                    mode={ruler}
                    typography={typography}
                    onClose={() => setRuler('off')}
                />
            )}

            {/**
              * El aviso del mapa solo aparece con la barra de herramientas
              * abierta.
              *
              * Antes salía de abajo a mitad de lectura, encima del texto, y no
              * había forma de entender qué estaba cargando ni por qué justo
              * entonces. Lo que se está calculando es el porcentaje del libro, y
              * eso solo importa cuando miras los controles: mientras lees, la
              * línea de estado ya dice por dónde vas dentro del capítulo.
              */}
            {chrome && mapStatusView.visible && (
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
                        {paginaEstable ? (
                            <span>pág. {paginaEstable.pagina}</span>
                        ) : location.page > 0 && (
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
                {/* Quién es quién, sin destripes. Va con lo que sitúa en el
                    libro: es la pregunta de «¿dónde estoy?» aplicada a la gente. */}
                <button
                    type="button"
                    className="icon-btn"
                    onClick={() => { setBuscado(null); setPanel('personajes'); }}
                    aria-label="Personajes y lugares"
                >
                    <IconPeople size={21} />
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
                            {paginaEstable
                                ? `Página ${paginaEstable.pagina} de ${paginaEstable.total}${paginasImpresas.length ? ' · edición impresa' : ''}`
                                : totalLocations > 0
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

            {panel === 'personajes' && (
                <PersonajesSheet
                    book={book}
                    engine={engineRef.current}
                    location={location}
                    toc={toc}
                    buscado={buscado}
                    onJump={(destino) => { setBuscado(null); jumpTo(destino); }}
                    onClose={() => { setBuscado(null); setPanel(null); }}
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
                    onResumen={() => setPanel('resumen')}
                    onClose={() => setPanel(null)}
                />
            )}

            {panel === 'resumen' && (
                <ResumenSheet
                    book={book}
                    engine={engineRef.current}
                    location={location}
                    toc={toc}
                    preferencias={preferences}
                    onClose={() => setPanel(null)}
                />
            )}

            {panel === 'display' && (
                <DisplaySheet
                    theme={theme}
                    onChangeTheme={(valor) => { setTheme(valor); aprenderLuz({ theme: valor }); }}
                    dim={dim}
                    onChangeDim={(valor) => { setDim(valor); aprenderLuz({ dim: valor }); }}
                    warm={warm}
                    onChangeWarm={(valor) => { setWarm(valor); aprenderLuz({ warm: valor }); }}
                    flow={typography.flow}
                    onChangeFlow={(flow) => setTypography({ ...typography, flow })}
                    transition={transition}
                    onChangeTransition={setTransition}
                    spread={spread}
                    onChangeSpread={setSpread}
                    columns={columns}
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

            {traduciendo && (
                <TraduccionSheet texto={traduciendo} traducir={traducirAqui} onClose={() => setTraduciendo(null)} />
            )}

            {lookup && (
                <DictionarySheet word={lookup} frase={lookupFrase} book={book} onClose={() => setLookup(null)} />
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
                    onWho={preguntarQuien}
                    onTranslate={ports.traduccion ? (texto) => {
                        setTraduciendo(texto);
                        engineRef.current?.clearSelection();
                        setSelection(null);
                    } : undefined}
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

            {posicionRemota && state === 'ready' && (
                <PosicionRemotaSheet
                    posicion={posicionRemota}
                    donde={engineRef.current?.chapterLabel(posicionRemota.cfi, toc) || ''}
                    onIr={() => {
                        // Es un salto deliberado: entra en el historial y se
                        // puede deshacer con «Volver a…».
                        jumpTo(posicionRemota.cfi);
                        onPosicionRemotaVista?.();
                    }}
                    onQuedarse={() => onPosicionRemotaVista?.()}
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
