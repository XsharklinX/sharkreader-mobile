import { describe, it, expect } from 'vitest';
import { geometriaPliegue, esquinaPara, recorridoDeToque, confirma } from './pliegueGeometria.js';

/**
 * Comprueba el modelo de verdad: enrollando la esquina sobre el cilindro y
 * tumbando lo que sobra, ¿cae donde está el dedo?
 */
const dondeCaeLaEsquina = (c, g) => {
    const u = (c.x - g.lx) * g.nx + (c.y - g.ly) * g.ny; // distancia desenrollada
    // Más allá de media vuelta, la hoja queda tumbada: d = -(u - πr).
    const d = -(u - Math.PI * g.r);
    // Proyección del punto sobre la línea, más d en la dirección n.
    const t = { x: c.x - u * g.nx, y: c.y - u * g.ny };
    return { x: t.x + d * g.nx, y: t.y + d * g.ny };
};

describe('geometriaPliegue', () => {
    it('la esquina levantada queda bajo el dedo', () => {
        const c = { x: 400, y: 800 };
        const f = { x: 220, y: 650 };
        const g = geometriaPliegue(f, c, 400);
        const cae = dondeCaeLaEsquina(c, g);
        expect(cae.x).toBeCloseTo(f.x, 6);
        expect(cae.y).toBeCloseTo(f.y, 6);
    });

    it('la dirección apunta hacia la esquina y es unitaria', () => {
        const g = geometriaPliegue({ x: 200, y: 800 }, { x: 400, y: 800 }, 400);
        expect(g.nx).toBeCloseTo(1);
        expect(Math.hypot(g.nx, g.ny)).toBeCloseTo(1);
    });

    it('al empezar, el rollo es fino: no puede ser más gordo que lo levantado', () => {
        const g = geometriaPliegue({ x: 395, y: 800 }, { x: 400, y: 800 }, 400);
        expect(g.r).toBeLessThan(2);
    });

    it('con el dedo encima de la esquina no se rompe', () => {
        const g = geometriaPliegue({ x: 400, y: 800 }, { x: 400, y: 800 }, 400);
        expect(Number.isFinite(g.lx) && Number.isFinite(g.r)).toBe(true);
    });
});

describe('esquina, recorrido y confirmación', () => {
    it('levanta la esquina del lado donde empezó el dedo', () => {
        expect(esquinaPara(100, 800)).toEqual({ x: 1, y: 0 });
        expect(esquinaPara(700, 800)).toEqual({ x: 1, y: 1 });
    });

    it('el recorrido del toque empieza en la esquina y acaba fuera por la izquierda', () => {
        const esquina = { x: 1, y: 1 };
        expect(recorridoDeToque(0, 400, 800, esquina)).toEqual({ x: 400, y: 800 });
        expect(recorridoDeToque(1, 400, 800, esquina).x).toBeLessThan(-400);
    });

    it('pasa página más allá de la mitad o con un golpe', () => {
        expect(confirma({ x: 150 }, 400)).toBe(true);
        expect(confirma({ x: 300 }, 400)).toBe(false);
        expect(confirma({ x: 300 }, 400, -1)).toBe(true);
    });
});
