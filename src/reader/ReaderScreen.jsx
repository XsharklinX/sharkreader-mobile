import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createEpubEngine } from './EpubEngine.js';
import { createGestureHandlers } from './useGestures.js';
import { buildReaderStyles, DEFAULT_TYPOGRAPHY } from './typography.js';
import ReaderSettingsSheet from './ReaderSettingsSheet.jsx';
import TocDrawer from './TocDrawer.jsx';
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
export default function ReaderScreen({ book, onClose, onProgress }) {
    const ports = usePorts();
    const viewportRef = useRef(null);
    const engineRef = useRef(null);

    const [state, setState] = useState('loading');
    const [error, setError] = useState(null);
    const [chromeVisible, setChromeVisible] = useState(true);
    const [panel, setPanel] = useState(null); // 'toc' | 'settings' | null
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
                });
                if (cancelled) return;

                setToc(result.toc);
                if (result.generatedLocations) {
                    // Calcular el mapa tarda segundos en un libro largo; guardarlo
                    // hace que la segunda apertura sea inmediata.
                    ports.storage.setSetting(LOCATIONS_KEY(book.id), result.generatedLocations).catch(() => {});
                }
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

    const gestures = useMemo(
        () => createGestureHandlers({ onNext: goNext, onPrev: goPrev, onToggleChrome: toggleChrome }),
        [goNext, goPrev, toggleChrome]
    );

    const jumpTo = useCallback((href) => {
        engineRef.current?.display(href);
        setPanel(null);
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

    return (
        <div className={`reader theme-reader-${theme}`}>
            {state === 'loading' && (
                <div className="reader-loading">
                    <span className="empty-emoji" aria-hidden="true">🦈</span>
                    <p className="empty-body">Abriendo {book.name}…</p>
                </div>
            )}

            <div className="reader-viewport" ref={viewportRef} />

            {/* Capa de gestos por encima del iframe. epub.js renderiza cada
                capítulo dentro de un iframe que se queda todos los eventos de
                puntero, así que sin esta capa las zonas de toque no responden.
                Contrapartida conocida: mientras esté activa no se puede
                seleccionar texto dentro del libro. Cuando lleguen los subrayados
                (v0.4.0) habrá que desactivarla en modo selección. */}
            <div className="reader-gestures" {...gestures} aria-hidden="true" />

            <header className={`reader-top${chromeVisible ? '' : ' hidden'}`}>
                <button type="button" className="icon-btn ghost" onClick={onClose} aria-label="Volver a la biblioteca">←</button>
                <span className="reader-chapter">{location.chapter || book.name}</span>
                <button type="button" className="icon-btn ghost" onClick={() => setPanel('toc')} aria-label="Índice">☰</button>
            </header>

            <footer className={`reader-bottom${chromeVisible ? '' : ' hidden'}`}>
                <div className="reader-actions">
                    <button type="button" className="icon-btn ghost" onClick={() => setPanel('settings')} aria-label="Ajustes de lectura">Aa</button>
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
        </div>
    );
}
