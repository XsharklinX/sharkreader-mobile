/**
 * @vitest-environment jsdom
 *
 * El parser de OPDS usa `DOMParser`, que en el WebView está siempre y en Node
 * no existe. Es el único módulo del proyecto que depende del DOM a propósito:
 * añadir un parser de XML al bundle serían cientos de KB para todos por una
 * función que usará una minoría.
 */
import { describe, it, expect } from 'vitest';
import {
    parseOpdsFeed, parseOpds2Feed, normalizeCatalogUrl, resolveUrl,
    basicAuthHeader, stripTags,
} from './opds.js';
import { fileNameFor } from './useCatalog.js';

const BASE = 'http://192.168.1.40:8080/opds';

const feed = (entries) => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Mi Calibre</title>
  <link rel="next" href="/opds?page=2" type="application/atom+xml"/>
  ${entries}
</feed>`;

describe('parseOpdsFeed', () => {
    it('lee un libro con su descarga y su portada', () => {
        const result = parseOpdsFeed(feed(`
            <entry>
              <title>Ficciones</title>
              <author><name>Jorge Luis Borges</name></author>
              <summary>Cuentos.</summary>
              <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="/get/epub/12"/>
              <link rel="http://opds-spec.org/image" type="image/jpeg" href="/get/cover/12"/>
            </entry>`), BASE);

        expect(result.title).toBe('Mi Calibre');
        expect(result.entries).toHaveLength(1);
        expect(result.entries[0]).toMatchObject({
            title: 'Ficciones',
            author: 'Jorge Luis Borges',
            kind: 'book',
        });
        expect(result.entries[0].downloads[0].url).toBe('http://192.168.1.40:8080/get/epub/12');
        expect(result.entries[0].cover).toBe('http://192.168.1.40:8080/get/cover/12');
    });

    it('resuelve las rutas relativas contra la del catálogo', () => {
        // Calibre las da relativas casi siempre: sin resolverlas, la mitad de
        // las descargas apuntarían a ninguna parte.
        const result = parseOpdsFeed(feed(`
            <entry>
              <title>X</title>
              <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="get/epub/9"/>
            </entry>`), BASE);
        expect(result.entries[0].downloads[0].url).toMatch(/^http:\/\/192\.168\.1\.40:8080\//);
    });

    it('distingue una carpeta de un libro', () => {
        const result = parseOpdsFeed(feed(`
            <entry>
              <title>Por autor</title>
              <link type="application/atom+xml;profile=opds-catalog" href="/opds/authors"/>
            </entry>`), BASE);
        expect(result.entries[0].kind).toBe('folder');
        expect(result.entries[0].navigate).toBe('http://192.168.1.40:8080/opds/authors');
    });

    it('prefiere EPUB sobre PDF cuando hay los dos', () => {
        // El EPUB es reflowable y se lee mejor en un móvil.
        const result = parseOpdsFeed(feed(`
            <entry>
              <title>X</title>
              <link rel="http://opds-spec.org/acquisition" type="application/pdf" href="/a.pdf"/>
              <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="/a.epub"/>
            </entry>`), BASE);
        expect(result.entries[0].downloads[0].type).toBe('application/epub+zip');
    });

    it('prefiere la portada a la miniatura', () => {
        const result = parseOpdsFeed(feed(`
            <entry>
              <title>X</title>
              <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="/a.epub"/>
              <link rel="http://opds-spec.org/image/thumbnail" href="/thumb.jpg"/>
              <link rel="http://opds-spec.org/image" href="/cover.jpg"/>
            </entry>`), BASE);
        expect(result.entries[0].cover).toContain('cover.jpg');
    });

    it('descarta entradas que no son ni libro ni carpeta', () => {
        const result = parseOpdsFeed(feed(`
            <entry><title>Ruido</title></entry>`), BASE);
        expect(result.entries).toHaveLength(0);
    });

    it('descarta formatos que no sabemos abrir', () => {
        const result = parseOpdsFeed(feed(`
            <entry>
              <title>X</title>
              <link rel="http://opds-spec.org/acquisition" type="application/x-mobipocket-ebook" href="/a.mobi"/>
            </entry>`), BASE);
        expect(result.entries).toHaveLength(0);
    });

    it('lee el enlace a la página siguiente', () => {
        // Sin paginación solo se vería la primera página de una biblioteca de
        // miles de títulos.
        expect(parseOpdsFeed(feed(''), BASE).nextPage)
            .toBe('http://192.168.1.40:8080/opds?page=2');
    });

    it('avisa si el servidor no devolvió XML', () => {
        // DOMParser no lanza con entrada inválida: sin comprobarlo, una página
        // de error HTML daría un catálogo vacío en lugar de un mensaje.
        expect(() => parseOpdsFeed('<html><body>404</body></html>', BASE)).toThrow();
    });

    it('avisa si el XML es válido pero no es OPDS', () => {
        expect(() => parseOpdsFeed('<rss><channel/></rss>', BASE)).toThrow(/OPDS/);
    });
});

describe('parseOpds2Feed', () => {
    it('normaliza el JSON a la misma forma que el Atom', () => {
        const result = parseOpds2Feed({
            metadata: { title: 'Catálogo' },
            publications: [{
                metadata: { title: 'Ficciones', author: { name: 'Borges' } },
                links: [{ href: '/a.epub', type: 'application/epub+zip' }],
                images: [{ href: '/c.jpg' }],
            }],
            navigation: [{ href: '/autores', title: 'Autores' }],
        }, BASE);

        expect(result.entries[0]).toMatchObject({ title: 'Ficciones', kind: 'book', author: 'Borges' });
        expect(result.entries[1].kind).toBe('folder');
    });
});

describe('normalizeCatalogUrl', () => {
    it('añade el protocolo que nadie escribe', () => {
        expect(normalizeCatalogUrl('192.168.1.40:8080/opds'))
            .toBe('http://192.168.1.40:8080/opds');
    });

    it('asume /opds si dan solo la raíz', () => {
        // Casi nadie sabe que el catálogo de Calibre cuelga de /opds: se copia
        // la dirección del navegador, que es la raíz.
        expect(normalizeCatalogUrl('http://192.168.1.40:8080'))
            .toBe('http://192.168.1.40:8080/opds');
    });

    it('respeta una ruta explícita', () => {
        expect(normalizeCatalogUrl('https://ejemplo.com/catalogo/root.xml'))
            .toBe('https://ejemplo.com/catalogo/root.xml');
    });

    it('devuelve vacío si no hay nada que interpretar', () => {
        expect(normalizeCatalogUrl('')).toBe('');
        expect(normalizeCatalogUrl('   ')).toBe('');
    });
});

describe('utilidades', () => {
    it('resolveUrl aguanta una entrada inservible', () => {
        expect(resolveUrl('', BASE)).toBe('');
    });

    it('basicAuthHeader se calla si no hay usuario', () => {
        expect(basicAuthHeader('')).toEqual({});
        expect(basicAuthHeader('ana', 'x').Authorization).toMatch(/^Basic /);
    });

    it('stripTags quita el HTML que traen los resúmenes', () => {
        expect(stripTags('<p>Un <b>cuento</b></p>')).toBe('Un cuento');
    });
});

describe('fileNameFor', () => {
    it('usa el título y la extensión del formato', () => {
        expect(fileNameFor({ title: 'Ficciones' }, 'application/epub+zip')).toBe('Ficciones.epub');
        expect(fileNameFor({ title: 'Manual' }, 'application/pdf')).toBe('Manual.pdf');
    });

    it('quita lo que rompería un nombre de fichero', () => {
        // Una barra crearía una carpeta sin querer; los dos puntos y las
        // comillas fallan al escribir.
        expect(fileNameFor({ title: 'A/B: "C"' }, 'application/epub+zip'))
            .toBe('A-B- -C-.epub');
    });

    it('cae a epub si el tipo no dice nada', () => {
        expect(fileNameFor({ title: 'X' }, '')).toBe('X.epub');
    });
});
