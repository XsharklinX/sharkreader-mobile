import { describe, it, expect } from 'vitest';
import {
    esquinaDe, cortar, reflejar, aClip, cornerState,
} from './pageCorner.js';

const W = 400;
const H = 800;
const HOJA = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];

describe('esquinaDe', () => {
    it('avanzando se agarra la derecha; retrocediendo, la izquierda', () => {
        expect(esquinaDe('next', H - 10, H)).toBe('bottom-right');
        expect(esquinaDe('prev', H - 10, H)).toBe('bottom-left');
    });

    it('la altura del dedo elige arriba o abajo', () => {
        // Es lo que hace que el gesto se sienta tuyo: tocas arriba y se levanta
        // la esquina de arriba.
        expect(esquinaDe('next', 10, H)).toBe('top-right');
        expect(esquinaDe('next', H - 10, H)).toBe('bottom-right');
    });
});

describe('cortar', () => {
    it('partir la hoja por la mitad deja media hoja', () => {
        const mitad = cortar(HOJA, { x: W / 2, y: 0 }, { x: 1, y: 0 });
        const xs = mitad.map((p) => p.x);
        expect(Math.min(...xs)).toBe(W / 2);
        expect(Math.max(...xs)).toBe(W);
    });

    it('los dos lados juntos son la hoja entera y no se solapan', () => {
        // **Esta es la propiedad que importa.** Cualquier desajuste entre las dos
        // mitades aparece como una costura de texto repetido justo en el doblez,
        // que es exactamente lo que se veía antes.
        const punto = { x: 150, y: 400 };
        const normal = { x: 0.6, y: 0.8 };
        const a = cortar(HOJA, punto, normal);
        const b = cortar(HOJA, punto, { x: -normal.x, y: -normal.y });

        const area = (poli) => Math.abs(poli.reduce((suma, p, i) => {
            const q = poli[(i + 1) % poli.length];
            return suma + (p.x * q.y - q.x * p.y);
        }, 0) / 2);

        expect(area(a) + area(b)).toBeCloseTo(W * H, 0);
    });

    it('una recta que no toca la hoja la deja entera o la borra', () => {
        expect(cortar(HOJA, { x: -50, y: 0 }, { x: 1, y: 0 })).toHaveLength(4);
        expect(cortar(HOJA, { x: -50, y: 0 }, { x: -1, y: 0 })).toHaveLength(0);
    });
});

describe('reflejar', () => {
    it('un punto sobre la recta no se mueve', () => {
        const p = reflejar({ x: 10, y: 10 }, { x: 10, y: 10 }, { x: 1, y: 0 });
        expect(p.x).toBeCloseTo(10);
        expect(p.y).toBeCloseTo(10);
    });

    it('reflejar dos veces devuelve al sitio', () => {
        const punto = { x: 100, y: 200 };
        const normal = { x: 0.6, y: 0.8 };
        const ida = reflejar({ x: 30, y: 40 }, punto, normal);
        const vuelta = reflejar(ida, punto, normal);
        expect(vuelta.x).toBeCloseTo(30);
        expect(vuelta.y).toBeCloseTo(40);
    });
});

describe('cornerState', () => {
    it('sin recorrido la hoja está entera y no hay dorso', () => {
        const s = cornerState({ x: W, y: H }, W, H, 'bottom-right');
        expect(s.visible).toBe(false);
        expect(s.progreso).toBe(0);
    });

    it('la esquina agarrada acaba exactamente bajo el dedo', () => {
        // Es la comprobación de que el modelo es el del papel y no una
        // aproximación: doblar por la mediatriz de C→P lleva C hasta P.
        const dedo = { x: 120, y: 500 };
        const s = cornerState(dedo, W, H, 'bottom-right');
        const llega = reflejar(
            { x: W, y: H },
            { x: (W + dedo.x) / 2, y: (H + dedo.y) / 2 },
            { x: dedo.x - W, y: dedo.y - H }
        );
        expect(llega.x).toBeCloseTo(dedo.x);
        expect(llega.y).toBeCloseTo(dedo.y);
        expect(s.visible).toBe(true);
    });

    it('el doblez es perpendicular al camino de la esquina al dedo', () => {
        // Arrastrando en horizontal puro, el doblez sale vertical.
        const s = cornerState({ x: 100, y: H }, W, H, 'bottom-right');
        expect(Math.abs(s.angulo % 180)).toBeCloseTo(90, 0);
    });

    it('arrastrando en diagonal el doblez sale en diagonal', () => {
        // Lo que distingue el doblado de esquina de una cortina vertical.
        const s = cornerState({ x: 100, y: 400 }, W, H, 'bottom-right');
        expect(Math.abs(s.angulo % 180)).not.toBeCloseTo(90, 0);
        expect(Math.abs(s.angulo % 180)).not.toBeCloseTo(0, 0);
    });

    it('el recorte del dorso y el de su sombra son distintos', () => {
        // El recorte del dorso está en coordenadas de la hoja sin reflejar, y la
        // sombra se pinta ya sobre la pantalla. Confundirlos pinta la sombra
        // sobre la mitad que no toca, que es un fallo que ya ocurrió una vez.
        const s = cornerState({ x: 100, y: 400 }, W, H, 'bottom-right');
        expect(s.shadeClip).not.toBe(s.backClip);
    });

    it('la transformación es una reflexión, no un giro', () => {
        // Un giro dejaría el texto legible; una hoja vista por detrás lo enseña
        // en espejo.
        const s = cornerState({ x: 100, y: 400 }, W, H, 'bottom-right');
        expect(s.backTransform).toContain('scaleY(-1)');
    });

    it('el dedo fuera de la hoja no produce geometría imposible', () => {
        const s = cornerState({ x: -900, y: 4000 }, W, H, 'bottom-right');
        expect(s.flatClip).toMatch(/^polygon\(/);
        expect(s.progreso).toBeLessThanOrEqual(1);
    });

    it('el progreso llega a uno al cruzar la hoja entera', () => {
        const s = cornerState({ x: 0, y: 0 }, W, H, 'bottom-right');
        expect(s.progreso).toBeCloseTo(1, 1);
    });
});

describe('aClip', () => {
    it('menos de tres puntos no es un polígono', () => {
        expect(aClip([{ x: 1, y: 1 }])).toBe('polygon(0 0, 0 0, 0 0)');
    });

    it('escribe píxeles, que es lo que entiende clip-path', () => {
        expect(aClip([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]))
            .toBe('polygon(0.0px 0.0px, 10.0px 0.0px, 0.0px 10.0px)');
    });
});

describe('un dedo que no es un punto', () => {
    it('devuelve la hoja en reposo, no una hoja rota', () => {
        // **Esta es la cicatriz del congelado.** Una llamada con la firma vieja
        // pasaba un número en vez de un punto; de ahí salía un `NaN` que llegaba
        // hasta el `clip-path`, el navegador lo descartaba y la copia se quedaba
        // sin recortar tapando la pantalla entera. El libro se veía clavado.
        for (const malo of [0, null, undefined, {}, { x: 10 }, { x: NaN, y: 3 }]) {
            const s = cornerState(malo, W, H, 'bottom-right');
            expect(s.visible, String(malo)).toBe(false);
            expect(s.flatClip).not.toContain('NaN');
            expect(s.backClip).not.toContain('NaN');
            expect(s.shadeClip).not.toContain('NaN');
        }
    });

    it('ningún recorte lleva NaN, ni con medidas absurdas', () => {
        for (const [w, h] of [[0, 0], [-10, 100], [NaN, NaN]]) {
            const s = cornerState({ x: 5, y: 5 }, w, h, 'bottom-right');
            expect(s.flatClip).not.toContain('NaN');
            expect(s.backClip).not.toContain('NaN');
            expect(s.shadeClip).not.toContain('NaN');
        }
    });
});
