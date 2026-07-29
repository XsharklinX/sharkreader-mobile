import { describe, it, expect } from 'vitest';
import { createRefreshCounter, intervalLabel, REFRESH_INTERVALS } from './einkRefresh.js';

describe('createRefreshCounter', () => {
    it('avisa al llegar al intervalo, no antes', () => {
        const counter = createRefreshCounter(3);
        expect(counter.pageTurned()).toBe(false);
        expect(counter.pageTurned()).toBe(false);
        expect(counter.pageTurned()).toBe(true);
    });

    it('vuelve a contar desde cero tras avisar', () => {
        const counter = createRefreshCounter(2);
        counter.pageTurned();
        expect(counter.pageTurned()).toBe(true);
        expect(counter.pageTurned()).toBe(false);
        expect(counter.pageTurned()).toBe(true);
    });

    it('con intervalo cero no avisa nunca', () => {
        const counter = createRefreshCounter(0);
        for (let i = 0; i < 50; i += 1) expect(counter.pageTurned()).toBe(false);
    });

    it('cambiar el intervalo reinicia la cuenta', () => {
        // Bajar de 25 a 5 con 20 páginas acumuladas limpiaría en la siguiente,
        // que desde fuera parece un fallo.
        const counter = createRefreshCounter(25);
        for (let i = 0; i < 20; i += 1) counter.pageTurned();
        counter.setInterval(5);
        expect(counter.pending()).toBe(0);
        for (let i = 0; i < 4; i += 1) expect(counter.pageTurned()).toBe(false);
        expect(counter.pageTurned()).toBe(true);
    });

    it('limpiar a mano también reinicia', () => {
        const counter = createRefreshCounter(5);
        counter.pageTurned();
        counter.pageTurned();
        counter.reset();
        expect(counter.pending()).toBe(0);
    });

    it('apagarlo con el contador a medias no deja un aviso pendiente', () => {
        const counter = createRefreshCounter(5);
        counter.pageTurned();
        counter.setInterval(0);
        expect(counter.pageTurned()).toBe(false);
    });
});

describe('intervalLabel', () => {
    it('dice «nunca» en vez de «cada 0 páginas»', () => {
        expect(intervalLabel(0)).toBe('Nunca');
        expect(intervalLabel(10)).toBe('Cada 10 páginas');
    });

    it('la opción de apagarlo existe', () => {
        expect(REFRESH_INTERVALS).toContain(0);
    });
});
