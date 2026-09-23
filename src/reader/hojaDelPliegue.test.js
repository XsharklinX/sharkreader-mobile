/**
 * @vitest-environment jsdom
 *
 * La copia del capítulo con la que se dibuja el pliegue.
 *
 * Es la pieza que ha roto el lector dos veces —una por el peso del CSS y otra
 * por el de las imágenes— así que las dos cosas quedan aquí comprobadas.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    htmlSinImagenes, htmlDeLaPagina, serializeStyles, PIXEL, PRESUPUESTO_CSS,
} from './EpubEngine.js';

/** Un documento de capítulo, con lo que haga falta dentro. */
const capitulo = (cuerpo) => {
    const doc = new DOMParser().parseFromString(
        `<html><head></head><body>${cuerpo}</body></html>`,
        'text/html'
    );
    // jsdom no maqueta, así que las medidas se ponen a mano: es lo que el
    // navegador de verdad devolvería.
    doc.querySelectorAll('img, image, svg, video, canvas').forEach((nodo, i) => {
        nodo.getBoundingClientRect = () => ({ width: 300 + i, height: 200 + i });
    });
    return doc;
};

describe('htmlSinImagenes', () => {
    it('cambia cada imagen por un píxel transparente', () => {
        // **Esto es lo que rompía los libros ilustrados.** La copia se monta dos
        // veces, así que cada lámina se descodificaba tres veces en total, y en
        // un capítulo con varias a página completa la app se quedaba sin memoria.
        const doc = capitulo('<p>Antes</p><img src="blob:http://x/aaa"><p>Después</p>');
        const html = htmlSinImagenes(doc);

        expect(html).not.toContain('blob:');
        expect(html).toContain(PIXEL);
    });

    it('deja el hueco con el tamaño que tenía la imagen', () => {
        // Sin la medida, quitar la imagen colapsaría el hueco y el texto de la
        // copia caería en otro sitio que en la página: el pliegue enseñaría algo
        // que no es lo que hay debajo.
        const doc = capitulo('<img src="blob:http://x/aaa">');
        const html = htmlSinImagenes(doc);

        expect(html).toContain('width:300px');
        expect(html).toContain('height:200px');
    });

    it('se lleva también los SVG, los vídeos y los lienzos', () => {
        const doc = capitulo('<svg></svg><video src="blob:v"></video><canvas></canvas>');
        const html = htmlSinImagenes(doc);

        expect(html).not.toContain('<svg');
        expect(html).not.toContain('<video');
        expect(html).not.toContain('<canvas');
    });

    it('no toca el texto', () => {
        const doc = capitulo('<p>Diez años. Diez malditos años.</p><img src="blob:x">');
        expect(htmlSinImagenes(doc)).toContain('Diez malditos años');
    });

    it('un capítulo sin imágenes sale igual que entró', () => {
        const doc = capitulo('<p>Solo texto</p>');
        const html = htmlSinImagenes(doc);
        expect(html).toContain('Solo texto');
        expect(html).not.toContain(PIXEL);
    });

    it('una imagen sin medidas no rompe nada', () => {
        // Una imagen que aún no ha cargado no mide: se queda sin estilo en vez de
        // con `width:NaNpx`, que es lo que deja una copia rota.
        const doc = new DOMParser().parseFromString(
            '<html><body><img src="blob:x"></body></html>', 'text/html'
        );
        const html = htmlSinImagenes(doc);
        expect(html).not.toContain('NaN');
        expect(html).toContain(PIXEL);
    });

    it('el original no se toca', () => {
        // Se trabaja sobre un clon: tocar el documento vivo cambiaría la página
        // que el usuario está leyendo.
        const doc = capitulo('<img src="blob:http://x/aaa">');
        htmlSinImagenes(doc);
        expect(doc.querySelector('img').getAttribute('src')).toBe('blob:http://x/aaa');
    });
});

describe('serializeStyles', () => {
    /** Monta hojas de estilo falsas sobre un documento. */
    const conHojas = (hojas) => ({
        styleSheets: hojas.map(({ id, texto }) => ({
            ownerNode: id ? { id } : {},
            cssRules: [{ cssText: texto }],
        })),
    });

    beforeEach(() => {});

    it('nuestras reglas van siempre, cueste lo que cueste', () => {
        // Son las que llevan el tema y la tipografía elegidos. Sin ellas la copia
        // se ve con la letra del libro y no con la del usuario.
        const doc = conHojas([
            { id: 'epubjs-inserted-css-1', texto: 'body{font-family:Literata}' },
            { texto: 'x'.repeat(PRESUPUESTO_CSS * 3) },
        ]);
        const css = serializeStyles(doc);
        expect(css).toContain('Literata');
    });

    it('la hoja gigante del libro se queda fuera', () => {
        // **Esto congelaba el lector.** Copiar todas las hojas daba 583 KB de CSS
        // por copia, con dos copias vivas mientras se leía.
        const doc = conHojas([{ texto: 'a'.repeat(PRESUPUESTO_CSS * 2) }]);
        expect(serializeStyles(doc).length).toBeLessThanOrEqual(PRESUPUESTO_CSS);
    });

    it('entran antes las pequeñas, que son las útiles', () => {
        // Las hojas cortas de un EPUB suelen llevar las cursivas y las
        // versalitas; la gorda es el armazón de la editorial.
        const doc = conHojas([
            { texto: 'b'.repeat(PRESUPUESTO_CSS - 100) },
            { texto: 'i{font-style:italic}' },
        ]);
        expect(serializeStyles(doc)).toContain('italic');
    });

    it('una hoja de otro origen no es un error', () => {
        const doc = {
            styleSheets: [{
                ownerNode: {},
                get cssRules() { throw new Error('cross-origin'); },
            }],
        };
        expect(() => serializeStyles(doc)).not.toThrow();
    });

    it('sin hojas devuelve cadena vacía', () => {
        expect(serializeStyles({ styleSheets: [] })).toBe('');
    });
});

describe('htmlDeLaPagina', () => {
    /** Un rendition falso que publica dónde empieza y acaba lo que se ve. */
    const conRango = (inicio, fin) => ({
        currentLocation: () => ({ start: { cfi: inicio }, end: { cfi: fin } }),
    });

    it('sin posición no recorta: se cae a copiar el capítulo', () => {
        // Devolver null es la señal para usar la red. Inventar un rango sería
        // peor: el pliegue enseñaría algo que no es la página de debajo.
        const doc = capitulo('<p>Texto</p>');
        expect(htmlDeLaPagina({ currentLocation: () => null }, doc)).toBeNull();
        expect(htmlDeLaPagina(conRango(null, null), doc)).toBeNull();
        expect(htmlDeLaPagina(undefined, doc)).toBeNull();
    });

    it('un CFI que no resuelve tampoco revienta', () => {
        // Un capítulo con estructura rara, un CFI de otra sección: se copia el
        // capítulo entero, que es más caro pero siempre funciona.
        const doc = capitulo('<p>Texto</p>');
        expect(htmlDeLaPagina(conRango('epubcfi(/6/4!/inventado)', 'epubcfi(/6/4!/otro)'), doc)).toBeNull();
    });
});
