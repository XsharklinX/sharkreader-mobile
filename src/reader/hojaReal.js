/**
 * Pasar página descubriendo la página de verdad.
 *
 * ## Cómo
 *
 * Detrás de la página real hay dos sombras ya pintadas: la siguiente y la
 * anterior (`EpubEngine.crearSombra`). Para pasar página:
 *
 *  1. La hoja real termina de irse hacia el lado —desde donde la dejó el dedo, o
 *     desde su sitio si fue un toque— y descubre la sombra, que **ya es** la
 *     página nueva.
 *  2. Con la hoja fuera de la pantalla, la página real avanza de verdad
 *     (`engine.next()`). Si cruza de capítulo y tarda trescientos milisegundos,
 *     no se ve: lo que hay en pantalla es la sombra, idéntica.
 *  3. Cuando la real ya está pintada, vuelve a su sitio de golpe. Como enseña
 *     exactamente lo mismo que la sombra, el cambio es invisible.
 *
 * Así desaparecen las dos cosas que hacían frágil el lector: la página que no
 * existía debajo del dedo y la espera al cambiar de capítulo.
 *
 * ## Toques rápidos
 *
 * Mientras una hoja está en camino, otro toque no se pierde: queda apuntado y se
 * hace en cuanto la primera termina. Tres toques seguidos son tres páginas.
 */

/** Lo que dura cruzar la pantalla entera sin impulso, en ms. */
export const DURACION_BASE = 240;
/** Por debajo de esto un movimiento no se ve, se ve un corte. */
export const DURACION_MINIMA = 80;

/**
 * Cuánto tarda la hoja en terminar de irse.
 *
 * Proporcional a lo que le falta por recorrer —si el dedo ya la llevó al 80 %,
 * queda poco— y más corta cuanto más fuerte se soltó.
 *
 * @param {number} restante píxeles que faltan
 * @param {number} ancho de la página
 * @param {number} [impulso] px/ms al soltar
 */
export const duracionRestante = (restante, ancho, impulso = 0) => {
    if (!ancho || restante <= 0) return 0;
    const fraccion = Math.min(1, Math.abs(restante) / ancho);
    const v = Math.abs(Number(impulso) || 0);
    return Math.max(DURACION_MINIMA, Math.round((DURACION_BASE * fraccion) / (1 + v)));
};

const fotograma = () => new Promise((listo) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => listo());
    else setTimeout(listo, 16);
});

const esperar = (ms) => new Promise((listo) => { setTimeout(listo, ms); });

/**
 * @param {Object} opciones
 * @param {() => HTMLElement|null} opciones.hoja contenedor de la página real
 * @param {(direccion: 'next'|'prev') => Promise<unknown>} opciones.avanzar cambia la página real
 * @param {(direccion: 'next'|'prev') => void} [opciones.elevar] pone delante la sombra que toca
 * @param {(direccion: 'next'|'prev') => void} [opciones.alTerminar]
 * @param {number} [opciones.limite] ms máximos esperando a que la real se pinte
 */
export const createHojaReal = ({ hoja, avanzar, elevar, alTerminar, lista = () => true, limite = 2500 }) => {
    let enCamino = false;
    const pendientes = [];

    const ponerSinTransicion = (nodo, transform) => {
        nodo.style.transition = 'none';
        nodo.style.transform = transform;
    };

    const pasar = async (direccion, { desde = 0, impulso = 0, animar = true } = {}) => {
        const nodo = hoja();
        // Sin sombra colocada para esta página —un toque en cola que llega antes
        // de que se recoloque—, la hoja no se mueve: descubriría otra página.
        // Se cambia sin más, que es lo que hacía siempre el lector.
        if (!nodo || !lista(direccion)) {
            if (nodo && desde) ponerSinTransicion(nodo, '');
            await avanzar(direccion);
            alTerminar?.(direccion);
            return;
        }
        const ancho = nodo.clientWidth || 1;
        const destino = direccion === 'next' ? -ancho : ancho;

        elevar?.(direccion);
        nodo.style.willChange = 'transform';

        // 1. La hoja termina de irse.
        const duracion = animar ? duracionRestante(destino - desde, ancho, impulso) : 0;
        if (duracion) {
            ponerSinTransicion(nodo, `translate3d(${Math.round(desde)}px,0,0)`);
            await fotograma();
            nodo.style.transition = `transform ${duracion}ms cubic-bezier(0.25, 0.8, 0.3, 1)`;
            nodo.style.transform = `translate3d(${destino}px,0,0)`;
            await esperar(duracion);
        } else {
            ponerSinTransicion(nodo, `translate3d(${destino}px,0,0)`);
        }

        // 2. Fuera de la vista, la página real avanza. Con tope: si algo se
        //    atasca, la hoja vuelve igual y el libro sigue respondiendo.
        await Promise.race([Promise.resolve(avanzar(direccion)).catch(() => {}), esperar(limite)]);
        // Dos fotogramas para que el WebView pinte la página nueva antes de
        // enseñarla: con uno, algunos dispositivos enseñan un instante la vieja.
        await fotograma();
        await fotograma();

        // 3. Vuelve a su sitio, ya con la página nueva.
        ponerSinTransicion(nodo, '');
        nodo.style.willChange = '';
        await fotograma();
        nodo.style.transition = '';
        alTerminar?.(direccion);
    };

    return {
        /** ¿Hay una hoja en camino? */
        ocupada: () => enCamino,

        /**
         * Pasa página. Si ya hay una en camino, se apunta y se hace después.
         *
         * @param {'next'|'prev'} direccion
         * @param {{desde?: number, impulso?: number, animar?: boolean}} [opciones]
         */
        async pasar(direccion, opciones) {
            if (enCamino) {
                // Como mucho tres en cola: un dedo nervioso no debe lanzar el
                // libro diez páginas adelante.
                if (pendientes.length < 3) pendientes.push([direccion, { ...opciones, desde: 0 }]);
                return;
            }
            enCamino = true;
            try {
                await pasar(direccion, opciones);
                while (pendientes.length) {
                    const [siguiente, ops] = pendientes.shift();
                    await pasar(siguiente, ops);
                }
            } finally {
                enCamino = false;
            }
        },
    };
};
