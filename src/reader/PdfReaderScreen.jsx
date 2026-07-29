import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createGestureHandlers } from './useGestures.js';
import { READER_THEMES } from './typography.js';
import { readBookBlob } from '../adapters/SafPicker.js';

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

export default function PdfReaderScreen({ book, onClose, onProgress }) {
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

    if (state === 'error') {
        return (
            <div className="reader">
                <div className="empty">
                    <span className="empty-emoji" aria-hidden="true">📄</span>
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
        <div className="reader reader-pdf" style={{ background: READER_THEMES[theme]?.bg }}>
            {state === 'loading' && (
                <div className="reader-loading">
                    <span className="empty-emoji" aria-hidden="true">🦈</span>
                    <p className="empty-body">Abriendo {book.name}…</p>
                </div>
            )}

            <div className="pdf-viewport" {...gestures}>
                <canvas ref={canvasRef} className={dark ? 'pdf-canvas inverted' : 'pdf-canvas'} />
            </div>

            <header className={`reader-top${chromeVisible ? '' : ' hidden'}`}>
                <button type="button" className="icon-btn ghost" onClick={onClose} aria-label="Volver a la biblioteca">←</button>
                <span className="reader-chapter">{book.name}</span>
                <button
                    type="button"
                    className="icon-btn ghost"
                    onClick={() => setShowOutline(true)}
                    aria-label="Índice"
                    disabled={outline.length === 0}
                >
                    ☰
                </button>
            </header>

            <footer className={`reader-bottom${chromeVisible ? '' : ' hidden'}`}>
                <div className="reader-actions">
                    <button type="button" className="icon-btn ghost" onClick={() => setScale((s) => Math.max(MIN_SCALE, s - 0.2))} aria-label="Alejar">−</button>
                    <span className="mono reader-percent">{Math.round(scale * 100)}%</span>
                    <button type="button" className="icon-btn ghost" onClick={() => setScale((s) => Math.min(MAX_SCALE, s + 0.2))} aria-label="Acercar">+</button>
                    <button
                        type="button"
                        className="icon-btn ghost"
                        onClick={() => setTheme(dark ? 'light' : 'dark')}
                        aria-label={dark ? 'Modo claro' : 'Modo oscuro'}
                    >
                        {dark ? '☀' : '☾'}
                    </button>
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
                <span className="reader-page mono">página {page} de {total}</span>
            </footer>

            {showOutline && (
                <div className="sheet-backdrop" onClick={() => setShowOutline(false)} role="presentation">
                    <aside className="drawer" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Índice del PDF">
                        <div className="drawer-tabs">
                            <span className="setting-label">Índice</span>
                            <button type="button" className="icon-btn ghost" onClick={() => setShowOutline(false)} aria-label="Cerrar">×</button>
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
