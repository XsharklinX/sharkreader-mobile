import { describe, it, expect } from 'vitest';
import {
    extractText, chapterTitle, buildIndexRows, toFtsQuery, cleanSnippet,
} from './contentIndex.js';

describe('extractText', () => {
    it('quita etiquetas y deja el texto', () => {
        expect(extractText('<p>Hola <em>mundo</em></p>')).toBe('Hola mundo');
    });

    it('no pega la última palabra de un párrafo con la primera del siguiente', () => {
        // Sin convertir los cierres de bloque en espacio saldría «unodos», que
        // además haría que ninguna de las dos palabras se pudiera buscar.
        expect(extractText('<p>uno</p><p>dos</p>')).toBe('uno dos');
    });

    it('descarta el contenido de script y style', () => {
        // Sin esto, buscar «color» encontraría la hoja de estilos de medio
        // catálogo.
        const html = '<style>p{color:red}</style><p>texto</p><script>var x=1</script>';
        expect(extractText(html)).toBe('texto');
    });

    it('quita los comentarios antes que las etiquetas', () => {
        // Un comentario puede contener etiquetas a medias que descuadrarían el
        // resto de sustituciones.
        expect(extractText('<!-- <p>oculto --><p>visible</p>')).toBe('visible');
    });

    it('traduce las entidades más comunes', () => {
        expect(extractText('<p>Hola&nbsp;t&uacute; &amp; yo</p>')).toContain('&');
        expect(extractText('<p>&#65;&#66;</p>')).toBe('AB');
    });

    it('aguanta entradas vacías', () => {
        expect(extractText('')).toBe('');
        expect(extractText(null)).toBe('');
    });
});

describe('chapterTitle', () => {
    it('prefiere el título del índice', () => {
        expect(chapterTitle('<h1>Otro</h1>', 'Capítulo I')).toBe('Capítulo I');
    });

    it('cae al primer encabezado si el índice no lo trae', () => {
        expect(chapterTitle('<h2>El jardín</h2><p>…</p>')).toBe('El jardín');
    });

    it('devuelve vacío si no hay ni una cosa ni la otra', () => {
        expect(chapterTitle('<p>solo texto</p>')).toBe('');
    });
});

describe('buildIndexRows', () => {
    const long = (word) => `<p>${`${word} `.repeat(40)}</p>`;

    it('genera una fila por capítulo', () => {
        const rows = buildIndexRows('b1', [
            { href: 'c1.xhtml', html: long('alfa'), label: 'Uno' },
            { href: 'c2.xhtml', html: long('beta'), label: 'Dos' },
        ]);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({ bookId: 'b1', href: 'c1.xhtml', chapter: 'Uno' });
    });

    it('descarta los capítulos casi vacíos', () => {
        // Portadas, créditos y saltos de sección solo aportan ruido.
        const rows = buildIndexRows('b1', [
            { href: 'cover.xhtml', html: '<p>Portada</p>' },
            { href: 'c1.xhtml', html: long('alfa') },
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0].href).toBe('c1.xhtml');
    });

    it('parte los capítulos enormes', () => {
        // FTS5 puntúa por documento: un capítulo de 300 000 caracteres
        // competiría mal contra uno corto que mencione lo mismo una vez.
        const huge = `<p>${'palabra '.repeat(40_000)}</p>`;
        const rows = buildIndexRows('b1', [{ href: 'c.xhtml', html: huge }]);
        expect(rows.length).toBeGreaterThan(1);
        expect(rows.every((row) => row.href === 'c.xhtml')).toBe(true);
    });

    it('no se rompe sin capítulos', () => {
        expect(buildIndexRows('b1')).toEqual([]);
    });
});

describe('toFtsQuery', () => {
    it('exige al menos dos letras', () => {
        expect(toFtsQuery('a')).toBe('');
        expect(toFtsQuery('  ')).toBe('');
    });

    it('busca todas las palabras, con prefijo en la última', () => {
        // El prefijo importa porque se busca mientras se escribe: sin él,
        // «filoso» no encontraría «filosofía» hasta escribirla entera.
        expect(toFtsQuery('jardin senderos')).toBe('"jardin" AND "senderos"*');
    });

    it('las comillas alrededor de todo buscan la frase exacta', () => {
        expect(toFtsQuery('"el jardin"')).toBe('"el" + "jardin"');
    });

    it('escapa la sintaxis de FTS5 en vez de romperse', () => {
        // El usuario no ha escrito una consulta, ha escrito una frase. Sin
        // escapar, esto sería un error de sintaxis en lugar de una búsqueda.
        const query = toFtsQuery('el (mundo) * como -voluntad');
        expect(query).not.toContain('(');
        expect(query).not.toContain('*(');
        expect(query).toContain('"mundo"');
        expect(query).toContain('"voluntad"');
    });

    it('trata los operadores como palabras si el usuario los escribe', () => {
        // Alguien buscando «or» quiere la palabra, no el operador booleano.
        expect(toFtsQuery('or not')).toBe('"or" AND "not"*');
    });

    it('devuelve vacío si solo había signos', () => {
        expect(toFtsQuery('*** ()')).toBe('');
    });
});

describe('cleanSnippet', () => {
    it('normaliza el espaciado y recorta', () => {
        expect(cleanSnippet('  uno   dos  ')).toBe('uno dos');
        expect(cleanSnippet('x'.repeat(300)).length).toBe(160);
    });

    it('conserva las marcas de coincidencia', () => {
        expect(cleanSnippet('un «hallazgo» aquí')).toContain('«hallazgo»');
    });
});
