/**
 * Genera un EPUB de prueba para verificar el lector en un dispositivo real.
 *
 * No es un libro de adorno: hace falta que tenga **varios capítulos y texto de
 * sobra** para que epub.js tenga que paginar de verdad. Con un capítulo de tres
 * párrafos no se puede comprobar nada de lo que importa —pasar página, el mapa de
 * posiciones, el porcentaje, el doblado de hoja— porque todo cabe en una página.
 *
 *   node scripts/make-test-epub.mjs
 *
 * Deja `test-book.epub` en la raíz del proyecto.
 */

import JSZip from 'jszip';
import { writeFile } from 'node:fs/promises';

const CHAPTERS = 8;
const PARAGRAPHS_PER_CHAPTER = 22;

/**
 * Párrafos con longitudes desiguales y puntuación variada.
 *
 * Un texto repetido palabra por palabra no serviría: hay que poder ver si la
 * partición de palabras, el justificado y las pausas de la voz se comportan, y
 * eso depende de que haya frases largas, cortas, comas, diálogo y palabras que
 * no quepan en una línea.
 */
const SEEDS = [
    'La biblioteca es ilimitada e interminable, y si un eterno viajero la atravesara en cualquier dirección comprobaría al cabo de los siglos que los mismos volúmenes se repiten en el mismo desorden.',
    'Mi soledad se alegra con esa elegante esperanza.',
    '—No pienso ir —dijo, y cerró la puerta sin volverse.',
    'De esas premisas incontrovertibles dedujo que la biblioteca es total: sus anaqueles registran todas las posibles combinaciones de los veintitantos símbolos ortográficos, es decir, todo lo que es dado expresar en todos los idiomas.',
    'Todo: la historia minuciosa del porvenir, las autobiografías de los arcángeles, el catálogo fiel de la biblioteca, miles y miles de catálogos falsos.',
    'Hablar es incurrir en tautologías; y la certidumbre de que todo está escrito nos anula o nos afantasma.',
    'Cuando se proclamó que la biblioteca abarcaba todos los libros, la primera impresión fue de extravagante felicidad.',
    'No había problema personal o mundial cuya elocuente solución no existiera: en algún hexágono. El universo estaba justificado.',
    'Esperanza que fue sucedida, como es natural, por una depresión excesiva; incomprensiblemente excesiva, según algunos.',
    'Yo afirmo que la biblioteca es interminable, y los idealistas arguyen que las salas hexagonales son una forma necesaria del espacio absoluto.',
];

const escape = (text) => text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const chapterHtml = (index) => {
    const paragraphs = Array.from({ length: PARAGRAPHS_PER_CHAPTER }, (_, i) =>
        `    <p>${escape(SEEDS[(index * 3 + i) % SEEDS.length])}</p>`
    ).join('\n');

    return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="es" lang="es">
<head><title>Capítulo ${index + 1}</title></head>
<body>
    <h1>Capítulo ${index + 1}</h1>
${paragraphs}
</body>
</html>`;
};

const zip = new JSZip();

// El mimetype va primero y sin comprimir: lo exige la especificación.
zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

zip.folder('META-INF').file('container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

const oebps = zip.folder('OEBPS');

for (let index = 0; index < CHAPTERS; index += 1) {
    oebps.file(`ch${index + 1}.xhtml`, chapterHtml(index));
}

const manifest = Array.from({ length: CHAPTERS }, (_, i) =>
    `    <item id="ch${i + 1}" href="ch${i + 1}.xhtml" media-type="application/xhtml+xml"/>`
).join('\n');

const spine = Array.from({ length: CHAPTERS }, (_, i) =>
    `    <itemref idref="ch${i + 1}"/>`
).join('\n');

oebps.file('content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">sharkreader-test-book</dc:identifier>
    <dc:title>Libro de prueba</dc:title>
    <dc:creator>SharkReader</dc:creator>
    <dc:language>es</dc:language>
  </metadata>
  <manifest>
${manifest}
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  </manifest>
  <spine>
${spine}
  </spine>
</package>`);

oebps.file('nav.xhtml', `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="es">
<head><title>Índice</title></head>
<body>
  <nav epub:type="toc"><ol>
${Array.from({ length: CHAPTERS }, (_, i) => `    <li><a href="ch${i + 1}.xhtml">Capítulo ${i + 1}</a></li>`).join('\n')}
  </ol></nav>
</body>
</html>`);

const buffer = await zip.generateAsync({ type: 'nodebuffer' });
await writeFile('test-book.epub', buffer);

const words = CHAPTERS * PARAGRAPHS_PER_CHAPTER * 25;
console.log(`test-book.epub — ${CHAPTERS} capítulos, ~${words} palabras, ${(buffer.length / 1024).toFixed(0)} KB`);
