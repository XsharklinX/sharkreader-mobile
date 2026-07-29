import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createEpubEngine } from './EpubEngine.js';
import { createGestureHandlers } from './useGestures.js';
import { buildReaderStyles, DEFAULT_TYPOGRAPHY } from './typography.js';
import ReaderSettingsSheet from './ReaderSettingsSheet.jsx';
import TocDrawer from './TocDrawer.jsx';
import SelectionToolbar from './SelectionToolbar.jsx';
import AnnotationsPanel from './AnnotationsPanel.jsx';
import {
    createHighlight,
    createBookmark,
    addAnnotation,
    removeAnnotation,
    HIGHLIGHT_SWATCHES,
} from './annotations.js';
import { normalizeAnnotationKind } from '../core/annotationExport.js';
import { readBookBlob } from '../adapters/SafPicker.js';
import { usePorts } from '../ports/index.js';

const LOCATIONS_KEY = (bookId) => `locations:${bookId}`;

/**
 * Lector EPUB.
 *
 * Responsabilidades repartidas: `EpubEngine` habla con epub.js, `useGestures`
 * interpreta el dedo, `typography` construye el CSS del iframe, y este
 * componente une las piezas y persiste el progreso.
 */
export default function ReaderScreen({ book, onClose, onProgress, onAnnotationsChange, onExportAnnotations }) {
    const ports = usePorts();
    const viewportRef = useRef(null);
    const engineRef = useRef(null);

    const [state, setState] = useState('loading');
    const [error, setError] = useState(null);
    const [chromeVisible, setChromeVisible] = useState(true);
    const [panel, setPanel] = useState(null); // 'toc' | 'settings' | 'annotations' | null
    const [selection, setSelection] = useState(null); // { cfiRange, text }
    const [toc, setToc] = useState([]);
    const [location, setLocation] = useState({ cfi: book.lastLocation || null, progress: book.progress || 0, chapter: '' });

    const [typography, setTypography] = useState(
        () => ({ ...DEFAULT_TYPOGRAPHY, ...(book.readerPreferences?.typography || {}) })
    );
    const [theme, setTheme] = useState(book.readerPreferences?.theme || 'dark');

    const styles = useMemo(() => buildReaderStyles(typography, theme), [typography, theme]);

    // ── Carga del libro ──────────────────────────────────────────────────────
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
                    // Se pasan aquí para que el hook quede registrado antes de
                    // que se monte el primer capítulo.
                    gestureHandlers: gesturesRef.current,
                });
                if (cancelled) return;

                setToc(result.toc);
                if (result.generatedLocations) {
                    // Calcular el mapa tarda segundos en un libro largo; guardarlo
                    // hace que la segunda apertura sea inmediata.
                    ports.storage.setSetting(LOCATIONS_KEY(book.id), result.generatedLocations).catch(() => {});
                }

                // Repintar los subrayados guardados. epub.js los dibuja como
                // overlays sobre el texto, así que hay que volver a añadirlos en
                // cada apertura: no viven en el EPUB, viven en la biblioteca.
                (book.bookmarks || [])
                    .filter((bookmark) => normalizeAnnotationKind(bookmark) === 'highlight')
                    .forEach((bookmark) => {
                        engine.addHighlight(
                            bookmark.cfi,
                            HIGHLIGHT_SWATCHES[bookmark.color] || HIGHLIGHT_SWATCHES.yellow,
                            () => setPanel('annotations')
                        );
                    });

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
        // Solo debe volver a cargar si cambia el libro: los estilos se aplican aparte.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [book.id]);

    // ── Posición actual ──────────────────────────────────────────────────────
    // `onProgress` va en una ref porque cambia de identidad en cada render del
    // padre: tenerlo en las dependencias volvería a suscribir el listener de
    // epub.js constantemente, y en el efecto de preferencias de más abajo
    // provocaría directamente un bucle de renders.
    const progressRef = useRef(onProgress);
    progressRef.current = onProgress;

    useEffect(() => {
        const engine = engineRef.current;
        if (!engine || state !== 'ready') return undefined;

        return engine.onRelocated((loc) => {
            const cfi = loc?.start?.cfi;
            if (!cfi) return;
            const progress = engine.progressFromCfi(cfi);
            setLocation({
                cfi,
                progress,
                chapter: engine.chapterLabel(cfi, toc),
                page: loc?.start?.displayed?.page,
                totalPages: loc?.start?.displayed?.total,
            });
            progressRef.current?.({ cfi, progress });
        });
    }, [state, toc]);

    // Los cambios de tipografía se aplican al iframe sin recargar el libro.
    useEffect(() => {
        if (state === 'ready') engineRef.current?.applyStyles(styles);
    }, [styles, state]);

    // Persistir las preferencias del lector es por libro, como en escritorio.
    useEffect(() => {
        if (state !== 'ready') return;
        progressRef.current?.({ readerPreferences: { typography, theme } });
    }, [typography, theme, state]);

    const goNext = useCallback(() => engineRef.current?.next(), []);
    const goPrev = useCallback(() => engineRef.current?.prev(), []);
    const toggleChrome = useCallback(() => setChromeVisible((visible) => !visible), []);

    // Los gestos se crean una sola vez y se guardan en una ref porque el hook de
    // contenido de epub.js los registra durante la carga, antes de que exista
    // ningún render posterior.
    const gesturesRef = useRef(null);
    if (!gesturesRef.current) {
        gesturesRef.current = createGestureHandlers({
            onNext: () => engineRef.current?.next(),
            onPrev: () => engineRef.current?.prev(),
            onToggleChrome: () => setChromeVisible((visible) => !visible),
            // Si hay texto marcado, el dedo estaba seleccionando: no se pasa página.
            shouldIgnore: () => Boolean(engineRef.current?.selectionText()),
            getWidth: () => viewportRef.current?.clientWidth || window.innerWidth,
        });
    }

    const jumpTo = useCallback((target) => {
        engineRef.current?.display(target);
        setPanel(null);
    }, []);

    // ── Anotaciones ──────────────────────────────────────────────────────────
    const annotationsRef = useRef(book.bookmarks || []);
    annotationsRef.current = book.bookmarks || [];

    const commitAnnotations = useCallback((next) => {
        onAnnotationsChange?.(next);
    }, [onAnnotationsChange]);

    const highlightSelection = useCallback((color, comment) => {
        if (!selection) return;
        const annotation = createHighlight({
            cfi: selection.cfiRange,
            text: selection.text,
            color,
            comment,
        });
        commitAnnotations(addAnnotation(annotationsRef.current, annotation));
        engineRef.current?.addHighlight(
            selection.cfiRange,
            HIGHLIGHT_SWATCHES[color],
            () => setPanel('annotations')
        );
        engineRef.current?.clearSelection();
        setSelection(null);
    }, [selection, commitAnnotations]);

    const deleteAnnotation = useCallback((cfi, kind) => {
        commitAnnotations(removeAnnotation(annotationsRef.current, cfi, kind));
        if (kind === 'highlight') engineRef.current?.removeHighlight(cfi);
    }, [commitAnnotations]);

    const toggleBookmark = useCallback(() => {
        const cfi = location.cfi;
        if (!cfi) return;
        const existing = annotationsRef.current.find(
            (bookmark) => bookmark.cfi === cfi && normalizeAnnotationKind(bookmark) === 'bookmark'
        );
        commitAnnotations(existing
            ? removeAnnotation(annotationsRef.current, cfi, 'bookmark')
            : addAnnotation(annotationsRef.current, createBookmark({ cfi, label: location.chapter })));
    }, [location.cfi, location.chapter, commitAnnotations]);

    const copySelection = useCallback(async () => {
        if (!selection) return;
        try {
            await navigator.clipboard.writeText(selection.text);
        } catch {
            // Sin permiso de portapapeles no hay alternativa razonable; se
            // cierra la barra igualmente para no dejar al usuario atascado.
        }
        engineRef.current?.clearSelection();
        setSelection(null);
    }, [selection]);

    const cancelSelection = useCallback(() => {
        engineRef.current?.clearSelection();
        setSelection(null);
    }, []);

    if (state === 'error') {
        return (
            <div className="reader">
                <div className="empty">
                    <span className="empty-emoji" aria-hidden="true">📕</span>
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
    const annotationCount = annotationsRef.current.length;
    const isBookmarked = annotationsRef.current.some(
        (bookmark) => bookmark.cfi === location.cfi && normalizeAnnotationKind(bookmark) === 'bookmark'
    );

    return (
        <div className={`reader theme-reader-${theme}`}>
            {state === 'loading' && (
                <div className="reader-loading">
                    <span className="empty-emoji" aria-hidden="true">🦈</span>
                    <p className="empty-body">Abriendo {book.name}…</p>
                </div>
            )}

            {/* Los gestos viven dentro del iframe (ver registerContentHooks),
                no en una capa por encima: así el toque navega y la pulsación
                larga sigue pudiendo seleccionar texto para subrayar. */}
            <div className="reader-viewport" ref={viewportRef} />

            <header className={`reader-top${chromeVisible ? '' : ' hidden'}`}>
                <button type="button" className="icon-btn ghost" onClick={onClose} aria-label="Volver a la biblioteca">←</button>
                <span className="reader-chapter">{location.chapter || book.name}</span>
                <button
                    type="button"
                    className="icon-btn ghost"
                    onClick={toggleBookmark}
                    aria-label={isBookmarked ? 'Quitar marcador' : 'Añadir marcador'}
                    aria-pressed={isBookmarked}
                >
                    {isBookmarked ? '🔖' : '🏷'}
                </button>
                <button type="button" className="icon-btn ghost" onClick={() => setPanel('toc')} aria-label="Índice">☰</button>
            </header>

            <footer className={`reader-bottom${chromeVisible ? '' : ' hidden'}`}>
                <div className="reader-actions">
                    <button type="button" className="icon-btn ghost" onClick={() => setPanel('settings')} aria-label="Ajustes de lectura">Aa</button>
                    <button
                        type="button"
                        className="icon-btn ghost"
                        onClick={() => setPanel('annotations')}
                        aria-label="Anotaciones"
                    >
                        🖍{annotationCount > 0 && <span className="badge mono">{annotationCount}</span>}
                    </button>
                    <div className="reader-progress" aria-hidden="true">
                        <span className="reader-bar"><i style={{ width: `${percent}%` }} /></span>
                    </div>
                    <span className="reader-percent mono">{percent}%</span>
                </div>
                {location.page > 0 && (
                    <span className="reader-page mono">
                        pág. {location.page} / {location.totalPages} de este capítulo
                    </span>
                )}
            </footer>

            {panel === 'toc' && (
                <TocDrawer
                    toc={toc}
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
