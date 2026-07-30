import React, { useEffect, useRef } from 'react';
import { foldState } from './pageFold.js';

/**
 * Mete el CSS del capítulo en su HTML.
 *
 * Va lo último del `<head>`, después de las hojas propias del EPUB: lo que trae
 * son el tema y la tipografía elegidos por el lector, y tienen que ganar igual que
 * ganan en la página real. Si el capítulo no declara cabecera —los hay— se pone
 * antes del cuerpo, que es donde el navegador la habría creado.
 */
export const withStyles = (html, css) => {
    if (!css) return html;
    const style = `<style>${css}</style>`;

    const head = html.search(/<\/head\s*>/i);
    if (head !== -1) return html.slice(0, head) + style + html.slice(head);

    const body = html.search(/<body[\s>]/i);
    if (body !== -1) return html.slice(0, body) + style + html.slice(body);

    return style + html;
};

/**
 * Las capas del doblado de hoja.
 *
 * ## Cómo se consigue el dorso
 *
 * La página que se va se dibuja **dos veces**: plana a un lado del doblez y
 * reflejada al otro. Un nodo del DOM no puede estar en dos sitios, así que hacen
 * falta dos copias del contenido.
 *
 * Las copias son dos iframes con el mismo HTML del capítulo, cada uno desplazado
 * para mostrar la página visible. El reflejo es `scaleX(-1)` con el origen en la
 * línea del doblez, que es exactamente lo que hace el papel al plegarse — de ahí
 * sale el texto al revés, y sale exacto.
 *
 * **Por qué iframes y no una imagen.** El primer intento rasterizaba la página
 * con html2canvas y devolvía siempre la primera del capítulo: su clon maqueta las
 * columnas CSS en otras coordenadas, y ni recortar con `x`, ni desplazar el clon,
 * ni `scrollX` conseguían moverlo. Con una copia propia el desplazamiento lo
 * ponemos nosotros. Además el texto sigue siendo texto: más nítido que un mapa de
 * bits y sin los 200 ms de rasterizado.
 *
 * ## Por qué el progreso no pasa por el estado de React
 *
 * Durante el arrastre esto se actualiza en cada fotograma. El componente se monta
 * una vez y luego los estilos se escriben directamente sobre los nodos: pasar por
 * un render sesenta veces por segundo para mover un recorte es tirar el
 * presupuesto de tiempo.
 */
export default function PageFold({ sheet, width, height, controllerRef }) {
    const flatRef = useRef(null);
    const backRef = useRef(null);
    const shadeRef = useRef(null);
    const shadowRef = useRef(null);
    const rootRef = useRef(null);

    // Las dos copias. Se montan a mano porque son iframes con `srcdoc` y hay que
    // colocarlas con el desplazamiento de columna, que React no puede expresar
    // como atributo.
    useEffect(() => {
        if (!sheet?.html || !flatRef.current || !backRef.current) return;

        const build = (host) => {
            host.replaceChildren();

            const frame = document.createElement('iframe');
            // Sin scripts: es una copia del contenido de un EPUB y no hay razón
            // para ejecutar nada. Es la misma postura que en el iframe real.
            frame.setAttribute('sandbox', '');
            frame.setAttribute('aria-hidden', 'true');
            frame.setAttribute('tabindex', '-1');
            frame.style.position = 'absolute';
            frame.style.border = '0';
            frame.style.width = `${sheet.frameWidth}px`;
            frame.style.height = `${sheet.frameHeight}px`;
            // Aquí está la clave: la copia se mueve para que la página visible
            // caiga en el origen del recuadro.
            frame.style.left = `${-sheet.offsetX}px`;
            frame.style.top = `${-sheet.offsetY}px`;
            frame.srcdoc = withStyles(sheet.html, sheet.css);

            host.appendChild(frame);
        };

        build(flatRef.current);
        build(backRef.current);

        // Copias nuevas: cualquier pliegue que quedara a medias estaría mostrando
        // ya otra página. Se retira.
        controllerRef?.current?.hide?.();
    }, [sheet, controllerRef]);

    useEffect(() => {
        if (!controllerRef) return undefined;

        let frame = 0;
        let shown = 0;

        const paint = (progress, direction) => {
            shown = progress;
            const state = foldState(progress, width, direction);

            if (rootRef.current) {
                rootRef.current.style.visibility = state.visible ? 'visible' : 'hidden';
            }
            if (flatRef.current) {
                flatRef.current.style.clipPath = state.flatClip;
            }
            if (backRef.current) {
                backRef.current.style.clipPath = state.backClip;
                backRef.current.style.transformOrigin = state.backOrigin;
                backRef.current.style.transform = state.backTransform;
            }
            if (shadeRef.current) {
                shadeRef.current.style.clipPath = state.backClip;
                shadeRef.current.style.background = state.backShade.gradient;
                shadeRef.current.style.opacity = String(state.backShade.opacity);
            }
            if (shadowRef.current) {
                shadowRef.current.style.left = `${state.shadow.left}px`;
                shadowRef.current.style.width = `${state.shadow.width}px`;
                shadowRef.current.style.background = state.shadow.gradient;
                shadowRef.current.style.opacity = state.visible ? '1' : '0';
            }
        };

        /**
         * Lleva el pliegue de donde está hasta el final y lo retira.
         *
         * Es lo que remata el gesto. La hoja no puede desaparecer a medio doblar
         * —eso es lo que se veía: un pliegue clavado en la pantalla— ni saltar de
         * golpe al otro lado. La página de debajo ya cambió antes de empezar
         * esto, y las copias siguen teniendo la página vieja, así que la
         * animación sigue contando la verdad mientras dura.
         */
        const animate = (to, direction, done) => {
            cancelAnimationFrame(frame);
            const from = shown;
            const start = performance.now();
            const span = Math.max(90, 190 * Math.abs(to - from));

            const step = (now) => {
                const t = Math.min(1, (now - start) / span);
                // Desacelera al final: el papel no se para en seco.
                const eased = 1 - (1 - t) ** 3;
                paint(from + (to - from) * eased, direction);
                if (t < 1) { frame = requestAnimationFrame(step); return; }
                done?.();
            };

            frame = requestAnimationFrame(step);
        };

        controllerRef.current = {
            /** Sigue al dedo, fotograma a fotograma. */
            set(progress, direction) {
                cancelAnimationFrame(frame);
                paint(progress, direction);
            },
            /** Remata el doblado y retira la hoja. */
            finish(direction) {
                if (shown <= 0) return;
                animate(1, direction, () => paint(0, direction));
            },
            /** Devuelve la hoja a su sitio: el gesto no llegó a pasar página. */
            cancel(direction) {
                if (shown <= 0) { paint(0, direction); return; }
                animate(0, direction);
            },
            /** La retira sin animar, para cuando la página cambia por otra vía. */
            hide() {
                cancelAnimationFrame(frame);
                paint(0, 'next');
            },
        };

        // El estado inicial se escribe también en el DOM, no solo en el atributo
        // `style` del JSX: al volver a montarse el nodo conserva lo que le
        // escribimos a mano la última vez, y React no lo reescribe porque para él
        // la propiedad no ha cambiado. Ahí se quedaba el pliegue clavado.
        paint(0, 'next');

        return () => {
            cancelAnimationFrame(frame);
            controllerRef.current = null;
        };
    }, [controllerRef, width]);

    return (
        <div className="fold" ref={rootRef} aria-hidden="true" style={{ visibility: 'hidden' }}>
            {/* Sombra que la hoja doblada proyecta sobre la página nueva. Va
                debajo de las copias: es lo que hay entre las dos hojas. */}
            <span className="fold-shadow" ref={shadowRef} />

            {/* La parte de la hoja vieja que sigue plana. */}
            <span className="fold-flat" ref={flatRef} style={{ width, height }} />

            {/* El dorso: la misma página reflejada sobre la línea del doblez. */}
            <span className="fold-back" ref={backRef} style={{ width, height }} />

            {/* Sombreado del dorso, encima del reflejo. */}
            <span className="fold-shade" ref={shadeRef} />
        </div>
    );
}
