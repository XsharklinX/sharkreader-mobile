import React, { useCallback, useEffect, useRef, useState } from 'react';
import { lineHeightPx, snapToLine, rulerGeometry } from './ruler.js';

/**
 * Regla de lectura sobre el texto del libro.
 *
 * Se pinta **encima** del iframe, no dentro: dentro tendría que reinyectarse en
 * cada capítulo y competiría con los subrayados por el mismo espacio de
 * anotaciones de epub.js. Fuera es una capa que se mueve sola.
 *
 * La capa deja pasar el toque salvo en la propia banda, que es la que se
 * arrastra. Si capturara todo, el modo regla convertiría el libro en una imagen:
 * no se podría pasar página, ni seleccionar, ni tocar una nota.
 */
export default function ReadingRuler({ mode, typography, onClose }) {
    const layerRef = useRef(null);
    const [bandTop, setBandTop] = useState(null);
    const [geometry, setGeometry] = useState(null);
    const dragging = useRef(false);

    const line = lineHeightPx(typography);

    // Todo se lleva en coordenadas **de la capa**, no de la pantalla: lo que se
    // escribe luego en `style.top` es relativo a la capa, y mezclar los dos
    // sistemas descoloca la banda en cuanto el lector no empieza en el píxel 0
    // —con la barra de estado, con una pantalla con muesca—.
    /** @param {number} y Vertical **dentro de la capa**. */
    const moveToLocal = useCallback((y) => {
        const node = layerRef.current;
        if (!node) return;
        setBandTop(snapToLine(y, 0, node.getBoundingClientRect().height, line));
    }, [line]);

    /** @param {number} clientY Vertical del evento, en coordenadas de pantalla. */
    const moveTo = useCallback((clientY) => {
        const rect = layerRef.current?.getBoundingClientRect();
        if (rect) moveToLocal(clientY - rect.top);
    }, [moveToLocal]);

    // Posición inicial: un tercio de la altura. Arriba del todo la banda cae
    // sobre el margen superior, donde no hay texto que iluminar.
    useEffect(() => {
        const node = layerRef.current;
        if (!node || bandTop !== null) return;
        const rect = node.getBoundingClientRect();
        setBandTop(snapToLine(rect.height / 3, 0, rect.height, line));
    }, [bandTop, line]);

    // La geometría se recalcula al mover la banda y al cambiar el interlineado.
    useEffect(() => {
        const node = layerRef.current;
        if (!node || bandTop === null) return;
        const rect = node.getBoundingClientRect();
        setGeometry(rulerGeometry(bandTop, rect.height, line, 0));
    }, [bandTop, line]);

    // Al girar la pantalla la banda puede quedar fuera del área nueva. Se
    // vuelve a encajar en vez de dejarla perdida debajo del borde.
    useEffect(() => {
        const reclamp = () => setBandTop((current) => {
            const node = layerRef.current;
            if (!node || current === null) return current;
            return snapToLine(current + line / 2, 0, node.getBoundingClientRect().height, line);
        });
        window.addEventListener('resize', reclamp);
        return () => window.removeEventListener('resize', reclamp);
    }, [line]);

    const onPointerDown = (event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        moveTo(event.clientY);
    };

    const onPointerMove = (event) => {
        if (!dragging.current) return;
        moveTo(event.clientY);
    };

    const onPointerUp = () => { dragging.current = false; };

    if (!geometry) return <div className="ruler-layer" ref={layerRef} aria-hidden="true" />;

    return (
        <div className="ruler-layer" ref={layerRef} aria-hidden="true">
            {/* En modo 'line' no se atenúa nada: hay a quien la banda le resulta
                agobiante y solo quiere el renglón marcado. */}
            {mode === 'band' && (
                <>
                    <div
                        className="ruler-shade"
                        style={{ top: geometry.above.top, height: geometry.above.height }}
                    />
                    <div
                        className="ruler-shade"
                        style={{ top: geometry.below.top, height: geometry.below.height }}
                    />
                </>
            )}

            <div
                className={`ruler-band ${mode}`}
                style={{ top: geometry.band.top, height: geometry.band.height }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                role="slider"
                aria-label="Regla de lectura"
                aria-valuenow={Math.round(geometry.band.top)}
                tabIndex={0}
                onKeyDown={(event) => {
                    // `snapToLine` centra en el punto recibido, así que para
                    // avanzar una línea hay que apuntar al centro de la
                    // siguiente, no a su borde.
                    if (event.key === 'ArrowDown') moveToLocal(geometry.band.top + line * 1.5);
                    else if (event.key === 'ArrowUp') moveToLocal(geometry.band.top - line / 2);
                    else if (event.key === 'Escape') onClose?.();
                }}
            >
                <span className="ruler-grip" />
            </div>
        </div>
    );
}
