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
import PdfLectura from './PdfLectura.jsx';
import { crearFuentePdf } from './pdfFuente.js';
import { crearOcrDePdf } from '../adapters/Ocr.js';
import { usePorts } from '../ports/index.js';
import PosicionRemotaSheet from './PosicionRemotaSheet.jsx';
import CapaTinta from './CapaTinta.jsx';
import { COLORES_TINTA, borrarEn, hayTinta } from './tinta.js';
import { shareImage } from '../library/backup.js';
import { FONT_SIZE_MIN, FONT_SIZE_MAX } from './typography.js';
import {
    IconArrowLeft, IconBookmark, IconList, IconHighlight, IconSun, IconClose, IconBook, IconTextSize,
    IconPen, IconEraser, IconUndo, IconShare,
} from '../ui/icons.jsx';

/** Letra del modo lectura cuando el PDF no tiene una guardada. */
const LETRA_PDF = { fontFamily: 'literata', fontSize: 18, lineHeight: 1.45, justify: true };

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
    posicionRemota,
    onPosicionRemotaVista,
}) {
    const ports = usePorts();
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

    /**
     * Folio o libro.
     *
     * En «lectura» el texto del PDF se convierte en párrafos y se compone con la
     * letra del lector: se lee a tamaño de móvil sin pellizcar. Es el modo que
     * convierte un PDF en algo que se puede leer en seis pulgadas. Ver
     * `PdfLectura.jsx`.
     */
    const [modo, setModo] = useState(book.readerPreferences?.pdfModo || 'pagina');
    const [letra, setLetra] = useState(() => ({ ...LETRA_PDF, ...(book.readerPreferences?.pdfLetra || {}) }));
    const [fuente, setFuente] = useState(null);
    /** Saltos pedidos desde la barra, el índice o las notas, para el modo lectura. */
    const [salto, setSalto] = useState(null);
    const [aviso, setAviso] = useState(null);
    /** El documento no tiene texto: es un escaneado. Se mira en la primera página. */
    const [escaneado, setEscaneado] = useState(false);
    const avisoRef = useRef(0);

    const avisar = useCallback((texto, duracion = 5000) => {
        clearTimeout(avisoRef.current);
        setAviso(texto);
        if (duracion) avisoRef.current = setTimeout(() => setAviso(null), duracion);
    }, []);

    /**
     * Lo escrito a mano, por página. Ver `tinta.js` y `CapaTinta.jsx`.
     *
     * Va aparte del libro, en sus propios ajustes: un PDF de apuntes puede
     * acumular miles de trazos, y guardarlos con el progreso los reescribiría
     * en cada pase de página.
     */
    const [tinta, setTinta] = useState({});
    const [lapiz, setLapiz] = useState(false);
    const [herramienta, setHerramienta] = useState('boligrafo');
    const [colores, setColores] = useState({ boligrafo: COLORES_TINTA.boligrafo[0], marcador: COLORES_TINTA.marcador[0] });
    const [conDedo, setConDedo] = useState(false);
    const [exportando, setExportando] = useState(false);
    const deshacerRef = useRef([]);
    const tintaCargada = useRef(false);

    useEffect(() => {
        let vivo = true;
        Promise.all([
            ports.storage?.getSetting(`tinta:${book.id}`).catch(() => null),
            ports.storage?.getSetting('tinta-dedo').catch(() => null),
        ]).then(([guardada, dedo]) => {
            if (!vivo) return;
            if (guardada && typeof guardada === 'object') setTinta(guardada);
            setConDedo(Boolean(dedo));
            tintaCargada.current = true;
        });
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [book.id]);

    useEffect(() => {
        if (!tintaCargada.current) return undefined;
        // Medio segundo de calma antes de guardar: escribiendo deprisa, guardar
        // cada trazo sería reescribir todo lo anotado a cada palabra.
        const espera = setTimeout(() => ports.storage?.setSetting(`tinta:${book.id}`, tinta).catch(() => {}), 500);
        return () => clearTimeout(espera);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tinta]);

    const cambiarTinta = useCallback((pagina, cambio) => {
        setTinta((antes) => {
            const previa = antes[pagina] || [];
            const nueva = cambio(previa);
            if (nueva === previa) return antes;
            deshacerRef.current = [...deshacerRef.current.slice(-49), { pagina, trazos: previa }];
            const siguiente = { ...antes, [pagina]: nueva };
            if (!nueva.length) delete siguiente[pagina];
            return siguiente;
        });
    }, []);

    const deshacer = () => {
        const ultimo = deshacerRef.current.pop();
        if (!ultimo) return;
        setTinta((antes) => {
            const siguiente = { ...antes, [ultimo.pagina]: ultimo.trazos };
            if (!ultimo.trazos.length) delete siguiente[ultimo.pagina];
            return siguiente;
        });
    };

    const exportarConTinta = async () => {
        setExportando(true);
        try {
            const { pdfConTinta } = await import('./exportarTinta.js');
            const bytes = new Uint8Array(await (await readBookBlob(book.sourcePath)).arrayBuffer());
            const salida = await pdfConTinta(bytes, tinta, async (numero) => {
                const vista = (await docRef.current.getPage(numero)).getViewport({ scale: 1 });
                return {
                    convertir: (x, y) => vista.convertToPdfPoint(x * vista.width, y * vista.height),
                    ancho: vista.width,
                };
            });
            const base = String(book.name || 'documento').replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, ' ').trim();
            await shareImage(`${base} (con notas).pdf`, new Blob([salida], { type: 'application/pdf' }), 'Compartir el PDF con lo escrito');
        } catch (fallo) {
            avisar(fallo?.message ? `No se ha podido exportar: ${fallo.message}` : 'No se ha podido exportar el PDF.');
        }
        setExportando(false);
    };

    const sacarLapiz = () => {
        // Se escribe sobre el folio quieto: el desplazamiento continuo y el
        // modo lectura no tienen una página fija debajo.
        setModo('pagina');
        setFlujo('paginated');
        setLapiz(true);
        setChromeVisible(false);
    };

    const irAPagina = useCallback((numero) => {
        setPage(numero);
        setSalto({ pagina: numero, clave: Date.now() });
    }, []);

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
                /**
                 * Las páginas sin texto se reconocen en el teléfono.
                 *
                 * Solo cuando el modo lectura las pide, no al abrir: reconocer
                 * cuesta medio segundo por página y el folio se ve sin ello.
                 * Lo reconocido se guarda, así que cada página se hace una vez.
                 */
                setFuente(crearFuentePdf(doc, {
                    ocr: crearOcrDePdf({
                        storage: ports.storage,
                        libro: book.id,
                        alEmpezar: (numero) => avisar(`Reconociendo el texto de la página ${numero}…`, 1500),
                    }),
                }));

                // ¿Escaneado? Una página del cuerpo sin texto lo delata. No se
                // mira la primera: suele ser una portada que es solo imagen.
                const muestra = Math.min(doc.numPages, Math.max(2, Math.round(doc.numPages / 3)));
                doc.getPage(muestra)
                    .then((pagina) => pagina.getTextContent())
                    .then((contenido) => {
                        const letras = (contenido.items || []).reduce((n, item) => n + (item.str || '').trim().length, 0);
                        if (!cancelled && letras < 20) setEscaneado(true);
                    })
                    .catch(() => {});

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
        // encima un lienzo que ya no está en pantalla. Y en modo lectura no hay
        // folio que pintar.
        if (flujo === 'scrolled' || modo === 'lectura') return;
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
            // El folio en blanco entero antes de pintar: pdf.js rellena el fondo
            // de la página con el mismo desplazamiento que el recorte, y sin
            // esto quedaba una franja transparente a la derecha con el texto
            // encima, fuera del papel.
            contexto.setTransform(1, 0, 0, 1, 0, 0);
            contexto.fillStyle = '#ffffff';
            contexto.fillRect(0, 0, canvas.width, canvas.height);
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
    }, [page, scale, state, recorte, recortar, flujo, modo]);

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
            readerPreferences: {
                theme, pdfCrop: recorte, pdfCropOn: recortar, pdfFlow: flujo, pdfModo: modo, pdfLetra: letra,
            },
        });
    }, [page, total, scale, state, theme, recorte, recortar, flujo, modo, letra]);

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

            {aviso && <div className="pdf-aviso" role="status">{aviso}</div>}

            {modo === 'lectura' && fuente ? (
                <PdfLectura
                    doc={docRef.current}
                    fuente={fuente}
                    paginaInicial={page}
                    salto={salto}
                    palette={READER_THEMES[theme] || READER_THEMES.dark}
                    letra={letra}
                    onLetra={setLetra}
                    onPagina={setPage}
                    onTap={toggleChrome}
                    onSinTexto={() => {
                        // Solo llega aquí si el reconocimiento no ha podido: en
                        // el navegador, o con una imagen ilegible. Se vuelve al
                        // folio y se dice por qué, en vez de enseñar una página
                        // en blanco que parece un fallo.
                        setModo('pagina');
                        avisar('No se ha podido reconocer el texto de este escaneado en este dispositivo.');
                    }}
                />
            ) : null}

            {modo === 'lectura' && fuente ? null : escaneado && chromeVisible && state === 'ready' ? (
                <div className="pdf-aviso" role="note">
                    Este PDF es un escaneado. Toca <b>Aa</b> para reconocer su texto en el teléfono y
                    leerlo como un libro, con texto que se puede copiar.
                </div>
            ) : null}

            {modo === 'lectura' && fuente ? null : flujo === 'scrolled' ? (
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
                    <div className="pdf-hoja">
                        <canvas ref={canvasRef} className={dark ? 'pdf-canvas inverted' : 'pdf-canvas'} />
                        <CapaTinta
                            activo={lapiz}
                            trazos={tinta[page] || []}
                            recorte={(recortar && recorte) ? recorte : null}
                            invertida={dark}
                            herramienta={herramienta}
                            color={colores[herramienta]}
                            conDedo={conDedo}
                            onTrazo={(trazo) => cambiarTinta(page, (antes) => [...antes, trazo])}
                            onBorrar={(punto, radio) => cambiarTinta(page, (antes) => {
                                const quedan = borrarEn(antes, punto, radio);
                                return quedan.length === antes.length ? antes : quedan;
                            })}
                        />
                    </div>
                </div>
            )}

            {lapiz && (
                <div className="tinta-barra" role="toolbar" aria-label="Escribir en la página">
                    <div className="tinta-fila">
                        {['boligrafo', 'marcador', 'goma'].map((h) => (
                            <button
                                key={h}
                                type="button"
                                className={`icon-btn${herramienta === h ? ' on' : ''}`}
                                onClick={() => setHerramienta(h)}
                                aria-label={{ boligrafo: 'Bolígrafo', marcador: 'Marcador', goma: 'Goma' }[h]}
                                aria-pressed={herramienta === h}
                            >
                                {h === 'goma' ? <IconEraser size={21} /> : h === 'marcador' ? <IconHighlight size={21} /> : <IconPen size={21} />}
                            </button>
                        ))}
                        <span className="tinta-separa" aria-hidden="true" />
                        {herramienta !== 'goma' && COLORES_TINTA[herramienta].map((c) => (
                            <button
                                key={c}
                                type="button"
                                className={`tinta-color${colores[herramienta] === c ? ' on' : ''}`}
                                style={{ '--tinta': c }}
                                onClick={() => setColores((antes) => ({ ...antes, [herramienta]: c }))}
                                aria-label={`Color ${c}`}
                                aria-pressed={colores[herramienta] === c}
                            />
                        ))}
                        <span className="tinta-hueco" />
                        <button type="button" className="icon-btn" onClick={deshacer} aria-label="Deshacer">
                            <IconUndo size={21} />
                        </button>
                    </div>
                    <div className="tinta-fila">
                        <label className="tinta-dedo">
                            <input
                                type="checkbox"
                                checked={conDedo}
                                onChange={(event) => {
                                    setConDedo(event.target.checked);
                                    ports.storage?.setSetting('tinta-dedo', event.target.checked).catch(() => {});
                                }}
                            />
                            Escribir también con el dedo
                        </label>
                        <span className="tinta-hueco" />
                        {hayTinta(tinta) && (
                            <button type="button" className="icon-btn" onClick={exportarConTinta} disabled={exportando} aria-label="Compartir el PDF con lo escrito">
                                <IconShare size={21} />
                            </button>
                        )}
                        <button type="button" className="btn" onClick={() => { setLapiz(false); setChromeVisible(true); }}>
                            Listo
                        </button>
                    </div>
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
                {/* Escribir, índice y anotaciones arriba, como en el lector de EPUB:
                    abajo solo queda cómo se ve la página, y cabe en una fila. */}
                <button
                    type="button"
                    className={`icon-btn${hayTinta(tinta) ? ' on' : ''}`}
                    onClick={sacarLapiz}
                    aria-label="Escribir en la página"
                >
                    <IconPen size={21} />
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

            <footer className={`reader-bottom${chromeVisible && !lapiz ? '' : ' hidden'}`}>
                <div className="progress-line">
                    <div className="progress-label">
                        <b>Página {page}</b>
                        <span>de {total}</span>
                    </div>
                    <span className="bar thin"><i style={{ width: `${total ? (page / total) * 100 : 0}%` }} /></span>
                </div>

                <input
                    type="range"
                    className="pdf-slider"
                    min={1}
                    max={total || 1}
                    value={page}
                    onChange={(event) => irAPagina(Number(event.target.value))}
                    aria-label="Ir a página"
                />

                <div className="reader-tools">
                    {/* En modo lectura, menos y más cambian la letra, no el zoom:
                        no hay folio que ampliar. */}
                    <button
                        type="button"
                        className="icon-btn"
                        onClick={() => (modo === 'lectura'
                            ? setLetra((l) => ({ ...l, fontSize: Math.max(FONT_SIZE_MIN, l.fontSize - 1) }))
                            : setScale((s) => Math.max(MIN_SCALE, s - 0.2)))}
                        aria-label={modo === 'lectura' ? 'Letra más pequeña' : 'Alejar'}
                    >
                        <span style={{ fontSize: 20, fontWeight: 600 }}>−</span>
                    </button>
                    <span className="mono" style={{ fontSize: 'var(--t-tiny)', color: 'var(--text-3)' }}>
                        {modo === 'lectura' ? `${letra.fontSize} pt` : `${Math.round(scale * 100)}%`}
                    </span>
                    <button
                        type="button"
                        className="icon-btn"
                        onClick={() => (modo === 'lectura'
                            ? setLetra((l) => ({ ...l, fontSize: Math.min(FONT_SIZE_MAX, l.fontSize + 1) }))
                            : setScale((s) => Math.min(MAX_SCALE, s + 0.2)))}
                        aria-label={modo === 'lectura' ? 'Letra más grande' : 'Acercar'}
                    >
                        <span style={{ fontSize: 20, fontWeight: 600 }}>+</span>
                    </button>
                    <button
                        type="button"
                        className={`icon-btn${modo === 'lectura' ? ' on' : ''}`}
                        onClick={() => {
                            setSalto({ pagina: page, clave: Date.now() });
                            setModo((actual) => (actual === 'lectura' ? 'pagina' : 'lectura'));
                        }}
                        aria-label={modo === 'lectura' ? 'Ver el folio original' : 'Leer como un libro'}
                        aria-pressed={modo === 'lectura'}
                    >
                        <IconTextSize size={21} />
                    </button>
                    <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setTheme(dark ? 'paper' : 'dark')}
                        aria-label={dark ? 'Fondo claro' : 'Fondo oscuro'}
                    >
                        <IconSun size={21} />
                    </button>
                    {modo !== 'lectura' && (
                        <button
                            type="button"
                            className={`icon-btn${flujo === 'scrolled' ? ' on' : ''}`}
                            onClick={() => setFlujo((actual) => (actual === 'scrolled' ? 'paginated' : 'scrolled'))}
                            aria-label={flujo === 'scrolled' ? 'Leer por páginas' : 'Leer desplazando'}
                            aria-pressed={flujo === 'scrolled'}
                        >
                            <IconList size={21} />
                        </button>
                    )}

                    {/* Recortar márgenes. Solo aparece si hay algo que recortar:
                        un botón que no haría nada es peor que no tenerlo. */}
                    {recorte && modo !== 'lectura' && (
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
                </div>
            </footer>

            {posicionRemota && state === 'ready' && Number(posicionRemota.cfi) > 0 && (
                <PosicionRemotaSheet
                    posicion={posicionRemota}
                    donde={`la página ${posicionRemota.cfi}`}
                    onIr={() => {
                        irAPagina(Math.min(Number(posicionRemota.cfi), total || 1));
                        onPosicionRemotaVista?.();
                    }}
                    onQuedarse={() => onPosicionRemotaVista?.()}
                />
            )}

            {showAnnotations && (
                <AnnotationsPanel
                    bookmarks={annotations}
                    onJump={(cfi) => {
                        const target = Number(cfi);
                        if (Number.isFinite(target)) irAPagina(Math.min(Math.max(1, target), total || 1));
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
                                    onClick={() => { irAPagina(entry.page); setShowOutline(false); }}
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
