import { describe, it, expect } from 'vitest';
import {
    createHighlight, highlightStyle, HIGHLIGHT_STYLES, DEFAULT_HIGHLIGHT_STYLE,
} from './annotations.js';

/**
 * La forma de una marca.
 *
 * Se prueba porque toca el formato de las anotaciones, que es el mismo que el del
 * escritorio y viaja en los respaldos. Un cambio de esquema aquí no se ve raro en
 * pantalla: se ve el día que alguien restaura un backup y le faltan las notas.
 */

describe('el formato no cambia', () => {
    it('una marca tiene exactamente los campos de siempre', () => {
        // `{ cfi, note, date, color, kind }` es el contrato con la versión de
        // escritorio. Una columna nueva rompería que un backup vaya y venga.
        const marca = createHighlight({ cfi: 'epubcfi(/6/4)', text: 'hola', style: 'underline' });
        expect(Object.keys(marca).sort()).toEqual(['cfi', 'color', 'date', 'kind', 'note']);
    });

    it('la forma viaja dentro del JSON de la nota', () => {
        const marca = createHighlight({ cfi: 'x', text: 'hola', style: 'strike' });
        expect(JSON.parse(marca.note).style).toBe('strike');
    });

    it('el relleno no se escribe: es lo que se asume', () => {
        // Guardarlo en cada marca engorda el respaldo para no decir nada.
        const marca = createHighlight({ cfi: 'x', text: 'hola' });
        expect(JSON.parse(marca.note)).not.toHaveProperty('style');
    });

    it('el texto y el comentario siguen donde estaban', () => {
        const marca = createHighlight({ cfi: 'x', text: 'hola', comment: 'ojo', style: 'underline' });
        const datos = JSON.parse(marca.note);
        expect(datos.text).toBe('hola');
        expect(datos.comment).toBe('ojo');
    });
});

describe('highlightStyle', () => {
    it('lee la forma guardada', () => {
        const marca = createHighlight({ cfi: 'x', text: 'hola', style: 'underline' });
        expect(highlightStyle(marca)).toBe('underline');
    });

    it('lo guardado antes de que esto existiera es relleno', () => {
        // Era lo único que había, así que es lo que significa su ausencia.
        const vieja = { cfi: 'x', kind: 'highlight', color: 'yellow', note: '{"text":"hola","comment":""}' };
        expect(highlightStyle(vieja)).toBe('fill');
    });

    it('una nota que no es JSON no revienta', () => {
        // Los marcadores simples guardan texto plano en el mismo campo.
        expect(highlightStyle({ note: 'una nota cualquiera' })).toBe(DEFAULT_HIGHLIGHT_STYLE);
        expect(highlightStyle({})).toBe(DEFAULT_HIGHLIGHT_STYLE);
        expect(highlightStyle(null)).toBe(DEFAULT_HIGHLIGHT_STYLE);
    });

    it('una forma que no conocemos cae en la de por defecto', () => {
        // Puede llegar de una versión más nueva a través de un respaldo.
        const rara = { note: '{"style":"arcoiris"}' };
        expect(highlightStyle(rara)).toBe(DEFAULT_HIGHLIGHT_STYLE);
    });
});

describe('las formas ofrecidas', () => {
    it('son tres y todas tienen nombre', () => {
        // No hay onda: epub.js dibuja líneas, y una onda necesita un trazado
        // propio. Una onda mal hecha se ve como un subrayado tembloroso.
        expect(Object.keys(HIGHLIGHT_STYLES)).toEqual(['fill', 'underline', 'strike']);
        Object.values(HIGHLIGHT_STYLES).forEach((forma) => {
            expect(forma.label).toBeTruthy();
        });
    });

    it('la de por defecto es una de las tres', () => {
        expect(HIGHLIGHT_STYLES[DEFAULT_HIGHLIGHT_STYLE]).toBeTruthy();
    });
});
