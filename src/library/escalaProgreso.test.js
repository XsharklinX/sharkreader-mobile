import { describe, it, expect } from 'vitest';
import {
    estaEnFraccion, backupEnPorcentaje, libroEnPorcentaje, libroEnFraccion, progresoReparado,
} from './escalaProgreso.js';

describe('escala del progreso', () => {
    it('reconoce una copia antigua del móvil', () => {
        expect(estaEnFraccion({ books: [{ progress: 0.45 }, { progress: 1 }] })).toBe(true);
        expect(estaEnFraccion({ books: [{ progress: 45 }, { progress: 0.5 }] })).toBe(false);
    });

    it('pasa a porcentaje solo lo que estaba en fracción', () => {
        expect(backupEnPorcentaje({ books: [{ progress: 0.45 }] }).books[0].progress).toBe(45);
        const escritorio = { books: [{ progress: 45 }] };
        expect(backupEnPorcentaje(escritorio)).toBe(escritorio);
    });

    it('un libro del escritorio al 45 % entra en el móvil al 0,45', () => {
        expect(libroEnFraccion({ progress: 45 }).progress).toBeCloseTo(0.45);
    });

    it('un libro del móvil al 0,45 sale en el backup al 45 %', () => {
        expect(libroEnPorcentaje({ progress: 0.45 }).progress).toBe(45);
    });

    it('ida y vuelta deja el mismo valor', () => {
        expect(libroEnFraccion(libroEnPorcentaje({ progress: 0.3333 })).progress).toBeCloseTo(0.3333, 4);
    });

    it('repara un libro que se guardó con el fallo', () => {
        expect(progresoReparado({ progress: 45 }).progress).toBeCloseTo(0.45);
        const bien = { progress: 0.45 };
        expect(progresoReparado(bien)).toBe(bien);
    });
});
