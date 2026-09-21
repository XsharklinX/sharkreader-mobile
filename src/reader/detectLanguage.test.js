import { describe, it, expect } from 'vitest';
import { detectLanguage, normalizeLang, resolveHyphenLang } from './detectLanguage.js';

/**
 * El idioma decide si se parten las palabras, y partir las palabras es lo que
 * hace que el justificado no abra ríos. Un fallo aquí no rompe nada visible: solo
 * deja la página fea, que es justo el tipo de cosa que nadie caza mirando.
 */

const ES = `El libro apareció en Gran Bretaña con el título original, tomado del primer
verso de una canción infantil del estilo de nuestro Cinco lobitos tiene la loba.
Corría el año de mil novecientos treinta y nueve. La editorial estadounidense
consideró que el título podía ofender a los lectores y decidió cambiarlo por otro
que no tuviera esa carga, de modo que la obra se publicó con un nombre distinto.`;

const EN = `The book appeared in Great Britain with the original title, taken from
the first verse of a children song of the kind that everybody knew. It was the
year nineteen thirty nine. The American publisher considered that the title could
offend the readers and decided to change it for another one that did not have
that burden, so the work was published with a different name.`;

const FR = `Le livre est paru en Grande Bretagne avec le titre original, tire du
premier vers d une chanson enfantine que tout le monde connaissait. C etait en
mil neuf cent trente neuf. L editeur americain a considere que le titre pouvait
offenser les lecteurs et a decide de le changer pour un autre qui n avait pas
cette charge, et l oeuvre a paru sous un nom different.`;

describe('detectLanguage', () => {
    it('reconoce el español', () => {
        expect(detectLanguage(ES)).toBe('es');
    });

    it('reconoce el inglés', () => {
        expect(detectLanguage(EN)).toBe('en');
    });

    it('reconoce el francés', () => {
        // Es el caso difícil: comparte «de», «la» y «que» con el español.
        expect(detectLanguage(FR)).toBe('fr');
    });

    it('una frase suelta no es una muestra', () => {
        // Equivocarse de idioma parte las palabras por donde no toca, así que con
        // poco texto es mejor no decir nada.
        expect(detectLanguage('Hola, ¿qué tal?')).toBe('');
        expect(detectLanguage('')).toBe('');
        expect(detectLanguage(null)).toBe('');
    });

    it('la eñe desempata frente al portugués', () => {
        const conEnhe = ES + ' El niño tenía una montaña de sueños y mañanas.';
        expect(detectLanguage(conEnhe)).toBe('es');
    });

    it('un texto sin marcadores de ningún idioma no inventa uno', () => {
        const raro = Array.from({ length: 60 }, (_, i) => `zxqv${i}`).join(' ');
        expect(detectLanguage(raro)).toBe('');
    });
});

describe('normalizeLang', () => {
    it('recorta la región', () => {
        expect(normalizeLang('es-ES')).toBe('es');
        expect(normalizeLang('en_US')).toBe('en');
        expect(normalizeLang('PT-BR')).toBe('pt');
    });

    it('traduce los códigos de tres letras', () => {
        // Los deja alguna herramienta de conversión antigua.
        expect(normalizeLang('spa')).toBe('es');
        expect(normalizeLang('ger')).toBe('de');
    });

    it('sin nada devuelve cadena vacía', () => {
        expect(normalizeLang('')).toBe('');
        expect(normalizeLang(undefined)).toBe('');
    });
});

describe('resolveHyphenLang', () => {
    it('lo que elige el usuario manda', () => {
        expect(resolveHyphenLang({ elegido: 'en', declarado: 'es', texto: ES })).toBe('en');
    });

    it('después, lo que declara el EPUB', () => {
        // El editor sabe más que una cuenta de palabras.
        expect(resolveHyphenLang({ declarado: 'en-GB', texto: ES })).toBe('en');
    });

    it('si el EPUB no declara nada, se mira el texto', () => {
        expect(resolveHyphenLang({ declarado: '', texto: ES })).toBe('es');
    });

    it('si declara un idioma que no sabemos partir, se mira el texto', () => {
        // Rendirse dejaría la página con ríos; mirar el texto es gratis.
        expect(resolveHyphenLang({ declarado: 'zh', texto: ES })).toBe('es');
    });

    it('con «auto» explícito también se mira el texto', () => {
        expect(resolveHyphenLang({ elegido: 'auto', declarado: '', texto: EN })).toBe('en');
    });

    it('sin nada de nada no revienta', () => {
        expect(resolveHyphenLang()).toBe('');
        expect(resolveHyphenLang({})).toBe('');
    });
});
