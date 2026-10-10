import { describe, it, expect } from 'vitest';
import { pasoDe, columnaDe, columnasDe, anclaEn, columnaDePagina } from './pdfColumnas.js';

describe('columnas del modo lectura', () => {
    const paso = pasoDe(360, 40);

    it('el paso es ancho más hueco', () => {
        expect(paso).toBe(400);
    });

    it('un bloque al principio de la tercera columna está en la 2', () => {
        expect(columnaDe(800, paso)).toBe(2);
        expect(columnaDe(799, paso)).toBe(2);
        expect(columnaDe(0, paso)).toBe(0);
    });

    it('cuenta las columnas de la tira', () => {
        expect(columnasDe(360, paso, 40)).toBe(1);
        expect(columnasDe(1160, paso, 40)).toBe(3);
    });

    const bloques = [
        { indice: 0, columna: 0, pagina: 40 },
        { indice: 1, columna: 0, pagina: 40 },
        { indice: 2, columna: 2, pagina: 41 },
        { indice: 3, columna: 3, pagina: 42 },
    ];

    it('en una columna que es toda continuación manda el párrafo que viene de antes', () => {
        expect(anclaEn(bloques, 1).indice).toBe(1);
    });

    it('en una columna donde empieza un bloque manda ese', () => {
        expect(anclaEn(bloques, 2).indice).toBe(2);
    });

    it('al abrir en una página aterriza en su primer bloque', () => {
        expect(columnaDePagina(bloques, 41)).toBe(2);
        expect(columnaDePagina(bloques, 1)).toBe(0);
        expect(columnaDePagina(bloques, 99)).toBe(3);
    });
});
