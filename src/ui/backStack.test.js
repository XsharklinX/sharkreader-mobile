import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pushBackHandler, runBack, resetBackStack, backStackDepth } from './backStack.js';

beforeEach(resetBackStack);

describe('backStack', () => {
    it('llama solo al de arriba', () => {
        // Este es el fallo original: Capacitor entrega el evento a todos los
        // oyentes, así que atrás con el índice abierto cerraba el índice y
        // además salía del libro.
        const bottom = vi.fn(() => true);
        const top = vi.fn(() => true);
        pushBackHandler(bottom);
        pushBackHandler(top);

        expect(runBack()).toBe(true);
        expect(top).toHaveBeenCalledOnce();
        expect(bottom).not.toHaveBeenCalled();
    });

    it('deja pasar al de abajo si el de arriba no lo consume', () => {
        const bottom = vi.fn(() => true);
        const top = vi.fn(() => false);
        pushBackHandler(bottom);
        pushBackHandler(top);

        expect(runBack()).toBe(true);
        expect(top).toHaveBeenCalledOnce();
        expect(bottom).toHaveBeenCalledOnce();
    });

    it('avisa cuando nadie lo atiende, para poder salir de la app', () => {
        pushBackHandler(() => false);
        expect(runBack()).toBe(false);
    });

    it('funciona con la pila vacía', () => {
        expect(runBack()).toBe(false);
    });

    it('trata un retorno indefinido como no consumido', () => {
        // Olvidar el `return true` no puede tragarse el atrás en silencio: se
        // quedaría la app sin forma de salir.
        const handler = vi.fn(() => {});
        pushBackHandler(handler);
        expect(runBack()).toBe(false);
    });

    it('la baja quita solo su entrada', () => {
        const first = vi.fn(() => true);
        const second = vi.fn(() => true);
        pushBackHandler(first);
        const removeSecond = pushBackHandler(second);

        removeSecond();
        expect(backStackDepth()).toBe(1);
        runBack();
        expect(first).toHaveBeenCalledOnce();
        expect(second).not.toHaveBeenCalled();
    });

    it('darse de baja dos veces no quita la de otro', () => {
        const first = vi.fn(() => true);
        pushBackHandler(first);
        const remove = pushBackHandler(() => true);
        remove();
        remove();
        expect(backStackDepth()).toBe(1);
    });
});
