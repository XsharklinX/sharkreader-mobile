import { useCallback, useRef, useState } from 'react';

/**
 * Historial de posiciones dentro del libro.
 *
 * Saltar desde el índice, desde un resultado de búsqueda o desde una nota te
 * lleva a otro sitio y **pierdes dónde estabas**. En el escritorio eso se
 * deshace con Alt+←; en móvil no había forma de volver.
 *
 * Solo se apilan los saltos deliberados, no el paso normal de páginas: si cada
 * página entrara en la pila, «volver» retrocedería una página y dejaría de
 * significar «llévame de vuelta a donde estaba».
 */
const MAX_ENTRIES = 30;

export const useHistory = () => {
    const stack = useRef([]);
    const [canGoBack, setCanGoBack] = useState(false);

    /** Guarda la posición actual antes de un salto. */
    const push = useCallback((entry) => {
        if (!entry?.cfi) return;

        // Saltar dos veces al mismo sitio no debe apilar dos veces.
        const last = stack.current[stack.current.length - 1];
        if (last?.cfi === entry.cfi) return;

        stack.current = [...stack.current, entry].slice(-MAX_ENTRIES);
        setCanGoBack(true);
    }, []);

    /** Devuelve la última posición guardada y la saca de la pila. */
    const pop = useCallback(() => {
        if (stack.current.length === 0) return null;
        const entry = stack.current[stack.current.length - 1];
        stack.current = stack.current.slice(0, -1);
        setCanGoBack(stack.current.length > 0);
        return entry;
    }, []);

    const clear = useCallback(() => {
        stack.current = [];
        setCanGoBack(false);
    }, []);

    return {
        push,
        pop,
        clear,
        canGoBack,
        /** Etiqueta del sitio al que se volvería, para poder mostrarla. */
        peekLabel: () => stack.current[stack.current.length - 1]?.label || '',
        depth: () => stack.current.length,
    };
};
