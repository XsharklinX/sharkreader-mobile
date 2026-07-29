/**
 * Arrastre de página.
 *
 * La diferencia entre «la app respondió» y «he pasado la página». Las
 * transiciones normales se ejecutan **después** de que el contenido cambie:
 * pulsas y entonces algo se desliza. Aquí la página se mueve mientras arrastras
 * y, si sueltas antes del umbral, vuelve a su sitio.
 *
 * Lo importante es que el gesto sea **reversible**: mientras no pases del 35%
 * del ancho puedes echarte atrás. Eso es lo que hace que se sienta como pasar
 * una hoja y no como pulsar un botón con animación.
 */

/** Fracción del ancho a partir de la cual el gesto se completa al soltar. */
export const COMMIT_THRESHOLD = 0.35;

/** Un gesto rápido completa aunque no llegue al umbral, como en cualquier carrusel. */
export const FLICK_VELOCITY = 0.5; // px por milisegundo

/** Movimiento mínimo antes de considerar que esto es un arrastre y no un toque. */
export const DRAG_START = 10;

/**
 * Decide qué hacer al soltar.
 *
 * @param {Object} gesture
 * @param {number} gesture.dx        Desplazamiento horizontal, px.
 * @param {number} gesture.width     Ancho de la página, px.
 * @param {number} gesture.elapsed   Duración del gesto, ms.
 * @returns {{commit: boolean, direction: 'next'|'prev'}}
 */
export const resolveDrag = ({ dx, width, elapsed }) => {
    const direction = dx < 0 ? 'next' : 'prev';
    const distance = Math.abs(dx);
    const velocity = elapsed > 0 ? distance / elapsed : 0;

    const passedThreshold = width > 0 && distance / width >= COMMIT_THRESHOLD;
    const wasFlick = velocity >= FLICK_VELOCITY && distance > DRAG_START * 2;

    return { commit: passedThreshold || wasFlick, direction };
};

/**
 * Desplazamiento que se aplica a la capa mientras el dedo está puesto.
 *
 * Al llegar al borde del libro —principio o final— el movimiento se amortigua
 * en lugar de bloquearse: el usuario nota que no hay nada más ahí sin que la
 * pantalla se quede rígida.
 */
export const dragOffset = ({ dx, width, atStart, atEnd }) => {
    const blocked = (dx > 0 && atStart) || (dx < 0 && atEnd);
    if (!blocked) return dx;
    // Resistencia de goma: se avanza cada vez menos.
    const limit = width * 0.12;
    return Math.sign(dx) * limit * (1 - Math.exp(-Math.abs(dx) / limit));
};

/**
 * Crea el controlador del gesto.
 *
 * No toca el DOM: recibe funciones para mover y confirmar, de modo que la
 * lógica se puede probar sin navegador.
 */
export const createPageDrag = ({
    getWidth, onMove, onCommit, onCancel, isEnabled, onStart, onEnd,
}) => {
    let start = null;

    const reset = () => { start = null; };

    return {
        down(event) {
            if (isEnabled && !isEnabled()) return;
            start = { x: event.clientX, y: event.clientY, time: Date.now(), dragging: false };
            // Aviso de que puede empezar un arrastre, para que quien dibuja tenga
            // tiempo de preparar la capa antes del primer movimiento.
            onStart?.();
        },

        move(event) {
            if (!start) return;

            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;

            // Hasta que el movimiento es claramente horizontal no se empieza a
            // arrastrar: si no, cualquier intento de seleccionar texto o de
            // hacer scroll movería la página.
            if (!start.dragging) {
                if (Math.abs(dx) < DRAG_START) return;
                if (Math.abs(dy) > Math.abs(dx)) { reset(); return; }
                start.dragging = true;
            }

            start.dx = dx;
            const width = getWidth();
            const offset = dragOffset({ dx, width });
            // Se pasa también el progreso y el sentido: el doblado de hoja
            // necesita saber cuánto se ha recorrido, no solo cuántos píxeles.
            onMove(
                offset,
                width > 0 ? Math.min(1, Math.abs(offset) / width) : 0,
                dx < 0 ? 'next' : 'prev'
            );
        },

        up(event) {
            if (!start) return false;
            const dragging = start.dragging;
            if (!dragging) { reset(); onEnd?.(); return false; }

            const result = resolveDrag({
                dx: event.clientX - start.x,
                width: getWidth(),
                elapsed: Date.now() - start.time,
            });
            reset();
            onEnd?.();

            if (result.commit) onCommit(result.direction);
            else onCancel();

            // Se devuelve true para que el manejador de toques sepa que este
            // gesto ya se ha consumido y no lo interprete además como un toque.
            return true;
        },

        /**
         * El sistema se ha quedado el gesto a mitad.
         *
         * Pasa cuando Android decide que el arrastre es suyo —el panel de
         * notificaciones, el gesto de atrás desde el borde, un WebView que
         * ignora `touch-action`—. Si ya se había recorrido lo suficiente para
         * pasar página, se pasa: el usuario completó el gesto y no tiene forma
         * de saber que el sistema lo interrumpió; ver la página volver a su
         * sitio se lee como que la app ha fallado.
         */
        cancel() {
            onEnd?.();
            if (!start?.dragging) { reset(); return; }
            const { commit, direction } = resolveDrag({
                dx: start.dx || 0,
                width: getWidth(),
                elapsed: Date.now() - start.time,
            });
            reset();
            if (commit) onCommit(direction);
            else onCancel();
        },

        isDragging: () => Boolean(start?.dragging),
    };
};
