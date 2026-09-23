/**
 * El color de un libro, sacado de su propia portada.
 *
 * ## Para qué
 *
 * En la estantería los libros se ven de canto, y un lomo se reconoce por su
 * color antes que por su texto — igual que en una estantería de verdad, donde
 * encuentras un libro por «el gordo rojo» y no leyendo cuarenta títulos. Si todos
 * los lomos fueran del mismo gris, la vista sería una lista girada noventa
 * grados.
 *
 * El color no lo elige la app: lo pone el libro. Eso hace que **la biblioteca de
 * cada uno se vea distinta**, y que sea reconocible: tu estante se parece a tu
 * estante.
 *
 * ## Por qué no basta con el color medio
 *
 * Promediar los píxeles de una portada da barro. Una cubierta roja con texto
 * blanco y una foto oscura promedian los tres al mismo marrón sucio, y encima ese
 * marrón no aparece en ninguna de las tres. Lo que se busca es **el color que más
 * manda**, no el punto medio.
 *
 * Así que se cuenta por celdas de color —se agrupa el espacio RGB en cubos y gana
 * el cubo con más píxeles— y se descartan dos cosas antes de contar:
 *
 *  - **Los grises**: casi toda portada tiene mucho blanco o negro de texto y
 *    fondo, y si contaran ganarían siempre. Un lomo blanco no distingue nada.
 *  - **Los extremos de luz**: el blanco puro y el negro puro no son el color de
 *    un libro, son el papel y la tinta.
 *
 * Si después de descartar no queda nada —una portada de verdad en blanco y
 * negro— se devuelve el gris que tenga, que es la respuesta honesta.
 */

/** Tamaño del cubo de color. 32 da ocho niveles por canal: suficiente. */
export const CUBO = 32;

/** Saturación mínima para que un píxel cuente como color y no como gris. */
export const SATURACION_MINIMA = 0.18;

/** Fuera los extremos: ni el papel ni la tinta son el color del libro. */
export const LUZ_MINIMA = 0.10;
export const LUZ_MAXIMA = 0.94;

const deHsl = (h, s, l) => {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const canal = (t) => {
        let v = t;
        if (v < 0) v += 1;
        if (v > 1) v -= 1;
        if (v < 1 / 6) return p + (q - p) * 6 * v;
        if (v < 1 / 2) return q;
        if (v < 2 / 3) return p + (q - p) * (2 / 3 - v) * 6;
        return p;
    };
    return hex(canal(h + 1 / 3) * 255, canal(h) * 255, canal(h - 1 / 3) * 255);
};

const aHsl = (r, g, b) => {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    const d = max - min;

    if (d === 0) return { h: 0, s: 0, l };

    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;

    return { h, s, l };
};

/** Luminancia relativa, la de la fórmula de contraste. */
const luminancia = (hexColor) => {
    const n = parseInt(String(hexColor).slice(1), 16);
    const canal = (v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * canal((n >> 16) & 255)
        + 0.7152 * canal((n >> 8) & 255)
        + 0.0722 * canal(n & 255);
};

const hex = (r, g, b) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v)))
    .toString(16).padStart(2, '0')).join('')}`;

/**
 * Color dominante de una imagen ya pintada.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} imagen
 * @returns {string} Un hexadecimal.
 */
export const colorDominante = (imagen) => {
    const { data, width, height } = imagen || {};
    if (!data || !width || !height) return '#5C5C64';

    const cubos = new Map();
    const grises = new Map();

    // De cuatro en cuatro píxeles: para encontrar el color que manda sobra
    // resolución, y recorrer una portada entera píxel a píxel en una biblioteca
    // de ciento treinta y seis es trabajo tirado.
    for (let i = 0; i < data.length; i += 16) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (data[i + 3] < 128) continue;

        const { s, l } = aHsl(r, g, b);
        const clave = `${Math.floor(r / CUBO)},${Math.floor(g / CUBO)},${Math.floor(b / CUBO)}`;

        if (s < SATURACION_MINIMA || l < LUZ_MINIMA || l > LUZ_MAXIMA) {
            const gris = grises.get(clave) || { n: 0, r: 0, g: 0, b: 0 };
            gris.n += 1; gris.r += r; gris.g += g; gris.b += b;
            grises.set(clave, gris);
            continue;
        }

        const cubo = cubos.get(clave) || { n: 0, r: 0, g: 0, b: 0 };
        cubo.n += 1; cubo.r += r; cubo.g += g; cubo.b += b;
        cubos.set(clave, cubo);
    }

    // Sin color que valga, la respuesta honesta es el gris que tenga: una
    // portada en blanco y negro no tiene un color escondido.
    const fuente = cubos.size ? cubos : grises;
    if (!fuente.size) return '#5C5C64';

    let mejor = null;
    fuente.forEach((cubo) => {
        if (!mejor || cubo.n > mejor.n) mejor = cubo;
    });

    // Se promedia **dentro del cubo ganador**, no sobre todo: así el color es uno
    // que de verdad está en la portada y no una mezcla de los que había.
    return hex(mejor.r / mejor.n, mejor.g / mejor.n, mejor.b / mejor.n);
};

/**
 * Lleva un color al rango en el que un lomo se lee.
 *
 * Una portada puede ser amarillo fluorescente o azul casi negro, y ninguno de los
 * dos sirve de lomo: con el primero no se lee el título y con el segundo no se
 * distingue del fondo. Se conserva el **tono** —que es lo que identifica al
 * libro— y se ajustan luz y saturación hasta que el lomo funcione.
 */
export const tonoDeLomo = (color) => {
    const m = /^#([0-9a-f]{6})$/i.exec(String(color || ''));
    if (!m) return { fondo: '#3A4152', tinta: '#E8EDF4' };

    const n = parseInt(m[1], 16);
    const { h, s, l } = aHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);

    const sat = Math.min(0.55, Math.max(0.22, s));
    let luz = Math.min(0.46, Math.max(0.22, l));

    /**
     * **El contraste se calcula, no se elige.**
     *
     * Un rojo saturado al 46 % de luz parece oscuro y no lo es: contra tinta
     * clara daba 2,7:1, por debajo del mínimo legible. Y no hay un valor de luz
     * que valga para todos los tonos —un amarillo al 46 % es mucho más luminoso
     * que un azul al mismo 46 %— así que el color se oscurece hasta que la
     * cuenta sale, tono a tono. Es la diferencia entre que funcione y que
     * funcione en las pruebas que se me ocurrieron.
     */
    const TINTA = '#EFF3F8';
    const luzTinta = luminancia(TINTA);
    let fondo = deHsl(h, sat, luz);

    for (let intento = 0; intento < 24; intento += 1) {
        const ratio = (luzTinta + 0.05) / (luminancia(fondo) + 0.05);
        if (ratio >= 4.5) break;
        luz = Math.max(0.06, luz - 0.02);
        fondo = deHsl(h, sat, luz);
    }

    return { fondo, tinta: TINTA };
};

/**
 * Ancho del lomo, en píxeles.
 *
 * Un tocho no mide lo mismo que una novela corta, y que se note es la mitad de la
 * gracia: en una estantería el grosor es información. Se saca del número de
 * páginas cuando se conoce y, si no, del tamaño del fichero, que es lo único que
 * siempre está.
 */
export const anchoDeLomo = ({ pageCount = 0, fileSize = 0 } = {}) => {
    const paginas = pageCount > 0
        ? pageCount
        // Una regla de a ojo: unos dos kilobytes de EPUB por página. No pretende
        // acertar, solo ordenar los libros por grosor de forma estable.
        : Math.round((fileSize || 0) / 2048);

    if (!paginas) return 26;
    return Math.round(Math.min(46, Math.max(18, 18 + (paginas / 900) * 28)));
};
