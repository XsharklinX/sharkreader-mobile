import { describe, it, expect } from 'vitest';
import { columnsFor, spreadValue, marginForColumns, SPREAD_MIN_WIDTH } from './spread.js';

describe('columnsFor', () => {
    it('deja una columna en un móvil vertical', () => {
        expect(columnsFor(392, 'auto')).toBe(1);
    });

    it('pone dos columnas en un móvil horizontal', () => {
        // Es el caso que justifica todo esto: con una sola columna serían unos
        // noventa caracteres por línea. El umbral de epub.js (800) no llegaría
        // nunca aquí, y por eso el nuestro está en 620.
        expect(columnsFor(782, 'auto')).toBe(2);
        expect(SPREAD_MIN_WIDTH).toBeLessThan(782);
    });

    it('respeta la elección de una sola columna a cualquier ancho', () => {
        expect(columnsFor(1200, 'none')).toBe(1);
    });

    it('trata el umbral como inclusivo', () => {
        expect(columnsFor(SPREAD_MIN_WIDTH, 'auto')).toBe(2);
        expect(columnsFor(SPREAD_MIN_WIDTH - 1, 'auto')).toBe(1);
    });
});

describe('spreadValue', () => {
    it('traduce al valor que espera epub.js', () => {
        expect(spreadValue('auto')).toBe('auto');
        expect(spreadValue('none')).toBe('none');
    });
});

describe('marginForColumns', () => {
    it('no toca el margen con una sola columna', () => {
        expect(marginForColumns(20, 1)).toBe(20);
    });

    it('lo reduce con dos: el hueco central ya separa los bloques', () => {
        expect(marginForColumns(36, 2)).toBe(24);
    });

    it('nunca deja el texto pegado al borde de la pantalla', () => {
        // Con margen 0 el dedo taparía la primera letra de cada línea.
        expect(marginForColumns(0, 2)).toBe(12);
        expect(marginForColumns(10, 2)).toBe(12);
    });
});
