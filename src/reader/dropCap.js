/**
 * ¿Trae este capítulo su propia letra capitular?
 *
 * ## Por qué hace falta preguntarlo
 *
 * La capitular de la app se pone con `::first-letter` sobre el primer párrafo.
 * En un libro compuesto con cuidado, el editor ya puso la suya —muchas veces un
 * `<span>` con su clase, a veces una imagen dibujada— y entonces la nuestra se
 * suma a la suya: dos letras grandes seguidas, o una inicial enorme encima de una
 * ilustración. Queda peor que no tener ninguna, y el usuario no entiende por qué
 * ese libro se ve roto si el ajuste funciona en los demás.
 *
 * Así que la opción deja de significar «pon una capitular» y pasa a significar
 * «que haya capitular»: si el libro ya la trae, se respeta la suya.
 *
 * ## Cómo se detecta
 *
 * No se puede preguntar por `::first-letter` del libro —los pseudoelementos no
 * se pueden inspeccionar—, así que se mira lo que sí es observable:
 *
 *  1. **Un elemento al principio del párrafo mucho más grande que el texto.** Es
 *     la forma habitual de componer una capitular a mano: un `span` con un tamaño
 *     de varias líneas. El umbral es 1,8 porque una versalita o una mayúscula
 *     decorativa se quedan por debajo y esas no son capitulares.
 *  2. **Un elemento flotado al principio.** Una capitular tiene que flotar para
 *     que el texto la rodee; si algo flota justo ahí, ese es su papel.
 *  3. **Una imagen pequeña al principio del párrafo.** Es la capitular dibujada
 *     de las ediciones ilustradas. Pequeña de verdad: una imagen grande al
 *     empezar un capítulo es una ilustración de apertura, no una inicial.
 *
 * Se mira solo el **primer párrafo**, que es donde puede haber una. Buscar más
 * allá encontraría cualquier cita destacada y apagaría la capitular sin motivo.
 */

/** Cuánto más grande que el texto tiene que ser para contar como capitular. */
export const FACTOR = 1.8;

/** Tamaño máximo de una imagen para ser una inicial y no una ilustración. */
export const IMAGEN_MAX = 120;

/**
 * @param {Element|null} parrafo Primer párrafo del capítulo.
 * @param {(el: Element) => {fontSize: string, float: string}} estiloDe
 * @returns {boolean}
 */
export const traeCapitular = (parrafo, estiloDe) => {
    if (!parrafo || typeof estiloDe !== 'function') return false;

    const base = parseFloat(estiloDe(parrafo)?.fontSize) || 0;
    // Sin tamaño base no hay con qué comparar, y adivinar sería peor que no
    // detectar: apagaría capitulares que sí queremos poner.
    if (!base) return false;

    // **Solo el primer hijo.** Una capitular es lo primero del párrafo o no es
    // una capitular. Mirar más allá encuentra cualquier palabra destacada a
    // mitad de texto y apaga el ajuste sin motivo.
    const hijo = parrafo.children?.[0];
    if (!hijo) return false;

    const estilo = estiloDe(hijo) || {};

    if (estilo.float === 'left' || estilo.float === 'right') return true;
    if ((parseFloat(estilo.fontSize) || 0) >= base * FACTOR) return true;

    if (hijo.tagName === 'IMG') {
        const ancho = Number(hijo.getAttribute?.('width')) || hijo.naturalWidth || 0;
        // Una imagen sin medidas conocidas al principio de un párrafo es, casi
        // siempre, una capitular dibujada.
        return ancho === 0 || ancho <= IMAGEN_MAX;
    }

    return false;
};

/** Clase que se pone en el cuerpo para que el CSS no añada la nuestra. */
export const MARCA = 'sr-ya-capitular';
