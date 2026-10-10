/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { duracionRestante, createHojaReal, DURACION_BASE, DURACION_MINIMA } from './hojaReal.js';

describe('duracionRestante', () => {
    it('cruzar la pantalla entera sin impulso tarda la base', () => {
        expect(duracionRestante(400, 400)).toBe(DURACION_BASE);
    });

    it('si el dedo ya la llevó casi al final, queda poco', () => {
        expect(duracionRestante(80, 400)).toBeLessThan(DURACION_BASE / 2);
    });

    it('cuanto más fuerte se suelta, menos tarda, sin bajar del mínimo', () => {
        expect(duracionRestante(400, 400, 1)).toBe(DURACION_BASE / 2);
        expect(duracionRestante(400, 400, 50)).toBe(DURACION_MINIMA);
    });

    it('nada que recorrer, nada que esperar', () => {
        expect(duracionRestante(0, 400)).toBe(0);
    });
});

describe('createHojaReal', () => {
    const montar = (avanzar = vi.fn(async () => {})) => {
        const nodo = document.createElement('div');
        Object.defineProperty(nodo, 'clientWidth', { value: 400 });
        const elevar = vi.fn();
        const hoja = createHojaReal({ hoja: () => nodo, avanzar, elevar, limite: 50 });
        return { nodo, hoja, avanzar, elevar };
    };

    it('la página real avanza con la hoja fuera y vuelve a su sitio', async () => {
        const visto = [];
        const avanzar = vi.fn(async () => { visto.push(nodo.style.transform); });
        const { nodo, hoja, elevar } = montar(avanzar);
        await hoja.pasar('next', { animar: false });
        expect(elevar).toHaveBeenCalledWith('next');
        // Cuando cambia, la hoja está fuera de la pantalla.
        expect(visto[0]).toBe('translate3d(-400px,0,0)');
        expect(nodo.style.transform).toBe('');
    });

    it('tres toques seguidos son tres páginas', async () => {
        const { hoja, avanzar } = montar();
        const a = hoja.pasar('next', { animar: false });
        hoja.pasar('next', { animar: false });
        hoja.pasar('next', { animar: false });
        await a;
        expect(avanzar).toHaveBeenCalledTimes(3);
    });

    it('sin sombra lista, la hoja no se mueve y la página cambia igual', async () => {
        const nodo = document.createElement('div');
        const visto = [];
        const avanzar = vi.fn(async () => { visto.push(nodo.style.transform); });
        const hoja = createHojaReal({ hoja: () => nodo, avanzar, lista: () => false });
        await hoja.pasar('next', { animar: true });
        expect(avanzar).toHaveBeenCalledTimes(1);
        expect(visto[0]).toBe('');
    });

    it('si la página real se atasca, la hoja vuelve igual', async () => {
        const { nodo, hoja } = montar(() => new Promise(() => {}));
        await hoja.pasar('prev', { animar: false });
        expect(nodo.style.transform).toBe('');
        expect(hoja.ocupada()).toBe(false);
    });
});
