import { describe, it, expect } from 'vitest';
import { alternar, alternarTodo, podar, accionesPara, cambiosDe } from './selection.js';

const libro = (id, extra = {}) => ({ id, name: id, ...extra });

describe('alternar', () => {
    it('pone y quita', () => {
        expect([...alternar(new Set(), 'a')]).toEqual(['a']);
        expect([...alternar(new Set(['a']), 'a')]).toEqual([]);
    });

    it('no muta el conjunto que recibe', () => {
        const original = new Set(['a']);
        alternar(original, 'b');
        expect([...original]).toEqual(['a']);
    });
});

describe('alternarTodo', () => {
    const visibles = [libro('a'), libro('b'), libro('c')];

    it('marca todo lo visible', () => {
        expect([...alternarTodo(new Set(), visibles)].sort()).toEqual(['a', 'b', 'c']);
    });

    it('con todo marcado, lo desmarca', () => {
        expect([...alternarTodo(new Set(['a', 'b', 'c']), visibles)]).toEqual([]);
    });

    it('con algunos marcados, completa', () => {
        expect([...alternarTodo(new Set(['a']), visibles)].sort()).toEqual(['a', 'b', 'c']);
    });

    it('«todo» es lo visible, no la biblioteca entera', () => {
        // Con un filtro puesto, marcar 136 libros cuando en pantalla hay 3 es la
        // clase de sorpresa que acaba en un borrado que nadie quería.
        const seleccion = alternarTodo(new Set(['z']), visibles);
        expect(seleccion.has('z')).toBe(true);
        expect(seleccion.size).toBe(4);
    });
});

describe('podar', () => {
    it('quita lo que ya no está a la vista', () => {
        // Al cambiar de filtro, lo seleccionado que desaparece seguiría contando en
        // «12 seleccionados» y se borraría con el resto sin haberlo visto nunca.
        const seleccion = new Set(['a', 'b', 'c']);
        expect([...podar(seleccion, [libro('a'), libro('c')])].sort()).toEqual(['a', 'c']);
    });

    it('sin nada visible se queda vacía', () => {
        expect([...podar(new Set(['a']), [])]).toEqual([]);
    });
});

describe('accionesPara', () => {
    it('con ninguno terminado, la acción es marcar', () => {
        const acciones = accionesPara([libro('a'), libro('b')]);
        expect(acciones.terminar.marcar).toBe(true);
        expect(acciones.terminar.label).toBe('Marcar terminado');
    });

    it('con todos terminados, la acción se invierte', () => {
        const acciones = accionesPara([
            libro('a', { isFinished: true }),
            libro('b', { isFinished: true }),
        ]);
        expect(acciones.terminar.marcar).toBe(false);
        expect(acciones.terminar.label).toBe('Quitar terminado');
    });

    it('con una mezcla, completa en vez de invertir', () => {
        // Marcar los ocho como terminados es lo que se quiere casi siempre;
        // desmarcar los tres que ya lo estaban no lo pide nadie.
        const acciones = accionesPara([libro('a', { isFinished: true }), libro('b')]);
        expect(acciones.terminar.marcar).toBe(true);
    });

    it('lo mismo con los favoritos', () => {
        expect(accionesPara([libro('a', { isFav: true }), libro('b')]).favorito.marcar).toBe(true);
        expect(accionesPara([libro('a', { isFav: true })]).favorito.marcar).toBe(false);
    });
});

describe('cambiosDe', () => {
    it('marcar terminado pone el progreso al 100 %', () => {
        const cambios = cambiosDe([libro('a')], 'terminar');
        expect(cambios[0].cambios.isFinished).toBe(true);
        expect(cambios[0].cambios.progress).toBe(1);
        expect(cambios[0].cambios.dateFinished).toBeTruthy();
    });

    it('desmarcar no toca el progreso', () => {
        // El usuario ha dicho que no está terminado, no por dónde va: inventar un
        // porcentaje sería peor que dejar el que había.
        const cambios = cambiosDe([libro('a', { isFinished: true, progress: 1 })], 'terminar');
        expect(cambios[0].cambios.isFinished).toBe(false);
        expect(cambios[0].cambios).not.toHaveProperty('progress');
    });

    it('respeta la fecha de fin que ya hubiera', () => {
        const cambios = cambiosDe([libro('a', { dateFinished: 1234 })], 'terminar');
        expect(cambios[0].cambios.dateFinished).toBe(1234);
    });

    it('una acción desconocida no devuelve cambios', () => {
        expect(cambiosDe([libro('a')], 'explotar')).toEqual([]);
    });
});
