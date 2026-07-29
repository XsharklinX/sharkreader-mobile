import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGestureHandlers, zoneAt, GESTURE_CONSTANTS } from './useGestures.js';

const WIDTH = 400;

const event = (x, y = 300) => ({
    clientX: x,
    clientY: y,
    currentTarget: { clientWidth: WIDTH },
});

const setup = () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    const onToggleChrome = vi.fn();
    const handlers = createGestureHandlers({ onNext, onPrev, onToggleChrome });
    return { handlers, onNext, onPrev, onToggleChrome };
};

describe('zoneAt', () => {
    it('reparte la pantalla en anterior, controles y siguiente', () => {
        expect(zoneAt(20, WIDTH)).toBe('prev');
        expect(zoneAt(200, WIDTH)).toBe('chrome');
        expect(zoneAt(380, WIDTH)).toBe('next');
    });

    it('el centro es la zona más ancha', () => {
        const lateral = GESTURE_CONSTANTS.TAP_ZONE * 2;
        expect(1 - lateral).toBeGreaterThan(lateral / 2);
    });
});

describe('toques', () => {
    beforeEach(() => { vi.useRealTimers(); });

    it('un toque a la derecha pasa a la página siguiente', () => {
        const { handlers, onNext } = setup();
        handlers.onPointerDown(event(380));
        handlers.onPointerUp(event(380));
        expect(onNext).toHaveBeenCalledOnce();
    });

    it('un toque a la izquierda vuelve atrás', () => {
        const { handlers, onPrev } = setup();
        handlers.onPointerDown(event(20));
        handlers.onPointerUp(event(20));
        expect(onPrev).toHaveBeenCalledOnce();
    });

    it('un toque en el centro muestra u oculta los controles', () => {
        const { handlers, onToggleChrome, onNext, onPrev } = setup();
        handlers.onPointerDown(event(200));
        handlers.onPointerUp(event(200));
        expect(onToggleChrome).toHaveBeenCalledOnce();
        expect(onNext).not.toHaveBeenCalled();
        expect(onPrev).not.toHaveBeenCalled();
    });
});

describe('deslizamientos', () => {
    it('deslizar a la izquierda avanza', () => {
        const { handlers, onNext } = setup();
        handlers.onPointerDown(event(300));
        handlers.onPointerUp(event(200));
        expect(onNext).toHaveBeenCalledOnce();
    });

    it('deslizar a la derecha retrocede', () => {
        const { handlers, onPrev } = setup();
        handlers.onPointerDown(event(100));
        handlers.onPointerUp(event(220));
        expect(onPrev).toHaveBeenCalledOnce();
    });

    it('un movimiento vertical no pasa página', () => {
        const { handlers, onNext, onPrev, onToggleChrome } = setup();
        handlers.onPointerDown(event(200, 500));
        handlers.onPointerUp(event(210, 200));
        expect(onNext).not.toHaveBeenCalled();
        expect(onPrev).not.toHaveBeenCalled();
        expect(onToggleChrome).not.toHaveBeenCalled();
    });

    it('un arrastre corto no cuenta como deslizamiento ni como toque', () => {
        const { handlers, onNext, onToggleChrome } = setup();
        handlers.onPointerDown(event(200));
        handlers.onPointerUp(event(225));
        expect(onNext).not.toHaveBeenCalled();
        expect(onToggleChrome).not.toHaveBeenCalled();
    });

    it('cancelar el gesto no dispara nada', () => {
        const { handlers, onNext, onToggleChrome } = setup();
        handlers.onPointerDown(event(380));
        handlers.onPointerCancel();
        handlers.onPointerUp(event(380));
        expect(onNext).not.toHaveBeenCalled();
        expect(onToggleChrome).not.toHaveBeenCalled();
    });
});

describe('pulsación larga', () => {
    it('dispara el subrayado y anula el paso de página', () => {
        vi.useFakeTimers();
        const onLongPress = vi.fn();
        const onNext = vi.fn();
        const handlers = createGestureHandlers({
            onNext, onPrev: vi.fn(), onToggleChrome: vi.fn(), onLongPress,
        });

        handlers.onPointerDown(event(380));
        vi.advanceTimersByTime(GESTURE_CONSTANTS.LONG_PRESS_MS + 10);
        handlers.onPointerUp(event(380));

        expect(onLongPress).toHaveBeenCalledOnce();
        expect(onNext).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it('soltar antes de tiempo pasa página con normalidad', () => {
        vi.useFakeTimers();
        const onLongPress = vi.fn();
        const onNext = vi.fn();
        const handlers = createGestureHandlers({
            onNext, onPrev: vi.fn(), onToggleChrome: vi.fn(), onLongPress,
        });

        handlers.onPointerDown(event(380));
        vi.advanceTimersByTime(100);
        handlers.onPointerUp(event(380));

        expect(onLongPress).not.toHaveBeenCalled();
        expect(onNext).toHaveBeenCalledOnce();
        vi.useRealTimers();
    });
});

describe('convivencia con la selección de texto', () => {
    it('un toque con texto seleccionado no pasa página', () => {
        const onNext = vi.fn();
        const onToggleChrome = vi.fn();
        const handlers = createGestureHandlers({
            onNext,
            onPrev: vi.fn(),
            onToggleChrome,
            shouldIgnore: () => true,
        });

        handlers.onPointerDown(event(380));
        handlers.onPointerUp(event(380));

        expect(onNext).not.toHaveBeenCalled();
        expect(onToggleChrome).not.toHaveBeenCalled();
    });

    it('sin selección activa el gesto funciona con normalidad', () => {
        const onNext = vi.fn();
        const handlers = createGestureHandlers({
            onNext,
            onPrev: vi.fn(),
            onToggleChrome: vi.fn(),
            shouldIgnore: () => false,
        });

        handlers.onPointerDown(event(380));
        handlers.onPointerUp(event(380));

        expect(onNext).toHaveBeenCalledOnce();
    });

    it('getWidth manda sobre el ancho del elemento, para eventos dentro del iframe', () => {
        const onPrev = vi.fn();
        const handlers = createGestureHandlers({
            onNext: vi.fn(),
            onPrev,
            onToggleChrome: vi.fn(),
            // El documento del iframe no tiene clientWidth: sin getWidth, un
            // toque en x=100 se compararía contra window.innerWidth.
            getWidth: () => 1000,
        });

        // x=100 sobre 1000 px cae en la zona izquierda (<28%).
        handlers.onPointerDown({ clientX: 100, clientY: 300, currentTarget: {} });
        handlers.onPointerUp({ clientX: 100, clientY: 300, currentTarget: {} });

        expect(onPrev).toHaveBeenCalledOnce();
    });
});
