/**
 * Regla de lectura: una banda clara sobre el texto y el resto atenuado.
 *
 * Es la versión digital de poner una cuartilla bajo la línea que lees. Ayuda a
 * quien pierde el renglón al saltar de línea —dislexia, déficit de atención,
 * cansancio, o simplemente un párrafo largo con letra pequeña— y es de las
 * pocas ayudas de lectura que se nota desde el primer minuto.
 *
 * Lo que la hace útil o inservible es su comportamiento al arrastrar. Dos
 * decisiones:
 *
 *  1. **Se mueve a saltos de una línea**, no libremente. Una banda que puede
 *     quedar a mitad de renglón corta las letras por la mitad y estorba más de
 *     lo que ayuda; con saltos, siempre encuadra una línea entera.
 *  2. **No sale de la pantalla.** Arrastrarla hasta el borde y perderla obliga
 *     a apagar el modo para recuperarla.
 */

/** Altura de la banda como múltiplo del interlineado. */
export const BAND_LINES = 1;

export const RULER_MODES = {
    off:  { label: 'Apagada',  description: 'Sin banda' },
    band: { label: 'Banda',    description: 'Ilumina la línea y atenúa el resto' },
    line: { label: 'Subrayado', description: 'Solo una línea bajo el renglón' },
};

/**
 * Altura en píxeles de una línea de texto con la tipografía actual.
 * @param {{fontSize: number, lineHeight: number}} typography
 */
export const lineHeightPx = ({ fontSize = 18, lineHeight = 1.6 } = {}) =>
    Math.max(12, Math.round(fontSize * lineHeight));

/**
 * Encaja una posición arbitraria —donde está el dedo— en la línea más cercana.
 *
 * @param {number} y        Posición vertical del dedo, en píxeles.
 * @param {number} top      Borde superior del área de texto.
 * @param {number} height   Alto del área de texto.
 * @param {number} line     Alto de una línea.
 * @returns {number} Posición del borde superior de la banda.
 */
export const snapToLine = (y, top, height, line) => {
    if (line <= 0) return top;

    // Se centra la banda en el dedo: al arrastrar, lo que se está señalando es
    // el centro de lo que se quiere leer, no su borde superior.
    const centered = y - line / 2;
    const snapped = top + Math.round((centered - top) / line) * line;

    // El límite inferior deja la banda entera dentro: si se permitiera salir a
    // medias, se perdería y habría que apagar el modo para recuperarla.
    const lowest = top + Math.max(0, height - line);
    return Math.min(lowest, Math.max(top, snapped));
};

/**
 * Avanza o retrocede la banda un número de líneas.
 *
 * Se usa al pasar página —la banda vuelve arriba, porque la línea por la que
 * ibas ya no está— y con las teclas de volumen si se configuran para eso.
 */
export const moveByLines = (current, delta, top, height, line) =>
    snapToLine(current + line / 2 + delta * line, top, height, line);

/**
 * Geometría de las tres piezas que se pintan: la banda y las dos zonas
 * atenuadas por encima y por debajo.
 *
 * Devolverlas juntas evita el error clásico de calcular la sombra superior con
 * un origen y la inferior con otro, que deja una franja sin atenuar de un píxel
 * justo en el borde — visible en pantallas de alta densidad.
 */
export const rulerGeometry = (bandTop, height, line, containerTop = 0) => {
    const top = Math.max(containerTop, bandTop);
    const bottom = top + line;
    return {
        band:  { top, height: line },
        above: { top: containerTop, height: Math.max(0, top - containerTop) },
        below: { top: bottom, height: Math.max(0, containerTop + height - bottom) },
    };
};
