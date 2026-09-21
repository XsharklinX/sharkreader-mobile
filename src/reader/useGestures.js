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
 * **Reclamar el gesto.** En cuanto el movimiento es claramente horizontal se
 * llama a `preventDefault()` y se borra cualquier selección naciente. Sin eso,
 * el WebView de Android empieza a seleccionar texto al arrastrar el dedo sobre
 * un párrafo, y el gesto se perdía: al soltar siempre había selección. Los
 * toques nunca fallaron porque un toque no selecciona nada.
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
 * Píxeles horizontales tras los que el gesto se declara nuestro.
 *
 * Más bajo que el umbral de arrastre a propósito: hay que reclamarlo antes de
 * que el WebView haya empezado a seleccionar texto, no después.
 */
const HORIZONTAL_CLAIM = 6;

/**
 * @param {Object} handlers
 * @param {() => void} handlers.onNext
 * @param {() => void} handlers.onPrev
 * @param {() => void} handlers.onToggleChrome
 * @param {(point: {x: number, y: number}) => void} [handlers.onLongPress]
 * @param {() => boolean} [handlers.shouldIgnore]
 *   Se consulta **al empezar** el gesto: si ya había texto seleccionado, el
 *   dedo estaba marcando y no navegando, así que el gesto se descarta.
 * @param {() => void} [handlers.clearSelection]
 *   Borra la selección que aparezca en los primeros píxeles de un arrastre
 *   horizontal, antes de que dé tiempo a reclamar el gesto.
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
        start = {
            x: event.clientX,
            y: event.clientY,
            time: Date.now(),
            // Se anota si **ya había** texto seleccionado al empezar.
            //
            // Antes se preguntaba al soltar, y eso rompía el deslizamiento: al
            // arrastrar el dedo sobre el texto, el WebView empieza a
            // seleccionar, así que al llegar el `pointerup` siempre había
            // selección y el gesto se descartaba entero. Los toques seguían
            // funcionando porque un toque no selecciona nada — exactamente el
            // síntoma que se veía.
            //
            // Lo que se quiere expresar es «el dedo estaba marcando, no
            // navegando», y eso se decide al empezar el gesto, no al acabarlo.
            hadSelection: Boolean(shouldIgnore?.()),
        };
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
        claimHorizontal(event);
        handlers.onDragMove?.(event);
    };

    /**
     * Reclama el gesto en cuanto se ve que es horizontal.
     *
     * Dos cosas, y las dos hacen falta:
     *
     *  1. `preventDefault()` para que el WebView no siga extendiendo la
     *     selección ni desplazando por su cuenta. Solo funciona porque el
     *     oyente se registra con `passive: false`.
     *  2. Borrar la selección que haya podido aparecer en los primeros píxeles,
     *     antes de que diera tiempo a reclamarlo. Si no, el texto se queda
     *     marcado en azul detrás de la página que se está arrastrando.
     */
    const claimHorizontal = (event) => {
        if (!start || start.hadSelection) return;

        const dx = Math.abs(event.clientX - start.x);
        const dy = Math.abs(event.clientY - start.y);
        if (dx < HORIZONTAL_CLAIM || dx <= dy) return;

        start.claimed = true;
        if (event.cancelable) event.preventDefault();
        handlers.clearSelection?.();
    };

    /**
     * El mismo trabajo para los eventos táctiles.
     *
     * En el WebView de Android los eventos de puntero se sintetizan a partir de
     * los táctiles, y hay versiones que dejan de emitir `pointermove` en cuanto
     * el sistema toma el gesto. `touchmove` sigue llegando y es el que de
     * verdad se puede cancelar.
     */
    const onTouchMove = (event, toLocal) => {
        const touch = event.touches?.[0];
        if (!touch || !start) return;

        // Las coordenadas se traducen al espacio del contenedor igual que las de
        // puntero: dentro del iframe la x de un toque es su posición entre todas
        // las columnas del capítulo, no dónde ha caído el dedo.
        const point = toLocal
            ? toLocal({ clientX: touch.clientX, clientY: touch.clientY, cancelable: event.cancelable })
            : { clientX: touch.clientX, clientY: touch.clientY };

        claimHorizontal({
            clientX: point.clientX,
            clientY: point.clientY,
            cancelable: event.cancelable,
            preventDefault: () => event.preventDefault(),
        });
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
        const { hadSelection } = start;
        start = null;

        // El dedo estaba marcando texto desde el principio: no navegaba.
        if (hadSelection) return;

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

        // Dónde se tocó. El doblado de esquina levanta la esquina que toca —si
        // tocas arriba, la de arriba— y sin el punto siempre levantaría la misma,
        // que se nota como una animación enlatada.
        handlers.onTapPoint?.({ x: event.clientX, y: event.clientY });

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
        onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onTouchMove,
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
