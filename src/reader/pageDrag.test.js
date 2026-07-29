import { describe, it, expect, vi } from 'vitest';
import {
    resolveDrag, dragOffset, createPageDrag,
    COMMIT_THRESHOLD, DRAG_START,
} from './pageDrag.js';

const WIDTH = 400;

describe('qué pasa al soltar', () => {
    it('un arrastre corto vuelve atrás: el gesto es reversible', () => {
        const result = resolveDrag({ dx: -40, width: WIDTH, elapsed: 600 });
        expect(result.commit).toBe(false);
        expect(result.direction).toBe('next');
    });

    it('pasado el umbral, completa', () => {
        const result = resolveDrag({ dx: -(WIDTH * COMMIT_THRESHOLD + 5), width: WIDTH, elapsed: 600 });
        expect(result.commit).toBe(true);
    });

    it('un gesto rápido completa aunque sea corto', () => {
        // 60 px en 60 ms: un golpe seco, como en cualquier carrusel.
        const result = resolveDrag({ dx: -60, width: WIDTH, elapsed: 60 });
        expect(result.commit).toBe(true);
    });

    it('un movimiento mínimo, aunque sea rápido, no cuenta', () => {
        const result = resolveDrag({ dx: -8, width: WIDTH, elapsed: 10 });
        expect(result.commit).toBe(false);
    });

    it('arrastrar a la derecha va a la página anterior', () => {
        expect(resolveDrag({ dx: 200, width: WIDTH, elapsed: 400 }).direction).toBe('prev');
    });

    it('un ancho de cero no provoca división por cero', () => {
        expect(() => resolveDrag({ dx: -50, width: 0, elapsed: 100 })).not.toThrow();
    });
});

describe('desplazamiento mientras se arrastra', () => {
    it('en medio del libro sigue al dedo exactamente', () => {
        expect(dragOffset({ dx: -120, width: WIDTH })).toBe(-120);
    });

    it('en el borde, el movimiento se amortigua en vez de bloquearse', () => {
        const offset = dragOffset({ dx: 200, width: WIDTH, atStart: true });
        expect(offset).toBeGreaterThan(0);
        expect(offset).toBeLessThan(200);
    });

    it('la amortiguación nunca supera el límite de goma', () => {
        const offset = dragOffset({ dx: 5000, width: WIDTH, atStart: true });
        expect(Math.abs(offset)).toBeLessThanOrEqual(WIDTH * 0.12 + 0.01);
    });

    it('el borde solo afecta a la dirección bloqueada', () => {
        expect(dragOffset({ dx: -120, width: WIDTH, atStart: true })).toBe(-120);
    });
});

describe('controlador del gesto', () => {
    const setup = (options = {}) => {
        const onMove = vi.fn();
        const onCommit = vi.fn();
        const onCancel = vi.fn();
        const drag = createPageDrag({
            getWidth: () => WIDTH,
            onMove, onCommit, onCancel,
            ...options,
        });
        return { drag, onMove, onCommit, onCancel };
    };

    const at = (x, y = 300) => ({ clientX: x, clientY: y });

    it('no mueve nada hasta superar el umbral de arrastre', () => {
        const { drag, onMove } = setup();
        drag.down(at(300));
        drag.move(at(300 - DRAG_START + 2));
        expect(onMove).not.toHaveBeenCalled();
    });

    it('a partir de ahí sigue al dedo', () => {
        const { drag, onMove } = setup();
        drag.down(at(300));
        drag.move(at(200));
        expect(onMove).toHaveBeenCalledWith(-100);
    });

    it('un movimiento vertical cancela: era scroll o selección', () => {
        const { drag, onMove } = setup();
        drag.down(at(300, 500));
        drag.move(at(290, 300));
        expect(onMove).not.toHaveBeenCalled();
        expect(drag.isDragging()).toBe(false);
    });

    it('completa al soltar pasado el umbral', () => {
        const { drag, onCommit, onCancel } = setup();
        drag.down(at(300));
        drag.move(at(100));
        drag.up(at(100));
        expect(onCommit).toHaveBeenCalledWith('next');
        expect(onCancel).not.toHaveBeenCalled();
    });

    it('vuelve al soltar antes del umbral', () => {
        const { drag, onCommit, onCancel } = setup();
        drag.down(at(300));
        drag.move(at(280));
        drag.up(at(280));
        expect(onCancel).toHaveBeenCalled();
        expect(onCommit).not.toHaveBeenCalled();
    });

    it('un toque sin arrastre no consume el gesto', () => {
        // Devolver false es lo que permite que el toque siga funcionando como
        // toque: pasar página por zonas tiene que seguir existiendo.
        const { drag } = setup();
        drag.down(at(300));
        expect(drag.up(at(300))).toBe(false);
    });

    it('un arrastre sí consume el gesto', () => {
        const { drag } = setup();
        drag.down(at(300));
        drag.move(at(120));
        expect(drag.up(at(120))).toBe(true);
    });

    it('cancelar antes del umbral devuelve la página a su sitio', () => {
        // Un arrastre corto interrumpido no completa: el usuario no llegó a
        // expresar que quería pasar página. Pasado el umbral sí completa, y eso
        // se prueba aparte en «interrupción del sistema».
        const { drag, onCancel } = setup();
        drag.down(at(300));
        drag.move(at(270));
        drag.cancel();
        expect(onCancel).toHaveBeenCalled();
    });

    it('desactivado no hace nada: hay que poder apagarlo en gama baja', () => {
        const { drag, onMove } = setup({ isEnabled: () => false });
        drag.down(at(300));
        drag.move(at(100));
        expect(onMove).not.toHaveBeenCalled();
    });
});

describe('interrupción del sistema', () => {
    const build = () => {
        const onCommit = vi.fn();
        const onCancel = vi.fn();
        const onMove = vi.fn();
        const drag = createPageDrag({
            getWidth: () => 400,
            onMove,
            onCommit,
            onCancel,
        });
        return { drag, onCommit, onCancel };
    };

    it('completa el pase si el gesto ya había pasado el umbral', () => {
        // Android se queda el gesto —panel de notificaciones, deslizar desde el
        // borde— sin que el usuario sepa que se interrumpió. Ver la página
        // volver a su sitio después de haberla arrastrado se lee como un fallo.
        const { drag, onCommit, onCancel } = build();
        drag.down({ clientX: 300, clientY: 200 });
        drag.move({ clientX: 100, clientY: 205 });
        drag.cancel();

        expect(onCommit).toHaveBeenCalledWith('next');
        expect(onCancel).not.toHaveBeenCalled();
    });

    it('devuelve la página si no había llegado al umbral', () => {
        const { drag, onCommit, onCancel } = build();
        drag.down({ clientX: 300, clientY: 200 });
        drag.move({ clientX: 275, clientY: 205 });
        drag.cancel();

        expect(onCommit).not.toHaveBeenCalled();
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it('no hace nada si el dedo no llegó a arrastrar', () => {
        const { drag, onCommit, onCancel } = build();
        drag.down({ clientX: 300, clientY: 200 });
        drag.cancel();

        expect(onCommit).not.toHaveBeenCalled();
        expect(onCancel).not.toHaveBeenCalled();
    });
});
