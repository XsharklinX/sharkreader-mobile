import { describe, it, expect } from 'vitest';
import { mapStatus, progressLabel, SECTION_PAUSE_MS } from './locationMap.js';

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
    it('muestra el avance del libro cuando hay mapa', () => {
        expect(progressLabel({ ready: true, bookPercent: 34, chapterPercent: 80 }))
            .toEqual({ text: '34%', of: 'libro' });
    });

    it('muestra el del capítulo mientras no lo hay', () => {
        // Sin mapa no se sabe por dónde vas en el libro. Enseñar «0 %» sería
        // mentir justo sobre el dato que se mira para orientarse.
        expect(progressLabel({ ready: false, bookPercent: 0, chapterPercent: 80 }))
            .toEqual({ text: '80%', of: 'capítulo' });
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
