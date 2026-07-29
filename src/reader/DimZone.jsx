import React, { useRef, useState } from 'react';
import { IconSun } from '../ui/icons.jsx';

/**
 * Atenuador de pantalla.
 *
 * Deslizar en vertical por el borde izquierdo oscurece el texto, como en Moon+
 * Reader. Es la diferencia entre poder leer en la cama y tener que salir del
 * libro para bajar el brillo del sistema.
 *
 * Se implementa con una capa negra semitransparente por encima del contenido en
 * lugar de tocar el brillo real de la ventana: no necesita plugin nativo ni
 * permisos, y baja el brillo percibido por debajo del mínimo del sistema, que es
 * justo lo que se busca de noche.
 */
const MAX_DIM = 0.72;

export default function DimZone({ value, onChange }) {
    const [dragging, setDragging] = useState(false);
    const start = useRef({ y: 0, value: 0 });

    const handleDown = (event) => {
        start.current = { y: event.clientY, value };
        setDragging(true);
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    const handleMove = (event) => {
        if (!dragging) return;
        const travel = window.innerHeight * 0.45;
        // Arrastrar hacia abajo oscurece: sigue la misma dirección que el gesto
        // de brillo del sistema.
        const delta = (event.clientY - start.current.y) / travel;
        onChange(Math.min(MAX_DIM, Math.max(0, start.current.value + delta)));
    };

    const handleUp = (event) => {
        setDragging(false);
        event.currentTarget.releasePointerCapture?.(event.pointerId);
    };

    return (
        <>
            <div
                className="reader-dimzone"
                onPointerDown={handleDown}
                onPointerMove={handleMove}
                onPointerUp={handleUp}
                onPointerCancel={handleUp}
                aria-hidden="true"
            />

            {dragging && (
                <div className="reader-dimhint" role="status" aria-live="polite">
                    <IconSun size={16} />
                    <span className="bar">
                        <i style={{ height: `${Math.round((1 - value / MAX_DIM) * 100)}%` }} />
                    </span>
                    <span className="mono" style={{ fontSize: 10 }}>
                        {Math.round((1 - value / MAX_DIM) * 100)}
                    </span>
                </div>
            )}
        </>
    );
}
