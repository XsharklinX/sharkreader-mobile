import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ventanaDe, paginaVisible, altoEstimado } from './pdfScroll.js';

/**
 * Las páginas de un PDF, una debajo de otra y desplazándose.
 *
 * ## Por qué hacía falta
 *
 * En EPUB el desplazamiento continuo existe desde hace tiempo; en PDF no, y leer
 * un manual a saltos de página completa en un móvil es incómodo: cada pase
 * cambia toda la pantalla y hay que volver a buscar por dónde ibas. Desplazando,
 * el texto sigue donde estaba y el ojo no se pierde.
 *
 * ## Cómo no se agota la memoria
 *
 * Solo se pintan las páginas que se ven y unas pocas alrededor. Las demás son
 * huecos con la altura que les tocaría, para que la barra de desplazamiento
 * mida lo que tiene que medir y saltar al 60 % del documento lleve al 60 % de
 * verdad. Ver `pdfScroll.js`.
 *
 * Cada lienzo se libera al salir de la ventana —`width = 0`— porque un canvas
 * retiene su mapa de bits mientras exista, y quinientos mapas de bits cierran la
 * app en gama baja.
 */
export default function PdfScroll({
    doc, scale, crop, dark, page, total, onPage, onTap,
}) {
    const hostRef = useRef(null);
    const canvasRefs = useRef(new Map());
    const tareasRef = useRef(new Map());
    const [ancho, setAncho] = useState(0);
    const [proporcion, setProporcion] = useState(0);
    const [ventana, setVentana] = useState(() => ventanaDe(page || 1, total));
    const saltoHecho = useRef(false);

    // Ancho disponible y proporción de la primera página: con eso se reservan
    // los huecos de todas las demás.
    useLayoutEffect(() => {
        const host = hostRef.current;
        if (!host || !doc) return undefined;

        const medir = () => setAncho(host.clientWidth);
        medir();

        let cancelado = false;
        doc.getPage(1).then((primera) => {
            if (cancelado) return;
            const vista = primera.getViewport({ scale: 1 });
            setProporcion(vista.height / vista.width);
        }).catch(() => {});

        const observador = new ResizeObserver(medir);
        observador.observe(host);
        return () => { cancelado = true; observador.disconnect(); };
    }, [doc]);

    const anchoUtil = crop ? ancho / crop.w : ancho;
    const altoHueco = altoEstimado(ancho, crop ? proporcion * (crop.h / crop.w) : proporcion);

    // ── Qué página se está viendo ───────────────────────────────────────────
    useEffect(() => {
        const host = hostRef.current;
        if (!host || !total) return undefined;

        let pendiente = 0;
        const mirar = () => {
            cancelAnimationFrame(pendiente);
            pendiente = requestAnimationFrame(() => {
                const caja = host.getBoundingClientRect();
                const cajas = [];
                host.querySelectorAll('[data-pagina]').forEach((nodo) => {
                    const r = nodo.getBoundingClientRect();
                    cajas.push({
                        pagina: Number(nodo.dataset.pagina),
                        top: r.top - caja.top,
                        bottom: r.bottom - caja.top,
                    });
                });

                const visible = paginaVisible(cajas, caja.height);
                if (!visible) return;
                setVentana(ventanaDe(visible, total));
                onPage?.(visible);
            });
        };

        host.addEventListener('scroll', mirar, { passive: true });
        mirar();
        return () => {
            cancelAnimationFrame(pendiente);
            host.removeEventListener('scroll', mirar);
        };
    }, [total, onPage]);

    // ── Ir a la página guardada, una sola vez ───────────────────────────────
    useEffect(() => {
        if (saltoHecho.current || !ancho || !total || !page) return;
        const nodo = hostRef.current?.querySelector(`[data-pagina="${page}"]`);
        if (!nodo) return;
        saltoHecho.current = true;
        // Sin animación: al abrir el libro hay que estar ya donde se dejó, no
        // verlo desplazarse desde el principio.
        nodo.scrollIntoView({ block: 'start', behavior: 'auto' });
    }, [ancho, total, page]);

    // ── Pintar lo que toca y soltar lo que no ───────────────────────────────
    useEffect(() => {
        if (!doc || !ancho) return undefined;
        let cancelado = false;

        const pintar = async (numero) => {
            const canvas = canvasRefs.current.get(numero);
            if (!canvas || canvas.dataset.pintado === String(scale)) return;

            try {
                tareasRef.current.get(numero)?.cancel();
                const pdfPage = await doc.getPage(numero);
                if (cancelado) return;

                const ratio = window.devicePixelRatio || 1;
                const base = pdfPage.getViewport({ scale: 1 });
                const fit = (anchoUtil / base.width) * scale;
                const vista = pdfPage.getViewport({ scale: fit * ratio });

                const w = crop ? vista.width * crop.w : vista.width;
                const h = crop ? vista.height * crop.h : vista.height;
                canvas.width = Math.round(w);
                canvas.height = Math.round(h);
                canvas.style.width = `${Math.round(w / ratio)}px`;
                canvas.style.height = `${Math.round(h / ratio)}px`;

                const ctx = canvas.getContext('2d');
                // El papel entero primero: pdf.js pinta el fondo con el mismo
                // desplazamiento del recorte y dejaba una franja transparente.
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                if (crop) {
                    ctx.setTransform(1, 0, 0, 1,
                        -Math.round(vista.width * crop.x), -Math.round(vista.height * crop.y));
                } else {
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                }

                const tarea = pdfPage.render({ canvasContext: ctx, viewport: vista });
                tareasRef.current.set(numero, tarea);
                await tarea.promise;
                canvas.dataset.pintado = String(scale);
            } catch {
                // Un render cancelado al desplazar rápido es lo normal.
            }
        };

        for (let n = ventana.desde; n <= ventana.hasta; n += 1) pintar(n);

        // Lo que ha salido de la ventana suelta su mapa de bits. Un canvas lo
        // retiene mientras exista, y quinientos cierran la app en gama baja.
        canvasRefs.current.forEach((canvas, numero) => {
            if (numero >= ventana.desde && numero <= ventana.hasta) return;
            if (!canvas.width) return;
            tareasRef.current.get(numero)?.cancel();
            canvas.width = 0;
            canvas.height = 0;
            delete canvas.dataset.pintado;
        });

        return () => { cancelado = true; };
    }, [doc, ancho, anchoUtil, scale, crop, ventana]);

    return (
        <div className="pdf-scroll" ref={hostRef} onClick={onTap}>
            {Array.from({ length: total }, (_, i) => i + 1).map((numero) => (
                <div
                    className="pdf-scroll-page"
                    key={numero}
                    data-pagina={numero}
                    style={{ minHeight: altoHueco ? `${altoHueco}px` : undefined }}
                >
                    <canvas
                        className={dark ? 'pdf-canvas inverted' : 'pdf-canvas'}
                        ref={(nodo) => {
                            if (nodo) canvasRefs.current.set(numero, nodo);
                            else canvasRefs.current.delete(numero);
                        }}
                    />
                </div>
            ))}
        </div>
    );
}
