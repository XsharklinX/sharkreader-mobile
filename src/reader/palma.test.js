import { describe, it, expect } from 'vitest';
import { esPalma, esAgarre } from './palma.js';

describe('palma', () => {
    it('una yema no es una palma', () => {
        expect(esPalma({ width: 14, height: 18 })).toBe(false);
    });

    it('un contacto grande sí', () => {
        expect(esPalma({ width: 48, height: 60 })).toBe(true);
    });

    it('sin datos de contacto, se da por bueno', () => {
        expect(esPalma({})).toBe(false);
    });
});

describe('agarre', () => {
    it('un apoyo largo y quieto pegado al borde es sujetar el móvil', () => {
        expect(esAgarre({ x: 395, ancho: 400, duracion: 900 })).toBe(true);
    });

    it('un toque rápido en el borde sí pasa página', () => {
        expect(esAgarre({ x: 395, ancho: 400, duracion: 120 })).toBe(false);
    });

    it('un toque largo lejos del borde no es un agarre', () => {
        expect(esAgarre({ x: 300, ancho: 400, duracion: 900 })).toBe(false);
    });
});
