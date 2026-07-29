import { useEffect, useRef } from 'react';
import { pushBackHandler } from './backStack.js';

/**
 * Registra un manejador del botón atrás mientras el componente esté montado.
 *
 * El manejador se guarda en una ref y se registra **una sola vez**: si se
 * volviera a registrar en cada render —que es lo que pasa si va en las
 * dependencias— la capa saltaría al final de la pila en cada cambio de estado y
 * acabaría atendiendo el atrás de capas abiertas después que ella.
 *
 * @param {() => boolean|void} handler
 *   Devuelve `true` si consume el evento; `false` lo deja pasar hacia abajo.
 * @param {boolean} [active] Registrado solo mientras sea true.
 */
export const useBackHandler = (handler, active = true) => {
    const ref = useRef(handler);
    ref.current = handler;

    useEffect(() => {
        if (!active) return undefined;
        return pushBackHandler(() => ref.current());
    }, [active]);
};
