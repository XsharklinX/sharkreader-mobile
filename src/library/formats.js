import JSZip from 'jszip';

/**
 * Formatos que no son EPUB ni PDF.
 *
 * La estrategia para el texto plano es convertirlo a un EPUB mínimo en el
 * momento de importar, en lugar de escribir un lector aparte. Así TXT y
 * Markdown heredan gratis todo lo que ya tiene el lector: paginación, temas,
 * tipografía, subrayados, voz, progreso por CFI y posición guardada.
 *
 * Los cómics sí necesitan visor propio: son imágenes, no texto reflowable.
 */

export const SUPPORTED_EXTENSIONS = ['epub', 'pdf', 'txt', 'md', 'markdown', 'cbz', 'docx'];

export const extensionOf = (name = '') =>
    String(name).toLowerCase().split('.').pop() || '';

/** Tipo interno con el que se guarda el libro. */
export const bookTypeOf = (name = '') => {
    const ext = extensionOf(name);
    if (ext === 'pdf') return 'pdf';
    if (ext === 'cbz') return 'comic';
    // TXT, Markdown y DOCX se convierten a EPUB en la importación, así que a
    // partir de ese momento son un EPUB más para el resto de la app.
    return 'epub';
};

const escapeHtml = (text) => text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/**
 * Markdown mínimo a HTML.
 *
 * A propósito no se usa una librería: para un fichero que se va a leer como
 * libro basta con encabezados, énfasis, citas y listas. Añadir un parser
 * completo costaría más peso de bundle que valor.
 */
const markdownToHtml = (text) => {
    const lines = text.split(/\r?\n/);
    const output = [];
    let inList = false;
    let inCode = false;

    const closeList = () => {
        if (inList) { output.push('</ul>'); inList = false; }
    };

    for (const line of lines) {
        if (line.trim().startsWith('```')) {
            closeList();
            output.push(inCode ? '</pre>' : '<pre>');
            inCode = !inCode;
            continue;
        }
        if (inCode) { output.push(escapeHtml(line)); continue; }

        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
            closeList();
            const level = heading[1].length;
            output.push(`<h${level}>${inline(heading[2])}</h${level}>`);
            continue;
        }

        const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
        if (bullet) {
            if (!inList) { output.push('<ul>'); inList = true; }
            output.push(`<li>${inline(bullet[1])}</li>`);
            continue;
        }

        closeList();

        if (line.trim().startsWith('>')) {
            output.push(`<blockquote><p>${inline(line.replace(/^\s*>\s?/, ''))}</p></blockquote>`);
            continue;
        }
        if (!line.trim()) continue;

        output.push(`<p>${inline(line)}</p>`);
    }

    closeList();
    if (inCode) output.push('</pre>');
    return output.join('\n');
};

const inline = (text) => escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

/**
 * Texto plano a HTML: cada bloque separado por línea en blanco es un párrafo.
 *
 * Muchos TXT vienen con saltos de línea duros a 70–80 columnas. Unir esas
 * líneas dentro de cada párrafo es lo que permite que el texto se re-ajuste al
 * ancho de la pantalla en lugar de salir cortado a mitad de frase.
 */
const plainTextToHtml = (text) => text
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.replace(/\r?\n/g, ' ').trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block)}</p>`)
    .join('\n');

/** Corta el HTML en capítulos para que epub.js no monte un único documento gigante. */
const splitIntoChapters = (html, maxChars = 40_000) => {
    const blocks = html.split('\n');
    const chapters = [];
    let current = [];
    let size = 0;

    for (const block of blocks) {
        // Un encabezado de nivel 1 o 2 empieza capítulo nuevo si ya hay contenido.
        const isHeading = /^<h[12]>/.test(block);
        if ((isHeading && size > 0) || size > maxChars) {
            chapters.push(current.join('\n'));
            current = [];
            size = 0;
        }
        current.push(block);
        size += block.length;
    }

    if (current.length) chapters.push(current.join('\n'));
    return chapters.length ? chapters : ['<p></p>'];
};

const xmlEscape = (text) => String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/**
 * Construye un EPUB 3 válido en memoria a partir de texto.
 *
 * @param {string} text
 * @param {{title: string, author?: string, markdown?: boolean}} meta
 * @returns {Promise<Blob>}
 */
export const textToEpub = async (text, { title, author = '', markdown = false, html: preHtml } = {}) => {
    // `html` permite entrar con el documento ya convertido —es lo que hace
    // DOCX, que llega como HTML de mammoth— reutilizando todo el resto:
    // troceado en capítulos, OPF, índice y empaquetado.
    const html = preHtml ?? (markdown ? markdownToHtml(text) : plainTextToHtml(text));
    const chapters = splitIntoChapters(html);
    const zip = new JSZip();

    // El mimetype tiene que ir primero y sin comprimir: es lo que exige la
    // especificación de EPUB para poder identificar el fichero.
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

    zip.folder('META-INF').file('container.xml',
        `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

    const oebps = zip.folder('OEBPS');

    chapters.forEach((chapter, index) => {
        oebps.file(`ch${index + 1}.xhtml`,
            `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="es">
<head><meta charset="utf-8"/><title>${xmlEscape(title)}</title></head>
<body>${chapter}</body>
</html>`);
    });

    const manifest = chapters
        .map((_, index) => `<item id="ch${index + 1}" href="ch${index + 1}.xhtml" media-type="application/xhtml+xml"/>`)
        .join('\n    ');
    const spine = chapters
        .map((_, index) => `<itemref idref="ch${index + 1}"/>`)
        .join('\n    ');

    oebps.file('content.opf',
        `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">sharkreader-${Date.now()}</dc:identifier>
    <dc:title>${xmlEscape(title)}</dc:title>
    <dc:creator>${xmlEscape(author)}</dc:creator>
    <dc:language>es</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${manifest}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>`);

    oebps.file('nav.xhtml',
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><meta charset="utf-8"/><title>Índice</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <ol>
      ${chapters.map((_, index) => `<li><a href="ch${index + 1}.xhtml">Parte ${index + 1}</a></li>`).join('\n      ')}
    </ol>
  </nav>
</body>
</html>`);

    return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
};

/**
 * Páginas de un cómic CBZ.
 *
 * Un CBZ es un ZIP de imágenes: se listan ordenadas por nombre, que es el
 * convenio universal en este formato. **CBR queda fuera**: es RAR, y descomprimir
 * RAR en el navegador exige arrastrar una librería pesada para un formato que
 * está en retirada.
 *
 * @returns {Promise<string[]>} nombres de las entradas, en orden de lectura
 */
export const listComicPages = async (blob) => {
    const zip = await JSZip.loadAsync(blob);
    return Object.keys(zip.files)
        .filter((name) => !zip.files[name].dir && /\.(jpe?g|png|webp|gif|avif)$/i.test(name))
        // Orden natural: "page2" antes que "page10", que es lo que un orden
        // alfabético simple se equivocaría en hacer.
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
};

/** Data URL de una página concreta del cómic. */
export const readComicPage = async (blob, entryName) => {
    const zip = await JSZip.loadAsync(blob);
    const file = zip.file(entryName);
    if (!file) return null;
    const base64 = await file.async('base64');
    const ext = extensionOf(entryName);
    const mime = ext === 'png' ? 'image/png'
        : ext === 'webp' ? 'image/webp'
        : ext === 'gif' ? 'image/gif'
        : ext === 'avif' ? 'image/avif'
        : 'image/jpeg';
    return `data:${mime};base64,${base64}`;
};
