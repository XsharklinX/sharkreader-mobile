import { describe, it, expect } from 'vitest';
import {
    foldPosition, flatClip, backClip, shadeClip, backOrigin, backShade, castShadow, crease, foldState,
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

    it('el dorso es exactamente la otra mitad de la hoja', () => {
        // **Este es el test que faltaba y por eso el pliegue se veía horrible.**
        // El recorte se aplica antes de reflejar, así que aquí se elige qué trozo
        // de página se dobla. Se recortaba el mismo trozo que sigue plano, y al
        // reflejarlo caía sobre la página nueva: texto al revés donde tenía que
        // estar la página siguiente, y una banda ilegible junto al doblez.
        //
        // Plana queda [0, foldX]; doblada, [foldX, W]. Juntas, la hoja entera y
        // ni un píxel compartido.
        expect(flatClip(300, W, 'next')).toBe('inset(0 100px 0 0)');
        expect(backClip(300, W, 'next')).toBe('inset(0 0 0 300px)');
    });

    it('y hacia atrás, al revés', () => {
        expect(flatClip(100, W, 'prev')).toBe('inset(0 0 0 100px)');
        expect(backClip(100, W, 'prev')).toBe('inset(0 300px 0 0)');
    });

    it('con la hoja sin doblar el dorso no ocupa nada', () => {
        // El doblez en el borde derecho: no hay nada al otro lado que doblar.
        expect(backClip(W, W, 'next')).toBe('inset(0 0 0 400px)');
    });
});

describe('shadeClip', () => {
    it('la sombra del dorso cae donde cae el papel, no donde estaba', () => {
        // El dorso se refleja; su sombra se dibuja encima, ya en coordenadas de
        // pantalla. Con el doblez a 300 de 400, el papel doblado mide 100 y acaba
        // ocupando de 200 a 300.
        expect(shadeClip(300, W, 'next')).toBe('inset(0 100px 0 200px)');
    });

    it('nunca se sale de la hoja', () => {
        // A mitad del gesto el papel doblado llegaría más allá del borde: se
        // recorta en el borde y no se pinta sombra sobre la nada.
        expect(shadeClip(100, W, 'next')).toBe('inset(0 300px 0 0px)');
        expect(shadeClip(300, W, 'prev')).toBe('inset(0 0px 0 300px)');
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

describe('la luz del pliegue según el tema', () => {
    it('en un tema oscuro el dorso se aclara, no se ensombrece', () => {
        // **Medido en el teléfono:** con el degradado negro sobre una página casi
        // negra, entre el dorso y la página nueva había UN nivel de luminancia.
        // Ensombrecer lo que ya está a oscuras no ensombrece nada, y el dorso se
        // veía como texto al revés flotando en vez de como el reverso de una hoja.
        expect(backShade(0.5, 'next', { dark: true }).gradient).toContain('255,255,255');
        expect(backShade(0.5, 'next', { dark: false }).gradient).toContain('rgba(0,0,0');
    });

    it('el filo del doblez está justo en el doblez y es estrecho', () => {
        // Un filo ancho deja de ser un filo y pasa a ser una banda.
        const filo = crease(300);
        expect(filo.left).toBe(299);
        expect(filo.width).toBe(3);
    });

    it('el filo también cambia de color con el tema', () => {
        expect(crease(300, { dark: true }).gradient).toContain('255,255,255');
        expect(crease(300, { dark: false }).gradient).toContain('rgba(0,0,0');
    });

    it('el estado completo lleva el filo', () => {
        const state = foldState(0.5, 400, 'next', { dark: true });
        expect(state.crease.left).toBe(state.foldX - 1);
    });
});
