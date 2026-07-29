/**
 * Índice de contenido para buscar en toda la biblioteca.
 *
 * Hasta ahora buscar en un libro obligaba a abrirlo, y buscar en la biblioteca
 * solo miraba título y autor. Eso deja fuera el caso que de verdad hace falta:
 * recuerdas una frase y no en qué libro estaba. Es lo que separa una estantería
 * de un archivo consultable.
 *
 * ## Cómo se trocea
 *
 * Por capítulo, no por libro. Un resultado que solo dijera «está en este libro»
 * dejaría el trabajo a medias — habría que abrirlo y volver a buscar dentro.
 *
 * ## Lo que NO hace
 *
 * No guarda posiciones exactas (CFI). Calcularlas exigiría montar cada capítulo
 * en un iframe, que es justo el coste que este índice existe para evitar. El
 * resultado lleva libro y capítulo, y al abrirlo se busca la frase dentro, que
 * es rápido porque ya se sabe en qué capítulo mirar.
 */

/** Se sube al cambiar cómo se extrae el texto, para reindexar lo ya indexado. */
export const INDEXER_VERSION = 1;

/** Un capítulo enorme se parte: FTS5 devuelve el fragmento, no el capítulo. */
const MAX_CHAPTER_CHARS = 120_000;

/**
 * Texto legible de un documento XHTML de EPUB.
 *
 * Se quitan `script` y `style` porque su contenido es texto para el navegador,
 * no para el lector: sin quitarlos, buscar «color» encontraría la hoja de
 * estilos de medio catálogo.
 */
export const extractText = (html) => {
    if (!html) return '';

    return String(html)
        // Comentarios primero: pueden contener etiquetas a medias que
        // descuadrarían el resto de sustituciones.
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        // Los saltos de bloque se convierten en espacio para que la última
        // palabra de un párrafo no se pegue a la primera del siguiente.
        .replace(/<\/(p|div|h[1-6]|li|td|br|section|blockquote)>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/\s+/g, ' ')
        .trim();
};

/** Título del capítulo tal y como lo declara el índice, o su primer encabezado. */
export const chapterTitle = (html, fromToc = '') => {
    if (fromToc) return fromToc;
    const heading = String(html || '').match(/<h[1-3][^>]*>([\s\S]{0,200}?)<\/h[1-3]>/i);
    return heading ? extractText(heading[1]).slice(0, 120) : '';
};

/**
 * Prepara las filas que se van a indexar de un libro.
 *
 * Se descartan los capítulos casi vacíos —portadas, páginas de créditos, saltos
 * de sección—: aportan ruido a los resultados y ocupan índice.
 *
 * @param {Array<{href: string, html: string, label?: string}>} chapters
 */
export const buildIndexRows = (bookId, chapters = []) => {
    const rows = [];

    chapters.forEach((chapter) => {
        const body = extractText(chapter.html);
        if (body.length < 80) return;

        const title = chapterTitle(chapter.html, chapter.label);

        // Un capítulo muy largo se parte en trozos. FTS5 puntúa por documento,
        // así que un capítulo de 300 000 caracteres competiría mal contra uno
        // corto que mencione lo mismo una sola vez.
        for (let offset = 0; offset < body.length; offset += MAX_CHAPTER_CHARS) {
            rows.push({
                bookId,
                href: chapter.href || '',
                chapter: title,
                body: body.slice(offset, offset + MAX_CHAPTER_CHARS),
            });
        }
    });

    return rows;
};

/**
 * Traduce lo que escribe el usuario a una consulta FTS5.
 *
 * Hay que escaparlo: FTS5 tiene sintaxis propia y un texto con comillas, `*`,
 * `-`, `OR` o paréntesis provoca un error de sintaxis en vez de una búsqueda.
 * El usuario no ha escrito una consulta, ha escrito una frase.
 *
 * Se conservan dos cosas de esa sintaxis, porque la gente las espera:
 *
 *  - **Comillas** alrededor de todo: busca la frase exacta y en ese orden.
 *  - El resto: todas las palabras, en cualquier orden, con prefijo en la
 *    última. El prefijo importa porque se busca mientras se escribe, y sin él
 *    «filoso» no encontraría «filosofía» hasta escribirla entera.
 */
export const toFtsQuery = (input) => {
    const text = String(input || '').trim();
    if (text.length < 2) return '';

    const exact = text.startsWith('"') && text.endsWith('"') && text.length > 2;
    const words = (exact ? text.slice(1, -1) : text)
        // Se quita todo lo que FTS5 interpreta, incluidos los guiones: un
        // guion delante de una palabra significa «excluir».
        .replace(/["*()^:-]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);

    if (words.length === 0) return '';

    // Cada palabra entre comillas es un literal para FTS5: así una palabra que
    // se llame como un operador —«or», «not»— se busca en lugar de ejecutarse.
    const quoted = words.map((word) => `"${word}"`);

    if (exact) return quoted.join(' + ');

    // Prefijo solo en la última palabra: es la que se está escribiendo.
    return quoted
        .map((word, index) => (index === quoted.length - 1 ? `${word.slice(0, -1)}"*` : word))
        .join(' AND ');
};

/**
 * Recorta el fragmento devuelto para que quepa en una fila de resultados.
 *
 * FTS5 marca las coincidencias con `snippet()`. Aquí solo se normaliza el
 * espaciado y se recorta, conservando las marcas.
 */
export const cleanSnippet = (snippet, limit = 160) =>
    String(snippet || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, limit);
