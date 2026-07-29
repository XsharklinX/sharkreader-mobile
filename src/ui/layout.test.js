import { describe, it, expect } from 'vitest';
import {
    layoutFor, showsTwoPanes, gridColumns, contentMaxWidth,
    BREAKPOINT_MEDIUM, BREAKPOINT_WIDE,
} from './layout.js';

describe('layoutFor', () => {
    it('un móvil en vertical es compacto', () => {
        expect(layoutFor(392)).toBe('compact');
        expect(layoutFor(320)).toBe('compact');
    });

    it('un móvil en horizontal cabe más pero no da para dos paneles', () => {
        // El panel izquierdo quedaría por debajo de los 320 px en los que una
        // lista de libros deja de ser legible.
        expect(layoutFor(780)).toBe('medium');
    });

    it('una tablet en horizontal sí', () => {
        expect(layoutFor(1280)).toBe('expanded');
    });

    it('los cortes son inclusivos', () => {
        expect(layoutFor(BREAKPOINT_MEDIUM)).toBe('medium');
        expect(layoutFor(BREAKPOINT_MEDIUM - 1)).toBe('compact');
        expect(layoutFor(BREAKPOINT_WIDE)).toBe('expanded');
        expect(layoutFor(BREAKPOINT_WIDE - 1)).toBe('medium');
    });
});

describe('showsTwoPanes', () => {
    it('parte la pantalla en una tablet en horizontal', () => {
        expect(showsTwoPanes(1280, 800)).toBe(true);
    });

    it('no en un móvil, gires como gires', () => {
        expect(showsTwoPanes(392, 850)).toBe(false);
        expect(showsTwoPanes(850, 392)).toBe(false);
    });

    it('no en una pantalla muy ancha pero baja', () => {
        // Un móvil alargado en horizontal puede pasar de 900 px con 380 de
        // alto: dos paneles darían dos columnas de ocho líneas, peor que una.
        expect(showsTwoPanes(960, 400)).toBe(false);
    });
});

describe('gridColumns', () => {
    it('mantiene el tamaño de portada y añade columnas al crecer', () => {
        // Lo contrario —columnas fijas— haría portadas gigantes en tablet.
        const phone = gridColumns(392);
        const tablet = gridColumns(1100);
        expect(tablet).toBeGreaterThan(phone);
    });

    it('la densidad compacta cabe más', () => {
        expect(gridColumns(392, true)).toBeGreaterThan(gridColumns(392, false));
    });

    it('nunca baja de dos columnas', () => {
        // Una sola columna de portadas sería una lista con imágenes enormes.
        expect(gridColumns(180)).toBe(2);
        expect(gridColumns(0)).toBe(2);
    });
});

describe('contentMaxWidth', () => {
    it('limita el ancho en pantallas grandes', () => {
        // Un formulario a todo lo ancho deja etiqueta y control a un palmo.
        expect(contentMaxWidth(1280)).toBe(680);
    });

    it('en un móvil usa todo lo que hay', () => {
        expect(contentMaxWidth(392)).toBe(392);
    });
});
