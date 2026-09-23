/**
 * El brillo con el pulgar, en el borde izquierdo.
 *
 * ## Por qué este gesto y no un control
 *
 * De noche, el brillo se toca constantemente: la habitación cambia, los ojos se
 * cansan, alguien enciende una luz. Con los controles metidos detrás de dos
 * toques, la mitad de las veces no se ajusta y se lee incómodo — que es
 * exactamente el tipo de cosa que decide si un lector se usa a la hora y media.
 *
 * Es el gesto que tiene Moon+ y el que más se usa de noche.
 *
 * ## El problema: no chocar con pasar página
 *
 * El borde izquierdo es también donde se toca para retroceder, y arrastrar es
 * pasar página. Este gesto tiene que poder distinguirse **antes** de que el
 * arrastre lo reclame, y con una regla que no deje dudas:
 *
 *  - Empieza en la franja izquierda, que es estrecha a propósito: el pulgar cae
 *    ahí sujetando el teléfono, y el resto de la pantalla queda entera para
 *    pasar página.
 *  - Es **vertical**. Si el dedo se va en horizontal, no era esto.
 *
 * Con esas dos condiciones, un arrastre para pasar página no puede confundirse:
 * empieza en cualquier sitio y va de lado.
 */

/** Ancho de la franja sensible, en proporción al ancho de pantalla. */
export const FRANJA = 0.08;

/** Ancho máximo en píxeles: en una tablet, el 8 % sería media mano. */
export const FRANJA_MAX = 44;

/** Cuánto hay que subir o bajar para que el gesto se considere del brillo. */
export const UMBRAL = 12;

/** Qué parte de la pantalla recorre el brillo entero, de 0 a 1. */
export const RECORRIDO = 0.6;

/** Ancho real de la franja para una pantalla dada. */
export const anchoDeFranja = (width) => Math.min(FRANJA_MAX, Math.round((width || 0) * FRANJA));

/**
 * ¿Este toque empieza en la franja del brillo?
 *
 * @param {number} x
 * @param {number} width
 */
export const enLaFranja = (x, width) => width > 0 && x >= 0 && x <= anchoDeFranja(width);

/**
 * ¿Este movimiento es el del brillo y no el de pasar página?
 *
 * Se pide que sea **claramente** vertical —el doble que el horizontal— y no solo
 * un poco más: con un umbral justo, un arrastre en diagonal para pasar página
 * acabaría bajando el brillo a mitad de gesto.
 */
export const esVertical = (dx, dy) => Math.abs(dy) >= UMBRAL && Math.abs(dy) > Math.abs(dx) * 2;

/**
 * Nuevo valor del atenuador a partir del recorrido del dedo.
 *
 * Hacia arriba aclara y hacia abajo oscurece, que es como funciona el brillo en
 * cualquier sitio. El atenuador es lo contrario —cuanto más alto, más oscuro—
 * así que el signo se invierte aquí y no en quien llama.
 *
 * @param {number} desde   Atenuación al empezar el gesto, 0 a 1.
 * @param {number} dy      Recorrido vertical en píxeles, positivo hacia abajo.
 * @param {number} height  Alto de la pantalla.
 * @returns {number} Atenuación nueva, 0 a 1.
 */
export const atenuacionDe = (desde, dy, height) => {
    if (!height) return desde;
    const paso = dy / (height * RECORRIDO);
    return Math.max(0, Math.min(0.92, desde + paso));
};

/**
 * Cómo se enseña el valor mientras se ajusta, de 0 a 100.
 *
 * Se enseña el **brillo**, no la atenuación: nadie piensa «tengo el atenuador al
 * treinta por ciento». Y se redondea a entero porque un decimal bailando bajo el
 * pulgar es ruido.
 */
export const brilloVisible = (atenuacion) => Math.round((1 - atenuacion) * 100);
