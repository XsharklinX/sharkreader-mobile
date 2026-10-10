import { describe, it, expect } from 'vitest';
import { leerClippingsKindle, leerTablaLua, leerMetadatosKoreader, formatoDe, emparejar } from './migrar.js';

const CLIPPINGS = `﻿Dune (Spanish Edition) (Frank Herbert)
- Tu subrayado en la página 12 | posición 170-172 | Añadido el martes, 1 de marzo de 2022 22:00:00

El miedo es el asesino de la mente.
==========
Dune (Spanish Edition) (Frank Herbert)
- Tu nota en la página 12 | posición 172 | Añadido el martes, 1 de marzo de 2022 22:01:00

La letanía contra el miedo
==========
Pride and Prejudice (Jane Austen)
- Your Highlight on Location 9-10 | Added on Monday, May 2, 2022 9:00:00 AM

It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.
==========
Pride and Prejudice (Jane Austen)
- Your Bookmark on Location 40 | Added on Monday, May 2, 2022 9:05:00 AM


==========
`;

describe('Kindle: My Clippings.txt', () => {
    const libros = leerClippingsKindle(CLIPPINGS);

    it('agrupa por libro y separa título y autor', () => {
        expect(libros.map((l) => [l.titulo, l.autor])).toEqual([
            ['Dune (Spanish Edition)', 'Frank Herbert'],
            ['Pride and Prejudice', 'Jane Austen'],
        ]);
    });

    it('la nota se junta con su subrayado', () => {
        expect(libros[0].subrayados).toEqual([
            expect.objectContaining({ texto: 'El miedo es el asesino de la mente.', nota: 'La letanía contra el miedo' }),
        ]);
    });

    it('entiende el formato en inglés y se salta los marcadores', () => {
        expect(libros[1].subrayados).toHaveLength(1);
        expect(libros[1].subrayados[0].texto).toMatch(/^It is a truth/);
    });
});

describe('Lua', () => {
    it('lee tablas anidadas, listas, cadenas con escapes y números', () => {
        const t = leerTablaLua(`-- comentario
return {
    ["doc_props"] = { ["title"] = "El \\"Quijote\\"", ["authors"] = "Cervantes" },
    ["percent_finished"] = 0.42,
    ["annotations"] = { [1] = { ["text"] = "línea\\nnueva", ["pos0"] = "/body/p[3]" }, [2] = { text = 'dos' } },
    ["flag"] = true,
}`);
        expect(t.doc_props.title).toBe('El "Quijote"');
        expect(t.percent_finished).toBe(0.42);
        expect(t.annotations[1].text).toBe('línea\nnueva');
        expect(t.annotations[2].text).toBe('dos');
        expect(t.flag).toBe(true);
    });
});

describe('KOReader', () => {
    it('formato actual: annotations', () => {
        const libro = leerMetadatosKoreader(`return {
            ["annotations"] = {
                [1] = { ["text"] = "En un lugar de la Mancha", ["note"] = "Inicio", ["pos0"] = "/body/p[1]", ["datetime"] = "2024-01-02 10:00:00" },
            },
            ["doc_props"] = { ["title"] = "Don Quijote", ["authors"] = "Miguel de Cervantes" },
            ["percent_finished"] = 0.31,
        }`);
        expect(libro).toMatchObject({ titulo: 'Don Quijote', autor: 'Miguel de Cervantes', progreso: 0.31 });
        expect(libro.subrayados[0]).toMatchObject({ texto: 'En un lugar de la Mancha', nota: 'Inicio' });
    });

    it('formato antiguo: highlight por página y notas en bookmarks', () => {
        const libro = leerMetadatosKoreader(`return {
            ["highlight"] = { [12] = { [1] = { ["text"] = "Llamadme Ismael.", ["datetime"] = "2021" } } },
            ["bookmarks"] = { [1] = { ["notes"] = "Llamadme Ismael.", ["text"] = "Comienzo famoso" } },
            ["doc_props"] = { ["title"] = "Moby Dick" },
        }`);
        expect(libro.subrayados).toEqual([{ texto: 'Llamadme Ismael.', nota: 'Comienzo famoso', fecha: '2021' }]);
    });

    it('un fichero roto no rompe nada', () => {
        expect(leerMetadatosKoreader('return { ["a"] = ')).toBeNull();
    });
});

describe('formato y emparejado', () => {
    it('reconoce cada formato', () => {
        expect(formatoDe('My Clippings.txt', CLIPPINGS)).toBe('kindle');
        expect(formatoDe('metadata.epub.lua', 'return {}')).toBe('koreader');
        expect(formatoDe('otra.txt', 'hola')).toBeNull();
    });

    it('empareja aunque el Kindle añada la edición al título', () => {
        const biblioteca = [
            { id: 'a', name: 'Dune', author: 'Frank Herbert' },
            { id: 'b', name: 'Dune', author: 'Otra Persona' },
        ];
        expect(emparejar({ titulo: 'Dune (Spanish Edition)', autor: 'Frank Herbert' }, biblioteca).id).toBe('a');
        expect(emparejar({ titulo: 'Cosmos', autor: '' }, biblioteca)).toBeNull();
    });
});
