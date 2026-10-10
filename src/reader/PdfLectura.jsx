import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { reflujo, tieneTexto } from './pdfReflow.js';
import { pasoDe, columnaDe, columnasDe, anclaEn, columnaDePagina } from './pdfColumnas.js';
import { createGestureHandlers } from './useGestures.js';
import { cuerpoPorPellizco, escalaVisual } from './pellizco.js';
import { FONT_FAMILIES } from './typography.js';
import { detectLanguage } from './detectLanguage.js';

/**
 * El PDF leído como un libro.
 *
 * El texto de cada página sale de pdf.js (o del OCR, si es un escaneado), se
 * convierte en párrafos con `pdfReflow.js` y se compone en columnas del ancho de
 * la pantalla con la letra, el tamaño y el tema del lector. Una columna es una
 * página: pasar página es mover la tira una columna, igual que hace epub.js con
 * un capítulo.
 *
 * ## Por tramos
 *
 * Un PDF de 600 páginas no se convierte entero al abrirlo: serían varios
 * segundos de espera antes de ver nada. Se convierte por tramos de unas pocas
 * páginas —lo que un EPUB llamaría un capítulo— y al llegar al final de uno se
 * monta el siguiente. Leer un tramo cuesta unas decenas de milisegundos.
 *
 * ## La posición sigue siendo la página del PDF
 *
 * Lo que se guarda es «página 41», el mismo dato que el modo página. Así se
 * puede cambiar de modo en cualquier momento y aterrizar en el mismo sitio, y
 * las anotaciones y el escritorio no tienen que saber que este modo existe.
 */

const PAGINAS_POR_TRAMO = 8;
const HUECO = 48;

export const tramoDe = (pagina) => Math.max(0, Math.floor((pagina - 1) / PAGINAS_POR_TRAMO));

const pilaDe = (id) => FONT_FAMILIES.find((f) => f.id === id)?.stack || FONT_FAMILIES[0].stack;

export default function PdfLectura({
    doc,
    fuente,
    paginaInicial = 1,
    salto,
    palette,
    letra,
    onLetra,
    onPagina,
    onTap,
    onSinTexto,
}) {
    const total = fuente.total;
    const ultimoTramo = tramoDe(total);

    const marcoRef = useRef(null);
    const tiraRef = useRef(null);

    const [tramo, setTramo] = useState(() => tramoDe(paginaInicial));
    const [bloques, setBloques] = useState(null);
    const [columna, setColumna] = useState(0);
    const [columnas, setColumnas] = useState(1);
    const [paso, setPaso] = useState(1);
    const [pellizco, setPellizco] = useState(null);

    /** Dónde aterrizar tras la próxima maquetación. `null`: en la frase actual. */
    const destino = useRef({ tipo: 'pagina', valor: paginaInicial });
    const posiciones = useRef([]);
    const anclaActual = useRef(null);
    const avisadoSinTexto = useRef(false);

    // ── Leer el tramo ────────────────────────────────────────────────────────
    useEffect(() => {
        let cancelado = false;
        setBloques(null);
        const desde = tramo * PAGINAS_POR_TRAMO + 1;
        const hasta = Math.min(total, desde + PAGINAS_POR_TRAMO - 1);

        fuente.paginas(desde, hasta).then((paginas) => {
            if (cancelado) return;
            if (!avisadoSinTexto.current && !tieneTexto(paginas)) {
                avisadoSinTexto.current = true;
                onSinTexto?.();
            }
            setBloques(reflujo(paginas));
        }).catch(() => {
            if (!cancelado) setBloques([]);
        });

        return () => { cancelado = true; };
        // `onSinTexto` cambia de identidad en cada render del padre.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tramo, fuente, total]);

    const idioma = useMemo(() => {
        const muestra = (bloques || []).slice(0, 12).map((b) => b.texto || '').join(' ');
        return detectLanguage(muestra) || 'es';
    }, [bloques]);

    // ── Maquetar y medir ─────────────────────────────────────────────────────
    const medir = useCallback(() => {
        const tira = tiraRef.current;
        if (!tira || !bloques) return;

        const ancho = tira.clientWidth;
        if (!ancho) return;
        tira.style.columnWidth = `${ancho}px`;
        const nuevoPaso = pasoDe(ancho, HUECO);
        const n = columnasDe(tira.scrollWidth, nuevoPaso, HUECO);

        // Posición de cada bloque respecto a la tira. Se usa el primer
        // rectángulo del bloque —un párrafo partido entre columnas tiene uno
        // por columna— y se resta la caja de la tira, que lleva el mismo
        // desplazamiento, así que el resultado no depende de la página actual.
        const origen = tira.getBoundingClientRect().left;
        posiciones.current = [...tira.querySelectorAll('[data-i]')].map((el) => {
            const caja = el.getClientRects()[0] || el.getBoundingClientRect();
            return {
                indice: Number(el.dataset.i),
                pagina: Number(el.dataset.p),
                columna: columnaDe(caja.left - origen, nuevoPaso),
            };
        });

        const d = destino.current || (anclaActual.current
            ? { tipo: 'ancla', valor: anclaActual.current.indice }
            : { tipo: 'inicio' });
        destino.current = null;

        let objetivo = 0;
        if (d.tipo === 'pagina') objetivo = columnaDePagina(posiciones.current, d.valor);
        else if (d.tipo === 'final') objetivo = n - 1;
        else if (d.tipo === 'ancla') {
            objetivo = posiciones.current.find((p) => p.indice === d.valor)?.columna ?? 0;
        }

        setPaso(nuevoPaso);
        setColumnas(n);
        setColumna(Math.min(Math.max(0, objetivo), n - 1));
    }, [bloques]);

    useLayoutEffect(() => { medir(); }, [medir, letra]);

    useEffect(() => {
        let temporizador = null;
        const alCambiar = () => {
            clearTimeout(temporizador);
            temporizador = setTimeout(medir, 200);
        };
        window.addEventListener('resize', alCambiar);
        return () => {
            clearTimeout(temporizador);
            window.removeEventListener('resize', alCambiar);
        };
    }, [medir]);

    // ── Informar de la página del PDF ────────────────────────────────────────
    const onPaginaRef = useRef(onPagina);
    onPaginaRef.current = onPagina;

    useEffect(() => {
        if (!bloques) return;
        const ancla = anclaEn(posiciones.current, columna);
        anclaActual.current = ancla;
        if (ancla) onPaginaRef.current?.(ancla.pagina);
    }, [columna, columnas, bloques]);

    // ── Saltos desde fuera: la barra, el índice, las notas ───────────────────
    useEffect(() => {
        if (!salto?.pagina) return;
        const objetivo = tramoDe(salto.pagina);
        destino.current = { tipo: 'pagina', valor: salto.pagina };
        if (objetivo !== tramo) setTramo(objetivo);
        else medir();
        // Solo cuando llega un salto nuevo.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [salto?.clave]);

    // ── Pasar página ─────────────────────────────────────────────────────────
    const estado = useRef({});
    estado.current = { columna, columnas, tramo, cargando: !bloques };

    const siguiente = useCallback(() => {
        const s = estado.current;
        if (s.cargando) return;
        if (s.columna < s.columnas - 1) setColumna(s.columna + 1);
        else if (s.tramo < ultimoTramo) {
            destino.current = { tipo: 'inicio' };
            anclaActual.current = null;
            setTramo(s.tramo + 1);
        }
    }, [ultimoTramo]);

    const anterior = useCallback(() => {
        const s = estado.current;
        if (s.cargando) return;
        if (s.columna > 0) setColumna(s.columna - 1);
        else if (s.tramo > 0) {
            destino.current = { tipo: 'final' };
            anclaActual.current = null;
            setTramo(s.tramo - 1);
        }
    }, []);

    const letraRef = useRef(letra);
    letraRef.current = letra;

    const gestos = useMemo(() => {
        let base = 18;
        return createGestureHandlers({
            onNext: siguiente,
            onPrev: anterior,
            onToggleChrome: () => onTap?.(),
            // Con texto seleccionado el dedo está marcando, no pasando página.
            shouldIgnore: () => Boolean(globalThis.getSelection?.()?.toString()),
            getWidth: () => marcoRef.current?.clientWidth || window.innerWidth,
            getHeight: () => marcoRef.current?.clientHeight || window.innerHeight,
            onPinchStart: () => {
                base = letraRef.current?.fontSize || 18;
                setPellizco({ base, cuerpo: base });
            },
            onPinchMove: (escala) => {
                const cuerpo = cuerpoPorPellizco(base, escala);
                setPellizco({ base, cuerpo });
            },
            onPinchEnd: (escala) => {
                const cuerpo = cuerpoPorPellizco(base, escala);
                setPellizco(null);
                if (cuerpo !== base) onLetra?.({ ...letraRef.current, fontSize: cuerpo });
            },
        });
        // Se crean una vez: leen el estado por referencias.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /**
     * Los táctiles van con oyentes nativos y no por JSX: React registra
     * `touchmove` como pasivo, y un oyente pasivo no puede impedir que el
     * WebView haga lo suyo con dos dedos mientras se pellizca.
     */
    useEffect(() => {
        const marco = marcoRef.current;
        if (!marco) return undefined;
        const mover = (event) => gestos.onTouchMove(event);
        marco.addEventListener('touchstart', gestos.onTouchStart, { passive: true });
        marco.addEventListener('touchmove', mover, { passive: false });
        marco.addEventListener('touchend', gestos.onTouchEnd, { passive: true });
        marco.addEventListener('touchcancel', gestos.onTouchEnd, { passive: true });
        return () => {
            marco.removeEventListener('touchstart', gestos.onTouchStart);
            marco.removeEventListener('touchmove', mover);
            marco.removeEventListener('touchend', gestos.onTouchEnd);
            marco.removeEventListener('touchcancel', gestos.onTouchEnd);
        };
    }, [gestos]);

    const estiloTira = {
        fontFamily: pilaDe(letra?.fontFamily),
        fontSize: `${letra?.fontSize || 18}px`,
        lineHeight: letra?.lineHeight || 1.45,
        textAlign: letra?.justify === false ? 'left' : 'justify',
        columnGap: `${HUECO}px`,
        transform: `translate3d(${-columna * paso}px,0,0)`,
        color: palette?.text,
    };

    return (
        <div
            className="pdfl"
            ref={marcoRef}
            style={{ background: palette?.bg }}
            onPointerDown={gestos.onPointerDown}
            onPointerMove={gestos.onPointerMove}
            onPointerUp={gestos.onPointerUp}
            onPointerCancel={gestos.onPointerCancel}
        >
            {!bloques && <p className="pdfl-cargando" style={{ color: palette?.text }}>Preparando el texto…</p>}

            <div
                className="pdfl-tira"
                ref={tiraRef}
                lang={idioma}
                style={{
                    ...estiloTira,
                    transform: pellizco
                        ? `${estiloTira.transform} scale(${escalaVisual(pellizco.base, pellizco.cuerpo)})`
                        : estiloTira.transform,
                }}
            >
                {(bloques || []).map((bloque, i) => {
                    if (bloque.tipo === 'imagen') {
                        return <PaginaComoImagen key={`i${bloque.pagina}`} doc={doc} pagina={bloque.pagina} i={i} />;
                    }
                    const Etiqueta = bloque.tipo === 'h' ? 'h3' : 'p';
                    return (
                        <Etiqueta key={i} data-i={i} data-p={bloque.pagina} className={bloque.tipo === 'h' ? 'pdfl-h' : 'pdfl-p'}>
                            {bloque.texto}
                        </Etiqueta>
                    );
                })}
                {bloques && tramo === ultimoTramo && <p className="pdfl-fin" data-i={bloques.length} data-p={total}>Fin del documento</p>}
            </div>

            {pellizco && (
                <div className="pellizco-aviso" role="status">
                    <b>{pellizco.cuerpo}</b>
                    {pellizco.cuerpo !== pellizco.base && <span>antes {pellizco.base}</span>}
                </div>
            )}
        </div>
    );
}

/**
 * Una página casi sin texto —portada, lámina, gráfico— se enseña como es.
 *
 * Se pinta al ancho de la columna y no más alta que ella: una imagen más alta
 * que la columna se partiría entre dos páginas.
 */
function PaginaComoImagen({ doc, pagina, i }) {
    const lienzoRef = useRef(null);

    useEffect(() => {
        let cancelado = false;
        let tarea = null;
        const pintar = async () => {
            const lienzo = lienzoRef.current;
            if (!doc || !lienzo) return;
            const pdfPage = await doc.getPage(pagina);
            if (cancelado) return;
            const columna = lienzo.parentElement?.clientWidth || 360;
            const alto = lienzo.closest('.pdfl-tira')?.clientHeight || 600;
            const vista = pdfPage.getViewport({ scale: 1 });
            const escala = Math.min(columna / vista.width, alto / vista.height);
            const ratio = window.devicePixelRatio || 1;
            const final = pdfPage.getViewport({ scale: escala * ratio });
            lienzo.width = Math.round(final.width);
            lienzo.height = Math.round(final.height);
            lienzo.style.width = `${Math.round(final.width / ratio)}px`;
            lienzo.style.height = `${Math.round(final.height / ratio)}px`;
            tarea = pdfPage.render({ canvasContext: lienzo.getContext('2d'), viewport: final });
            await tarea.promise.catch(() => {});
        };
        pintar();
        return () => { cancelado = true; tarea?.cancel?.(); };
    }, [doc, pagina]);

    return (
        <figure className="pdfl-figura" data-i={i} data-p={pagina}>
            <canvas ref={lienzoRef} aria-label={`Página ${pagina} del PDF`} />
        </figure>
    );
}
