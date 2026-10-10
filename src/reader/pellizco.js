import { FONT_SIZE_MIN, FONT_SIZE_MAX } from './typography.js';

/**
 * Pellizcar el texto para cambiar la letra.
 *
 * ## Por qué
 *
 * Es el primer gesto que prueba cualquiera que no ve bien el texto, y en casi
 * todos los lectores no hace nada sobre un EPUB. Cambiar el cuerpo pasaba por
 * sacar la barra, abrir la hoja de Texto y pulsar «+» varias veces, y después
 * buscar otra vez la frase por la que ibas.
 *
 * ## Cómo
 *
 * Mientras los dedos se mueven no se recompone nada: la hoja se escala con un
 * `transform`, que la GPU hace gratis. Solo al soltar se aplica el cuerpo nuevo,
 * **una vez**, por el mismo camino que la hoja de Texto —que ya conserva la
 * frase de arriba al repaginar—. Recomponer en cada movimiento serían decenas de
 * repaginados por segundo y la página saltaría bajo los dedos.
 *
 * Aquí solo está la cuenta, que es lo que se puede probar sin un teléfono.
 */

/** Distancia entre los dos primeros dedos de un evento táctil. */
export const distanciaEntreDedos = (touches) => {
    if (!touches || touches.length < 2) return 0;
    const a = touches[0];
    const b = touches[1];
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
};

/**
 * Por debajo de esto el pellizco no cuenta.
 *
 * Dos dedos apoyados sin intención —sujetar el móvil con la otra mano— se mueven
 * unos píxeles solos. Sin margen, cada uno de esos apoyos cambiaría la letra un
 * punto.
 */
export const UMBRAL_PELLIZCO = 0.06;

/**
 * El cuerpo que corresponde a una escala de pellizco.
 *
 * La relación no es lineal a propósito: separar los dedos al doble no pide letra
 * al doble —de 18 a 36 se sale de la escala—, pide «bastante más grande». Con la
 * raíz, abrir al doble da unos 25 y cerrar a la mitad unos 13, que es lo que se
 * espera del gesto.
 *
 * @param {number} base  Cuerpo al empezar el gesto.
 * @param {number} escala Distancia actual entre dedos / distancia inicial.
 */
export const cuerpoPorPellizco = (base, escala) => {
    const inicial = Number(base) || 18;
    if (!Number.isFinite(escala) || escala <= 0) return inicial;
    if (Math.abs(escala - 1) < UMBRAL_PELLIZCO) return inicial;

    const propuesto = Math.round(inicial * Math.sqrt(escala));
    return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, propuesto));
};

/**
 * Escala visual de la hoja mientras dura el gesto.
 *
 * Es la proporción entre el cuerpo que se va a aplicar y el de partida, no la
 * escala cruda de los dedos: así lo que se ve al soltar coincide con lo que se
 * veía con los dedos puestos, y no hay un salto final.
 */
export const escalaVisual = (base, cuerpo) => {
    const inicial = Number(base) || 18;
    return Math.round((cuerpo / inicial) * 1000) / 1000;
};
