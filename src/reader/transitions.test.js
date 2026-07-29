import { describe, it, expect } from 'vitest';
import {
    PAGE_TRANSITIONS, DEFAULT_TRANSITION,
    transitionClass, transitionDuration, runTransition,
} from './transitions.js';

/** Elemento de mentira con la misma API que usa runTransition. */
const fakeElement = () => {
    const list = new Set();
    return {
        offsetWidth: 100,
        classList: {
            add: (...names) => names.forEach((name) => list.add(name)),
            remove: (...names) => names.forEach((name) => list.delete(name)),
            contains: (name) => list.has(name),
        },
        _classes: list,
    };
};

describe('catálogo de transiciones', () => {
    it('la opción por defecto existe', () => {
        expect(PAGE_TRANSITIONS[DEFAULT_TRANSITION]).toBeTruthy();
    });

    it('todas tienen etiqueta, descripción y duración', () => {
        Object.entries(PAGE_TRANSITIONS).forEach(([id, transition]) => {
            expect(transition.label, id).toBeTruthy();
            expect(transition.description, id).toBeTruthy();
            expect(typeof transition.duration, id).toBe('number');
        });
    });

    it('«ninguna» dura cero: es la opción para móviles lentos', () => {
        expect(PAGE_TRANSITIONS.none.duration).toBe(0);
    });

    it('ninguna dura tanto como para estorbar al pasar páginas seguidas', () => {
        Object.values(PAGE_TRANSITIONS).forEach((transition) => {
            expect(transition.duration).toBeLessThanOrEqual(320);
        });
    });
});

describe('clases CSS', () => {
    it('incluye la transición y la dirección', () => {
        expect(transitionClass('slide', 'next')).toBe('turn turn-slide turn-next');
        expect(transitionClass('fade', 'prev')).toBe('turn turn-fade turn-prev');
    });

    it('«ninguna» no genera clase', () => {
        expect(transitionClass('none', 'next')).toBe('');
    });

    it('un id desconocido no genera clase en vez de romper', () => {
        expect(transitionClass('inventada', 'next')).toBe('');
        expect(transitionClass(null, 'next')).toBe('');
    });
});

describe('ejecución', () => {
    it('añade las clases al elemento', () => {
        const element = fakeElement();
        runTransition(element, 'slide', 'next');

        expect(element.classList.contains('turn')).toBe(true);
        expect(element.classList.contains('turn-slide')).toBe(true);
        expect(element.classList.contains('turn-next')).toBe(true);
    });

    it('limpia las clases de una animación anterior antes de empezar', () => {
        const element = fakeElement();
        runTransition(element, 'slide', 'next');
        runTransition(element, 'fade', 'prev');

        expect(element.classList.contains('turn-slide')).toBe(false);
        expect(element.classList.contains('turn-next')).toBe(false);
        expect(element.classList.contains('turn-fade')).toBe(true);
        expect(element.classList.contains('turn-prev')).toBe(true);
    });

    it('la limpieza devuelta quita las clases', () => {
        const element = fakeElement();
        const cleanup = runTransition(element, 'push', 'next');
        cleanup();
        expect(element.classList.contains('turn-push')).toBe(false);
    });

    it('sin elemento no lanza', () => {
        expect(() => runTransition(null, 'slide', 'next')).not.toThrow();
    });

    it('con «ninguna» no toca el elemento', () => {
        const element = fakeElement();
        runTransition(element, 'none', 'next');
        expect(element._classes.size).toBe(0);
    });

    it('la duración conocida se usa para retirar la clase', () => {
        expect(transitionDuration('slide')).toBe(PAGE_TRANSITIONS.slide.duration);
        expect(transitionDuration('inventada')).toBe(0);
    });
});
