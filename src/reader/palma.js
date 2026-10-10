/**
 * Sujetar el móvil sin pasar página.
 *
 * En un móvil grande, la mano que lo sujeta apoya la base del pulgar o la palma
 * en el borde de la pantalla. Para el lector eso era un toque, y pasaba una o dos
 * páginas sin querer. Dos señales distinguen un apoyo de un toque con la yema:
 *
 *  - **El tamaño del contacto.** Android da, con cada evento, el ancho y el alto
 *    de la zona apoyada. Una yema son unos 8 a 20 px CSS; la base del pulgar o la
 *    palma, bastante más.
 *  - **Un apoyo largo y quieto pegado al borde.** Un toque para pasar página dura
 *    menos de un tercio de segundo; la mano que sujeta se queda.
 *
 * Cualquiera de las dos descarta el gesto entero.
 */

/** Más ancho o alto que esto (px CSS) no es una yema. */
export const CONTACTO_MAXIMO = 34;

/** Franja del borde donde se apoya la mano que sujeta (px CSS). */
export const FRANJA_AGARRE = 14;

/** Un apoyo en la franja que dure más que esto es sujetar, no tocar (ms). */
export const DURACION_AGARRE = 380;

/** ¿Este contacto es una palma o la base del pulgar? */
export const esPalma = ({ width = 0, height = 0 } = {}) =>
    Math.max(Number(width) || 0, Number(height) || 0) > CONTACTO_MAXIMO;

/**
 * ¿Este «toque» era la mano sujetando el móvil?
 *
 * @param {{x: number, ancho: number, duracion: number, movimiento: number}} toque
 */
export const esAgarre = ({ x, ancho, duracion, movimiento = 0 }) =>
    duracion > DURACION_AGARRE
    && movimiento < 12
    && (x < FRANJA_AGARRE || x > ancho - FRANJA_AGARRE);
