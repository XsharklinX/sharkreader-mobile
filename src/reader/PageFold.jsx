import React, { useEffect, useRef } from 'react';
import { foldState } from './pageFold.js';

/**
 * Las capas del doblado de hoja.
 *
 * Recibe la página que se va como un canvas ya rasterizado y la dibuja dos veces:
 * plana a un lado del doblez y reflejada al otro. Ver `pageFold.js` para la
 * geometría y por qué el reflejo especular es exacto y no una aproximación.
 *
 * ## Por qué el progreso no vive en el estado de React
 *
 * Durante el arrastre esto se actualiza en cada fotograma. Pasar por un render de
 * React sesenta veces por segundo para mover un recorte es tirar el presupuesto de
 * tiempo: el componente se monta una vez y luego los estilos se escriben
 * directamente sobre los nodos. Es la misma razón por la que el arrastre de la
 * página tampoco pasa por el estado.
 */
export default function PageFold({ canvas, offset, width, height, controllerRef }) {
    const flatRef = useRef(null);
    const backRef = useRef(null);
    const shadeRef = useRef(null);
    const shadowRef = useRef(null);
    const rootRef = useRef(null);

    // Las dos copias del mapa de bits. Se insertan a mano porque son el mismo
    // canvas dibujado dos veces y React no puede montar un nodo dos veces.
    useEffect(() => {
        if (!canvas || !flatRef.current || !backRef.current || !width) return;

        /**
         * Recorta la página visible del capítulo rasterizado.
         *
         * El recorte se hace aquí y no al rasterizar porque pedirle al
         * rasterizador un recuadro concreto devolvía una imagen en blanco: su clon
         * maqueta las columnas en otras coordenadas. Ver `pageSnapshot.js`.
         */
        const paint = (host) => {
            host.replaceChildren();
            const image = document.createElement('canvas');
            image.width = width;
            image.height = height;
            image.style.width = `${width}px`;
            image.style.height = `${height}px`;
            image.style.display = 'block';
            image.getContext('2d')?.drawImage(
                canvas,
                offset?.x || 0, offset?.y || 0, width, height,
                0, 0, width, height
            );
            host.appendChild(image);
        };

        paint(flatRef.current);
        paint(backRef.current);
    }, [canvas, offset, width, height]);

    /**
     * Mueve el doblez. La llama el arrastre en cada fotograma.
     *
     * Se expone por ref en lugar de por prop para que quien arrastra no tenga que
     * provocar un render: escribe aquí y los estilos van directos al nodo.
     */
    useEffect(() => {
        if (!controllerRef) return undefined;

        controllerRef.current = {
            set(progress, direction) {
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
            },
        };

        return () => { controllerRef.current = null; };
    }, [controllerRef, width]);

    return (
        <div className="fold" ref={rootRef} aria-hidden="true" style={{ visibility: 'hidden' }}>
            {/* Sombra que la hoja doblada proyecta sobre la página nueva. Va
                debajo de las copias: es lo que hay entre las dos hojas. */}
            <span className="fold-shadow" ref={shadowRef} />

            {/* La parte de la hoja vieja que sigue plana. */}
            <span className="fold-flat" ref={flatRef} />

            {/* El dorso: la misma imagen reflejada sobre la línea del doblez. */}
            <span className="fold-back" ref={backRef} />

            {/* Sombreado del dorso, encima del reflejo. */}
            <span className="fold-shade" ref={shadeRef} />
        </div>
    );
}
