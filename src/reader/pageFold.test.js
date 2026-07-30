import { describe, it, expect } from 'vitest';
import {
    foldPosition, flatClip, backClip, backOrigin, backShade, castShadow, foldState,
} from './pageFold.js';

const W = 400;

describe('foldPosition', () => {
    it('sin doblar, el doblez está en el borde que se agarra', () => {
        expect(foldPosition(0, W, 'next')).toBe(W);
        expect(foldPosition(0, W, 'prev')).toBe(0);
    });

    it('con la hoja vuelta del todo, llega al otro borde', () => {
        expect(foldPosition(1, W, 'next')).toBe(0);
        expect(foldPosition(1, W, 'prev')).toBe(W);
    });

    it('viaja de forma continua', () => {
        let previous = foldPosition(0, W, 'next');
        for (const t of [0.2, 0.4, 0.6, 0.8, 1]) {
            const current = foldPosition(t, W, 'next');
            expect(current).toBeLessThan(previous);
            previous = current;
        }
    });

    it('cae en píxeles enteros', () => {
        // Media unidad coloca cada letra a mitad de píxel y el texto se redibuja
        // distinto en cada fotograma.
        for (const t of [0.13, 0.37, 0.66, 0.91]) {
            expect(Number.isInteger(foldPosition(t, 397, 'next'))).toBe(true);
        }
    });

    it('recorta el progreso fuera de rango', () => {
        // El arrastre con goma en el borde del libro puede pasar de 1.
        expect(foldPosition(1.7, W, 'next')).toBe(0);
        expect(foldPosition(-0.5, W, 'next')).toBe(W);
    });
});

describe('flatClip', () => {
    it('avanzando deja visible lo que hay a la izquierda del doblez', () => {
        // Con el doblez al 25 %, se recortan los otros tres cuartos.
        expect(flatClip(100, W, 'next')).toBe('inset(0 300px 0 0)');
    });

    it('retrocediendo, al contrario', () => {
        expect(flatClip(100, W, 'prev')).toBe('inset(0 0 0 100px)');
    });

    it('nunca produce un recorte negativo', () => {
        // Un inset negativo agranda el elemento en vez de recortarlo: la hoja
        // asomaría por fuera de la página.
        expect(flatClip(500, W, 'next')).toContain('0px 0 0');
    });
});

describe('backClip y backOrigin', () => {
    it('el reflejo se ancla en la línea del doblez', () => {
        // Es lo que hace que el espejo sea exacto: el papel se pliega por ahí.
        expect(backOrigin(137)).toBe('137px center');
    });

    it('el dorso no asoma por el borde de la hoja', () => {
        // Sin recorte se vería texto invertido donde no hay papel doblado.
        const clip = backClip(300, W, 'next');
        expect(clip).toMatch(/^inset\(/);
        expect(clip).not.toContain('-');
    });

    it('con la hoja sin doblar el dorso no ocupa nada', () => {
        expect(backClip(W, W, 'next')).toBe('inset(0 0px 0 0px)');
    });
});

describe('backShade', () => {
    it('la sombra del dorso crece al empezar a doblar', () => {
        expect(backShade(0, 'next').opacity).toBe(0);
        expect(backShade(0.2, 'next').opacity).toBeGreaterThan(0);
    });

    it('se estabiliza en vez de seguir oscureciendo', () => {
        // Pasado el punto en que el pliegue se ha separado, más sombra solo
        // taparía el texto del dorso.
        expect(backShade(0.5, 'next').opacity).toBe(1);
        expect(backShade(1, 'next').opacity).toBe(1);
    });

    it('el degradado sale del doblez, no del borde libre', () => {
        // Junto al doblez no entra luz; hacia la punta va aclarándose.
        expect(backShade(0.5, 'next').gradient).toContain('to left');
        expect(backShade(0.5, 'prev').gradient).toContain('to right');
    });
});

describe('castShadow', () => {
    it('cae al otro lado del doblez, sobre la página nueva', () => {
        expect(castShadow(200, 'next').left).toBe(200);
        // Retrocediendo va por delante del doblez.
        expect(castShadow(200, 'prev').left).toBeLessThan(200);
    });

    it('es una banda estrecha: una amplia parece niebla', () => {
        expect(castShadow(200, 'next').width).toBeLessThanOrEqual(32);
    });
});

describe('foldState', () => {
    it('las cinco piezas salen del mismo doblez', () => {
        // Calculadas por separado, un redondeo distinto deja una costura de un
        // píxel justo en el doblez, visible como una línea clara.
        const state = foldState(0.4, 397, 'next');
        expect(state.flatClip).toContain(`${397 - state.foldX}px`);
        expect(state.backOrigin).toBe(`${state.foldX}px center`);
        expect(state.shadow.left).toBe(state.foldX);
    });

    it('a progreso cero no hay nada que pintar', () => {
        expect(foldState(0, W, 'next').visible).toBe(false);
    });

    it('en cuanto se mueve el dedo, sí', () => {
        expect(foldState(0.01, W, 'next').visible).toBe(true);
    });

    it('el reflejo es un espejo, no una rotación', () => {
        // Un `rotateY` daría una puerta girando; `scaleX(-1)` sobre la línea del
        // doblez es literalmente lo que hace el papel.
        expect(foldState(0.5, W, 'next').backTransform).toContain('scaleX(-1)');
    });
});
