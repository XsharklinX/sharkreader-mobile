/**
 * Recorte de márgenes en PDF: cómo se encuentra la caja de texto.
 *
 * ## Por qué hace falta
 *
 * Un PDF está maquetado para un folio A4. En una pantalla de seis pulgadas, ese
 * folio se encoge entero —márgenes incluidos— y **un tercio de la pantalla queda
 * en blanco** mientras el texto se vuelve ilegible. Es la razón por la que leer
 * un manual en el móvil resulta incómodo aunque el lector funcione bien.
 *
 * Recortando el blanco sobrante, el mismo texto se ve a casi el doble de tamaño
 * sin tocar el zoom. No es un ajuste de comodidad: es lo que hace que un PDF se
 * pueda leer en un teléfono.
 *
 * ## Cómo se encuentra la caja
 *
 * Se mira la página ya pintada y se busca la primera fila y la primera columna
 * que tienen algo distinto del fondo, por los cuatro lados. Dos decisiones que
 * parecen detalles y no lo son:
 *
 *  1. **El fondo se deduce de las esquinas**, no se supone blanco. Hay PDF con
 *     fondo crema, escaneados grisáceos y páginas en negativo. Suponer blanco
 *     recortaría la página entera en cuanto el fondo no lo fuera.
 *
 *  2. **Una fila cuenta como contenido si tiene suficientes píxeles distintos**,
 *     no con uno solo. Un escaneado tiene motas, y una sola mota en el borde
 *     bastaría para que no se recortara nada — que es como estas cosas acaban
 *     "no funcionando" sin dar error.
 *
 * ## Una caja para todo el documento
 *
 * El recorte se calcula sobre unas pocas páginas y se usa el mismo para todas.
 * Calcularlo por página haría que el texto cambiara de tamaño y de sitio en cada
 * pase —una página con una ilustración a sangre recortaría distinto que la
 * siguiente— y eso marea más de lo que ayuda el recorte.
 */

/** Cuánto se aparta un píxel del fondo para contar como tinta. */
export const UMBRAL = 26;

/** Qué proporción de una fila tiene que ser tinta para que cuente. */
export const DENSIDAD = 0.004;

/** Margen que se deja alrededor del texto, en proporción al ancho. */
export const AIRE = 0.012;

/**
 * Si la caja encontrada ocupa casi toda la página, no se recorta.
 *
 * Recortar un 2 % no compensa volver a pintar, y además suele significar que la
 * detección no ha encontrado nada de verdad.
 */
export const MINIMO_UTIL = 0.94;

const luminancia = (data, i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];

/**
 * Color de fondo, deducido de las cuatro esquinas.
 *
 * La mediana y no la media: si una esquina cae dentro de una ilustración a
 * sangre, la media se va con ella y el fondo sale mal para toda la página.
 */
export const fondoDe = ({ data, width, height }) => {
    const muestras = [];
    const paso = Math.max(1, Math.floor(Math.min(width, height) * 0.02));
    for (const [x0, y0] of [[0, 0], [width - paso, 0], [0, height - paso], [width - paso, height - paso]]) {
        for (let y = y0; y < y0 + paso; y += 1) {
            for (let x = x0; x < x0 + paso; x += 1) {
                muestras.push(luminancia(data, (y * width + x) * 4));
            }
        }
    }
    muestras.sort((a, b) => a - b);
    return muestras[Math.floor(muestras.length / 2)] ?? 255;
};

/**
 * Caja que encierra el contenido de una página ya pintada.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} imagen
 * @returns {{x: number, y: number, w: number, h: number}|null}
 */
export const cajaDeContenido = (imagen, { umbral = UMBRAL, densidad = DENSIDAD } = {}) => {
    const { data, width, height } = imagen;
    if (!width || !height) return null;

    const fondo = fondoDe(imagen);
    const esTinta = (x, y) => Math.abs(luminancia(data, (y * width + x) * 4) - fondo) > umbral;

    // El suelo es tres y no uno: con uno, **una sola mota de un escaneado**
    // basta para que la fila cuente y no se recorte nada. Es exactamente la
    // forma en que un ajuste así parece no hacer nada sin dar ningún error.
    const minFila = Math.max(3, Math.floor(width * densidad));
    const minColumna = Math.max(3, Math.floor(height * densidad));

    let arriba = -1;
    let abajo = -1;
    for (let y = 0; y < height; y += 1) {
        let cuenta = 0;
        for (let x = 0; x < width; x += 1) if (esTinta(x, y)) cuenta += 1;
        if (cuenta >= minFila) {
            if (arriba === -1) arriba = y;
            abajo = y;
        }
    }
    if (arriba === -1) return null;

    let izquierda = -1;
    let derecha = -1;
    for (let x = 0; x < width; x += 1) {
        let cuenta = 0;
        for (let y = arriba; y <= abajo; y += 1) if (esTinta(x, y)) cuenta += 1;
        if (cuenta >= minColumna) {
            if (izquierda === -1) izquierda = x;
            derecha = x;
        }
    }
    if (izquierda === -1) return null;

    return { x: izquierda, y: arriba, w: derecha - izquierda + 1, h: abajo - arriba + 1 };
};

/**
 * Junta las cajas de varias páginas en una sola.
 *
 * Se toma la **unión**, no el promedio: una caja que no quepa recortaría texto, y
 * cortar una línea es un fallo mucho peor que dejar un dedo de margen. Con una
 * página que llegue al borde, ese lado no se recorta, y está bien así.
 */
export const unirCajas = (cajas = []) => {
    const validas = cajas.filter(Boolean);
    if (!validas.length) return null;

    const x = Math.min(...validas.map((c) => c.x));
    const y = Math.min(...validas.map((c) => c.y));
    const x2 = Math.max(...validas.map((c) => c.x + c.w));
    const y2 = Math.max(...validas.map((c) => c.y + c.h));
    return { x, y, w: x2 - x, h: y2 - y };
};

/**
 * La caja final, con su aire y en proporciones de 0 a 1.
 *
 * Se devuelve en proporciones para que valga a cualquier escala: el recorte se
 * calcula una vez con la página pintada a un tamaño y luego se aplica aunque el
 * usuario cambie el zoom o gire el teléfono.
 *
 * @returns {{x: number, y: number, w: number, h: number}|null} null si no
 *          compensa recortar.
 */
export const recorteRelativo = (caja, width, height, { aire = AIRE, minimo = MINIMO_UTIL } = {}) => {
    if (!caja || !width || !height) return null;

    const margen = Math.round(width * aire);
    const x = Math.max(0, caja.x - margen);
    const y = Math.max(0, caja.y - margen);
    const x2 = Math.min(width, caja.x + caja.w + margen);
    const y2 = Math.min(height, caja.y + caja.h + margen);

    const ancho = (x2 - x) / width;
    const alto = (y2 - y) / height;

    // Si apenas hay margen que quitar, no se toca: recortar un dos por ciento no
    // compensa, y suele significar que no se ha detectado nada de verdad.
    if (ancho > minimo && alto > minimo) return null;

    return { x: x / width, y: y / height, w: ancho, h: alto };
};
