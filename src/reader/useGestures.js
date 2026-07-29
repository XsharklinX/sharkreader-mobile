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

/**
 * Ancho de las zonas laterales, como fracción del ancho de página.
 *
 * Era 0.28. Con casi un tercio de pantalla por lado, el centro «real» —lo que
 * uno percibe como el medio— quedaba dentro de la zona de paso de página, y
 * tocar un poco a la izquierda del centro retrocedía. 0.18 deja el 64 % central
 * libre, que ya se lee claramente como centro.
 */
const TAP_ZONE = 0.18;

/**
 * Tope absoluto de la zona lateral, en píxeles.
 *
 * En una tablet, un 18 % de 1200 px son 216 px de banda muerta a cada lado:
 * media pantalla dedicada a pasar página. El toque es del mismo tamaño en
 * cualquier pantalla —un pulgar— así que la zona también debe serlo a partir de
 * cierto ancho.
 */
const TAP_ZONE_MAX_PX = 140;

/** Ancho efectivo de la zona lateral para un ancho de página dado. */
export const tapZoneWidth = (width) =>
    Math.min(TAP_ZONE_MAX_PX, width * TAP_ZONE);
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
 * @param {(point: {x: number, y: number}) => boolean} [handlers.onTapWhileSpeaking]
 *   Se puede asignar después de crear los manejadores: el objeto devuelto es el
 *   mismo que se recibe, porque los gestos se registran dentro del iframe
 *   durante la carga y ya no se vuelven a crear.
 */
export const createGestureHandlers = (handlers) => {
    const { onNext, onPrev, onToggleChrome, onLongPress, shouldIgnore, getWidth } = handlers;
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

        const zone = tapZoneWidth(width);
        if (event.clientX < zone) onPrev();
        else if (event.clientX > width - zone) onNext();
        else onToggleChrome();
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
