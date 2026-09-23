import { describe, it, expect } from 'vitest';
import {
    anchoDeFranja, enLaFranja, esVertical, atenuacionDe, brilloVisible,
    FRANJA_MAX, UMBRAL,
} from './brilloGesto.js';

const ANCHO = 720;
const ALTO = 1640;

describe('la franja', () => {
    it('es estrecha: el resto de la pantalla sigue siendo para pasar página', () => {
        expect(anchoDeFranja(ANCHO)).toBeLessThan(ANCHO * 0.1);
        expect(enLaFranja(20, ANCHO)).toBe(true);
        expect(enLaFranja(ANCHO / 2, ANCHO)).toBe(false);
        expect(enLaFranja(ANCHO - 10, ANCHO)).toBe(false);
    });

    it('en una tablet no se come media mano', () => {
        // El 8 % de una pantalla de 2000 px serían 160: ahí ya no es una franja,
        // es una columna donde no se podría pasar página.
        expect(anchoDeFranja(2000)).toBe(FRANJA_MAX);
    });

    it('sin ancho conocido, nada está en la franja', () => {
        expect(enLaFranja(5, 0)).toBe(false);
    });
});

describe('distinguirlo de pasar página', () => {
    it('un movimiento claramente vertical es el brillo', () => {
        expect(esVertical(3, 60)).toBe(true);
        expect(esVertical(0, -40)).toBe(true);
    });

    it('un arrastre horizontal nunca lo es', () => {
        expect(esVertical(120, 4)).toBe(false);
    });

    it('una diagonal tampoco', () => {
        // **Aquí está el choque.** Con un umbral justo —vertical algo mayor que
        // horizontal— un arrastre en diagonal para pasar página acabaría bajando
        // el brillo a mitad de gesto. Se pide el doble.
        expect(esVertical(50, 60)).toBe(false);
        expect(esVertical(50, 130)).toBe(true);
    });

    it('un temblor no cuenta', () => {
        expect(esVertical(0, UMBRAL - 1)).toBe(false);
    });
});

describe('atenuacionDe', () => {
    it('bajar el dedo oscurece y subirlo aclara', () => {
        expect(atenuacionDe(0.3, 200, ALTO)).toBeGreaterThan(0.3);
        expect(atenuacionDe(0.3, -200, ALTO)).toBeLessThan(0.3);
    });

    it('no se pasa de los extremos', () => {
        expect(atenuacionDe(0.9, 5000, ALTO)).toBeLessThanOrEqual(0.92);
        expect(atenuacionDe(0.1, -5000, ALTO)).toBe(0);
    });

    it('nunca llega a negro del todo', () => {
        // Una pantalla completamente negra parece la app colgada, y desde ahí no
        // se ve ni el propio gesto para deshacerlo.
        expect(atenuacionDe(0, 99999, ALTO)).toBeLessThan(1);
    });

    it('recorrer media pantalla cambia bastante, pero no todo', () => {
        const medio = atenuacionDe(0, ALTO / 2, ALTO);
        expect(medio).toBeGreaterThan(0.4);
        expect(medio).toBeLessThan(0.92);
    });

    it('sin alto conocido no cambia nada', () => {
        expect(atenuacionDe(0.4, 300, 0)).toBe(0.4);
    });
});

describe('brilloVisible', () => {
    it('enseña el brillo, no la atenuación', () => {
        // Nadie piensa «tengo el atenuador al treinta por ciento».
        expect(brilloVisible(0)).toBe(100);
        expect(brilloVisible(0.25)).toBe(75);
    });

    it('es un entero: un decimal bailando bajo el pulgar es ruido', () => {
        expect(Number.isInteger(brilloVisible(0.333))).toBe(true);
    });
});
