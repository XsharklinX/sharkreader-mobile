import { describe, it, expect } from 'vitest';
import {
    curlState, shadeGradient, underState, MAX_ANGLE, SLIDE_FRACTION,
} from './pageCurl.js';

const W = 400;

const angleOf = (transform) =>
    Number(transform.match(/rotateY\((-?[\d.]+)deg\)/)?.[1]);

const slideOf = (transform) =>
    Number(transform.match(/translate3d\((-?[\d.]+)px/)?.[1]);

describe('curlState', () => {
    it('en reposo la hoja está en su sitio', () => {
        const state = curlState(0, 'next', W);
        expect(angleOf(state.transform)).toBe(0);
        expect(slideOf(state.transform)).toBe(0);
        expect(state.shade).toBe(0);
    });

    it('avanzando gira sobre el borde izquierdo', () => {
        // Es el eje del cuaderno: la hoja se levanta por el borde derecho.
        expect(curlState(1, 'next', W).origin).toBe('left center');
        expect(curlState(1, 'prev', W).origin).toBe('right center');
    });

    it('el giro va en sentidos opuestos según se avance o se retroceda', () => {
        expect(angleOf(curlState(1, 'next', W).transform)).toBeLessThan(0);
        expect(angleOf(curlState(1, 'prev', W).transform)).toBeGreaterThan(0);
    });

    it('no llega a los 90 grados: la hoja quedaría de canto', () => {
        // A 90 la hoja desaparece y el usuario ve un hueco.
        expect(Math.abs(angleOf(curlState(1, 'next', W).transform))).toBe(MAX_ANGLE);
        expect(MAX_ANGLE).toBeLessThan(90);
    });

    it('el desplazamiento cae en píxeles enteros', () => {
        // Misma razón que en el arrastre: media unidad coloca cada letra a mitad
        // de píxel y el texto se redibuja distinto en cada fotograma.
        for (const progress of [0.13, 0.37, 0.5, 0.66, 0.91, 1]) {
            const slide = slideOf(curlState(progress, 'next', 397).transform);
            expect(Number.isInteger(slide), String(progress)).toBe(true);
        }
    });

    it('además de girar, la hoja se separa del cuaderno', () => {
        // Solo con giro el movimiento se lee como una puerta, no como papel.
        const slide = Math.abs(slideOf(curlState(1, 'next', W).transform));
        expect(slide).toBe(Math.round(W * SLIDE_FRACTION));
    });

    it('la resistencia inicial es lo que lo hace parecer papel', () => {
        // Con una curva lineal parece una animación de menú: la hoja tiene que
        // costar al principio y irse sola al final.
        const early = Math.abs(angleOf(curlState(0.2, 'next', W).transform));
        const linear = MAX_ANGLE * 0.2;
        expect(early).toBeLessThan(linear);
    });

    it('la sombra crece con el ángulo pero no apaga la página', () => {
        expect(curlState(0.5, 'next', W).shade)
            .toBeLessThan(curlState(1, 'next', W).shade);
        expect(curlState(1, 'next', W).shade).toBeLessThan(0.7);
    });

    it('recorta el progreso fuera de rango en vez de deformarse', () => {
        // El arrastre con goma en el borde del libro puede pasar de 1.
        expect(angleOf(curlState(1.8, 'next', W).transform))
            .toBe(angleOf(curlState(1, 'next', W).transform));
        expect(angleOf(curlState(-0.4, 'next', W).transform)).toBe(0);
    });

    it('sin ancho conocido gira pero no se desplaza', () => {
        const state = curlState(1, 'next', 0);
        expect(slideOf(state.transform)).toBe(0);
        expect(Math.abs(angleOf(state.transform))).toBe(MAX_ANGLE);
    });

    it('el progreso avanza de forma monótona', () => {
        let previous = 0;
        for (const progress of [0.1, 0.25, 0.4, 0.6, 0.8, 1]) {
            const angle = Math.abs(angleOf(curlState(progress, 'next', W).transform));
            expect(angle).toBeGreaterThan(previous);
            previous = angle;
        }
    });
});

describe('shadeGradient', () => {
    it('la sombra sale del pliegue, no del borde libre', () => {
        // El papel está más oscuro junto al doblez, donde no entra la luz.
        expect(shadeGradient('next')).toContain('to right');
        expect(shadeGradient('prev')).toContain('to left');
    });

    it('acaba en transparente para no oscurecer media página', () => {
        expect(shadeGradient('next')).toContain('rgba(0,0,0,0)');
    });
});

describe('underState', () => {
    it('la hoja de debajo apenas se mueve', () => {
        // En un libro de verdad la de debajo está quieta; lo que se mueve es la
        // de encima.
        const start = underState(0);
        expect(start.transform).toContain('scale(0.988');
        expect(underState(1).transform).toContain('scale(1');
    });

    it('se destapa a medida que la de encima se va', () => {
        expect(underState(0).shade).toBeGreaterThan(underState(1).shade);
        expect(underState(1).shade).toBe(0);
    });
});
