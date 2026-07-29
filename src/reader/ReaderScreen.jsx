import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createEpubEngine } from './EpubEngine.js';
import { createGestureHandlers } from './useGestures.js';
import { buildReaderStyles, DEFAULT_TYPOGRAPHY, READER_THEMES } from './typography.js';
import ReaderSettingsSheet from './ReaderSettingsSheet.jsx';
import TocDrawer from './TocDrawer.jsx';
import SelectionToolbar from './SelectionToolbar.jsx';
import AnnotationsPanel from './AnnotationsPanel.jsx';
import DimZone from './DimZone.jsx';
import SpeechBar from './SpeechBar.jsx';
import { useSpeech } from './useSpeech.js';
import {
    createHighlight, createBookmark, addAnnotation, removeAnnotation, HIGHLIGHT_SWATCHES,
} from './annotations.js';
import { normalizeAnnotationKind } from '../core/annotationExport.js';
import { readBookBlob } from '../adapters/SafPicker.js';
import { usePorts } from '../ports/index.js';
import { formatMinutes } from '../stats/derive.js';
import {
    IconArrowLeft, IconTextSize, IconList, IconBookmark, IconHighlight, IconSearch, IconVolume,
} from '../ui/icons.jsx';

const LOCATIONS_KEY = (bookId) => `locations:${bookId}`;

/** Minutos restantes estimados con el ritmo real de este libro. */
const estimateLeft = (book, progress) => {
    const minutes = book.readingMinutes || 0;
    if (minutes < 5 || progress < 0.04) return null;
    const left = Math.round(minutes / progress - minutes);
    return left > 0 ? left : null;
};

export default function ReaderScreen({ book, onClose, onProgress, onAnnotationsChange, onExportAnnotations }) {
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

    const styles = useMemo(() => buildReaderStyles(typography, theme), [typography, theme]);
    const palette = READER_THEMES[theme] || READER_THEMES.dark;

    const progressRef = useRef(onProgress);
    progressRef.current = onProgress;

    // Los gestos se crean una sola vez: el hook de contenido de epub.js los
    // registra durante la carga, antes de cualquier render posterior.
    const gesturesRef = useRef(null);
    if (!gesturesRef.current) {
        gesturesRef.current = createGestureHandlers({
            onNext: () => engineRef.current?.next(),
            onPrev: () => engineRef.current?.prev(),
            onToggleChrome: () => setChrome((visible) => !visible),
            shouldIgnore: () => Boolean(engineRef.current?.selectionText()),
            getWidth: () => viewportRef.current?.clientWidth || window.innerWidth,
        });
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

                const result = await engine.open(data, viewportRef.current, {
                    styles,
                    savedLocations,
                    startCfi: book.lastLocation || undefined,
                    gestureHandlers: gesturesRef.current,
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
    }, [book.id]);

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
        progressRef.current?.({ readerPreferences: { typography, theme } });
    }, [typography, theme, state]);

    const jumpTo = useCallback((target) => {
        engineRef.current?.display(target);
        setPanel(null);
    }, []);

    // ── Lectura en voz alta ──────────────────────────────────────────────────
    const speech = useSpeech({
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
            <div className="reader-viewport" ref={viewportRef} />

            {dim > 0 && <div className="reader-dim" style={{ opacity: dim }} aria-hidden="true" />}

            <DimZone value={dim} onChange={setDim} />

            {!chrome && location.page > 0 && (
                <span className="page-chip">{location.page} / {location.totalPages}</span>
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
                <div className="progress-pair">
                    <div className="progress-line">
                        <div className="progress-label">
                            <b>Capítulo</b>
                            <span>{chapterPercent}%</span>
                        </div>
                        <span className="bar thin chapter"><i style={{ width: `${chapterPercent}%` }} /></span>
                    </div>
                    <div className="progress-line">
                        <div className="progress-label">
                            <span>Libro · {percent}%</span>
                            <span>{leftInBook ? `quedan ${formatMinutes(leftInBook)}` : ''}</span>
                        </div>
                        <span className="bar thin bookwide"><i style={{ width: `${percent}%` }} /></span>
                    </div>
                </div>

                <div className="reader-tools">
                    <button type="button" className="icon-btn" onClick={() => setPanel('settings')} aria-label="Ajustes de lectura">
                        <IconTextSize size={22} />
                    </button>
                    <button type="button" className="icon-btn" onClick={() => setPanel('toc')} aria-label="Índice">
                        <IconList size={22} />
                    </button>
                    <button type="button" className="icon-btn" onClick={() => setPanel('search')} aria-label="Buscar en el libro">
                        <IconSearch size={22} />
                    </button>
                    <button
                        type="button"
                        className={`icon-btn${annotationCount ? ' on' : ''}`}
                        onClick={() => setPanel('annotations')}
                        aria-label={`Anotaciones (${annotationCount})`}
                    >
                        <IconHighlight size={22} />
                    </button>
                    <button
                        type="button"
                        className={`icon-btn${speech.isSpeaking ? ' on' : ''}`}
                        onClick={speech.toggle}
                        disabled={!speech.supported}
                        aria-label="Leer en voz alta"
                    >
                        <IconVolume size={22} />
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

            {panel === 'settings' && (
                <ReaderSettingsSheet
                    typography={typography}
                    theme={theme}
                    onChangeTypography={setTypography}
                    onChangeTheme={setTheme}
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

            {selection && (
                <SelectionToolbar
                    text={selection.text}
                    onHighlight={highlightSelection}
                    onCopy={copySelection}
                    onCancel={cancelSelection}
                />
            )}
        </div>
    );
}
