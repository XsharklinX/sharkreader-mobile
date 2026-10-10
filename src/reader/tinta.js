/**
 * Escribir a mano sobre un PDF.
 *
 * Los trazos se guardan **en proporciones de la página entera** (0 a 1), no en
 * píxeles de pantalla. Así sobreviven a todo lo que cambia el lienzo: el zoom,
 * el recorte de márgenes, girar a otro móvil o abrir el backup en una tableta.
 * Cada punto lleva su presión, que es lo que hace que un lápiz parezca lápiz.
 *
 * Un trazo: `{ herramienta: 'boligrafo' | 'marcador', color, ancho, puntos: [[x, y, presion], …] }`,
 * con `ancho` también en proporción del ancho de la página.
 */

export const HERRAMIENTAS = {
    boligrafo: { ancho: 0.0032, opacidad: 1 },
    marcador: { ancho: 0.018, opacidad: 0.35 },
};

export const COLORES_TINTA = {
    boligrafo: ['#1d1d1f', '#1f4fd1', '#c62828'],
    marcador: ['#ffd400', '#7bd88f', '#ff8ab3'],
};

/** Cuánto se acerca la goma a un trazo para borrarlo, en proporción del ancho. */
export const RADIO_GOMA = 0.018;

/** Sin redondear, un trazo largo pesa decenas de KB en la copia de seguridad. */
const redondear = (n) => Math.round(n * 10000) / 10000;

/** Un punto de la pantalla, pasado a proporciones de la página entera. */
export const aPagina = ({ x, y }, { ancho, alto }, recorte = null) => {
    const caja = recorte || { x: 0, y: 0, w: 1, h: 1 };
    return {
        x: caja.x + (x / ancho) * caja.w,
        y: caja.y + (y / alto) * caja.h,
    };
};

/** Lo contrario: de proporciones de la página a píxeles del lienzo. */
export const aLienzo = ([x, y], { ancho, alto }, recorte = null) => {
    const caja = recorte || { x: 0, y: 0, w: 1, h: 1 };
    return [((x - caja.x) / caja.w) * ancho, ((y - caja.y) / caja.h) * alto];
};

const distanciaAlSegmento = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const largo = dx * dx + dy * dy;
    const t = largo ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / largo)) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};

/**
 * Quita los puntos que no cambian la forma (Ramer–Douglas–Peucker).
 *
 * Un lápiz a 240 Hz da cientos de puntos por palabra; casi todos están en línea
 * con sus vecinos. Quitarlos al soltar deja el trazo igual a la vista y una
 * décima parte de grande.
 */
export const simplificar = (puntos, tolerancia = 0.0006) => {
    if (puntos.length < 3) return puntos;
    let maximo = 0;
    let indice = 0;
    const ultimo = puntos.length - 1;
    for (let i = 1; i < ultimo; i += 1) {
        const d = distanciaAlSegmento(puntos[i], puntos[0], puntos[ultimo]);
        if (d > maximo) { maximo = d; indice = i; }
    }
    if (maximo <= tolerancia) return [puntos[0], puntos[ultimo]];
    const izquierda = simplificar(puntos.slice(0, indice + 1), tolerancia);
    const derecha = simplificar(puntos.slice(indice), tolerancia);
    return [...izquierda.slice(0, -1), ...derecha];
};

/** Cierra un trazo recién dibujado: lo simplifica y redondea. */
export const cerrarTrazo = (trazo) => ({
    ...trazo,
    ancho: redondear(trazo.ancho),
    puntos: simplificar(trazo.puntos).map(([x, y, p]) => [redondear(x), redondear(y), Math.round((p ?? 0.5) * 100) / 100]),
});

/**
 * La presión que da el puntero, o una razonable si no da ninguna.
 *
 * Un dedo o un ratón dicen 0.5 apretando, o 0 en algunos WebView; un lápiz sin
 * presión, también. Se toma 0.5 para que el trazo tenga el ancho normal.
 */
export const presionDe = (evento) => {
    const p = Number(evento?.pressure);
    return evento?.pointerType === 'pen' && p > 0 ? Math.min(1, p) : 0.5;
};

/** Ancho de un tramo con presión: entre la mitad y vez y media del nominal. */
export const anchoConPresion = (ancho, presion) => ancho * (0.5 + (presion ?? 0.5));

/** ¿Pasa la goma por este trazo? */
export const tocaTrazo = (trazo, punto, radio = RADIO_GOMA) => {
    const p = [punto.x, punto.y];
    const margen = radio + trazo.ancho / 2;
    const { puntos } = trazo;
    if (puntos.length === 1) return Math.hypot(p[0] - puntos[0][0], p[1] - puntos[0][1]) <= margen;
    for (let i = 1; i < puntos.length; i += 1) {
        if (distanciaAlSegmento(p, puntos[i - 1], puntos[i]) <= margen) return true;
    }
    return false;
};

/** Los trazos de una página, sin los que toca la goma. */
export const borrarEn = (trazos, punto, radio) => trazos.filter((t) => !tocaTrazo(t, punto, radio));

/** ¿Hay algo escrito en el libro? */
export const hayTinta = (porPagina = {}) => Object.values(porPagina).some((lista) => lista?.length);

const hexARgb = (hex) => {
    const limpio = String(hex).replace('#', '');
    const n = parseInt(limpio.length === 3 ? limpio.split('').map((c) => c + c).join('') : limpio, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/**
 * Un trazo como anotación «Ink» de PDF, en el espacio de la página.
 *
 * `convertir(x, y)` pasa de proporciones de la página a puntos PDF; lo da
 * pdf.js (`viewport.convertToPdfPoint`), que ya sabe de giros y cajas de
 * recorte. Se devuelve todo lo que necesita el diccionario de la anotación y su
 * apariencia, para que cualquier visor la dibuje igual aunque no sepa
 * regenerarla.
 */
export const comoAnotacionPdf = (trazo, convertir, anchoPagina) => {
    const puntos = trazo.puntos.map(([x, y]) => convertir(x, y));
    const presionMedia = trazo.puntos.reduce((s, p) => s + (p[2] ?? 0.5), 0) / trazo.puntos.length;
    const grosor = Math.max(0.3, anchoConPresion(trazo.ancho, presionMedia) * anchoPagina);
    const xs = puntos.map((p) => p[0]);
    const ys = puntos.map((p) => p[1]);
    const media = grosor / 2 + 1;
    const rect = [Math.min(...xs) - media, Math.min(...ys) - media, Math.max(...xs) + media, Math.max(...ys) + media];
    const color = hexARgb(trazo.color);
    const opacidad = HERRAMIENTAS[trazo.herramienta]?.opacidad ?? 1;

    // La apariencia se dibuja con su origen en la esquina de `rect`.
    const f = (n) => Number(n.toFixed(2));
    const ruta = puntos.map(([x, y], i) => `${f(x - rect[0])} ${f(y - rect[1])} ${i ? 'l' : 'm'}`);
    if (puntos.length === 1) ruta.push(`${f(puntos[0][0] - rect[0] + 0.01)} ${f(puntos[0][1] - rect[1])} l`);
    const contenido = [
        opacidad < 1 ? '/GS0 gs' : '',
        `${color.map(f).join(' ')} RG`,
        `${f(grosor)} w 1 J 1 j`,
        ...ruta,
        'S',
    ].filter(Boolean).join('\n');

    return {
        rect: rect.map(f),
        inkList: puntos.flat().map(f),
        color,
        grosor: f(grosor),
        opacidad,
        apariencia: { contenido, ancho: f(rect[2] - rect[0]), alto: f(rect[3] - rect[1]) },
    };
};
