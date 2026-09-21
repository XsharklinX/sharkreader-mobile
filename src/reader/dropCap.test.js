/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { traeCapitular, FACTOR, IMAGEN_MAX, MARCA } from './dropCap.js';

/** Monta un párrafo y un lector de estilos falso, que jsdom no calcula. */
const montar = (html, estilos = {}) => {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    const parrafo = doc.querySelector('p');
    const estiloDe = (el) => {
        if (el === parrafo) return { fontSize: '18px', float: 'none' };
        const clave = el.getAttribute('data-caso') || '';
        return estilos[clave] || { fontSize: '18px', float: 'none' };
    };
    return { parrafo, estiloDe };
};

describe('traeCapitular', () => {
    it('un párrafo normal no trae ninguna', () => {
        const { parrafo, estiloDe } = montar('<p>Era una tarde de octubre.</p>');
        expect(traeCapitular(parrafo, estiloDe)).toBe(false);
    });

    it('una inicial varias veces mayor que el texto sí', () => {
        // Es la forma habitual de componerla a mano.
        const { parrafo, estiloDe } = montar(
            '<p><span data-caso="cap">E</span>ra una tarde.</p>',
            { cap: { fontSize: '54px', float: 'none' } }
        );
        expect(traeCapitular(parrafo, estiloDe)).toBe(true);
    });

    it('una versalita no cuenta como capitular', () => {
        // Aquí está el riesgo de un umbral flojo: muchos libros empiezan el
        // capítulo con la primera palabra en versalitas, y apagar la capitular
        // por eso dejaría sin efecto la mitad de la biblioteca.
        const { parrafo, estiloDe } = montar(
            '<p><span data-caso="vers">ERA</span> una tarde.</p>',
            { vers: { fontSize: `${18 * (FACTOR - 0.4)}px`, float: 'none' } }
        );
        expect(traeCapitular(parrafo, estiloDe)).toBe(false);
    });

    it('algo flotando al principio es una capitular', () => {
        // Una capitular tiene que flotar para que el texto la rodee: si algo
        // flota justo ahí, ese es su papel.
        const { parrafo, estiloDe } = montar(
            '<p><span data-caso="f">E</span>ra una tarde.</p>',
            { f: { fontSize: '18px', float: 'left' } }
        );
        expect(traeCapitular(parrafo, estiloDe)).toBe(true);
    });

    it('una inicial dibujada, aunque sea imagen', () => {
        const { parrafo, estiloDe } = montar(`<p><img data-caso="i" width="${IMAGEN_MAX - 20}">ra una tarde.</p>`);
        expect(traeCapitular(parrafo, estiloDe)).toBe(true);
    });

    it('una ilustración de apertura no es una capitular', () => {
        // Una imagen grande al empezar el capítulo es una ilustración; poner
        // encima una letra de tres líneas es el desastre que esto evita.
        const { parrafo, estiloDe } = montar(`<p><img data-caso="i" width="${IMAGEN_MAX + 400}">Era una tarde.</p>`);
        expect(traeCapitular(parrafo, estiloDe)).toBe(false);
    });

    it('solo mira el principio del párrafo', () => {
        // Un destacado a mitad de párrafo no es una capitular, y buscarlo por
        // todo el texto apagaría el ajuste sin motivo.
        const { parrafo, estiloDe } = montar(
            '<p>Era <b>una</b> tarde <span data-caso="g">larga</span>.</p>',
            { g: { fontSize: '60px', float: 'none' } }
        );
        expect(traeCapitular(parrafo, estiloDe)).toBe(false);
    });

    it('sin párrafo o sin estilos no decide nada', () => {
        expect(traeCapitular(null, () => ({}))).toBe(false);
        const { parrafo } = montar('<p>x</p>');
        expect(traeCapitular(parrafo, null)).toBe(false);
    });

    it('sin tamaño base no adivina', () => {
        // Adivinar sería peor que no detectar: apagaría capitulares que sí
        // queremos poner.
        const doc = new DOMParser().parseFromString('<body><p><span>E</span>ra.</p></body>', 'text/html');
        expect(traeCapitular(doc.querySelector('p'), () => ({ fontSize: '', float: 'none' }))).toBe(false);
    });

    it('la marca es la que espera el CSS', () => {
        expect(MARCA).toBe('sr-ya-capitular');
    });
});
