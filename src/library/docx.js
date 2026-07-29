/**
 * DOCX.
 *
 * Se convierte a EPUB en la importación, igual que TXT y Markdown, en lugar de
 * escribir un visor aparte. Así hereda gratis todo lo que ya tiene el lector:
 * paginación, temas, tipografía, subrayados, voz, progreso por CFI y posición
 * guardada. Un visor propio tendría que reimplementar las siete cosas.
 *
 * La conversión la hace **mammoth**, que no traduce el DOCX etiqueta a etiqueta
 * sino que interpreta sus estilos: un párrafo con estilo «Título 1» sale como
 * `<h1>`, no como un `<p>` en negrita de 24 puntos. Esa diferencia es lo que
 * permite después trocear el documento en capítulos de verdad y que el índice
 * del libro tenga sentido.
 *
 * **Las imágenes se descartan.** Mammoth las devuelve como data URI incrustados
 * en el HTML, y un documento con veinte fotos daría un EPUB de decenas de MB
 * con el texto perdido dentro. Un DOCX que se lee como libro es texto; si lleva
 * maquetación seria, lo que quiere el usuario es el PDF.
 */

/**
 * Estilos del documento a etiquetas HTML.
 *
 * Mammoth trae un mapeo por defecto razonable, pero se le añaden los nombres en
 * español: Word los localiza, y un documento escrito en un Word en español
 * declara «Título 1», no «Heading 1». Sin esto, el documento entero saldría
 * como una única tirada de párrafos sin capítulos.
 */
const STYLE_MAP = [
    "p[style-name='Título 1'] => h1:fresh",
    "p[style-name='Título 2'] => h2:fresh",
    "p[style-name='Título 3'] => h3:fresh",
    "p[style-name='Titulo 1'] => h1:fresh",
    "p[style-name='Titulo 2'] => h2:fresh",
    "p[style-name='Titulo 3'] => h3:fresh",
    "p[style-name='Heading 1'] => h1:fresh",
    "p[style-name='Heading 2'] => h2:fresh",
    "p[style-name='Heading 3'] => h3:fresh",
    "p[style-name='Cita'] => blockquote:fresh",
    "p[style-name='Quote'] => blockquote:fresh",
];

/**
 * Convierte un DOCX a HTML limpio.
 *
 * @param {Blob} blob
 * @returns {Promise<{html: string, warnings: string[]}>}
 */
export const docxToHtml = async (blob) => {
    // Carga diferida: mammoth pesa unos 200 KB y solo hace falta si el usuario
    // importa un DOCX, que no es el caso normal. Cargarlo siempre encarecería
    // el arranque de todos por una minoría.
    const mammoth = await import('mammoth/mammoth.browser.js');
    const convert = mammoth.default?.convertToHtml || mammoth.convertToHtml;

    const arrayBuffer = await blob.arrayBuffer();
    const result = await convert(
        { arrayBuffer },
        {
            styleMap: STYLE_MAP,
            // Devolver cadena vacía descarta la imagen sin abortar la
            // conversión. Ver arriba por qué no se conservan.
            convertImage: () => Promise.resolve({}),
        }
    );

    return {
        html: cleanHtml(result.value || ''),
        warnings: (result.messages || []).map((message) => message.message),
    };
};

/**
 * Quita del HTML lo que no aporta nada a la lectura.
 *
 * Word genera montones de párrafos vacíos —cada Intro suelto es uno— y con el
 * espaciado entre párrafos del lector se convierten en huecos enormes en mitad
 * de la página.
 */
export const cleanHtml = (html) => String(html || '')
    .replace(/<p>\s*(?:&nbsp;|\s)*<\/p>/gi, '')
    .replace(/<p><\/p>/gi, '')
    // Los anclajes vacíos de los marcadores de Word no se ven pero cuentan como
    // contenido al trocear en capítulos.
    .replace(/<a\b[^>]*>\s*<\/a>/gi, '')
    // Cada bloque en su línea: `splitIntoChapters` corta por saltos de línea.
    .replace(/></g, '>\n<')
    .trim();

/**
 * Título del documento, si se puede deducir de su primer encabezado.
 *
 * Un DOCX no tiene metadatos fiables —el «título» de las propiedades del
 * fichero suele estar vacío o traer el nombre de una plantilla—, así que se
 * mira el contenido y, si no hay encabezado, decide el nombre del fichero.
 */
export const titleFromHtml = (html) => {
    const heading = String(html || '').match(/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/i);
    if (!heading) return '';
    return heading[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
};
