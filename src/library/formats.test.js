import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { textToEpub, bookTypeOf, extensionOf, SUPPORTED_EXTENSIONS } from './formats.js';

const readZip = async (blob) => JSZip.loadAsync(await blob.arrayBuffer());

describe('reconocimiento de formato', () => {
    it('deduce el tipo interno a partir de la extensión', () => {
        expect(bookTypeOf('libro.epub')).toBe('epub');
        expect(bookTypeOf('manual.PDF')).toBe('pdf');
        expect(bookTypeOf('tomo.cbz')).toBe('comic');
    });

    it('el texto plano acaba siendo un EPUB, porque se convierte al importar', () => {
        expect(bookTypeOf('notas.txt')).toBe('epub');
        expect(bookTypeOf('apuntes.md')).toBe('epub');
    });

    it('extensionOf tolera nombres raros', () => {
        expect(extensionOf('sin-extension')).toBe('sin-extension');
        expect(extensionOf('')).toBe('');
        expect(extensionOf('a.b.c.epub')).toBe('epub');
    });

    it('declara los formatos que la app acepta', () => {
        expect(SUPPORTED_EXTENSIONS).toContain('epub');
        expect(SUPPORTED_EXTENSIONS).toContain('cbz');
        // CBR queda fuera a propósito: es RAR y no compensa la librería.
        expect(SUPPORTED_EXTENSIONS).not.toContain('cbr');
    });
});

describe('conversión de texto a EPUB', () => {
    it('produce un EPUB con la estructura mínima obligatoria', async () => {
        const blob = await textToEpub('Hola mundo.', { title: 'Prueba' });
        const zip = await readZip(blob);

        expect(zip.file('mimetype')).toBeTruthy();
        expect(zip.file('META-INF/container.xml')).toBeTruthy();
        expect(zip.file('OEBPS/content.opf')).toBeTruthy();
        expect(zip.file('OEBPS/nav.xhtml')).toBeTruthy();
    });

    it('el mimetype es exactamente el que exige la especificación', async () => {
        const zip = await readZip(await textToEpub('x', { title: 'T' }));
        expect(await zip.file('mimetype').async('string')).toBe('application/epub+zip');
    });

    it('lleva el título y el autor a la metadata', async () => {
        const zip = await readZip(await textToEpub('x', { title: 'Mi libro', author: 'Alguien' }));
        const opf = await zip.file('OEBPS/content.opf').async('string');
        expect(opf).toContain('<dc:title>Mi libro</dc:title>');
        expect(opf).toContain('<dc:creator>Alguien</dc:creator>');
    });

    it('escapa los caracteres que romperían el XML', async () => {
        const zip = await readZip(await textToEpub('x', { title: 'Yo & <tú>' }));
        const opf = await zip.file('OEBPS/content.opf').async('string');
        expect(opf).toContain('Yo &amp; &lt;tú&gt;');
        expect(opf).not.toContain('<tú>');
    });

    it('une los saltos de línea duros dentro de un párrafo', async () => {
        // Un TXT cortado a 70 columnas debe re-ajustarse al ancho de la pantalla,
        // no salir partido a mitad de frase.
        const text = 'Esta frase estaba\ncortada en dos líneas.\n\nY esto es otro párrafo.';
        const zip = await readZip(await textToEpub(text, { title: 'T' }));
        const chapter = await zip.file('OEBPS/ch1.xhtml').async('string');

        expect(chapter).toContain('<p>Esta frase estaba cortada en dos líneas.</p>');
        expect(chapter).toContain('<p>Y esto es otro párrafo.</p>');
    });

    it('convierte los encabezados de Markdown', async () => {
        const zip = await readZip(await textToEpub('# Capítulo\n\nTexto.', { title: 'T', markdown: true }));
        const chapter = await zip.file('OEBPS/ch1.xhtml').async('string');
        expect(chapter).toContain('<h1>Capítulo</h1>');
    });

    it('convierte énfasis, citas y listas de Markdown', async () => {
        const source = '**fuerte** y *suave*\n\n> una cita\n\n- uno\n- dos';
        const zip = await readZip(await textToEpub(source, { title: 'T', markdown: true }));
        const chapter = await zip.file('OEBPS/ch1.xhtml').async('string');

        expect(chapter).toContain('<strong>fuerte</strong>');
        expect(chapter).toContain('<em>suave</em>');
        expect(chapter).toContain('<blockquote><p>una cita</p></blockquote>');
        expect(chapter).toContain('<li>uno</li>');
    });

    it('parte en capítulos por encabezado, para no montar un documento gigante', async () => {
        const source = '# Uno\n\nTexto A.\n\n# Dos\n\nTexto B.\n\n# Tres\n\nTexto C.';
        const zip = await readZip(await textToEpub(source, { title: 'T', markdown: true }));

        expect(zip.file('OEBPS/ch1.xhtml')).toBeTruthy();
        expect(zip.file('OEBPS/ch2.xhtml')).toBeTruthy();
        expect(zip.file('OEBPS/ch3.xhtml')).toBeTruthy();

        const opf = await zip.file('OEBPS/content.opf').async('string');
        expect(opf).toContain('<itemref idref="ch3"/>');
    });

    it('un texto vacío produce un EPUB válido en vez de romper', async () => {
        const zip = await readZip(await textToEpub('', { title: 'Vacío' }));
        expect(zip.file('OEBPS/ch1.xhtml')).toBeTruthy();
    });

    it('el HTML del texto plano va escapado', async () => {
        const zip = await readZip(await textToEpub('<script>alert(1)</script>', { title: 'T' }));
        const chapter = await zip.file('OEBPS/ch1.xhtml').async('string');
        expect(chapter).not.toContain('<script>');
        expect(chapter).toContain('&lt;script&gt;');
    });
});
