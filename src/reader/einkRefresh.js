/**
 * Refresco controlado para pantallas de tinta electrónica.
 *
 * ## El problema
 *
 * Un panel e-ink no repinta la pantalla entera en cada cambio: mueve solo las
 * partículas de las zonas que cambian, porque un repintado completo tarda cerca
 * de un segundo y parpadea. La contrapartida es que las partículas no vuelven
 * del todo a su sitio, y el rastro de las páginas anteriores se va acumulando —
 * lo que en estos aparatos se llama *ghosting*. Al cabo de quince o veinte
 * páginas el texto se lee sobre una sombra gris de todo lo anterior.
 *
 * La solución de siempre es forzar un repintado completo cada cierto número de
 * páginas: se pierde un segundo, pero la pantalla queda limpia.
 *
 * ## Lo que se puede hacer desde un WebView, y lo que no
 *
 * **No se puede** pedirle al controlador del panel que haga un refresco
 * completo. Esa API es de los SDK de cada fabricante —Onyx, Boox, Tolino— y no
 * está expuesta al navegador.
 *
 * **Sí se puede** provocarlo: si toda la pantalla cambia de color a la vez, el
 * controlador no tiene más remedio que repintarla entera. Un fundido rápido a
 * negro y vuelta consigue exactamente eso. Es lo que hacen los lectores que
 * ofrecen esta opción en aparatos de terceros, y por eso el ajuste se llama
 * «limpiar pantalla» y no «refresco completo»: describe lo que el usuario ve,
 * no un mecanismo que en realidad estamos induciendo de rebote.
 *
 * En una pantalla normal esto se vería como un parpadeo negro sin ningún
 * sentido, así que solo se hace con el modo tinta activado.
 */

/** Cada cuántas páginas limpiar. `0` desactiva la limpieza. */
export const REFRESH_INTERVALS = [0, 5, 10, 15, 25];

export const DEFAULT_REFRESH_EVERY = 10;

/** Duración del fundido. Bastante para que el panel lo tome como cambio total. */
export const FLASH_MS = 120;

export const intervalLabel = (value) =>
    (value === 0 ? 'Nunca' : `Cada ${value} páginas`);

/**
 * Lleva la cuenta de páginas y dice cuándo toca limpiar.
 *
 * Se cuenta pasando página, no por tiempo: el rastro lo produce el cambio de
 * contenido, y una página abierta media hora sin tocar no ensucia nada.
 */
export const createRefreshCounter = (every = DEFAULT_REFRESH_EVERY) => {
    let count = 0;
    let interval = every;

    return {
        /** @returns {boolean} true si toca limpiar. */
        pageTurned() {
            if (!interval) return false;
            count += 1;
            if (count < interval) return false;
            count = 0;
            return true;
        },

        setInterval(value) {
            interval = value;
            // Al cambiar el intervalo se reinicia la cuenta: si no, bajar de 25
            // a 5 con 20 páginas acumuladas limpiaría en la siguiente, que
            // desde fuera parece un fallo.
            count = 0;
        },

        /** Limpiar a mano también reinicia la cuenta. */
        reset() { count = 0; },

        pending: () => count,
    };
};

/**
 * Provoca el repintado completo.
 *
 * Se hace con una capa por encima y no cambiando el fondo del lector: tocar el
 * fondo obligaría a epub.js a recalcular, y con ello a repaginar el capítulo
 * entero por un efecto puramente visual.
 *
 * @param {HTMLElement} container Nodo dentro del que insertar la capa.
 * @returns {Promise<void>}
 */
export const flashScreen = (container, duration = FLASH_MS) => new Promise((resolve) => {
    if (!container) { resolve(); return; }

    const layer = container.ownerDocument.createElement('div');
    layer.className = 'eink-flash';
    layer.setAttribute('aria-hidden', 'true');
    container.appendChild(layer);

    // Dos fotogramas: uno para que el nodo entre en el árbol y otro para que el
    // navegador registre el color inicial. Con uno solo, algunos WebView aplican
    // el cambio en el mismo ciclo y no hay transición que provoque el repintado.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            layer.classList.add('on');
            setTimeout(() => {
                layer.remove();
                resolve();
            }, duration);
        });
    });
});
