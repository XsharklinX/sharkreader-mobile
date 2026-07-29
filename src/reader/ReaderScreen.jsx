import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createEpubEngine } from './EpubEngine.js';
import { createGestureHandlers } from './useGestures.js';
import { buildReaderStyles, DEFAULT_TYPOGRAPHY, READER_THEMES } from './typography.js';
import ReaderSettingsSheet from './ReaderSettingsSheet.jsx';
import DisplaySheet from './DisplaySheet.jsx';
import { runTransition, DEFAULT_TRANSITION } from './transitions.js';
import { buildFontFaceCss } from './fontLoader.js';
import { useHistory } from './useHistory.js';
import FootnoteSheet from './FootnoteSheet.jsx';
import ImageViewer from './ImageViewer.jsx';
import { createPageDrag } from './pageDrag.js';
import TocDrawer from './TocDrawer.jsx';
import SelectionToolbar from './SelectionToolbar.jsx';
import AnnotationsPanel from './AnnotationsPanel.jsx';
import DimZone from './DimZone.jsx';
import SpeechBar from './SpeechBar.jsx';
import { useSpeech } from './useSpeech.js';
import { useAutoScroll } from './useAutoScroll.js';
import DictionarySheet from './DictionarySheet.jsx';
import { renderQuoteImage } from './quoteImage.js';
import { shareImage } from '../library/backup.js';
import {
    createHighlight, createBookmark, addAnnotation, removeAnnotation, HIGHLIGHT_SWATCHES,
} from './annotations.js';
import { normalizeAnnotationKind } from '../core/annotationExport.js';
import { readBookBlob } from '../adapters/SafPicker.js';
import { usePorts } from '../ports/index.js';
import { formatMinutes } from '../stats/derive.js';
import {
    IconArrowLeft, IconTextSize, IconList, IconBookmark, IconHighlight, IconSearch,
    IconVolume, IconClock, IconSun,
} from '../ui/icons.jsx';

const LOCATIONS_KEY = (bookId) => `locations:${bookId}`;

/** Minutos restantes estimados con el ritmo real de este libro. */
const estimateLeft = (book, progress) => {
    const minutes = book.readingMinutes || 0;
    if (minutes < 5 || progress < 0.04) return null;
    const left = Math.round(minutes / progress - minutes);
    return left > 0 ? left : null;
};

export default function ReaderScreen({ book, onClose, onProgress, onAnnotationsChange, onExportAnnotations, preferences = {} }) {
    const ports = usePorts();
    const viewportRef = useRef(null);
    const engineRef = useRef(null);

    const [state, setState] = useState('loading');
    const [error, setError] = useState(null);
    const [chrome, setChrome] = useState(false);
    const [panel, setPanel] = useState(null);
    const [selection, setSelection] = useState(null);
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

    const [typography, setTypography] = useState(
        () => ({ ...DEFAULT_TYPOGRAPHY, ...(book.readerPreferences?.typography || {}) })
    );
    const [theme, setTheme] = useState(book.readerPreferences?.theme || 'dark');
    const [transition, setTransition] = useState(book.readerPreferences?.transition || DEFAULT_TRANSITION);

    const styles = useMemo(() => buildReaderStyles(typography, theme), [typography, theme]);
    const palette = READER_THEMES[theme] || READER_THEMES.dark;

    const progressRef = useRef(onProgress);
    progressRef.current = onProgress;

    // Los gestos se crean una sola vez: el hook de contenido de epub.js los
    // registra durante la carga, antes de cualquier render posterior.
    const gesturesRef = useRef(null);
    if (!gesturesRef.current) {
        gesturesRef.current = createGestureHandlers({
            onNext: () => turnPage('next'),
            onPrev: () => turnPage('prev'),
            onToggleChrome: () => setChrome((visible) => !visible),
            shouldIgnore: () => Boolean(engineRef.current?.selectionText()),
            getWidth: () => viewportRef.current?.clientWidth || window.innerWidth,
        });
    }

    /**
     * Pasa página con su animación. La transición va en el contenedor y no
     * dentro del iframe: epub.js repinta el iframe entero al cambiar de página,
     * así que animar su contenido daría un parpadeo.
     */
    const transitionRef = useRef(transition);
    transitionRef.current = transition;
    const cleanupRef = useRef(null);

    const turnPage = (direction) => {
        const engine = engineRef.current;
        if (!engine) return;
        cleanupRef.current?.();
        cleanupRef.current = runTransition(viewportRef.current, transitionRef.current, direction);
        if (direction === 'next') engine.next();
        else engine.prev();
    };

    /**
     * Arrastre de página: la hoja sigue al dedo y vuelve si sueltas antes del
     * umbral. Se desactiva con la animación «ninguna», que es la opción para
     * dispositivos donde 60 fps no es realista.
     */
    const dragRef = useRef(null);
    if (!dragRef.current) {
        const setShift = (shift) => {
            const node = viewportRef.current;
            if (!node) return;
            node.classList.add('dragging');
            node.classList.remove('releasing');
            node.style.transform = `translateX(${shift}px)`;
        };

        const release = () => {
            const node = viewportRef.current;
            if (!node) return;
            node.classList.remove('dragging');
            node.classList.add('releasing');
            node.style.transform = '';
        };

        dragRef.current = createPageDrag({
            getWidth: () => viewportRef.current?.clientWidth || window.innerWidth,
            isEnabled: () => transitionRef.current !== 'none'
                && !engineRef.current?.selectionText(),
            onMove: setShift,
            onCancel: release,
            onCommit: (direction) => {
                release();
                if (direction === 'next') engineRef.current?.next();
                else engineRef.current?.prev();
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

        const load = async () => {
            try {
                const blob = await readBookBlob(book.sourcePath);
                const data = await blob.arrayBuffer();
                if (cancelled) return;

                const savedLocations = await ports.storage.getSetting(LOCATIONS_KEY(book.id));

                // Las fuentes se preparan antes de abrir: el hook de contenido
                // debe estar registrado cuando epub.js monte el primer capítulo,
                // igual que los gestos.
                const fontCss = await buildFontFaceCss().catch(() => '');
                if (cancelled) return;

                const result = await engine.open(data, viewportRef.current, {
                    fontCss,
                    hyphenLang: typography.hyphenLang,
                    styles,
                    savedLocations,
                    startCfi: book.lastLocation || undefined,
                    gestureHandlers: gesturesRef.current,
                    flow: typography.flow,
                });
                if (cancelled) return;

                setToc(result.toc);
                if (result.generatedLocations) {
                    ports.storage.setSetting(LOCATIONS_KEY(book.id), result.generatedLocations).catch(() => {});
                }

                // Los subrayados son overlays de epub.js: no viven en el EPUB y
                // hay que volver a pintarlos en cada apertura.
                (book.bookmarks || [])
                    .filter((bookmark) => normalizeAnnotationKind(bookmark) === 'highlight')
                    .forEach((bookmark) => engine.addHighlight(
                        bookmark.cfi,
                        HIGHLIGHT_SWATCHES[bookmark.color] || HIGHLIGHT_SWATCHES.yellow,
                        () => setPanel('annotations')
                    ));

                engine.onSelected((cfiRange) => {
                    const text = engine.selectionText();
                    if (text) setSelection({ cfiRange, text });
                });

                engine.registerFootnotes(setFootnote);
                engine.registerImages(setImage);

                setState('ready');
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [book.id, typography.flow, typography.hyphenLang]);

    // ── Posición ─────────────────────────────────────────────────────────────
    useEffect(() => {
        const engine = engineRef.current;
        if (!engine || state !== 'ready') return undefined;

        return engine.onRelocated((loc) => {
            const cfi = loc?.start?.cfi;
            if (!cfi) return;
            const progress = engine.progressFromCfi(cfi);
            const page = loc?.start?.displayed?.page || 0;
            const total = loc?.start?.displayed?.total || 0;

            setLocation({
                cfi,
                progress,
                chapter: engine.chapterLabel(cfi, toc),
                chapterProgress: total > 0 ? page / total : 0,
                page,
                totalPages: total,
            });
            progressRef.current?.({ cfi, progress });
        });
    }, [state, toc]);

    useEffect(() => {
        if (state === 'ready') engineRef.current?.applyStyles(styles);
    }, [styles, state]);

    // Cambiar el margen mueve el contenedor, no el documento: epub.js tiene que
    // volver a medir para recalcular el ancho de columna.
    useEffect(() => {
        if (state === 'ready') engineRef.current?.resize();
    }, [typography.margin, state]);

    useEffect(() => {
        if (state !== 'ready') return;
        progressRef.current?.({ readerPreferences: { typography, theme, transition, warm } });
    }, [typography, theme, transition, warm, state]);

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
    const speech = useSpeech({
        title: book.name,
        chapter: location.chapter,
        // Lee solo lo visible, no el capítulo entero: si no, la voz seguiría
        // leyendo contenido de páginas que el usuario aún no tiene delante.
        getPageText: useCallback(() => engineRef.current?.visibleText() || '', []),
        onSentence: useCallback((sentence) => {
            engineRef.current?.highlightSpoken(sentence);
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

    const highlightSelection = useCallback((color, comment) => {
        if (!selection) return;
        const annotation = createHighlight({ cfi: selection.cfiRange, text: selection.text, color, comment });
        onAnnotationsChange?.(addAnnotation(annotationsRef.current, annotation));
        engineRef.current?.addHighlight(selection.cfiRange, HIGHLIGHT_SWATCHES[color], () => setPanel('annotations'));
        engineRef.current?.clearSelection();
        setSelection(null);
    }, [selection, onAnnotationsChange]);

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

    // ── Avance automático y teclas de volumen ────────────────────────────────
    const autoScroll = useAutoScroll({
        onNext: () => engineRef.current?.next(),
        onPrev: () => engineRef.current?.prev(),
        // La captura de teclas de volumen se desactiva si el usuario la apagó
        // en ajustes: un interruptor que no hace nada es peor que no ofrecerlo.
        enabled: state === 'ready' && (preferences.volumeKeys ?? true),
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
    const leftInBook = estimateLeft(book, location.progress);
    const annotationCount = annotationsRef.current.length;

    // La interfaz del lector se adapta al tema de lectura: en sepia o papel una
    // barra oscura encima del texto claro sería un golpe visual.
    const chromeVars = palette.ui === 'light'
        ? { '--chrome-bg': 'rgba(255,255,255,.94)', '--chrome-text': '#1A1A1A' }
        : { '--chrome-bg': 'rgba(18,23,29,.94)', '--chrome-text': '#F2F6F9' };

    return (
        <div
            className="reader"
            style={{
                '--reader-bg': palette.bg,
                '--reader-text': palette.text,
                '--reader-margin': `${typography.margin}px`,
                ...chromeVars,
            }}
        >
            {state === 'loading' && (
                <div className="reader-loading">
                    <span className="empty-art">📖</span>
                    <p className="empty-body">Abriendo {book.name}…</p>
                </div>
            )}

            {/* Los gestos van dentro del iframe (registerContentHooks), no en una
                capa por encima: así el toque navega y la pulsación larga puede
                seleccionar texto para subrayar. */}
            <div
                className={`reader-viewport${typography.flow === 'scrolled' ? ' scrolled' : ''}`}
                ref={viewportRef}
            />

            {dim > 0 && <div className="reader-dim" style={{ opacity: dim }} aria-hidden="true" />}
            {warm > 0 && <div className="reader-warm" style={{ opacity: warm }} aria-hidden="true" />}

            <DimZone value={dim} onChange={setDim} />

            {!chrome && location.page > 0 && !history.canGoBack && (
                <span className="page-chip">{location.page} / {location.totalPages}</span>
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
                <div className="reader-title">
                    <span className="reader-book">{book.name}</span>
                    {location.chapter && <span className="reader-chapter">{location.chapter}</span>}
                </div>
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

            <footer className={`reader-bottom${chrome ? '' : ' hidden'}`}>
                {/* Una sola pista con las dos lecturas superpuestas: el avance
                    del libro en gris de fondo y el del capítulo en acento
                    encima. Dos barras apiladas ocupaban el doble para decir
                    casi lo mismo. */}
                <div className="prog">
                    <div className="prog-row">
                        <span className="prog-chapter">
                            {location.chapter || 'Capítulo'}
                        </span>
                        <span className="prog-left mono">
                            {leftInBook ? `quedan ${formatMinutes(leftInBook)}` : `${percent}%`}
                        </span>
                    </div>
                    {/* Arrastrable: recorrer el libro sin pasar por el índice.
                        Mientras se arrastra se muestra el capítulo de destino,
                        para poder soltar sabiendo a dónde vas. */}
                    <div className="prog-track">
                        <span className="prog-book" style={{ width: `${scrubAt ?? percent}%` }} />
                        <span className="prog-chap" style={{ width: `${scrubAt === null ? chapterPercent : 0}%` }} />
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
                            aria-label="Ir a una posición del libro"
                        />
                    </div>

                    {scrubAt !== null && (
                        <div className="scrub-preview">
                            <b>{Math.round(scrubAt)}%</b>
                            <span>{scrubChapter || 'del libro'}</span>
                        </div>
                    )}
                    <div className="prog-row prog-sub">
                        <span className="mono">cap. {chapterPercent}%</span>
                        <span className="mono">libro {percent}%</span>
                    </div>
                </div>

                <div className="reader-tools">
                    <button type="button" className="tool" onClick={() => setPanel('settings')} aria-label="Texto">
                        <IconTextSize size={21} />
                        <span>Texto</span>
                    </button>
                    <button type="button" className="tool" onClick={() => setPanel('display')} aria-label="Pantalla y lectura">
                        <IconSun size={21} />
                        <span>Pantalla</span>
                    </button>
                    <button type="button" className="tool" onClick={() => setPanel('toc')} aria-label="Índice">
                        <IconList size={21} />
                        <span>Índice</span>
                    </button>
                    <button
                        type="button"
                        className={`tool${annotationCount ? ' on' : ''}`}
                        onClick={() => setPanel('annotations')}
                        aria-label={`Notas (${annotationCount})`}
                    >
                        <IconHighlight size={21} />
                        <span>Notas{annotationCount > 0 ? ` ${annotationCount}` : ''}</span>
                    </button>
                    <button
                        type="button"
                        className={`tool${speech.isSpeaking ? ' on' : ''}`}
                        onClick={speech.toggle}
                        disabled={!speech.supported}
                        aria-label="Leer en voz alta"
                    >
                        <IconVolume size={21} />
                        <span>Voz</span>
                    </button>
                </div>
            </footer>

            {speech.state !== 'idle' && (
                <SpeechBar speech={speech} onClose={speech.stop} />
            )}

            {(panel === 'toc' || panel === 'search') && (
                <TocDrawer
                    toc={toc}
                    initialTab={panel === 'search' ? 'search' : 'toc'}
                    currentChapter={location.chapter}
                    onSelect={jumpTo}
                    onClose={() => setPanel(null)}
                    onSearch={(query) => engineRef.current?.search(query)}
                />
            )}

            {panel === 'display' && (
                <DisplaySheet
                    theme={theme}
                    onChangeTheme={setTheme}
                    flow={typography.flow}
                    onChangeFlow={(flow) => setTypography({ ...typography, flow })}
                    transition={transition}
                    onChangeTransition={setTransition}
                    dim={dim}
                    onChangeDim={setDim}
                    warm={warm}
                    onChangeWarm={setWarm}
                    transitionMode={transition}
                    autoScroll={autoScroll}
                    onClose={() => setPanel(null)}
                />
            )}

            {panel === 'settings' && (
                <ReaderSettingsSheet
                    typography={typography}
                    onChangeTypography={setTypography}
                    onClose={() => setPanel(null)}
                />
            )}

            {panel === 'annotations' && (
                <AnnotationsPanel
                    bookmarks={annotationsRef.current}
                    onJump={jumpTo}
                    onDelete={deleteAnnotation}
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
                />
            )}
        </div>
    );
}
