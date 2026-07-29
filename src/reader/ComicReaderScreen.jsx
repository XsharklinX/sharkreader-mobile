import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createGestureHandlers } from './useGestures.js';
import { listComicPages, readComicPage } from '../library/formats.js';
import { readBookBlob } from '../adapters/SafPicker.js';
import { IconArrowLeft, IconBookmark, IconSun, IconGrid } from '../ui/icons.jsx';

/**
 * Visor de cómic para CBZ.
 *
 * Un cómic no es texto reflowable: cada página es una imagen completa, así que
 * no hay tipografía ni CFI. Lo que importa aquí es distinto:
 *
 *  - Que la página se vea entera de un vistazo, o ampliada a doble toque.
 *  - Que cargar el tomo no reviente la memoria: un CBZ puede tener 200 páginas
 *    de 2 MB. Solo se decodifica la página visible y sus vecinas inmediatas.
 *  - Dirección de lectura configurable, porque el manga va de derecha a
 *    izquierda y forzar el sentido occidental lo hace ilegible.
 */

const PRELOAD = 1;

export default function ComicReaderScreen({ book, onClose, onProgress, onAnnotationsChange }) {
    const blobRef = useRef(null);
    const cacheRef = useRef(new Map());

    const [pages, setPages] = useState([]);
    const [page, setPage] = useState(Math.max(1, Number(book.lastLocation) || 1));
    const [images, setImages] = useState({});
    const [state, setState] = useState('loading');
    const [error, setError] = useState(null);
    const [chrome, setChrome] = useState(false);
    const [rtl, setRtl] = useState(book.readerPreferences?.rtl ?? false);
    const [fit, setFit] = useState(book.readerPreferences?.fit || 'contain');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const blob = await readBookBlob(book.sourcePath);
                if (cancelled) return;
                blobRef.current = blob;

                const entries = await listComicPages(blob);
                if (cancelled) return;
                if (entries.length === 0) throw new Error('Este CBZ no contiene imágenes.');

                setPages(entries);
                setState('ready');
            } catch (loadError) {
                if (!cancelled) {
                    setError(loadError?.message || 'No se pudo abrir el cómic.');
                    setState('error');
                }
            }
        })();
        return () => { cancelled = true; cacheRef.current.clear(); };
    }, [book.sourcePath]);

    // Solo se decodifican la página actual y sus vecinas. Un tomo entero en
    // memoria son cientos de megas de data URL.
    useEffect(() => {
        if (state !== 'ready' || !blobRef.current) return;
        let cancelled = false;

        const load = async () => {
            const wanted = [];
            for (let offset = -PRELOAD; offset <= PRELOAD; offset++) {
                const index = page - 1 + offset;
                if (index >= 0 && index < pages.length) wanted.push(index);
            }

            const next = {};
            for (const index of wanted) {
                if (cancelled) return;
                const name = pages[index];
                if (!cacheRef.current.has(name)) {
                    const data = await readComicPage(blobRef.current, name);
                    if (data) cacheRef.current.set(name, data);
                }
                if (cacheRef.current.has(name)) next[index + 1] = cacheRef.current.get(name);
            }

            // La caché se poda para que avanzar por el tomo no acumule páginas.
            if (cacheRef.current.size > PRELOAD * 2 + 3) {
                const keep = new Set(wanted.map((index) => pages[index]));
                [...cacheRef.current.keys()].forEach((key) => {
                    if (!keep.has(key)) cacheRef.current.delete(key);
                });
            }

            if (!cancelled) setImages(next);
        };

        load();
        return () => { cancelled = true; };
    }, [page, pages, state]);

    const progressRef = useRef(onProgress);
    progressRef.current = onProgress;

    useEffect(() => {
        if (state !== 'ready' || pages.length === 0) return;
        progressRef.current?.({
            cfi: String(page),
            progress: page / pages.length,
            readerPreferences: { rtl, fit },
        });
    }, [page, pages.length, state, rtl, fit]);

    const goNext = useCallback(() => setPage((p) => Math.min(p + 1, pages.length || p)), [pages.length]);
    const goPrev = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);

    // En lectura de derecha a izquierda el gesto se invierte: deslizar a la
    // izquierda retrocede, que es lo que espera quien lee manga.
    const gestures = useMemo(() => createGestureHandlers({
        onNext: rtl ? goPrev : goNext,
        onPrev: rtl ? goNext : goPrev,
        onToggleChrome: () => setChrome((v) => !v),
    }), [rtl, goNext, goPrev]);

    if (state === 'error') {
        return (
            <div className="reader" style={{ '--reader-bg': '#000' }}>
                <div className="empty">
                    <span className="empty-art" style={{ fontSize: 32 }}>📚</span>
                    <h2 className="empty-title">No se pudo abrir</h2>
                    <p className="empty-body">{error}</p>
                    <button type="button" className="btn btn-primary" onClick={onClose}>
                        Volver a la biblioteca
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="reader comic" style={{ '--reader-bg': '#000' }}>
            {state === 'loading' && (
                <div className="reader-loading">
                    <span className="empty-art" style={{ fontSize: 32 }}>📚</span>
                    <p className="empty-body">Abriendo {book.name}…</p>
                </div>
            )}

            <div className="comic-viewport" {...gestures}>
                {images[page] && (
                    <img
                        src={images[page]}
                        alt={`Página ${page}`}
                        className={`comic-page fit-${fit}`}
                        draggable={false}
                    />
                )}
            </div>

            {!chrome && pages.length > 0 && (
                <span className="page-chip">{page} / {pages.length}</span>
            )}

            <header className={`reader-top${chrome ? '' : ' hidden'}`}>
                <button type="button" className="icon-btn" onClick={onClose} aria-label="Volver a la biblioteca">
                    <IconArrowLeft size={22} />
                </button>
                <div className="reader-title">
                    <span className="reader-book">{book.name}</span>
                    <span className="reader-chapter">página {page} de {pages.length}</span>
                </div>
                <button
                    type="button"
                    className={`icon-btn${rtl ? ' on' : ''}`}
                    onClick={() => setRtl((value) => !value)}
                    aria-label={rtl ? 'Leer de izquierda a derecha' : 'Leer de derecha a izquierda (manga)'}
                    aria-pressed={rtl}
                >
                    <span className="mono" style={{ fontSize: 11, fontWeight: 700 }}>{rtl ? '←' : '→'}</span>
                </button>
            </header>

            <footer className={`reader-bottom${chrome ? '' : ' hidden'}`}>
                <div className="progress-line">
                    <div className="progress-label">
                        <b>Página {page}</b>
                        <span>de {pages.length}</span>
                    </div>
                    <span className="bar thin chapter">
                        <i style={{ width: `${pages.length ? (page / pages.length) * 100 : 0}%` }} />
                    </span>
                </div>

                <input
                    type="range"
                    className="pdf-slider"
                    min={1}
                    max={pages.length || 1}
                    value={page}
                    onChange={(event) => setPage(Number(event.target.value))}
                    aria-label="Ir a página"
                />

                <div className="reader-tools">
                    <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setFit((value) => (value === 'contain' ? 'width' : 'contain'))}
                        aria-label={fit === 'contain' ? 'Ajustar al ancho' : 'Ajustar a la pantalla'}
                    >
                        <IconGrid size={21} />
                    </button>
                    <button
                        type="button"
                        className="icon-btn"
                        onClick={() => onAnnotationsChange?.([
                            ...(book.bookmarks || []),
                            { cfi: String(page), kind: null, color: null, date: new Date().toLocaleDateString('es-ES'), note: `Página ${page}` },
                        ])}
                        aria-label="Marcar esta página"
                    >
                        <IconBookmark size={21} />
                    </button>
                </div>
            </footer>
        </div>
    );
}
