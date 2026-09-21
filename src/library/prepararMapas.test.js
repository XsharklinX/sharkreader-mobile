import { describe, it, expect } from 'vitest';
import { porPreparar, MAXIMO } from './prepararMapas.js';

const libro = (id, extras = {}) => ({
    id,
    sourcePath: `/data/${id}.epub`,
    progress: 0.3,
    lastReadDate: 1000,
    ...extras,
});

describe('porPreparar', () => {
    it('solo los libros empezados', () => {
        // Un libro sin abrir no necesita porcentaje todavía, y calcularlo son
        // varios segundos de CPU por libro.
        const lista = porPreparar([
            libro('a'),
            libro('b', { progress: 0 }),
        ]);
        expect(lista.map((l) => l.id)).toEqual(['a']);
    });

    it('los terminados tampoco', () => {
        expect(porPreparar([libro('a', { isFinished: true })])).toEqual([]);
    });

    it('sin fichero no hay nada que abrir', () => {
        // Los libros que vienen de un backup de escritorio llegan sin binario.
        expect(porPreparar([libro('a', { sourcePath: null })])).toEqual([]);
    });

    it('del más recién leído al más antiguo', () => {
        // Es el orden en que se van a volver a abrir.
        const lista = porPreparar([
            libro('viejo', { lastReadDate: 100 }),
            libro('nuevo', { lastReadDate: 900 }),
            libro('medio', { lastReadDate: 500 }),
        ]);
        expect(lista.map((l) => l.id)).toEqual(['nuevo', 'medio', 'viejo']);
    });

    it('se para en un tope', () => {
        // Con ciento treinta y seis libros esto sería un cuarto de hora de CPU
        // para calcular el porcentaje de libros que igual no se abren nunca.
        const muchos = Array.from({ length: 40 }, (_, i) => libro(`l${i}`, { lastReadDate: i }));
        expect(porPreparar(muchos)).toHaveLength(MAXIMO);
    });

    it('una biblioteca vacía no da problemas', () => {
        expect(porPreparar([])).toEqual([]);
        expect(porPreparar(undefined)).toEqual([]);
    });
});
