import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGestureHandlers, zoneAt, tapZoneWidth, GESTURE_CONSTANTS } from './useGestures.js';

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

    it('el centro ocupa la mayor parte de la pantalla', () => {
        // Con zonas laterales del 28 % el centro percibido caía dentro de la
        // zona de paso de página: tocar un poco a la izquierda del medio
        // retrocedía. El centro tiene que ser inequívocamente el centro.
        const lateral = GESTURE_CONSTANTS.TAP_ZONE * 2;
        expect(1 - lateral).toBeGreaterThan(0.6);
    });

    it('un toque justo a la izquierda del centro no pasa página', () => {
        expect(zoneAt(WIDTH / 2 - 30, WIDTH)).toBe('chrome');
        expect(zoneAt(WIDTH / 2 + 30, WIDTH)).toBe('chrome');
    });

    it('reparte las dos zonas por igual', () => {
        // La izquierda salía más ancha que la derecha porque la x venía del
        // iframe y se dividía entre el ancho del contenedor, más grande.
        const left = zoneAt(tapZoneWidth(WIDTH) - 1, WIDTH);
        const right = zoneAt(WIDTH - tapZoneWidth(WIDTH) + 1, WIDTH);
        expect(left).toBe('prev');
        expect(right).toBe('next');
        expect(zoneAt(tapZoneWidth(WIDTH) + 1, WIDTH)).toBe('chrome');
        expect(zoneAt(WIDTH - tapZoneWidth(WIDTH) - 1, WIDTH)).toBe('chrome');
    });
});

describe('tapZoneWidth', () => {
    it('escala con el ancho en un móvil', () => {
        expect(tapZoneWidth(392)).toBeCloseTo(392 * GESTURE_CONSTANTS.TAP_ZONE, 5);
    });

    it('deja de crecer en una tablet', () => {
        // Un 18 % de 1200 px serían 216 px de banda muerta a cada lado: media
        // pantalla para pasar página. El pulgar mide lo mismo en cualquier
        // pantalla, así que la zona también.
        expect(tapZoneWidth(1200)).toBe(GESTURE_CONSTANTS.TAP_ZONE_MAX_PX);
        expect(tapZoneWidth(1200)).toBeLessThan(1200 * GESTURE_CONSTANTS.TAP_ZONE);
    });

    it('el centro sigue siendo mayoría en una tablet', () => {
        const width = 1200;
        expect(width - tapZoneWidth(width) * 2).toBeGreaterThan(width * 0.7);
    });

    it('no deja la pantalla sin centro en un móvil muy estrecho', () => {
        const width = 320;
        expect(width - tapZoneWidth(width) * 2).toBeGreaterThan(width * 0.6);
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

describe('deslizar sobre texto', () => {
    /**
     * La regresión que rompía deslizar tres versiones seguidas.
     *
     * Al arrastrar el dedo sobre un párrafo, el WebView de Android empieza a
     * seleccionar texto. Como `shouldIgnore` se consultaba al SOLTAR, siempre
     * encontraba selección y descartaba el gesto entero. Los toques seguían
     * funcionando porque un toque no selecciona nada.
     */
    const setupWithSelection = (selectionDuringDrag) => {
        let selected = false;
        const onNext = vi.fn();
        const onPrev = vi.fn();
        const clearSelection = vi.fn(() => { selected = false; });
        const handlers = createGestureHandlers({
            onNext,
            onPrev,
            onToggleChrome: vi.fn(),
            shouldIgnore: () => selected,
            clearSelection,
            getWidth: () => WIDTH,
        });
        return {
            handlers, onNext, onPrev, clearSelection,
            select: () => { selected = selectionDuringDrag; },
        };
    };

    it('pasa página aunque el WebView empiece a seleccionar a mitad del gesto', () => {
        const { handlers, onNext, select } = setupWithSelection(true);

        handlers.onPointerDown(event(300));
        select(); // el WebView selecciona al arrastrar sobre el texto
        handlers.onPointerMove(event(240));
        handlers.onPointerUp(event(200));

        expect(onNext).toHaveBeenCalledOnce();
    });

    it('borra la selección naciente al reclamar el gesto', () => {
        const { handlers, clearSelection } = setupWithSelection(true);
        handlers.onPointerDown(event(300));
        handlers.onPointerMove(event(280));
        expect(clearSelection).toHaveBeenCalled();
    });

    it('no reclama un movimiento vertical', () => {
        // Deslizar hacia abajo en modo desplazamiento tiene que seguir siendo
        // del navegador.
        const { handlers, clearSelection } = setupWithSelection(true);
        handlers.onPointerDown(event(300, 300));
        handlers.onPointerMove(event(302, 380));
        expect(clearSelection).not.toHaveBeenCalled();
    });

    it('respeta una selección que ya existía antes de tocar', () => {
        // Aquí el dedo sí estaba marcando: arrastrar el asa de la selección no
        // debe pasar página.
        let selected = true;
        const onNext = vi.fn();
        const handlers = createGestureHandlers({
            onNext,
            onPrev: vi.fn(),
            onToggleChrome: vi.fn(),
            shouldIgnore: () => selected,
            clearSelection: vi.fn(),
            getWidth: () => WIDTH,
        });

        handlers.onPointerDown(event(300));
        handlers.onPointerMove(event(240));
        handlers.onPointerUp(event(200));

        expect(onNext).not.toHaveBeenCalled();
    });

    it('cancela el evento táctil para que Android no se quede el gesto', () => {
        // Sin `preventDefault` el sistema sigue con lo suyo. Solo funciona
        // porque el oyente se registra con `passive: false`.
        const { handlers } = setupWithSelection(false);
        const preventDefault = vi.fn();

        handlers.onPointerDown(event(300));
        handlers.onTouchMove({
            touches: [{ clientX: 260, clientY: 300 }],
            cancelable: true,
            preventDefault,
        });

        expect(preventDefault).toHaveBeenCalled();
    });

    it('no intenta cancelar un evento que no se puede cancelar', () => {
        const { handlers } = setupWithSelection(false);
        const preventDefault = vi.fn();

        handlers.onPointerDown(event(300));
        handlers.onTouchMove({
            touches: [{ clientX: 260, clientY: 300 }],
            cancelable: false,
            preventDefault,
        });

        expect(preventDefault).not.toHaveBeenCalled();
    });
});

describe('pellizco', () => {
    const dosDedos = (separacion) => ({
        touches: [{ clientX: 200 - separacion / 2, clientY: 300 }, { clientX: 200 + separacion / 2, clientY: 300 }],
        cancelable: true,
        preventDefault: vi.fn(),
    });

    const montar = () => {
        const onNext = vi.fn();
        const onPrev = vi.fn();
        const onToggleChrome = vi.fn();
        const onPinchStart = vi.fn();
        const onPinchMove = vi.fn();
        const onPinchEnd = vi.fn();
        const handlers = createGestureHandlers({
            onNext, onPrev, onToggleChrome, onPinchStart, onPinchMove, onPinchEnd,
            getWidth: () => WIDTH,
        });
        return { handlers, onNext, onPrev, onToggleChrome, onPinchStart, onPinchMove, onPinchEnd };
    };

    it('separar dos dedos informa de la escala y no pasa página', () => {
        const g = montar();
        g.handlers.onPointerDown(event(370));
        g.handlers.onTouchStart(dosDedos(100));
        g.handlers.onTouchMove(dosDedos(150));
        g.handlers.onPointerUp(event(370));
        g.handlers.onTouchEnd({ touches: [] });

        expect(g.onPinchStart).toHaveBeenCalledTimes(1);
        expect(g.onPinchMove).toHaveBeenLastCalledWith(1.5);
        expect(g.onPinchEnd).toHaveBeenCalledWith(1.5);
        expect(g.onNext).not.toHaveBeenCalled();
        expect(g.onToggleChrome).not.toHaveBeenCalled();
    });

    it('el dedo que queda apoyado al soltar el otro no es un toque', () => {
        const g = montar();
        g.handlers.onTouchStart(dosDedos(100));
        g.handlers.onTouchEnd({ touches: [{ clientX: 370, clientY: 300 }] });
        g.handlers.onPointerDown(event(370));
        g.handlers.onPointerUp(event(370));
        g.handlers.onTouchEnd({ touches: [] });

        expect(g.onPinchEnd).toHaveBeenCalledTimes(1);
        expect(g.onNext).not.toHaveBeenCalled();
    });

    it('acabado el pellizco, los toques vuelven a funcionar', () => {
        const g = montar();
        g.handlers.onTouchStart(dosDedos(100));
        g.handlers.onTouchEnd({ touches: [] });
        g.handlers.onPointerDown(event(370));
        g.handlers.onPointerUp(event(370));
        expect(g.onNext).toHaveBeenCalledTimes(1);
    });

    it('sin quien lo atienda, dos dedos no hacen nada especial', () => {
        const { handlers } = setup();
        expect(() => handlers.onTouchStart(dosDedos(100))).not.toThrow();
        expect(handlers.pinching).toBeFalsy();
    });
});

describe('sujetar el móvil', () => {
    it('un contacto ancho —la palma— no pasa página', () => {
        const { handlers, onNext } = setup();
        handlers.onPointerDown({ ...event(380), width: 55, height: 70 });
        handlers.onPointerUp(event(380));
        expect(onNext).not.toHaveBeenCalled();
    });

    it('un apoyo largo y quieto pegado al borde tampoco', () => {
        vi.useFakeTimers();
        const { handlers, onNext } = setup();
        handlers.onPointerDown(event(396));
        vi.advanceTimersByTime(900);
        handlers.onPointerUp(event(396));
        vi.useRealTimers();
        expect(onNext).not.toHaveBeenCalled();
    });

    it('un toque normal con la yema sí', () => {
        const { handlers, onNext } = setup();
        handlers.onPointerDown({ ...event(380), width: 14, height: 16 });
        handlers.onPointerUp(event(380));
        expect(onNext).toHaveBeenCalledTimes(1);
    });
});

describe('hojear', () => {
    const montar = () => {
        const onNext = vi.fn();
        const onHojear = vi.fn();
        const handlers = createGestureHandlers({
            onNext, onPrev: vi.fn(), onToggleChrome: vi.fn(), onHojear,
            getWidth: () => WIDTH, getHeight: () => 800,
        });
        return { handlers, onNext, onHojear };
    };

    it('mantener el dedo en la zona de avanzar empieza a hojear y al soltar para', () => {
        vi.useFakeTimers();
        const { handlers, onNext, onHojear } = montar();
        handlers.onPointerDown(event(360));
        vi.advanceTimersByTime(500);
        handlers.onPointerUp(event(360));
        vi.useRealTimers();
        expect(onHojear.mock.calls).toEqual([['empieza', 'next'], ['termina']]);
        expect(onNext).not.toHaveBeenCalled();
    });

    it('un toque normal no hojea', () => {
        vi.useFakeTimers();
        const { handlers, onNext, onHojear } = montar();
        handlers.onPointerDown(event(360));
        vi.advanceTimersByTime(100);
        handlers.onPointerUp(event(360));
        vi.advanceTimersByTime(600);
        vi.useRealTimers();
        expect(onHojear).not.toHaveBeenCalled();
        expect(onNext).toHaveBeenCalledTimes(1);
    });

    it('pegado al borde es la mano que sujeta: no hojea', () => {
        vi.useFakeTimers();
        const { handlers, onHojear } = montar();
        handlers.onPointerDown(event(396));
        vi.advanceTimersByTime(900);
        handlers.onPointerUp(event(396));
        vi.useRealTimers();
        expect(onHojear).not.toHaveBeenCalled();
    });
});
