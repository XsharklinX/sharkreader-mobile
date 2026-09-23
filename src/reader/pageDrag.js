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

/**
 * Cuánto hay que arrastrar para que un gesto **lento** complete.
 *
 * Algo más de media pantalla, no un tercio. Con el impulso funcionando hay dos
 * formas claras de pasar página —empujarla más allá de la mitad, o darle un
 * golpe— y ninguna se dispara sin querer. Con el tercio de antes, un arrastre
 * corto y dubitativo pasaba página igual que uno decidido.
 *
 * El 0,55 y no el 0,5 es a propósito: **media pantalla exacta tiene que ser
 * terreno neutro**, donde decide cómo sueltas y no dónde estás. Con el umbral
 * justo en la mitad, soltar ahí completaba siempre y el impulso no pintaba nada
 * en el único punto donde de verdad importa.
 */
export const COMMIT_THRESHOLD = 0.55;

/**
 * Velocidad a partir de la cual un golpe pasa página, aunque sea corto.
 *
 * Píxeles por milisegundo. Medida **sobre el final del gesto**, no sobre su
 * media: ver `VENTANA_MS`.
 */
export const FLICK_VELOCITY = 0.5;

/**
 * Cuánto del final del gesto cuenta para la velocidad.
 *
 * **Aquí estaba el fallo del impulso.** La velocidad se sacaba de dividir todo
 * el recorrido entre toda la duración, que es la media del gesto y no dice nada
 * de cómo se ha soltado. Un arrastre lento que acaba en un golpe daba media
 * lenta; uno rápido que se para antes de soltar daba media rápida. Lo que manda
 * al soltar algo es la velocidad que llevaba **en ese instante**, y eso son los
 * últimos milisegundos.
 */
export const VENTANA_MS = 90;

/**
 * Impulso al soltar, en píxeles por milisegundo, acotado.
 *
 * Se acota para que un golpe brutal no dispare una animación de dos fotogramas
 * que se lee como un salto en vez de como un movimiento.
 */
export const IMPULSO_MAX = 3;

/** Movimiento mínimo antes de considerar que esto es un arrastre y no un toque. */
export const DRAG_START = 10;

/**
 * Decide qué hacer al soltar.
 *
 * @param {Object} gesture
 * @param {number} gesture.dx        Desplazamiento horizontal, px.
 * @param {number} gesture.width     Ancho de la página, px.
 * @param {number} gesture.elapsed   Duración del gesto, ms.
 * @param {number} [gesture.impulso] Velocidad al soltar, px/ms, con signo.
 * @returns {{commit: boolean, direction: 'next'|'prev', impulso: number}}
 */
export const resolveDrag = ({ dx, width, elapsed, impulso }) => {
    const distance = Math.abs(dx);

    // Sin impulso medido se cae a la media del gesto, que es lo que había. Vale
    // para el gesto interrumpido por el sistema, donde no hay últimos
    // milisegundos que mirar.
    const v = Number.isFinite(impulso)
        ? impulso
        : (elapsed > 0 ? dx / elapsed : 0);

    const rapido = Math.abs(v) >= FLICK_VELOCITY && distance > DRAG_START * 2;

    /**
     * Un golpe manda sobre la distancia, **y también para volver**.
     *
     * Si al soltar el dedo iba hacia atrás, el usuario se está echando atrás
     * aunque haya recorrido media pantalla: completar ahí es lo que hace que un
     * gesto se sienta fuera de control.
     */
    if (rapido) {
        return {
            commit: true,
            direction: v < 0 ? 'next' : 'prev',
            impulso: Math.max(-IMPULSO_MAX, Math.min(IMPULSO_MAX, v)),
        };
    }

    const direction = dx < 0 ? 'next' : 'prev';
    const passedThreshold = width > 0 && distance / width >= COMMIT_THRESHOLD;

    return { commit: passedThreshold, direction, impulso: 0 };
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
    atStart, atEnd,
}) => {
    let start = null;

    /**
     * Velocidad del dedo al soltar, en px/ms y con signo.
     *
     * Se saca del rastro reciente. Con menos de dos puntos no hay velocidad que
     * medir y se devuelve `null`, que es la señal para caer a la media.
     */
    const impulsoDe = () => {
        const rastro = start?.rastro || [];
        if (rastro.length < 2) return null;
        const primero = rastro[0];
        const ultimo = rastro[rastro.length - 1];
        const dt = ultimo.t - primero.t;
        if (dt <= 0) return null;
        return (ultimo.x - primero.x) / dt;
    };

    const reset = () => { start = null; };

    return {
        down(event) {
            if (isEnabled && !isEnabled()) return;
            start = {
                x: event.clientX,
                y: event.clientY,
                time: Date.now(),
                dragging: false,
                // Las últimas posiciones con su instante. Con esto se puede saber
                // a qué velocidad iba el dedo **al soltar**, que es lo único que
                // importa para el impulso.
                rastro: [],
            };
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
            const ahora = Date.now();
            start.rastro.push({ x: event.clientX, t: ahora });
            // Solo se guarda la ventana reciente: el rastro entero no se usa y en
            // un arrastre largo serían cientos de puntos para nada.
            while (start.rastro.length > 2 && ahora - start.rastro[0].t > VENTANA_MS) {
                start.rastro.shift();
            }

            const width = getWidth();
            const offset = dragOffset({
                dx,
                width,
                atStart: atStart?.() || false,
                atEnd: atEnd?.() || false,
            });
            // Se pasa también el progreso, el sentido y **dónde está el dedo**.
            // El doblado de esquina no se describe con un número: la esquina
            // agarrada acaba justo debajo del dedo, así que hace falta el punto.
            onMove(
                offset,
                width > 0 ? Math.min(1, Math.abs(offset) / width) : 0,
                dx < 0 ? 'next' : 'prev',
                { x: event.clientX, y: event.clientY }
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
                impulso: impulsoDe(),
            });
            reset();
            onEnd?.();

            if (result.commit) onCommit(result.direction, result.impulso);
            else onCancel(result.impulso);

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
            const { commit, direction, impulso } = resolveDrag({
                dx: start.dx || 0,
                width: getWidth(),
                elapsed: Date.now() - start.time,
                // El rastro sigue ahí aunque el gesto lo haya cortado el sistema:
                // el dedo llevaba una velocidad y la página tiene que salir con
                // ella, no a una velocidad fija distinta de la del gesto de al
                // lado que sí terminó bien.
                impulso: impulsoDe(),
            });
            reset();
            if (commit) onCommit(direction, impulso);
            else onCancel(impulso);
        },

        isDragging: () => Boolean(start?.dragging),
    };
};
