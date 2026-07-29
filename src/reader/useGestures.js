/**
 * Gestos del lector.
 *
 * El escritorio navega con teclado y ratón; aquí todo pasa por el dedo. Las tres
 * zonas verticales de la pantalla se reparten así:
 *
 *   ┌──────┬────────────┬──────┐
 *   │ ←    │  controles │    → │
 *   │ 28%  │    44%     │  28% │
 *   └──────┴────────────┴──────┘
 *
 * Un toque en los laterales pasa página; en el centro muestra u oculta la
 * interfaz. Deslizar horizontalmente también pasa página, con un umbral que
 * evita que un roce al hacer scroll cuente como gesto.
 */

const TAP_ZONE = 0.28;         // ancho de las zonas laterales
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
 */
export const createGestureHandlers = ({
    onNext,
    onPrev,
    onToggleChrome,
    onLongPress,
    shouldIgnore,
    getWidth,
}) => {
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
        clearLongPress();
        if (onLongPress) {
            longPressTimer = setTimeout(() => {
                longPressTimer = null;
                start = null; // consumido: el pointerup ya no debe pasar página
                onLongPress({ x: event.clientX, y: event.clientY });
            }, LONG_PRESS_MS);
        }
    };

    const onPointerUp = (event) => {
        clearLongPress();
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

        const ratio = event.clientX / width;
        if (ratio < TAP_ZONE) onPrev();
        else if (ratio > 1 - TAP_ZONE) onNext();
        else onToggleChrome();
    };

    const onPointerCancel = () => {
        clearLongPress();
        start = null;
    };

    return { onPointerDown, onPointerUp, onPointerCancel, onPointerLeave: onPointerCancel };
};

/** Zona en la que cae un punto — se usa para pintar las ayudas visuales. */
export const zoneAt = (x, width) => {
    const ratio = x / width;
    if (ratio < TAP_ZONE) return 'prev';
    if (ratio > 1 - TAP_ZONE) return 'next';
    return 'chrome';
};

export const GESTURE_CONSTANTS = {
    TAP_ZONE,
    SWIPE_MIN_DISTANCE,
    SWIPE_MAX_DURATION,
    TAP_MAX_MOVEMENT,
    LONG_PRESS_MS,
};
