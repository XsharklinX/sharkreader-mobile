/**
 * Ayudas de vocabulario sobre el texto.
 *
 * ## Qué hace
 *
 * Encima de las palabras difíciles para tu nivel aparece su traducción, en letra
 * pequeña, sin tocar nada. Quien lee en otro idioma lee de corrido en vez de
 * parar en cada palabra a mantenerla pulsada. Kindle lo tiene (Word Wise), solo
 * en inglés y solo con libros de su tienda.
 *
 * ## Qué palabra es difícil
 *
 * La que no está entre las N más usadas del idioma, según listas de frecuencia
 * reales (ver `frecuencias/LICENCIA.txt`). El nivel decide N: con B1 se ayuda en
 * todo lo que pase de las 5.000 más usadas; con C1, solo en lo que pase de
 * 20.000. Los nombres propios no se tocan —van en mayúscula en mitad de frase—
 * ni las palabras cortas.
 *
 * ## Que no estorbe
 *
 * Un párrafo con una glosa cada tres palabras ya no se lee. Hay un tope por
 * párrafo, y una palabra solo se glosa la primera vez que sale en el capítulo:
 * la segunda ya la has visto.
 *
 * Las glosas son la traducción de la palabra, hecha en el teléfono con el mismo
 * motor que «Traducir». Solo tiene sentido con libros en otro idioma.
 */

export const NIVELES_GLOSAS = [
    { id: 'b1', label: 'B1', limite: 5000, hint: 'Ayuda en casi todo lo que no es básico' },
    { id: 'b2', label: 'B2', limite: 10000, hint: 'Solo palabras poco corrientes' },
    { id: 'c1', label: 'C1', limite: 20000, hint: 'Solo palabras raras' },
];

export const limiteDe = (nivel) => NIVELES_GLOSAS.find((n) => n.id === nivel)?.limite || 10000;

const CARGADORES = {
    en: () => import('./frecuencias/en.json'),
    es: () => import('./frecuencias/es.json'),
    fr: () => import('./frecuencias/fr.json'),
    de: () => import('./frecuencias/de.json'),
    it: () => import('./frecuencias/it.json'),
    pt: () => import('./frecuencias/pt.json'),
};

export const IDIOMAS_CON_GLOSAS = Object.keys(CARGADORES);

/** Las palabras «conocidas» de un idioma para un nivel, o null si no hay lista. */
export const cargarConocidas = async (idioma, nivel) => {
    const cargar = CARGADORES[idioma];
    if (!cargar) return null;
    const lista = (await cargar()).default;
    return new Set(lista.slice(0, limiteDe(nivel)));
};

/** Por párrafo, como mucho. */
const POR_PARRAFO = 3;
/** Palabras de texto entre una glosa y la siguiente, como poco. */
const SEPARACION = 6;

/**
 * Qué palabras de un párrafo llevan glosa.
 *
 * @param {string} texto el párrafo
 * @param {Set<string>} conocidas
 * @param {Set<string>} [yaGlosadas] las ya glosadas en el capítulo; se amplía
 * @returns {string[]} las palabras tal como aparecen, en orden
 */
export const palabrasDificiles = (texto, conocidas, yaGlosadas = new Set(), idioma = 'en') => {
    const elegidas = [];
    let desdeLaUltima = SEPARACION;
    let inicioDeFrase = true;

    for (const m of String(texto || '').matchAll(/\p{L}+|[.!?¿¡:;«»"“—]/gu)) {
        const token = m[0];
        if (!/\p{L}/u.test(token)) {
            if (/[.!?¿¡:«"“—]/.test(token)) inicioDeFrase = true;
            continue;
        }
        const empiezaFrase = inicioDeFrase;
        inicioDeFrase = false;
        desdeLaUltima += 1;

        if (elegidas.length >= POR_PARRAFO || desdeLaUltima < SEPARACION) continue;
        if (token.length < 4) continue;
        // Mayúscula en mitad de frase: un nombre propio.
        if (!empiezaFrase && /^\p{Lu}/u.test(token)) continue;

        const clave = token.toLocaleLowerCase(idioma);
        if (conocidas.has(clave) || yaGlosadas.has(clave)) continue;

        elegidas.push(token);
        yaGlosadas.add(clave);
        desdeLaUltima = 0;
    }
    return elegidas;
};

