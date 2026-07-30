/**
 * Arrastrar una hoja hacia abajo para cerrarla.
 *
 * Todas las hojas de la app dibujan un asa en la parte de arriba. El asa es la
 * forma universal de decir «tira de mí», y aquí no hacía nada: tirar de ella
 * dejaba la hoja donde estaba. Un mando que promete un gesto y no responde se
 * siente como una app rota, aunque el botón de cerrar funcione.
 *
 * El arrastre solo empieza en la zona del asa y el título. Si empezara en
 * cualquier parte pelearía con el desplazamiento del contenido, y una hoja que se
 * cierra cuando intentabas leer la lista de abajo es peor que una que no se
 * cierra nunca.
 */

/** Cuánto hay que bajar para que se cierre al soltar, en píxeles. */
export const CLOSE_DISTANCE = 96;

/** Un tirón rápido cierra aunque no llegue a esa distancia. */
export const CLOSE_VELOCITY = 0.55; // px por milisegundo

/**
 * Decide qué pasa al soltar.
 *
 * @param {number} dy       Cuánto ha bajado, px. Negativo si se ha subido.
 * @param {number} elapsed  Duración del gesto, ms.
 */
export const resolveSheetDrag = (dy, elapsed) => {
    if (dy <= 0) return { close: false };
    const velocity = elapsed > 0 ? dy / elapsed : 0;
    return { close: dy >= CLOSE_DISTANCE || velocity >= CLOSE_VELOCITY };
};

/**
 * Cuánto se mueve la hoja mientras el dedo está puesto.
 *
 * Hacia abajo sigue al dedo. Hacia arriba casi no: la hoja ya está arriba y no
 * hay nada que enseñar, pero quedarse completamente rígida haría dudar de si el
 * gesto se ha registrado.
 */
export const sheetOffset = (dy) => (dy >= 0 ? dy : dy * 0.12);

/** Lo que se ve del velo detrás: se aclara conforme la hoja se va. */
export const scrimOpacity = (dy, height) => {
    if (!height || dy <= 0) return 1;
    return Math.max(0, 1 - (dy / height) * 1.4);
};
