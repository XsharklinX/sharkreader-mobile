/**
 * Gestos del lector.
 *
 * El escritorio navega con teclado y ratón; aquí todo pasa por el dedo. Las tres
 * zonas verticales de la pantalla se reparten así:
 *
 *   ┌────┬──────────────────┬────┐
 *   │ ←  │    controles     │  → │
 *   │18% │       64%        │18% │
 *   └────┴──────────────────┴────┘
 *
 * Un toque en los laterales pasa página; en el centro muestra u oculta la
 * interfaz. Deslizar horizontalmente también pasa página, con un umbral que
 * evita que un roce al hacer scroll cuente como gesto.
 *
 * Las zonas se miden en las coordenadas del **documento del libro**, que es
 * donde se escuchan los eventos. El contenedor es más ancho —lleva los
 * márgenes de lectura como relleno— y usar su ancho hacía la zona izquierda
 * más grande que la derecha.
 */

import { actionAt, tapZoneWidth, TAP_ZONE, TAP_ZONE_MAX_PX } from './gestureGrid.js';

// Reexportado: las zonas son ahora de `gestureGrid`, que es quien las
// configura, pero media app las pide por aquí.
export { tapZoneWidth };

const SWIPE_MIN_DISTANCE = 48; // px que hay que recorrer para que cuente
const SWIPE_MAX_DURATION = 700;// ms: más lento que esto no es un deslizamiento
const TAP_MAX_MOVEMENT = 12;   // px de tolerancia para considerar que fue un toque
const LONG_PRESS_MS = 480;

/**
 * @param {Object} handlers
 * @param {() => void} handlers.onNext
 * @param {() => void} handlers.onPrev
 * @param {() => void} handlers.onToggleChrome
 * @param {(point: {x: number, y: number}) => void} [handlers.onLongPress]
 * @param {() => boolean} [handlers.shouldIgnore]
 *   Se consulta al soltar el dedo. Sirve para que seleccionar texto dentro del
 *   libro no acabe pasando página: el gesto se descarta si devuelve true.
 * @param {() => number} [handlers.getWidth]
 *   Ancho de referencia para decidir la zona. Necesario cuando los eventos se
 *   escuchan en el documento de un iframe, que no tiene `clientWidth`.
 * @param {() => number} [handlers.getHeight]
 *   Alto de referencia, para las filas de la rejilla.
 * @param {string[]} [handlers.grid]
 *   Rejilla de nueve acciones. Se lee en cada toque, no al crear los
 *   manejadores: se pueden cambiar los gestos con el libro abierto.
 * @param {(action: string) => void} [handlers.onAction]
 *   Ejecuta la acción de la zona tocada.
 * @param {(point: {x: number, y: number}) => boolean} [handlers.onTapWhileSpeaking]
 *   Se puede asignar después de crear los manejadores: el objeto devuelto es el
 *   mismo que se recibe, porque los gestos se registran dentro del iframe
 *   durante la carga y ya no se vuelven a crear.
 */
export const createGestureHandlers = (handlers) => {
    const { onNext, onPrev, onLongPress, shouldIgnore, getWidth } = handlers;
    let start = null;
    let longPressTimer = null;

    const clearLongPress = () => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    };

    const onPointerDown = (event) => {
        start = { x: event.clientX, y: event.clientY, time: Date.now() };
        handlers.onDragDown?.(event);
        clearLongPress();
        if (onLongPress) {
            longPressTimer = setTimeout(() => {
                longPressTimer = null;
                start = null; // consumido: el pointerup ya no debe pasar página
                onLongPress({ x: event.clientX, y: event.clientY });
            }, LONG_PRESS_MS);
        }
    };

    const onPointerMove = (event) => {
        handlers.onDragMove?.(event);
    };

    const onPointerUp = (event) => {
        clearLongPress();

        // El arrastre se resuelve primero. Si ha consumido el gesto, no se
        // interpreta además como toque ni como deslizamiento: pasarían dos
        // páginas de golpe.
        if (handlers.onDragUp?.(event)) { start = null; return; }

        if (!start) return;

        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        const elapsed = Date.now() - start.time;
        const width = getWidth?.() || event.currentTarget?.clientWidth || window.innerWidth;
        start = null;

        // Hay texto seleccionado: el dedo estaba marcando, no navegando.
        if (shouldIgnore?.()) return;

        const movement = Math.hypot(dx, dy);

        // Deslizamiento horizontal claro: predomina el eje X y es rápido.
        if (Math.abs(dx) >= SWIPE_MIN_DISTANCE
            && Math.abs(dx) > Math.abs(dy) * 1.5
            && elapsed <= SWIPE_MAX_DURATION) {
            if (dx < 0) onNext();
            else onPrev();
            return;
        }

        // Si el dedo se movió demasiado no fue un toque; se ignora para no
        // pasar página al intentar seleccionar texto.
        if (movement > TAP_MAX_MOVEMENT) return;

        // Mientras se lee en voz alta, un toque salta a ese párrafo en lugar de
        // pasar página: es el gesto que se espera de un lector con voz, y sin él
        // habría que parar, buscar y volver a empezar.
        if (handlers.onTapWhileSpeaking?.({ x: event.clientX, y: event.clientY })) return;

        // La rejilla decide qué hace cada zona. Sin rejilla configurada se usa
        // el reparto por defecto, que es el de siempre: laterales pasan página,
        // centro enseña los controles.
        const height = handlers.getHeight?.() || 0;
        const action = actionAt(handlers.grid, event.clientX, event.clientY, width, height);

        // Las tres acciones básicas se resuelven aquí aunque no haya
        // despachador: son las que tiene cualquier lector y no deberían
        // depender de que quien monte los gestos se acuerde de conectarlas.
        // Las demás —marcador, índice, voz— sí necesitan `onAction`, porque
        // viven fuera de este módulo.
        if (handlers.onAction) { handlers.onAction(action); return; }
        if (action === 'next') onNext();
        else if (action === 'prev') onPrev();
        else if (action === 'chrome') handlers.onToggleChrome?.();
    };

    const onPointerCancel = () => {
        clearLongPress();
        handlers.onDragCancel?.();
        start = null;
    };

    // Se devuelve el mismo objeto que se muta desde fuera (onTapWhileSpeaking),
    // porque los gestos se registran en el iframe durante la carga y no se
    // vuelven a crear.
    Object.assign(handlers, {
        onPointerDown, onPointerMove, onPointerUp, onPointerCancel,
        onPointerLeave: onPointerCancel,
    });
    return handlers;
};

/** Zona en la que cae un punto — se usa para pintar las ayudas visuales. */
export const zoneAt = (x, width) => {
    const zone = tapZoneWidth(width);
    if (x < zone) return 'prev';
    if (x > width - zone) return 'next';
    return 'chrome';
};

export const GESTURE_CONSTANTS = {
    TAP_ZONE,
    TAP_ZONE_MAX_PX,
    SWIPE_MIN_DISTANCE,
    SWIPE_MAX_DURATION,
    TAP_MAX_MOVEMENT,
    LONG_PRESS_MS,
};
