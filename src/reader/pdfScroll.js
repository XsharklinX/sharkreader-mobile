/**
 * Desplazamiento continuo en PDF: qué se pinta y en qué página vas.
 *
 * ## Por qué no basta con apilar las páginas
 *
 * Un PDF de quinientas páginas son quinientos lienzos. Pintarlos todos agota la
 * memoria del WebView y la app se cierra sola; y aunque cupieran, rasterizar
 * quinientas páginas para enseñar una es trabajo tirado. Así que se pinta una
 * ventana alrededor de lo que se ve y el resto son huecos con la altura correcta,
 * para que la barra de desplazamiento no baile.
 *
 * ## En qué página vas
 *
 * Desplazando no hay una respuesta obvia: en cualquier momento se ven trozos de
 * dos páginas. Se elige **la que más superficie ocupa en pantalla**, que es la
 * que dirías si te preguntaran. Con el borde entre dos páginas justo en medio,
 * gana la de arriba por un pelo y el número no tiembla — que es lo que pasaría
 * eligiendo «la primera que asoma».
 */

/** Cuántas páginas se pintan por delante y por detrás de lo que se ve. */
export const VENTANA = 2;

/**
 * Rango de páginas que conviene tener pintado.
 *
 * @param {number} actual  Página visible, desde 1.
 * @param {number} total
 * @param {number} ventana
 * @returns {{desde: number, hasta: number}}
 */
export const ventanaDe = (actual, total, ventana = VENTANA) => ({
    desde: Math.max(1, actual - ventana),
    hasta: Math.min(total, actual + ventana),
});

/**
 * Cuánto de una página se ve, en píxeles de alto.
 *
 * @param {{top: number, bottom: number}} caja  Posición de la página.
 * @param {number} alto  Alto de la ventana de lectura.
 */
export const visibleDe = (caja, alto) => {
    if (!caja) return 0;
    const arriba = Math.max(0, caja.top);
    const abajo = Math.min(alto, caja.bottom);
    return Math.max(0, abajo - arriba);
};

/**
 * En qué página estás, según lo que se ve.
 *
 * @param {{pagina: number, top: number, bottom: number}[]} cajas
 * @param {number} alto
 * @returns {number} Número de página, o 0 si no se ve ninguna.
 */
export const paginaVisible = (cajas = [], alto = 0) => {
    let mejor = 0;
    let mejorVisible = 0;

    for (const caja of cajas) {
        const visible = visibleDe(caja, alto);
        // Estrictamente mayor: con dos páginas partidas por la mitad exacta gana
        // la primera, y así el número no tiembla al quedarse justo en el borde.
        if (visible > mejorVisible) {
            mejorVisible = visible;
            mejor = caja.pagina;
        }
    }

    return mejor;
};

/**
 * Alto que se reserva a una página todavía sin pintar.
 *
 * Se usa la proporción de la primera página para todas. No siempre acierta —hay
 * PDF que mezclan vertical y horizontal— pero el hueco se corrige en cuanto la
 * página se pinta, y la alternativa es abrir las quinientas páginas al arrancar
 * solo para medirlas.
 */
export const altoEstimado = (ancho, proporcion) => Math.round(ancho * (proporcion || 1.414));
