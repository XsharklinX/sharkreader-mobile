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
import { cajaDeContenido, unirCajas, recorteRelativo } from './pdfCrop.js';
import PdfScroll from './PdfScroll.jsx';
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

/**
 * Cuántas páginas se miran para decidir el recorte de márgenes.
 *
 * Una sola no basta: la primera página de un PDF suele ser una portada a sangre
 * o una portadilla casi vacía, y cualquiera de las dos daría un recorte que no
 * vale para el resto del libro. Con cuatro repartidas por el documento se
 * acierta el cuerpo, que es lo que se va a leer.
 */
const MUESTRAS_RECORTE = 4;

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
    /**
     * Recorte de márgenes, en proporciones de la página.
     *
     * Un PDF está maquetado para un folio: en un móvil, ese folio se encoge
     * entero —márgenes incluidos— y un tercio de la pantalla se va en blanco
     * mientras el texto queda ilegible. Recortando el blanco, el mismo texto se
     * ve a casi el doble sin tocar el zoom.
     *
     * Se calcula **una vez por documento** y vale para todas las páginas: si se
     * calculara por página, el texto cambiaría de tamaño y de sitio en cada pase.
     * Ver `pdfCrop.js`.
     */
    const [recorte, setRecorte] = useState(book.readerPreferences?.pdfCrop ?? null);
    const [recortar, setRecortar] = useState(book.readerPreferences?.pdfCropOn !== false);
    const recorteHecho = useRef(false);
    /**
     * Páginas sueltas o desplazamiento continuo.
     *
     * En EPUB el continuo existe desde hace tiempo; en PDF no, y leer un manual a
     * saltos de página completa en un móvil es incómodo: cada pase cambia toda la
     * pantalla y hay que volver a buscar por dónde ibas.
     */
    const [flujo, setFlujo] = useState(book.readerPreferences?.pdfFlow || 'paginated');

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
        // Desplazando, de pintar se encarga `PdfScroll`: aquí solo se pintaría
        // encima un lienzo que ya no está en pantalla.
        if (flujo === 'scrolled') return;
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
            const caja = (recortar && recorte) ? recorte : null;

            /**
             * Con recorte, la escala se calcula contra **el ancho del texto**, no
             * el del folio.
             *
             * Ahí está toda la ganancia: si la caja de texto ocupa el 70 % del
             * folio, ajustarla a la pantalla en vez del folio entero agranda el
             * texto un 40 % sin que el usuario toque nada.
             */
            const anchoUtil = viewport.width * (caja ? caja.w : 1);
            const fitScale = (available / anchoUtil) * scale;
            const scaled = pdfPage.getViewport({ scale: fitScale * ratio });

            const anchoLienzo = caja ? scaled.width * caja.w : scaled.width;
            const altoLienzo = caja ? scaled.height * caja.h : scaled.height;

            canvas.width = Math.round(anchoLienzo);
            canvas.height = Math.round(altoLienzo);
            canvas.style.width = `${Math.round(anchoLienzo / ratio)}px`;
            canvas.style.height = `${Math.round(altoLienzo / ratio)}px`;

            const contexto = canvas.getContext('2d');
            // El recorte se hace desplazando el lienzo, no recortando después:
            // pintar el folio entero para tirar los bordes gastaría memoria y
            // tiempo en píxeles que nadie va a ver.
            if (caja) {
                contexto.setTransform(
                    1, 0, 0, 1,
                    -Math.round(scaled.width * caja.x),
                    -Math.round(scaled.height * caja.y)
                );
            } else {
                contexto.setTransform(1, 0, 0, 1, 0, 0);
            }

            const task = pdfPage.render({
                canvasContext: contexto,
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
    }, [page, scale, state, recorte, recortar, flujo]);

    /**
     * Encuentra el recorte mirando unas pocas páginas.
     *
     * Va después de que el libro esté en pantalla y con la primera página ya
     * pintada: buscar la caja de texto obliga a rasterizar páginas enteras y leer
     * sus píxeles, y hacerlo antes retrasaría la apertura por un ajuste que no
     * hace falta para ver la primera página.
     */
    useEffect(() => {
        if (state !== 'ready' || !docRef.current || recorteHecho.current) return;
        if (recorte) { recorteHecho.current = true; return; }
        recorteHecho.current = true;

        let cancelado = false;

        const detectar = async () => {
            const doc = docRef.current;
            const paginas = doc.numPages;
            // Repartidas por el documento y saltándose la portada, que suele ser
            // una imagen a sangre y daría un recorte que no vale para el cuerpo.
            const indices = Array.from({ length: MUESTRAS_RECORTE }, (_, i) =>
                Math.max(1, Math.min(paginas, Math.round(((i + 1) / (MUESTRAS_RECORTE + 1)) * paginas))));

            const cajas = [];
            let ancho = 0;
            let alto = 0;

            for (const indice of [...new Set(indices)]) {
                if (cancelado) return;
                try {
                    const pdfPage = await doc.getPage(indice);
                    // A escala pequeña: para encontrar el bloque de texto sobra
                    // resolución, y a tamaño completo serían megas por página.
                    const vista = pdfPage.getViewport({ scale: 0.4 });
                    const lienzo = document.createElement('canvas');
                    lienzo.width = Math.max(1, Math.round(vista.width));
                    lienzo.height = Math.max(1, Math.round(vista.height));
                    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
                    await pdfPage.render({ canvasContext: ctx, viewport: vista }).promise;

                    const imagen = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
                    cajas.push(cajaDeContenido(imagen));
                    ancho = lienzo.width;
                    alto = lienzo.height;
                } catch {
                    // Una página que no se deja pintar no impide decidir con las
                    // demás.
                }
            }

            if (cancelado) return;
            const encontrado = recorteRelativo(unirCajas(cajas), ancho, alto);
            if (encontrado) setRecorte(encontrado);
        };

        detectar();
        return () => { cancelado = true; };
    }, [state, recorte]);

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
            // El recorte se guarda calculado: encontrarlo obliga a rasterizar
            // cuatro páginas y leer sus píxeles, y no hay razón para repetirlo
            // cada vez que se abre el mismo libro.
            readerPreferences: { theme, pdfCrop: recorte, pdfCropOn: recortar, pdfFlow: flujo },
        });
    }, [page, total, scale, state, theme, recorte, recortar, flujo]);

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

            {flujo === 'scrolled' ? (
                <PdfScroll
                    doc={docRef.current}
                    scale={scale}
                    crop={(recortar && recorte) ? recorte : null}
                    dark={dark}
                    page={page}
                    total={total}
                    onPage={setPage}
                    onTap={toggleChrome}
                />
            ) : (
                <div className="pdf-viewport" {...gestures}>
                    <canvas ref={canvasRef} className={dark ? 'pdf-canvas inverted' : 'pdf-canvas'} />
                </div>
            )}

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
                        className={`icon-btn${flujo === 'scrolled' ? ' on' : ''}`}
                        onClick={() => setFlujo((modo) => (modo === 'scrolled' ? 'paginated' : 'scrolled'))}
                        aria-label={flujo === 'scrolled' ? 'Leer por páginas' : 'Leer desplazando'}
                        aria-pressed={flujo === 'scrolled'}
                    >
                        <IconList size={21} />
                    </button>

                    {/* Recortar márgenes. Solo aparece si hay algo que recortar:
                        un botón que no haría nada es peor que no tenerlo. */}
                    {recorte && (
                        <button
                            type="button"
                            className={`icon-btn${recortar ? ' on' : ''}`}
                            onClick={() => setRecortar((valor) => !valor)}
                            aria-label={recortar ? 'Ver la página entera' : 'Recortar márgenes'}
                            aria-pressed={recortar}
                        >
                            <IconBook size={21} />
                        </button>
                    )}
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
