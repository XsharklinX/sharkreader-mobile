import { describe, it, expect } from 'vitest';
import { ajusteDePortada, recortePerdido, RATIO_CELDA } from './coverFit.js';

describe('ajusteDePortada', () => {
    it('una novela típica llena la celda', () => {
        // 1400 × 2100 es exactamente 2:3, la proporción más común en EPUB.
        expect(ajusteDePortada(1400, 2100)).toBe('rellena');
    });

    it('una diferencia pequeña se recorta sin avisar', () => {
        // 600 × 900 es 2:3; 600 × 860 se pasa un 4 %: son unos milímetros de borde.
        expect(ajusteDePortada(600, 860)).toBe('rellena');
    });

    it('una portada cuadrada se respeta', () => {
        // Es el caso que rompía: metida en una celda 2:3 pierde un tercio, y por
        // arriba, que es donde va el título.
        expect(ajusteDePortada(1000, 1000)).toBe('contiene');
        expect(recortePerdido(1000, 1000)).toBeCloseTo(0.333, 2);
    });

    it('una apaisada también', () => {
        expect(ajusteDePortada(1600, 900)).toBe('contiene');
    });

    it('una muy alargada también', () => {
        // Algunas ediciones antiguas escanean la sobrecubierta entera.
        expect(ajusteDePortada(600, 1400)).toBe('contiene');
    });

    it('sin medidas todavía, rellena', () => {
        // Es lo que acierta el 90 % de las veces, y vale más que la celda cambie
        // de aspecto una vez a que parpadee al revés.
        expect(ajusteDePortada(0, 0)).toBe('rellena');
        expect(ajusteDePortada(undefined, undefined)).toBe('rellena');
    });
});

describe('recortePerdido', () => {
    it('no se pierde nada si la proporción coincide', () => {
        expect(recortePerdido(200, 300)).toBeCloseTo(0, 5);
    });

    it('se mide igual de estricto por arriba que por abajo', () => {
        // Entre 0,5 y 0,58 hay la misma proporción que entre 1,5 y 1,74: restando
        // en vez de dividir, el segundo caso parecería cinco veces peor.
        const masAncha = recortePerdido(RATIO_CELDA * 1.5 * 1000, 1000);
        const masAlta = recortePerdido(RATIO_CELDA / 1.5 * 1000, 1000);
        expect(masAncha).toBeCloseTo(masAlta, 5);
    });

    it('una cuadrada pierde un tercio', () => {
        expect(recortePerdido(500, 500)).toBeCloseTo(1 / 3, 2);
    });
});
