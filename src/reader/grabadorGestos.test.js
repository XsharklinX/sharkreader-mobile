import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reproducir, createGrabador } from './grabadorGestos.js';

/**
 * Banco de gestos: cada traza de `gestos-reales/` pasa por los mismos
 * manejadores que usa el lector y tiene que dar la decisión que lleva escrita.
 *
 * Para añadir un gesto que se ha roto en el teléfono: grabarlo con
 * `__gestos.exportar()` (ver `grabadorGestos.js`), guardarlo aquí con su
 * decisión correcta y arreglar el código hasta que pase.
 */
const trazas = import.meta.glob('./gestos-reales/*.json', { eager: true });

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000); });
afterEach(() => { vi.useRealTimers(); });

describe('banco de gestos', () => {
    const lista = Object.values(trazas).map((m) => m.default || m);

    it('hay trazas que reproducir', () => {
        expect(lista.length).toBeGreaterThan(5);
    });

    it.each(lista.map((t) => [t.nombre, t]))('%s', (_, traza) => {
        const decisiones = reproducir(traza, (ms) => vi.advanceTimersByTime(ms));
        expect(decisiones).toEqual(traza.esperado);
    });
});

describe('grabador', () => {
    it('apagado no graba nada y no cambia lo que hacen los manejadores', () => {
        const grabador = createGrabador();
        const original = vi.fn(() => 'hecho');
        const handlers = grabador.envolver({ onPointerDown: original });
        expect(handlers.onPointerDown({ clientX: 1, clientY: 2 })).toBe('hecho');
        expect(JSON.parse(grabador.exportar())).toEqual([]);
    });

    it('encendido guarda el gesto y lo que se decidió', () => {
        const grabador = createGrabador();
        grabador.encender();
        const handlers = grabador.envolver({ onPointerDown() {}, onPointerUp() {}, getWidth: () => 400 });
        handlers.onPointerDown({ clientX: 370, clientY: 300, timeStamp: 10, width: 14, height: 16 });
        grabador.decision('next');
        handlers.onPointerUp({ clientX: 370, clientY: 300, timeStamp: 90 });
        vi.advanceTimersByTime(1);
        const [traza] = JSON.parse(grabador.exportar());
        expect(traza.eventos.map((e) => e.tipo)).toEqual(['onPointerDown', 'onPointerUp']);
        expect(traza.eventos[1].t).toBe(80);
        expect(traza.decisiones).toEqual(['next']);
        expect(traza.ancho).toBe(400);
    });
});
