/**
 * Del PDF al texto corrido.
 *
 * ## El problema
 *
 * Un PDF no tiene párrafos: tiene trozos de texto con una posición en el folio.
 * pdf.js los devuelve tal cual (`getTextContent`), en el orden en que los
 * escribió el programa que hizo el PDF, que no siempre es el de lectura. Para
 * leerlo como un libro —con tu letra, tu tamaño y sin pellizcar— hay que
 * reconstruir lo que el ojo ve en el folio:
 *
 *  1. **Líneas**, juntando los trozos que comparten altura.
 *  2. **Columnas**: en un artículo a dos columnas, la línea 1 de la izquierda y
 *     la línea 1 de la derecha están a la misma altura y no van seguidas.
 *  3. **Cabeceras y pies** que se repiten en cada página («Revista de Historia ·
 *     12») y que en medio de un párrafo cortan la lectura.
 *  4. **Párrafos**, por el hueco entre líneas, la sangría y las líneas cortas.
 *  5. **Palabras partidas** a final de línea: «interc-» + «ambio».
 *  6. **Títulos**, por el cuerpo de letra.
 *
 * Los reflujos de otros lectores fallan casi siempre en el 2 y el 3, y el
 * resultado es peor que el folio: frases que saltan de columna y números de
 * página en mitad del texto. Por eso esas dos partes son las más cuidadas.
 *
 * Todo es puro: entra lo que da pdf.js y sale una lista de bloques.
 */

/** @typedef {{ str: string, transform: number[], width: number, height?: number, fontName?: string }} TrozoPdf */
/** @typedef {{ x0: number, x1: number, y: number, cuerpo: number, texto: string }} Linea */
/** @typedef {{ tipo: 'p'|'h', texto: string, pagina: number }} Bloque */

const mediana = (valores) => {
    const lista = valores.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    if (!lista.length) return 0;
    const medio = Math.floor(lista.length / 2);
    return lista.length % 2 ? lista[medio] : (lista[medio - 1] + lista[medio]) / 2;
};

/** Cuerpo de letra de un trozo, en unidades del PDF. */
const cuerpoDe = (trozo) => {
    const t = trozo.transform || [];
    const porMatriz = Math.hypot(t[2] || 0, t[3] || 0);
    return porMatriz || trozo.height || 10;
};

/**
 * Junta los trozos en líneas.
 *
 * Dos trozos son de la misma línea si su línea base está a menos de media
 * letra. Dentro de la línea se ordenan por x y se mete un espacio solo si hay
 * hueco: muchos PDF ya traen el espacio dentro del trozo, y otros parten una
 * palabra en dos trozos pegados que no deben separarse.
 *
 * @param {TrozoPdf[]} trozos
 * @returns {Linea[]} de arriba abajo
 */
export const lineasDe = (trozos = []) => {
    const utiles = trozos
        .filter((t) => t && typeof t.str === 'string' && t.str.trim() && Array.isArray(t.transform))
        .map((t) => ({
            texto: t.str,
            x0: t.transform[4],
            x1: t.transform[4] + (t.width || 0),
            y: t.transform[5],
            cuerpo: cuerpoDe(t),
        }))
        .sort((a, b) => b.y - a.y || a.x0 - b.x0);

    /** @type {Array<{y: number, cuerpo: number, trozos: Object[]}>} */
    const grupos = [];
    for (const trozo of utiles) {
        const grupo = grupos.find((g) => Math.abs(g.y - trozo.y) < Math.max(g.cuerpo, trozo.cuerpo) * 0.5);
        if (grupo) grupo.trozos.push(trozo);
        else grupos.push({ y: trozo.y, cuerpo: trozo.cuerpo, trozos: [trozo] });
    }

    return grupos
        .map((grupo) => {
            const ordenados = grupo.trozos.sort((a, b) => a.x0 - b.x0);
            let texto = '';
            let finAnterior = null;
            for (const trozo of ordenados) {
                const hueco = finAnterior === null ? 0 : trozo.x0 - finAnterior;
                const necesitaEspacio = finAnterior !== null
                    && hueco > grupo.cuerpo * 0.12
                    && !/\s$/.test(texto) && !/^\s/.test(trozo.texto);
                texto += (necesitaEspacio ? ' ' : '') + trozo.texto;
                finAnterior = Math.max(finAnterior ?? -Infinity, trozo.x1);
            }
            return {
                x0: ordenados[0].x0,
                x1: Math.max(...ordenados.map((t) => t.x1)),
                y: grupo.y,
                cuerpo: mediana(ordenados.map((t) => t.cuerpo)),
                texto: texto.replace(/\s+/g, ' ').trim(),
            };
        })
        .filter((linea) => linea.texto)
        .sort((a, b) => b.y - a.y);
};

/**
 * Pone las líneas en orden de lectura, columna a columna.
 *
 * Se busca un **canalón**: una franja vertical cerca del centro que casi
 * ninguna línea cruza, con texto a los dos lados. Si existe, se lee la columna
 * izquierda entera y luego la derecha. Las líneas que sí cruzan (un título a
 * todo el ancho) van delante si están por encima de las columnas.
 *
 * @param {Linea[]} lineas
 * @param {number} ancho Ancho del folio.
 */
export const ordenDeLectura = (lineas, ancho) => {
    if (!lineas.length || !ancho) return lineas;

    const centro = ancho / 2;
    const margen = ancho * 0.03;
    const cruzan = lineas.filter((l) => l.x0 < centro - margen && l.x1 > centro + margen);
    const izquierda = lineas.filter((l) => l.x1 <= centro + margen && !cruzan.includes(l));
    const derecha = lineas.filter((l) => l.x0 >= centro - margen && !cruzan.includes(l));

    const dosColumnas = izquierda.length >= 4 && derecha.length >= 4
        && cruzan.length / lineas.length < 0.2;
    if (!dosColumnas) return lineas;

    const techoColumnas = Math.max(...[...izquierda, ...derecha].map((l) => l.y));
    const encima = cruzan.filter((l) => l.y > techoColumnas);
    const resto = cruzan.filter((l) => l.y <= techoColumnas);

    const porAltura = (a, b) => b.y - a.y;
    return [
        ...encima.sort(porAltura),
        ...[...izquierda, ...resto].sort(porAltura),
        ...derecha.sort(porAltura),
    ];
};

/** Texto de una línea con los números cambiados, para comparar cabeceras. */
const firma = (texto) => texto.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

const esNumeroDePagina = (texto) => /^(p[áa]g(ina)?\.?\s*)?[\divxlc]{1,6}$/i.test(texto.trim())
    || /^[-–—]\s*\d+\s*[-–—]$/.test(texto.trim());

/**
 * Las cabeceras y pies que se repiten.
 *
 * Una línea en la franja superior o inferior del folio que aparece —con los
 * números cambiados— en una buena parte de las páginas no es contenido: es el
 * título de la revista, el capítulo corriente o la paginación.
 *
 * @param {Array<{lineas: Linea[], alto: number}>} paginas
 * @returns {Set<string>} firmas a quitar
 */
export const cabecerasRepetidas = (paginas = []) => {
    const cuenta = new Map();
    for (const { lineas, alto } of paginas) {
        const vistas = new Set();
        for (const linea of lineas) {
            if (!enMargen(linea, alto)) continue;
            vistas.add(firma(linea.texto));
        }
        for (const f of vistas) cuenta.set(f, (cuenta.get(f) || 0) + 1);
    }
    const minimo = Math.max(2, Math.ceil(paginas.length * 0.3));
    return new Set([...cuenta].filter(([, veces]) => veces >= minimo).map(([f]) => f));
};

const enMargen = (linea, alto) => linea.y > alto * 0.9 || linea.y < alto * 0.1;

/**
 * Quita cabeceras, pies y números de página sueltos en los márgenes.
 *
 * @param {Linea[]} lineas
 * @param {number} alto
 * @param {Set<string>} repetidas
 */
export const sinCabeceras = (lineas, alto, repetidas = new Set()) => lineas.filter((linea) => {
    if (!enMargen(linea, alto)) return true;
    if (esNumeroDePagina(linea.texto)) return false;
    return !repetidas.has(firma(linea.texto));
});

/**
 * ¿Acaba esta línea con una palabra partida?
 *
 * Solo si el guion va pegado a una letra y la línea siguiente empieza en
 * minúscula: «bien-» + «estar» en mayúscula sería «bien-Estar», que no existe, y
 * un guion de diálogo al final de línea no parte nada.
 */
const partePalabra = (actual, siguiente) => /\p{L}[-‐]$/u.test(actual) && /^\p{Ll}/u.test(siguiente);

/**
 * Agrupa las líneas de una página en párrafos y títulos.
 *
 * @param {Linea[]} lineas en orden de lectura y ya sin cabeceras
 * @param {number} pagina número de página del PDF
 * @param {{ cuerpoTexto?: number }} [opciones] cuerpo del texto normal del
 *   documento. Se pasa desde fuera porque en una página con mucho título la
 *   mediana de la propia página no es el cuerpo del texto.
 * @returns {Bloque[]}
 */
export const parrafosDe = (lineas, pagina, { cuerpoTexto } = {}) => {
    if (!lineas.length) return [];

    const cuerpo = cuerpoTexto || mediana(lineas.map((l) => l.cuerpo));
    const interlineas = [];
    for (let i = 1; i < lineas.length; i += 1) {
        const salto = lineas[i - 1].y - lineas[i].y;
        if (salto > 0 && salto < cuerpo * 3) interlineas.push(salto);
    }
    // El interlineado normal es el hueco **pequeño** que más se repite. Con la
    // mediana, una página de pocos párrafos —dos huecos normales y dos entre
    // párrafos— daría un valor a medio camino y no separaría ninguno.
    const ordenadas = [...interlineas].sort((a, b) => a - b);
    const interlinea = ordenadas[Math.floor((ordenadas.length - 1) * 0.3)] || cuerpo * 1.2;
    const anchoColumna = mediana(lineas.map((l) => l.x1 - l.x0));
    const izquierdaTipica = mediana(lineas.map((l) => l.x0));

    /** @type {Bloque[]} */
    const bloques = [];
    let actual = null;

    const cerrar = () => {
        if (actual?.texto.trim()) bloques.push({ ...actual, texto: actual.texto.trim() });
        actual = null;
    };

    lineas.forEach((linea, i) => {
        const titulo = linea.cuerpo >= cuerpo * 1.18 && linea.texto.length < 140;
        const previa = lineas[i - 1];

        if (titulo) {
            // Un título de dos líneas sigue siendo un título.
            if (actual?.tipo === 'h' && previa && Math.abs(previa.cuerpo - linea.cuerpo) < 0.5) {
                actual.texto += ` ${linea.texto}`;
                return;
            }
            cerrar();
            actual = { tipo: 'h', texto: linea.texto, pagina };
            return;
        }

        let nuevo = !actual || actual.tipo === 'h';
        if (!nuevo && previa) {
            const salto = previa.y - linea.y;
            const previaCierra = /[.!?:»”"')\]…]$/.test(previa.texto);
            if (salto < 0) {
                // Salto de columna: la línea siguiente está más arriba. El
                // párrafo sigue si la frase no había terminado.
                nuevo = previaCierra || !/^[\p{Ll},;]/u.test(linea.texto);
            } else {
                const hueco = salto > interlinea * 1.45;
                const sangria = linea.x0 > izquierdaTipica + cuerpo * 0.8;
                const previaCorta = (previa.x1 - previa.x0) < anchoColumna * 0.72;
                nuevo = hueco || (sangria && previaCierra) || (previaCorta && previaCierra);
            }
        }

        if (nuevo) {
            cerrar();
            actual = { tipo: 'p', texto: linea.texto, pagina };
            return;
        }

        if (partePalabra(actual.texto, linea.texto)) {
            actual.texto = actual.texto.replace(/[-‐]$/, '') + linea.texto;
        } else {
            actual.texto += ` ${linea.texto}`;
        }
    });
    cerrar();
    return bloques;
};

/**
 * Une el último párrafo de una página con el primero de la siguiente cuando es
 * el mismo párrafo cortado por el salto de página.
 *
 * Sin esto, cada cambio de folio parte una frase en dos párrafos, que es justo
 * lo que delata un reflujo hecho deprisa.
 *
 * @param {Bloque[]} anteriores
 * @param {Bloque[]} siguientes
 */
export const coserPaginas = (anteriores, siguientes) => {
    if (!anteriores.length || !siguientes.length) return [...anteriores, ...siguientes];
    const ultimo = anteriores[anteriores.length - 1];
    const primero = siguientes[0];
    const sigue = ultimo.tipo === 'p' && primero.tipo === 'p'
        && !/[.!?:»”"…]$/.test(ultimo.texto)
        && /^[\p{Ll}(,;]/u.test(primero.texto);
    if (!sigue) return [...anteriores, ...siguientes];

    const texto = partePalabra(ultimo.texto, primero.texto)
        ? ultimo.texto.replace(/[-‐]$/, '') + primero.texto
        : `${ultimo.texto} ${primero.texto}`;
    return [...anteriores.slice(0, -1), { ...ultimo, texto }, ...siguientes.slice(1)];
};

/** Por debajo de estos caracteres una página se enseña como imagen. */
export const MINIMO_TEXTO_PAGINA = 60;

/**
 * Convierte una tanda de páginas en bloques de lectura.
 *
 * Las páginas casi sin texto —una portada, una lámina, un gráfico— no se
 * convierten: se marcan como `imagen` para enseñarlas tal cual, porque su
 * contenido es el dibujo y no las tres palabras que lleva.
 *
 * @param {Array<{numero: number, trozos: TrozoPdf[], ancho: number, alto: number}>} paginas
 * @param {{ cuerpoTexto?: number }} [opciones]
 * @returns {Array<Bloque | {tipo: 'imagen', pagina: number}>}
 */
export const reflujo = (paginas = [], opciones = {}) => {
    const preparadas = paginas.map((p) => ({ ...p, lineas: lineasDe(p.trozos) }));
    const repetidas = cabecerasRepetidas(preparadas);
    const cuerpoTexto = opciones.cuerpoTexto
        || mediana(preparadas.flatMap((p) => p.lineas.map((l) => l.cuerpo)));

    let bloques = [];
    for (const pagina of preparadas) {
        const caracteres = pagina.lineas.reduce((n, l) => n + l.texto.length, 0);
        if (caracteres < MINIMO_TEXTO_PAGINA) {
            bloques.push({ tipo: 'imagen', pagina: pagina.numero });
            continue;
        }
        const limpias = sinCabeceras(pagina.lineas, pagina.alto, repetidas);
        const ordenadas = ordenDeLectura(limpias, pagina.ancho);
        bloques = coserPaginas(bloques, parrafosDe(ordenadas, pagina.numero, { cuerpoTexto }));
    }
    return bloques;
};

/** ¿El documento tiene texto o es un escaneado? Se decide con unas pocas páginas. */
export const tieneTexto = (paginas = []) => {
    const total = paginas.reduce(
        (n, p) => n + (p.trozos || []).reduce((m, t) => m + (t?.str?.trim().length || 0), 0),
        0
    );
    return total >= MINIMO_TEXTO_PAGINA * Math.max(1, Math.ceil(paginas.length / 2));
};
