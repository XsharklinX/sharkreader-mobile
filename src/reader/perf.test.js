import { describe, it, expect, beforeEach, vi } from 'vitest';
import { medir, midiendo, iniciar, resumen, tabla, exponer } from './perf.js';

describe('resumen', () => {
    it('da mediana y percentil 95, no media', () => {
        // La media miente: un solo tirón sube el número entero y parece que todo
        // va mal. Lo que se quiere saber es cómo va normalmente y cómo va cuando
        // va mal, y son dos preguntas distintas.
        const medidas = [...Array(19).fill(50), 900];
        const r = resumen(medidas);
        expect(r.mediana).toBe(50);
        expect(r.peor).toBe(900);
        expect(r.veces).toBe(20);
    });

    it('sin medidas no inventa nada', () => {
        expect(resumen([])).toBeNull();
        expect(resumen(undefined)).toBeNull();
    });

    it('con una sola medida los tres números coinciden', () => {
        expect(resumen([120])).toEqual({ veces: 1, mediana: 120, p95: 120, peor: 120 });
    });
});

describe('el cronómetro', () => {
    beforeEach(() => {
        medir(false);
        // Los dos fotogramas se resuelven al momento: lo que se prueba es la
        // contabilidad, no el calendario del navegador.
        vi.stubGlobal('requestAnimationFrame', (fn) => { fn(); return 0; });
    });

    it('apagado no guarda nada y no cuesta nada', () => {
        const fin = iniciar('pasar');
        fin();
        expect(tabla()).toEqual({});
        expect(midiendo()).toBe(false);
    });

    it('encendido guarda una medida por cierre', () => {
        medir(true);
        iniciar('pasar')();
        iniciar('pasar')();
        expect(tabla().pasar.veces).toBe(2);
    });

    it('cerrar dos veces cuenta una sola', () => {
        // Pasar página puede terminar por varios caminos —el gesto, el
        // temporizador de seguridad—. Contar el segundo daría una medida
        // absurdamente larga que ensucia la mediana.
        medir(true);
        const fin = iniciar('pasar');
        fin();
        fin();
        expect(tabla().pasar.veces).toBe(1);
    });

    it('apagar vacía lo medido', () => {
        medir(true);
        iniciar('abrir')();
        medir(false);
        expect(tabla()).toEqual({});
    });
});

describe('exponer', () => {
    it('deja el cronómetro a mano en la ventana', () => {
        // En el teléfono no hay consola interactiva; `adb logcat` sí recoge lo
        // que la app escribe, así que esta es la vía para leer las medidas.
        const ventana = {};
        exponer(ventana);
        expect(typeof ventana.__perf.log).toBe('function');
        expect(typeof ventana.__perf.medir).toBe('function');
    });

    it('sin ventana no revienta', () => {
        expect(() => exponer(null)).not.toThrow();
    });
});
