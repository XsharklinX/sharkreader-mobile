import Loading from '../ui/Loading.jsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createGestureHandlers } from './useGestures.js';
import { READER_THEMES } from './typography.js';
import AnnotationsPanel from './AnnotationsPanel.jsx';
import {
    createBookmark,
    addAnnotation,
    removeAnnotation,
    HIGHLIGHT_SWATCHES,
} from './annotations.js';
import { normalizeAnnotationKind } from '../core/annotationExport.js';
import { readBookBlob } from '../adapters/SafPicker.js';
import {
    IconArrowLeft, IconBookmark, IconList, IconHighlight, IconSun, IconClose, IconBook,
} from '../ui/icons.jsx';

/**
 * Lector PDF sobre pdf.js.
 *
 * A diferencia del EPUB, aquí no hay reflujo: cada página es una imagen de
 * tamaño fijo. Eso cambia dos cosas respecto al lector de EPUB:
 *
 *  - El progreso es página/total, no un CFI.
 *  - El modo oscuro no puede hacerse con CSS sobre el texto, porque no hay
 *    texto que estilar. Se invierte el canvas entero con `invert(1)
 *    hue-rotate(180deg)`, que oscurece el fondo dejando los colores de las
 *    imágenes aproximadamente en su sitio.
 */

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;

export default function PdfReaderScreen({
    book,
    onClose,
    onProgress,
    onAnnotationsChange,
    onExportAnnotations,
}) {
    const canvasRef = useRef(null);
    const docRef = useRef(null);
    const renderTaskRef = useRef(null);

    const [state, setState] = useState('loading');
    const [error, setError] = useState(null);
    const [page, setPage] = useState(Math.max(1, Number(book.lastLocation) || 1));
    const [total, setTotal] = useState(0);
    const [scale, setScale] = useState(book.pdfScale || 1.2);
    const [chromeVisible, setChromeVisible] = useState(true);
    const [theme, setTheme] = useState(book.readerPreferences?.theme || 'dark');
    const [outline, setOutline] = useState([]);
    const [showOutline, setShowOutline] = useState(false);

    // ── Carga ────────────────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                const pdfjs = await import('pdfjs-dist');
                const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
                pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

                const blob = await readBookBlob(book.sourcePath);
                const data = await blob.arrayBuffer();
                if (cancelled) return;

                const doc = await pdfjs.getDocument({ data }).promise;
                if (cancelled) {
                    doc.destroy();
                    return;
                }

                docRef.current = doc;
                setTotal(doc.numPages);

                const rawOutline = await doc.getOutline().catch(() => null);
                if (rawOutline?.length) {
                    setOutline(await resolveOutline(doc, rawOutline));
                }

                setState('ready');
            } catch (loadError) {
                if (!cancelled) {
                    setError(loadError?.message || 'No se pudo abrir el PDF.');
                    setState('error');
                }
            }
        };

        load();
        return () => {
            cancelled = true;
            renderTaskRef.current?.cancel();
            docRef.current?.destroy();
            docRef.current = null;
        };
    }, [book.id, book.sourcePath]);

    // ── Renderizado de la página actual ──────────────────────────────────────
    useEffect(() => {
        if (state !== 'ready' || !docRef.current) return;
        let cancelled = false;

        const render = async () => {
            // Cancelar el render anterior evita que dos páginas escriban sobre
            // el mismo canvas al pasar páginas rápido.
            renderTaskRef.current?.cancel();

            const pdfPage = await docRef.current.getPage(page);
            if (cancelled) return;

            const canvas = canvasRef.current;
            if (!canvas) return;

            const ratio = window.devicePixelRatio || 1;
            const viewport = pdfPage.getViewport({ scale: 1 });
            const available = canvas.parentElement.clientWidth;
            const fitScale = (available / viewport.width) * scale;
            const scaled = pdfPage.getViewport({ scale: fitScale * ratio });

            canvas.width = Math.round(scaled.width);
            canvas.height = Math.round(scaled.height);
            canvas.style.width = `${Math.round(scaled.width / ratio)}px`;
            canvas.style.height = `${Math.round(scaled.height / ratio)}px`;

            const task = pdfPage.render({
                canvasContext: canvas.getContext('2d'),
                viewport: scaled,
            });
            renderTaskRef.current = task;

            try {
                await task.promise;
            } catch {
                // Un render cancelado es lo normal al pasar página; no es un error.
            }
        };

        render();
        return () => { cancelled = true; };
    }, [page, scale, state]);

    // ── Progreso ─────────────────────────────────────────────────────────────
    // `onProgress` se guarda en una ref a propósito: cambia de identidad en cada
    // render del padre, y tenerlo en las dependencias haría que este efecto se
    // ejecutara en bucle — llamaría a onProgress, que provoca un render, que
    // crea un onProgress nuevo, que vuelve a disparar el efecto.
    const progressRef = useRef(onProgress);
    progressRef.current = onProgress;

    useEffect(() => {
        if (state !== 'ready' || !total) return;
        progressRef.current?.({
            cfi: String(page),
            progress: page / total,
            pdfScale: scale,
        });
    }, [page, total, scale, state]);

    const goNext = useCallback(() => setPage((current) => Math.min(current + 1, total || current)), [total]);
    const goPrev = useCallback(() => setPage((current) => Math.max(1, current - 1)), []);
    const toggleChrome = useCallback(() => setChromeVisible((visible) => !visible), []);

    const gestures = useMemo(
        () => createGestureHandlers({ onNext: goNext, onPrev: goPrev, onToggleChrome: toggleChrome }),
        [goNext, goPrev, toggleChrome]
    );

    // ── Anotaciones ──────────────────────────────────────────────────────────
    // En PDF la posición es el número de página serializado, no un CFI. Es el
    // mismo convenio que usa el escritorio, así que las anotaciones viajan en
    // un backup sin conversión.
    const [showAnnotations, setShowAnnotations] = useState(false);
    const annotations = book.bookmarks || [];

    const pageIsBookmarked = annotations.some(
        (bookmark) => bookmark.cfi === String(page) && normalizeAnnotationKind(bookmark) === 'bookmark'
    );

    const toggleBookmark = () => {
        const cfi = String(page);
        onAnnotationsChange?.(pageIsBookmarked
            ? removeAnnotation(annotations, cfi, 'bookmark')
            : addAnnotation(annotations, createBookmark({ cfi, label: `Página ${page}` })));
    };

    const deleteAnnotation = (cfi, kind) => {
        onAnnotationsChange?.(removeAnnotation(annotations, cfi, kind));
    };

    if (state === 'error') {
        return (
            <div className="reader">
                <div className="empty">
                    <span className="empty-art" aria-hidden="true" style={{fontSize:32}}>📄</span>
                    <h2 className="empty-title">No se pudo abrir</h2>
                    <p className="empty-body">{error}</p>
                    <button type="button" className="btn btn-primary" onClick={onClose}>
                        Volver a la biblioteca
                    </button>
                </div>
            </div>
        );
    }

    const dark = theme === 'dark' || theme === 'black';

    return (
        <div className="reader reader-pdf" style={{ '--reader-bg': READER_THEMES[theme]?.bg }}>
            {state === 'loading' && (
                <div className="reader-loading">
                    {/* Un emoji lo dibuja el sistema con su propio estilo y no
                        se parece a nada del resto de la app. Aquí va el icono de
                        la propia app, que sí es nuestro. */}
                    <span className="empty-art" aria-hidden="true"><IconBook size={30} /></span>
                    <p className="empty-body">Abriendo {book.name}…</p>
                </div>
            )}

            <div className="pdf-viewport" {...gestures}>
                <canvas ref={canvasRef} className={dark ? 'pdf-canvas inverted' : 'pdf-canvas'} />
            </div>

            <header className={`reader-top${chromeVisible ? '' : ' hidden'}`}>
                <button type="button" className="icon-btn" onClick={onClose} aria-label="Volver a la biblioteca">
                    <IconArrowLeft size={22} />
                </button>
                <div className="reader-title">
                    <span className="reader-book">{book.name}</span>
                    <span className="reader-chapter">página {page} de {total}</span>
                </div>
                <button
                    type="button"
                    className={`icon-btn${pageIsBookmarked ? ' on' : ''}`}
                    onClick={toggleBookmark}
                    aria-label={pageIsBookmarked ? 'Quitar marcador' : 'Marcar esta página'}
                    aria-pressed={pageIsBookmarked}
                >
                    <IconBookmark size={21} filled={pageIsBookmarked} />
                </button>
            </header>

            <footer className={`reader-bottom${chromeVisible ? '' : ' hidden'}`}>
                <div className="progress-line">
                    <div className="progress-label">
                        <b>Página {page}</b>
                        <span>de {total}</span>
                    </div>
                    <span className="bar thin chapter"><i style={{ width: `${total ? (page / total) * 100 : 0}%` }} /></span>
                </div>

                <input
                    type="range"
                    className="pdf-slider"
                    min={1}
                    max={total || 1}
                    value={page}
                    onChange={(event) => setPage(Number(event.target.value))}
                    aria-label="Ir a página"
                />

                <div className="reader-tools">
                    <button type="button" className="icon-btn" onClick={() => setScale((s) => Math.max(MIN_SCALE, s - 0.2))} aria-label="Alejar">
                        <span style={{ fontSize: 20, fontWeight: 600 }}>−</span>
                    </button>
                    <span className="mono" style={{ fontSize: 'var(--t-tiny)', color: 'var(--text-3)' }}>
                        {Math.round(scale * 100)}%
                    </span>
                    <button type="button" className="icon-btn" onClick={() => setScale((s) => Math.min(MAX_SCALE, s + 0.2))} aria-label="Acercar">
                        <span style={{ fontSize: 20, fontWeight: 600 }}>+</span>
                    </button>
                    <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setTheme(dark ? 'paper' : 'dark')}
                        aria-label={dark ? 'Fondo claro' : 'Fondo oscuro'}
                    >
                        <IconSun size={21} />
                    </button>
                    <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setShowOutline(true)}
                        aria-label="Índice"
                        disabled={outline.length === 0}
                    >
                        <IconList size={22} />
                    </button>
                    <button
                        type="button"
                        className={`icon-btn${annotations.length ? ' on' : ''}`}
                        onClick={() => setShowAnnotations(true)}
                        aria-label={`Anotaciones (${annotations.length})`}
                    >
                        <IconHighlight size={22} />
                    </button>
                </div>
            </footer>

            {showAnnotations && (
                <AnnotationsPanel
                    bookmarks={annotations}
                    onJump={(cfi) => {
                        const target = Number(cfi);
                        if (Number.isFinite(target)) setPage(Math.min(Math.max(1, target), total || 1));
                        setShowAnnotations(false);
                    }}
                    onDelete={deleteAnnotation}
                    onExport={() => onExportAnnotations?.(book)}
                    onClose={() => setShowAnnotations(false)}
                />
            )}

            {showOutline && (
                <div className="scrim" onClick={() => setShowOutline(false)} role="presentation">
                    <aside className="drawer" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Índice del PDF">
                        <div className="drawer-head">
                            <span className="section-title">Índice</span>
                            <button type="button" className="icon-btn" onClick={() => setShowOutline(false)} aria-label="Cerrar"><IconClose size={20} /></button>
                        </div>
                        <div className="drawer-list">
                            {outline.map((entry, index) => (
                                <button
                                    key={`${entry.title}-${index}`}
                                    type="button"
                                    className={`drawer-item${entry.page === page ? ' current' : ''}`}
                                    style={{ paddingLeft: `${12 + entry.depth * 14}px` }}
                                    onClick={() => { setPage(entry.page); setShowOutline(false); }}
                                >
                                    {entry.title}
                                    <span className="mono drawer-page">{entry.page}</span>
                                </button>
                            ))}
                        </div>
                    </aside>
                </div>
            )}
        </div>
    );
}

/**
 * El outline de un PDF apunta a destinos internos, no a números de página.
 * Hay que resolver cada destino para poder navegar.
 */
const resolveOutline = async (doc, items, depth = 0, output = []) => {
    for (const item of items) {
        let pageNumber = null;
        try {
            const dest = typeof item.dest === 'string'
                ? await doc.getDestination(item.dest)
                : item.dest;
            if (dest?.[0]) {
                pageNumber = (await doc.getPageIndex(dest[0])) + 1;
            }
        } catch {
            // Un destino roto no debe romper el índice entero.
        }

        if (pageNumber) {
            output.push({ title: item.title || '(sin título)', page: pageNumber, depth });
        }
        if (item.items?.length) {
            await resolveOutline(doc, item.items, depth + 1, output);
        }
    }
    return output;
};
