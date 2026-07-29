/**
 * Copiar un fragmento con su cita.
 *
 * Copiar solo el texto seleccionado sirve para pegarlo en un chat. No sirve para
 * citarlo: en cuanto el fragmento sale del libro pierde de dónde venía, y
 * reconstruirlo después —abrir la app, buscar la frase, mirar el capítulo— es
 * justo lo que nadie hace. Así que la cita se compone en el momento de copiar.
 *
 * Hay tres formatos porque el mismo fragmento va a sitios distintos:
 *
 *   - `plain`    para pegarlo en cualquier parte sin que quede raro.
 *   - `markdown` para notas y editores que lo entienden.
 *   - `academic` para un trabajo, con el capítulo entre comillas.
 *
 * Nada de esto inventa datos: si el EPUB no declara autor, la cita se compone
 * sin autor en lugar de poner «Desconocido», que ensucia más de lo que informa.
 */

export const CITATION_FORMATS = {
    plain: { label: 'Texto', description: 'Cita entre comillas y la fuente debajo' },
    markdown: { label: 'Markdown', description: 'Bloque de cita, para notas' },
    academic: { label: 'Académico', description: 'Autor, título, capítulo y posición' },
};

/** Recorta y normaliza el fragmento; los saltos de línea sobran en una cita. */
const cleanQuote = (text) =>
    String(text || '').replace(/\s+/g, ' ').trim();

/** Une las partes que existan con un separador, ignorando las vacías. */
const join = (parts, separator) => parts.filter(Boolean).join(separator);

/**
 * @param {Object} source
 * @param {string} source.text      Fragmento seleccionado.
 * @param {string} [source.title]   Título del libro.
 * @param {string} [source.author]  Autor, si el EPUB lo declara.
 * @param {string} [source.chapter] Capítulo actual.
 * @param {number} [source.percent] Progreso 0–1, para situar la cita.
 * @param {keyof typeof CITATION_FORMATS} [format]
 */
export const formatCitation = (source, format = 'plain') => {
    const quote = cleanQuote(source?.text);
    if (!quote) return '';

    const title = (source?.title || '').trim();
    const author = (source?.author || '').trim();
    const chapter = (source?.chapter || '').trim();
    const percent = Number.isFinite(source?.percent)
        ? `${Math.round(source.percent * 100)} %`
        : '';

    if (format === 'markdown') {
        // El fragmento puede ocupar varias líneas al pegarlo; cada una necesita
        // su «>» o el bloque de cita se corta en la primera.
        const body = quote.split('\n').map((line) => `> ${line}`).join('\n');
        const attribution = join([
            title ? `**${title}**` : '',
            author,
            chapter,
            percent,
        ], ' · ');
        return attribution ? `${body}\n>\n> — ${attribution}` : body;
    }

    if (format === 'academic') {
        // Orden convencional: quién, dónde, qué parte. El capítulo va
        // entrecomillado y el título en cursiva, como en cualquier referencia.
        const reference = join([
            author,
            title ? `*${title}*` : '',
            chapter ? `«${chapter}»` : '',
            percent,
        ], ', ');
        return reference ? `«${quote}» (${reference})` : `«${quote}»`;
    }

    const attribution = join([title, author, chapter, percent], ' · ');
    return attribution ? `«${quote}»\n— ${attribution}` : `«${quote}»`;
};

/**
 * Vista previa corta para el selector de formato.
 *
 * Se recorta el fragmento a 40 caracteres: la vista previa está para comparar
 * la *forma* de las tres opciones, y con el fragmento entero no cabrían.
 */
export const citationPreview = (source, format) => {
    const shortened = cleanQuote(source?.text).slice(0, 40);
    return formatCitation(
        { ...source, text: shortened + (cleanQuote(source?.text).length > 40 ? '…' : '') },
        format
    );
};
