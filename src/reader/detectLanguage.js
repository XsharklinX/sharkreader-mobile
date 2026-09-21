/**
 * De qué idioma es un texto.
 *
 * ## Para qué hace falta
 *
 * Para partir palabras. El navegador solo aplica `hyphens: auto` si sabe en qué
 * idioma está el texto, y lo saca del atributo `lang` del documento. Muchos EPUB
 * no lo declaran, y unos cuantos lo declaran mal —sobre todo las traducciones,
 * que se quedan con el `lang` del original—.
 *
 * Sin guionado, el texto justificado abre ríos de espacio entre palabras. Así que
 * la cadena es: justificado necesita guionado, guionado necesita idioma, y el
 * idioma hay que deducirlo cuando el fichero no lo dice.
 *
 * ## Cómo se decide
 *
 * Contando palabras cortísimas y muy frecuentes. No hace falta nada más fino: con
 * un párrafo de novela, «de», «la», «que» contra «the», «of», «and» separan el
 * español del inglés sin ninguna duda, y lo mismo el resto.
 *
 * Es deliberadamente tonto. La alternativa —modelos de n-gramas— pesa cientos de
 * kilobytes para acertar en textos de diez palabras, y aquí siempre hay un
 * capítulo entero delante.
 */

/**
 * Palabras vacías por idioma.
 *
 * Solo de los idiomas que el navegador sabe guionar y que aparecen de verdad en
 * una biblioteca en español. Añadir idiomas que nadie va a leer solo añade
 * ocasiones de confundirse.
 */
const MARCADORES = {
    es: ['de', 'la', 'que', 'el', 'en', 'los', 'del', 'se', 'las', 'por', 'un', 'para', 'con', 'una', 'su', 'al', 'lo', 'como', 'pero', 'sus'],
    en: ['the', 'of', 'and', 'to', 'in', 'that', 'was', 'his', 'he', 'it', 'with', 'as', 'her', 'had', 'for', 'she', 'not', 'but', 'be', 'they'],
    pt: ['de', 'que', 'nao', 'uma', 'com', 'para', 'como', 'mas', 'foi', 'ele', 'das', 'seu', 'ela', 'ser', 'quando', 'muito', 'ja', 'eu', 'tambem', 'so'],
    fr: ['de', 'le', 'la', 'et', 'les', 'des', 'que', 'il', 'une', 'dans', 'pas', 'pour', 'qui', 'sur', 'plus', 'elle', 'au', 'ce', 'se', 'son'],
    it: ['di', 'che', 'il', 'la', 'non', 'per', 'una', 'con', 'del', 'si', 'come', 'piu', 'ma', 'sono', 'della', 'gli', 'alla', 'nel', 'suo', 'era'],
    de: ['der', 'die', 'und', 'den', 'das', 'nicht', 'von', 'sie', 'ist', 'des', 'sich', 'mit', 'dem', 'dass', 'er', 'ein', 'ich', 'auf', 'so', 'eine'],
    ca: ['que', 'els', 'amb', 'per', 'del', 'les', 'una', 'als', 'seva', 'aquest', 'mes', 'ja', 'pero', 'sobre', 'tot', 'com', 'quan', 'seu', 'fins', 'aixo'],
};

/**
 * Letras que delatan un idioma, para desempatar.
 *
 * Solo las que de verdad distinguen. «de» lo comparten español, portugués y
 * francés; una «ñ» o un «ß» no los comparte nadie. Las tildes graves sobre i, o y
 * u son italianas: el español solo lleva agudas.
 */
const PISTAS = [
    [/ñ/i, 'es'],
    [/[ãõ]/i, 'pt'],
    [/ß|[äöü]/i, 'de'],
    [/[ìòù]/i, 'it'],
    [/œ|ê|û/i, 'fr'],
    [/l·l|ŀ/i, 'ca'],
];

/** Idiomas que el navegador sabe partir y que ofrecemos. */
export const IDIOMAS_SOPORTADOS = Object.keys(MARCADORES);

/**
 * Normaliza un código de idioma a los dos primeros caracteres.
 *
 * Los EPUB traen de todo: `es`, `es-ES`, `es_ES`, `ES`, `spa`. Lo que necesita el
 * atributo `lang` es la etiqueta corta, y lo que necesita esta función es poder
 * comparar.
 */
export const normalizeLang = (codigo) => {
    const limpio = String(codigo || '').trim().toLowerCase().replace('_', '-');
    if (!limpio) return '';

    const corto = limpio.split('-')[0];

    // Códigos de tres letras: los usa alguna herramienta de conversión vieja.
    const tresLetras = { spa: 'es', eng: 'en', por: 'pt', fra: 'fr', fre: 'fr', ita: 'it', deu: 'de', ger: 'de', cat: 'ca' };
    return tresLetras[corto] || corto;
};

/**
 * Adivina el idioma de un texto.
 *
 * @param {string} texto  Un fragmento del libro. Con un par de párrafos sobra.
 * @returns {string} Código de dos letras, o cadena vacía si no hay nada claro.
 */
export const detectLanguage = (texto) => {
    const limpio = String(texto || '')
        .toLowerCase()
        // Las tildes se quitan para contar palabras, pero se miran aparte como
        // pista: «não» cuenta como «nao» y además delata el portugués.
        .replace(/[^\p{Letter}\s·]/gu, ' ');

    const palabras = limpio
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .split(/\s+/)
        .filter(Boolean);

    // Menos de treinta palabras no es una muestra: es una frase suelta, y
    // equivocarse de idioma parte las palabras por donde no toca.
    if (palabras.length < 30) return '';

    const puntos = {};
    for (const [idioma, marcadores] of Object.entries(MARCADORES)) {
        const set = new Set(marcadores);
        puntos[idioma] = palabras.reduce((suma, palabra) => suma + (set.has(palabra) ? 1 : 0), 0);
    }

    // Las pistas de ortografía valen por varias palabras: una «ñ» en un texto de
    // quinientas palabras es más concluyente que veinte «de», que comparten
    // español, portugués y francés.
    for (const [patron, idioma] of PISTAS) {
        if (patron.test(texto)) puntos[idioma] = (puntos[idioma] || 0) + palabras.length * 0.04;
    }

    const orden = Object.entries(puntos).sort((a, b) => b[1] - a[1]);
    const [mejor, suMarca] = orden[0];
    const segunda = orden[1]?.[1] || 0;

    // Hace falta que gane de verdad. Con dos idiomas empatados, no declarar nada
    // es mejor que declarar el equivocado: sin `lang` el navegador no parte
    // palabras, y eso es un texto con ríos; con el `lang` errado, parte por donde
    // no debe y eso son palabras rotas.
    const claro = suMarca >= palabras.length * 0.04 && suMarca > segunda * 1.3;
    return claro ? mejor : '';
};

/**
 * El idioma con el que marcar el capítulo.
 *
 * Se prefiere lo que declare el EPUB, porque el editor sabe más que una cuenta de
 * palabras — salvo que declare algo que no sabemos guionar, y entonces mirar el
 * texto es mejor que rendirse.
 */
export const resolveHyphenLang = ({ declarado, texto, elegido } = {}) => {
    // Lo que el usuario elige a mano manda sobre todo lo demás.
    const manual = normalizeLang(elegido);
    if (manual && manual !== 'auto' && IDIOMAS_SOPORTADOS.includes(manual)) return manual;

    const delLibro = normalizeLang(declarado);
    if (IDIOMAS_SOPORTADOS.includes(delLibro)) return delLibro;

    return detectLanguage(texto);
};
