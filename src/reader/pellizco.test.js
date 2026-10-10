import { describe, it, expect } from 'vitest';
import { distanciaEntreDedos, cuerpoPorPellizco, escalaVisual } from './pellizco.js';
import { FONT_SIZE_MIN, FONT_SIZE_MAX } from './typography.js';

const dedos = (ax, ay, bx, by) => [{ clientX: ax, clientY: ay }, { clientX: bx, clientY: by }];

describe('distanciaEntreDedos', () => {
    it('mide la distancia entre los dos primeros dedos', () => {
        expect(distanciaEntreDedos(dedos(0, 0, 30, 40))).toBe(50);
    });

    it('con un solo dedo no hay pellizco', () => {
        expect(distanciaEntreDedos([{ clientX: 0, clientY: 0 }])).toBe(0);
        expect(distanciaEntreDedos(null)).toBe(0);
    });
});

describe('cuerpoPorPellizco', () => {
    it('un temblor de los dedos no cambia la letra', () => {
        expect(cuerpoPorPellizco(18, 1.03)).toBe(18);
        expect(cuerpoPorPellizco(18, 0.97)).toBe(18);
    });

    it('abrir los dedos agranda y cerrarlos achica', () => {
        expect(cuerpoPorPellizco(18, 1.5)).toBeGreaterThan(18);
        expect(cuerpoPorPellizco(18, 0.6)).toBeLessThan(18);
    });

    it('abrir al doble no dobla la letra', () => {
        const cuerpo = cuerpoPorPellizco(18, 2);
        expect(cuerpo).toBeGreaterThan(22);
        expect(cuerpo).toBeLessThan(30);
    });

    it('no se sale de la escala de la hoja de Texto', () => {
        expect(cuerpoPorPellizco(30, 9)).toBe(FONT_SIZE_MAX);
        expect(cuerpoPorPellizco(13, 0.05)).toBe(FONT_SIZE_MIN);
    });

    it('una escala rota deja el cuerpo como estaba', () => {
        expect(cuerpoPorPellizco(18, NaN)).toBe(18);
        expect(cuerpoPorPellizco(18, 0)).toBe(18);
    });
});

describe('escalaVisual', () => {
    it('es la proporción entre el cuerpo nuevo y el de partida', () => {
        expect(escalaVisual(18, 18)).toBe(1);
        expect(escalaVisual(20, 25)).toBe(1.25);
    });
});
