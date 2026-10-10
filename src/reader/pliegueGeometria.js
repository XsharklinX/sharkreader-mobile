/**
 * Geometría del pliegue de papel.
 *
 * El modelo es el del rollo: la parte de la hoja que pasa de la línea de pliegue
 * se enrolla sobre un cilindro de radio `r` y, más allá de media vuelta, queda
 * tumbada boca abajo encima de la hoja. Es lo que hace el papel de verdad cuando
 * se levanta una esquina, y es el modelo de casi todos los «page curl».
 *
 * Aquí solo están las cuentas que deciden dónde va la línea, hacia dónde se
 * enrolla y con qué radio, para que **la esquina que se levanta quede bajo el
 * dedo**. El dibujo, píxel a píxel, lo hace el shader de `pliegueGL.js` con
 * estos tres valores.
 *
 * Todo en píxeles de la hoja, con el origen arriba a la izquierda.
 */

/** Radio máximo del rollo, en proporción del ancho de la hoja. */
const RADIO = 0.085;

/**
 * La esquina que se levanta: la de abajo si el dedo empezó en la mitad de
 * abajo, la de arriba si no. Siempre del lado derecho: el pliegue es para
 * avanzar.
 */
export const esquinaPara = (yInicial, alto) => ({ x: 1, y: yInicial < alto / 2 ? 0 : 1 });

/**
 * Línea del pliegue para que la esquina `c` quede en el dedo `f`.
 *
 * @param {{x: number, y: number}} f dedo, en píxeles
 * @param {{x: number, y: number}} c esquina, en píxeles
 * @param {number} ancho de la hoja
 * @returns {{nx: number, ny: number, lx: number, ly: number, r: number}}
 *   `n` dirección (unitaria) hacia la que se enrolla; `l` un punto de la línea;
 *   `r` el radio del rollo
 */
export const geometriaPliegue = (f, c, ancho) => {
    let dx = c.x - f.x;
    let dy = c.y - f.y;
    let distancia = Math.hypot(dx, dy);
    if (distancia < 0.5) {
        // Dedo sobre la esquina: hoja plana. Una dirección cualquiera hacia la
        // derecha evita dividir entre cero.
        dx = 1; dy = 0; distancia = 0.5;
    }
    const nx = dx / distancia;
    const ny = dy / distancia;
    // El rollo nunca es más grueso que lo que se ha levantado: al empezar, una
    // esquina apenas doblada no puede tener un cilindro de 30 px.
    const r = Math.min(ancho * RADIO, distancia / Math.PI);
    // La línea se coloca de forma que, enrollando la hoja sobre el cilindro y
    // tumbando lo que sobra, la esquina caiga justo en el dedo.
    const a = (Math.PI * r - distancia) / 2;
    return { nx, ny, lx: f.x - nx * a, ly: f.y - ny * a, r };
};

/**
 * Dónde está el dedo en la animación de pasar página con un toque.
 *
 * La esquina viaja de su sitio a más allá del borde izquierdo con una curva
 * suave, subiendo un poco: es el gesto de quien levanta una hoja.
 *
 * @param {number} t de 0 a 1
 */
export const recorridoDeToque = (t, ancho, alto, esquina) => {
    const s = 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
    const desdeX = ancho * esquina.x;
    const desdeY = alto * esquina.y;
    return {
        x: desdeX + (-ancho * 1.05 - desdeX) * s,
        y: desdeY + (alto * 0.5 - desdeY) * 0.25 * Math.sin(Math.PI * s),
    };
};

/** ¿Al soltar aquí se pasa página? Más allá de la mitad, o con un golpe. */
export const confirma = (f, ancho, impulso = 0) => f.x < ancho * 0.5 || impulso < -0.45;
