/**
 * Las viñetas de una página de cómic.
 *
 * ## Para qué
 *
 * Una página de cómic en seis pulgadas no se lee: los bocadillos salen a cuatro
 * píxeles de letra y hay que ampliar y arrastrar por cada viñeta. Con las
 * viñetas localizadas, el lector las enseña una a una, ampliadas, en orden. Es
 * lo que hacen las tiendas de cómics con sus propios libros; aquí funciona con
 * cualquier CBZ.
 *
 * ## Cómo
 *
 * Las viñetas están separadas por **canalones**: franjas del color del papel
 * que cruzan la página de lado a lado. Se busca primero el color del papel
 * —por el borde de la página, que casi siempre es margen— y después, sobre una
 * miniatura:
 *
 *  1. Filas casi enteras de papel → la página se corta en tiras horizontales.
 *  2. En cada tira, columnas casi enteras de papel → la tira se corta en
 *     viñetas.
 *  3. Cada trozo se vuelve a mirar por si dentro hay más cortes (una viñeta
 *     ancha arriba y dos abajo dentro de la misma columna).
 *
 * Es el corte XY clásico. No hace falta nada más fino: la inmensa mayoría de los
 * cómics se maquetan en rejilla. Las páginas que no se dejan cortar —una
 * ilustración a sangre, viñetas inclinadas— se quedan enteras, que es lo mismo
 * que había antes.
 *
 * Todo es puro y trabaja con un `ImageData` (o cualquier cosa con `data`,
 * `width` y `height`).
 */

/** @typedef {{ x: number, y: number, w: number, h: number }} Caja proporciones de 0 a 1 */

const luz = (data, i) => (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;

/** Luminosidad del papel, por los bordes de la página. */
export const colorDelPapel = ({ data, width, height }) => {
    const muestras = [];
    const paso = Math.max(1, Math.floor(Math.min(width, height) / 60));
    for (let x = 0; x < width; x += paso) {
        muestras.push(luz(data, (0 * width + x) * 4), luz(data, ((height - 1) * width + x) * 4));
    }
    for (let y = 0; y < height; y += paso) {
        muestras.push(luz(data, (y * width + 0) * 4), luz(data, (y * width + width - 1) * 4));
    }
    muestras.sort((a, b) => a - b);
    return muestras[Math.floor(muestras.length / 2)] ?? 255;
};

const TOLERANCIA = 38;
/** Proporción de la línea que tiene que ser papel para contar como canalón. */
const LIMPIA = 0.97;

/** Mapa de «es papel» por píxel, para no recalcular la luz en cada pasada. */
const mapaDePapel = ({ data, width, height }, papel) => {
    const mapa = new Uint8Array(width * height);
    for (let i = 0, p = 0; p < mapa.length; i += 4, p += 1) {
        mapa[p] = Math.abs(luz(data, i) - papel) <= TOLERANCIA ? 1 : 0;
    }
    return mapa;
};

/**
 * Tramos de contenido a lo largo de un eje, separados por canalones.
 *
 * @returns {Array<[number, number]>} pares [inicio, fin) en píxeles
 */
const tramos = (mapa, ancho, { x0, y0, x1, y1 }, eje, huecoMinimo) => {
    const largo = eje === 'y' ? y1 - y0 : x1 - x0;
    const limpia = new Array(largo).fill(false);

    for (let i = 0; i < largo; i += 1) {
        let papel = 0;
        let total = 0;
        if (eje === 'y') {
            const fila = (y0 + i) * ancho;
            for (let x = x0; x < x1; x += 1) { papel += mapa[fila + x]; total += 1; }
        } else {
            for (let y = y0; y < y1; y += 1) { papel += mapa[y * ancho + x0 + i]; total += 1; }
        }
        limpia[i] = total > 0 && papel / total >= LIMPIA;
    }

    const salida = [];
    let inicio = null;
    let hueco = 0;
    for (let i = 0; i <= largo; i += 1) {
        const esPapel = i === largo || limpia[i];
        if (!esPapel) {
            if (inicio === null) inicio = i;
            hueco = 0;
            continue;
        }
        if (inicio === null) continue;
        hueco += 1;
        // Un tramo se cierra cuando el hueco de papel es lo bastante ancho para
        // ser un canalón y no el blanco de dentro de un dibujo.
        if (hueco >= huecoMinimo || i === largo) {
            salida.push([inicio, i - hueco + 1]);
            inicio = null;
            hueco = 0;
        }
    }
    return salida.filter(([a, b]) => b > a);
};

/** Ajusta una región a su contenido, quitando el papel de los bordes. */
const ajustar = (mapa, ancho, region) => {
    let { x0, y0, x1, y1 } = region;
    const filaVacia = (y) => { for (let x = x0; x < x1; x += 1) if (!mapa[y * ancho + x]) return false; return true; };
    const columnaVacia = (x) => { for (let y = y0; y < y1; y += 1) if (!mapa[y * ancho + x]) return false; return true; };
    while (y0 < y1 && filaVacia(y0)) y0 += 1;
    while (y1 > y0 && filaVacia(y1 - 1)) y1 -= 1;
    while (x0 < x1 && columnaVacia(x0)) x0 += 1;
    while (x1 > x0 && columnaVacia(x1 - 1)) x1 -= 1;
    return { x0, y0, x1, y1 };
};

/**
 * Corta una región en viñetas, alternando ejes.
 *
 * @returns {Array<{x0:number,y0:number,x1:number,y1:number}>} en orden de lectura occidental
 */
const cortar = (mapa, ancho, region, eje, profundidad, huecos) => {
    const partes = tramos(mapa, ancho, region, eje, eje === 'y' ? huecos.y : huecos.x);
    if (partes.length <= 1) {
        if (profundidad === 0) return [region];
        // Sin cortes en este eje: se prueba el otro una vez más.
        const otro = eje === 'y' ? 'x' : 'y';
        const enOtro = tramos(mapa, ancho, region, otro, otro === 'y' ? huecos.y : huecos.x);
        if (enOtro.length <= 1) return [region];
        return cortar(mapa, ancho, region, otro, profundidad - 1, huecos);
    }

    const otro = eje === 'y' ? 'x' : 'y';
    return partes.flatMap(([a, b]) => {
        const sub = eje === 'y'
            ? { ...region, y0: region.y0 + a, y1: region.y0 + b }
            : { ...region, x0: region.x0 + a, x1: region.x0 + b };
        return cortar(mapa, ancho, ajustar(mapa, ancho, sub), otro, profundidad - 1, huecos);
    });
};

/** Por debajo de esta proporción de la página, un trozo no es una viñeta. */
const AREA_MINIMA = 0.02;

/**
 * Las viñetas de una página, en orden de lectura.
 *
 * @param {{data: Uint8ClampedArray|number[], width: number, height: number}} imagen
 * @param {{ rtl?: boolean }} [opciones] manga: de derecha a izquierda
 * @returns {Caja[]} vacío si la página no se deja dividir en dos o más viñetas
 */
export const detectarVinetas = (imagen, { rtl = false } = {}) => {
    const { width, height } = imagen;
    if (!width || !height) return [];

    const papel = colorDelPapel(imagen);
    const mapa = mapaDePapel(imagen, papel);
    const pagina = ajustar(mapa, width, { x0: 0, y0: 0, x1: width, y1: height });
    const huecos = {
        y: Math.max(2, Math.round(height * 0.008)),
        x: Math.max(2, Math.round(width * 0.008)),
    };

    // Las tiras horizontales se cortan primero: es el orden de lectura.
    const tiras = tramos(mapa, width, pagina, 'y', huecos.y)
        .map(([a, b]) => ajustar(mapa, width, { ...pagina, y0: pagina.y0 + a, y1: pagina.y0 + b }));

    const area = width * height;
    const viñetas = [];
    for (const tira of tiras) {
        let enTira = cortar(mapa, width, tira, 'x', 3, huecos)
            .filter((r) => ((r.x1 - r.x0) * (r.y1 - r.y0)) / area >= AREA_MINIMA);
        if (rtl) {
            // En manga, dentro de cada fila se lee de derecha a izquierda. El
            // corte devuelve las columnas de izquierda a derecha, y las de una
            // misma columna de arriba abajo: se reordena solo por columnas.
            enTira = [...enTira].sort((a, b) => (b.x0 - a.x0) || (a.y0 - b.y0));
        }
        viñetas.push(...enTira);
    }

    if (viñetas.length < 2) return [];
    return viñetas.map((r) => ({
        x: r.x0 / width,
        y: r.y0 / height,
        w: (r.x1 - r.x0) / width,
        h: (r.y1 - r.y0) / height,
    }));
};

/**
 * Transformación para enseñar una viñeta ampliada y centrada.
 *
 * @param {Caja} caja
 * @param {{ancho: number, alto: number}} imagen tamaño natural de la página
 * @param {{ancho: number, alto: number}} pantalla
 * @param {number} [aire] proporción de la pantalla que se deja de margen
 * @returns {{escala: number, x: number, y: number}} píxeles CSS
 */
export const encuadre = (caja, imagen, pantalla, aire = 0.04) => {
    const anchoCaja = caja.w * imagen.ancho;
    const altoCaja = caja.h * imagen.alto;
    const escala = Math.min(
        (pantalla.ancho * (1 - aire * 2)) / anchoCaja,
        (pantalla.alto * (1 - aire * 2)) / altoCaja
    );
    const centroX = (caja.x + caja.w / 2) * imagen.ancho * escala;
    const centroY = (caja.y + caja.h / 2) * imagen.alto * escala;
    return {
        escala,
        x: Math.round(pantalla.ancho / 2 - centroX),
        y: Math.round(pantalla.alto / 2 - centroY),
    };
};
