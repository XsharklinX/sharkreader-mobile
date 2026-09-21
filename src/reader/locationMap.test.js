import { describe, it, expect } from 'vitest';
import { mapStatus, progressLabel, SECTION_PAUSE_MS, CALMA_MS, hayCalma } from './locationMap.js';

describe('mapStatus', () => {
    it('se calla cuando el mapa ya está', () => {
        expect(mapStatus({ done: 40, total: 40, ready: true }).visible).toBe(false);
    });

    it('se calla al principio, cuando aparecería y desaparecería', () => {
        expect(mapStatus({ done: 1, total: 100 }).visible).toBe(false);
    });

    it('muestra el avance en mitad del cálculo', () => {
        const status = mapStatus({ done: 20, total: 40 });
        expect(status.visible).toBe(true);
        expect(status.percent).toBe(50);
        expect(status.label).toContain('50 %');
    });

    it('se calla al llegar al final aunque no se haya marcado listo', () => {
        // El aviso desaparece con el último capítulo, sin esperar a que el
        // guardado en disco confirme.
        expect(mapStatus({ done: 40, total: 40 }).visible).toBe(false);
    });

    it('no se rompe sin datos', () => {
        expect(mapStatus().visible).toBe(false);
        expect(mapStatus({ done: 5, total: 0 }).visible).toBe(false);
    });
});

describe('progressLabel', () => {
    it('siempre el porcentaje, nunca el tiempo restante', () => {
        // El tiempo era una estimación sobre una estimación: bailaba al cambiar
        // el ritmo de lectura y no respondía a «por dónde voy».
        const label = progressLabel({ ready: true, bookPercent: 34, chapterPercent: 80 });
        expect(label.text).toBe('34 %');
        expect(label.of).toBe('del libro');
        expect(label.text).not.toMatch(/min/);
    });

    it('el porcentaje del libro sale del mapa, igual en los dos modos', () => {
        // Un CFI es un CFI, esté paginado o desplazándose: el medidor es el
        // mismo y no hay dos cálculos que mantener sincronizados.
        expect(progressLabel({ ready: true, bookPercent: 61 }).exact).toBe(true);
    });

    it('sin mapa dice que el porcentaje es del capítulo', () => {
        // Enseñar «0 %» durante diez segundos sería mentir justo sobre el dato
        // que se mira para orientarse.
        const label = progressLabel({ ready: false, bookPercent: 0, chapterPercent: 80 });
        expect(label.text).toBe('80 %');
        expect(label.of).toBe('del capítulo');
        expect(label.exact).toBe(false);
    });

    it('redondea sin decimales', () => {
        expect(progressLabel({ ready: true, bookPercent: 34.7 }).text).toBe('35 %');
    });

    it('sin datos no se rompe', () => {
        expect(progressLabel({ ready: true }).text).toBe('0 %');
        expect(progressLabel({ ready: false }).text).toBe('0 %');
    });
});

describe('SECTION_PAUSE_MS', () => {
    it('es bastante menor que los 100 ms de serie de epub.js', () => {
        // Con cuarenta capítulos, 100 ms son cuatro segundos de espera pura.
        expect(SECTION_PAUSE_MS).toBeLessThan(50);
        // Pero sigue dejando hueco para pintar un fotograma.
        expect(SECTION_PAUSE_MS).toBeGreaterThan(0);
    });
});

describe('hayCalma', () => {
    it('sin ningún paso de página, el mapa trabaja', () => {
        // Al abrir el libro nadie está pasando páginas todavía.
        expect(hayCalma(0, 10_000)).toBe(true);
    });

    it('recién pasada una página, el mapa espera', () => {
        // Aquí es donde se perdían los treinta milisegundos: procesar un
        // capítulo caía justo encima del dedo.
        expect(hayCalma(10_000, 10_100)).toBe(false);
    });

    it('pasado el silencio, sigue', () => {
        expect(hayCalma(10_000, 10_000 + CALMA_MS)).toBe(true);
    });

    it('el silencio es más largo que una página y más corto que leerla', () => {
        // Pasando páginas seguidas el mapa se queda quieto; leyendo de verdad,
        // avanza entre página y página.
        expect(CALMA_MS).toBeGreaterThan(200);
        expect(CALMA_MS).toBeLessThan(3000);
    });
});
