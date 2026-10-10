/**
 * El vocabulario, como tarjetas de Anki.
 *
 * Se exporta un fichero de texto con las cabeceras que entiende Anki desde la
 * 2.1.55 (y AnkiDroid, que usa el mismo importador): separador, mazo, tipo de
 * nota y columna de etiquetas. Al abrirlo, Anki ya sabe dónde va cada cosa y no
 * pregunta nada. No hace falta tener AnkiDroid instalado ni darle permisos: el
 * mismo fichero vale para el ordenador.
 *
 * Cada tarjeta lleva **la frase del libro** donde apareció la palabra. Es lo
 * que la diferencia de una lista de palabras sueltas: se repasa con el
 * contexto en que se aprendió, que es como se recuerda.
 */

export const MAZO_ANKI = 'SharkReader::Vocabulario';

/** Una frase de más de esto no es contexto, es un párrafo. */
const FRASE_MAXIMA = 280;

const escaparHtml = (texto) => String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Un campo del fichero: sin tabuladores ni saltos, que lo romperían. */
const campo = (html) => String(html || '').replace(/[\t\r\n]+/g, ' ').trim();

/** Una etiqueta de Anki no admite espacios. */
const etiqueta = (texto) => String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

const escaparRegExp = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * La frase de un párrafo en la que está la palabra.
 *
 * Si la frase es larguísima, se recorta alrededor de la palabra con puntos
 * suspensivos. Si la palabra no aparece (se buscó una forma distinta), se
 * devuelve vacío: mejor sin contexto que con uno que no la contiene.
 */
export const fraseConPalabra = (parrafo, palabra) => {
    const texto = String(parrafo || '').replace(/\s+/g, ' ').trim();
    const buscada = String(palabra || '').trim();
    if (!texto || !buscada) return '';
    const patron = new RegExp(`(^|[^\\p{L}])${escaparRegExp(buscada)}(?=$|[^\\p{L}])`, 'iu');
    const frases = texto.split(/(?<=[.!?…])\s+/u);
    const frase = frases.find((f) => patron.test(f));
    if (!frase) return '';
    if (frase.length <= FRASE_MAXIMA) return frase;

    const donde = frase.search(patron);
    const inicio = Math.max(0, donde - FRASE_MAXIMA / 2);
    const recorte = frase.slice(inicio, inicio + FRASE_MAXIMA);
    // Cortar por palabras enteras.
    const limpio = recorte
        .replace(inicio > 0 ? /^\S*\s/ : /^/, '')
        .replace(inicio + FRASE_MAXIMA < frase.length ? /\s\S*$/ : /$/, '');
    return `${inicio > 0 ? '…' : ''}${limpio}${inicio + FRASE_MAXIMA < frase.length ? '…' : ''}`;
};

/** La frase con la palabra en negrita, ya escapada para Anki. */
export const resaltarEnFrase = (frase, palabra) => {
    const html = escaparHtml(frase);
    const buscada = escaparHtml(palabra);
    if (!buscada) return html;
    const patron = new RegExp(`(^|[^\\p{L}])(${escaparRegExp(buscada)})(?=$|[^\\p{L}])`, 'giu');
    return html.replace(patron, '$1<b>$2</b>');
};

/**
 * El fichero para Anki.
 *
 * Anverso: la palabra y, debajo, la frase del libro con la palabra en negrita.
 * Reverso: la traducción si la hay, la definición y de qué libro sale.
 *
 * @param {Array<{word, lang, definition, bookName, frase?, traduccion?}>} palabras
 */
export const vocabularioParaAnki = (palabras = []) => {
    const cabecera = [
        '#separator:tab',
        '#html:true',
        '#notetype:Basic',
        `#deck:${MAZO_ANKI}`,
        '#tags column:3',
    ];
    const filas = palabras.filter((p) => p?.word).map((p) => {
        const anverso = [
            `<div style="font-size:1.4em">${escaparHtml(p.word)}</div>`,
            p.frase ? `<div style="margin-top:.8em;font-style:italic;opacity:.8">${resaltarEnFrase(p.frase, p.word)}</div>` : '',
        ].join('');
        const reverso = [
            p.traduccion ? `<div style="font-size:1.25em">${escaparHtml(p.traduccion)}</div>` : '',
            p.definition ? `<div style="margin-top:.6em">${escaparHtml(p.definition)}</div>` : '',
            p.bookName ? `<div style="margin-top:.8em;font-size:.8em;opacity:.6">${escaparHtml(p.bookName)}</div>` : '',
        ].join('');
        const etiquetas = ['sharkreader', p.lang ? `idioma-${etiqueta(p.lang)}` : '', etiqueta(p.bookName)]
            .filter(Boolean).join(' ');
        return [campo(anverso), campo(reverso || escaparHtml(p.word)), etiquetas].join('\t');
    });
    return `${[...cabecera, ...filas].join('\n')}\n`;
};
