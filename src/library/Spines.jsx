import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { tonoDeLomo, anchoDeLomo } from './coverColor.js';

/**
 * La biblioteca vista de canto: lomos en una estantería.
 *
 * ## Qué contesta esta vista que ninguna otra contesta
 *
 * «¿Qué tengo?». La rejilla enseña seis libros por pantalla y la compacta doce;
 * aquí caben cuarenta. Eso cambia lo que se puede hacer: con seis por pantalla
 * hay que buscar, con cuarenta se reconoce — igual que en una estantería de
 * verdad, donde encuentras un libro por «el gordo rojo de arriba» sin leer un
 * solo título.
 *
 * Tres cosas hacen que funcione, y las tres son información, no adorno:
 *
 *  - **El color sale de la portada**, no de una paleta. Ver `coverColor.js`. Así
 *    cada biblioteca se ve distinta y la tuya es reconocible.
 *  - **El grosor sale de las páginas.** Un tocho ocupa más que una novela corta,
 *    que es lo que pasa en el mueble.
 *  - **La altura varía un poco.** Una fila de lomos exactamente iguales se lee
 *    como un gráfico de barras; los libros reales no están calibrados. La
 *    variación se deriva del identificador del libro, así que es siempre la misma
 *    para el mismo libro y no baila entre aperturas.
 *
 * ## Lo que se está leyendo, sacado hacia fuera
 *
 * Un libro empezado asoma del anaquel, como cuando lo dejas a medio meter para
 * no perderlo. Es el único sitio donde aparece el acento, y sustituye a la barra
 * de progreso que en un lomo no cabría.
 */

/** Cuánto varía la altura de un lomo, arriba y abajo, en píxeles. */
export const VARIACION = 14;

/** Alto base del anaquel. */
export const ALTO = 132;

/**
 * Altura de un lomo, derivada de su identificador.
 *
 * Determinista a propósito: con `Math.random()` los libros cambiarían de alto en
 * cada dibujado y la estantería temblaría al desplazarse.
 */
export const altoDeLomo = (id) => {
    const texto = String(id || '');
    // Se mezcla en 32 bits y el resto se toma **al final**. Haciéndolo en cada
    // vuelta el resultado dependía casi solo del último carácter, y libros con
    // identificadores parecidos salían todos exactamente igual de altos — que es
    // justo lo que esta variación existe para evitar.
    let h = 2166136261;
    for (let i = 0; i < texto.length; i += 1) {
        h ^= texto.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const fraccion = ((h >>> 0) % 10007) / 10007;
    return ALTO - VARIACION + Math.round(fraccion * VARIACION * 2);
};

/**
 * Reparte los libros en anaqueles que quepan en el ancho.
 *
 * Se va sumando el grosor de cada lomo hasta llenar la balda, en lugar de poner
 * un número fijo por fila: con grosores distintos, un número fijo dejaría unas
 * baldas a medias y otras desbordadas.
 */
export const repartir = (libros, ancho, anchoDe) => {
    const baldas = [];
    let balda = [];
    let usado = 0;

    for (const libro of libros) {
        const w = anchoDe(libro);
        if (balda.length && usado + w > ancho) {
            baldas.push(balda);
            balda = [];
            usado = 0;
        }
        balda.push(libro);
        usado += w;
    }
    if (balda.length) baldas.push(balda);

    return baldas;
};

export default function Spines({
    books, width = 0, colores = {}, onOpen, onLongPress, leyendoId = null,
}) {
    /**
     * El ancho se mide **del contenedor**, no de la ventana.
     *
     * Con `window.innerWidth` los lomos se salían por la derecha: la lista vive
     * dentro de una columna con sus márgenes, y en horizontal la diferencia es de
     * más de cien píxeles — los suficientes para que la última balda se saliera de
     * la pantalla y arrastrara la página de lado.
     */
    const hostRef = useRef(null);
    const [medido, setMedido] = useState(0);

    useLayoutEffect(() => {
        const host = hostRef.current;
        if (!host) return undefined;
        const medir = () => setMedido(host.clientWidth);
        medir();
        const observador = new ResizeObserver(medir);
        observador.observe(host);
        return () => observador.disconnect();
    }, []);

    const util = Math.max(240, (medido || width || 390) - 8);

    const anchoDe = (libro) => anchoDeLomo({
        pageCount: libro.pageCount,
        fileSize: libro.fileSize,
    }) + 2;

    const baldas = useMemo(
        () => repartir(books, util, anchoDe),
        [books, util]
    );

    return (
        <div className="lomos" ref={hostRef}>
            {baldas.map((balda, i) => (
                <div className="balda" key={i}>
                    <div className="balda-libros">
                        {balda.map((libro) => {
                            const { fondo, tinta } = tonoDeLomo(colores[libro.id] || libro.color);
                            const leyendo = libro.id === leyendoId;

                            return (
                                <button
                                    type="button"
                                    key={libro.id}
                                    className={`lomo${leyendo ? ' leyendo' : ''}`}
                                    style={{
                                        '--lomo-bg': fondo,
                                        '--lomo-ink': tinta,
                                        width: `${anchoDe(libro) - 2}px`,
                                        height: `${altoDeLomo(libro.id)}px`,
                                    }}
                                    onClick={() => onOpen?.(libro)}
                                    onContextMenu={(e) => { e.preventDefault(); onLongPress?.(libro); }}
                                    title={`${libro.name}${libro.author ? ` · ${libro.author}` : ''}`}
                                >
                                    <span className="lomo-titulo">{libro.name}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* La tabla. Es lo que convierte una fila de rectángulos en una
                        estantería: sin línea de apoyo, los lomos flotan. */}
                    <div className="balda-tabla" aria-hidden="true" />
                </div>
            ))}
        </div>
    );
}
