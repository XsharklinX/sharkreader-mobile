import { describe, it, expect, vi } from 'vitest';
import {
    PAGE_TRANSITIONS, DEFAULT_TRANSITION, phaseState, transitionDuration,
    runTurn, usesCurl,
} from './transitions.js';

describe('catálogo de transiciones', () => {
    it('todas tienen etiqueta, descripción y duración', () => {
        Object.entries(PAGE_TRANSITIONS).forEach(([id, spec]) => {
            expect(spec.label, id).toBeTruthy();
            expect(spec.description, id).toBeTruthy();
            expect(typeof spec.in, id).toBe('number');
        });
    });

    it('ninguna declara fase de salida', () => {
        // La salida ya no existe: con un solo iframe la página vieja deja de
        // existir en cuanto epub.js pinta la nueva, y esperar para animarla era
        // lo que metía hasta 210 ms de latencia en cada toque.
        Object.entries(PAGE_TRANSITIONS).forEach(([id, spec]) => {
            expect(spec.out, id).toBeUndefined();
        });
    });

    it('«ninguna» no dura nada: es la opción sin coste', () => {
        expect(transitionDuration('none')).toBe(0);
    });

    it('hay al menos seis formas de pasar página', () => {
        expect(Object.keys(PAGE_TRANSITIONS).length).toBeGreaterThanOrEqual(6);
    });

    it('ninguna dura tanto como para estorbar al pasar páginas seguidas', () => {
        Object.keys(PAGE_TRANSITIONS).forEach((id) => {
            expect(transitionDuration(id), id).toBeLessThanOrEqual(280);
        });
    });

    it('la de por defecto es el doblado de hoja', () => {
        expect(DEFAULT_TRANSITION).toBe('curl');
        expect(usesCurl(DEFAULT_TRANSITION)).toBe(true);
    });

    it('solo el doblado usa la geometría del pliegue', () => {
        Object.keys(PAGE_TRANSITIONS)
            .filter((id) => id !== 'curl')
            .forEach((id) => expect(usesCurl(id), id).toBe(false));
    });
});

describe('phaseState', () => {
    it('nunca toca la opacidad del texto: solo transform y velo', () => {
        // Animar la opacidad de un elemento con texto hace que el WebView cambie
        // de suavizado subpíxel a escala de grises mientras dura, y los glifos se
        // redibujan con otro método.
        const state = phaseState('slide', 'next', 'enter');
        expect(state).not.toHaveProperty('opacity');
        expect(state.transform).toContain('translate3d');
    });

    it('avanzando la página nueva viene desde la derecha', () => {
        expect(phaseState('slide', 'next', 'enter').transform).toContain('34px');
        expect(phaseState('slide', 'next', 'enter').transform).not.toContain('-34px');
    });

    it('retrocediendo viene desde la izquierda', () => {
        expect(phaseState('slide', 'prev', 'enter').transform).toContain('-34px');
    });

    it('en reposo se queda en su sitio', () => {
        const rest = phaseState('push', 'next', 'rest');
        expect(rest.transform).toBe('translate3d(0,0,0)');
        expect(rest.veil).toBe(0);
    });

    it('el desplazamiento cae en píxeles enteros', () => {
        // Media unidad coloca cada letra a mitad de píxel y se redibuja distinta
        // en cada fotograma.
        Object.keys(PAGE_TRANSITIONS).forEach((id) => {
            const { transform } = phaseState(id, 'next', 'enter');
            const match = transform?.match(/(-?[\d.]+)px/);
            if (!match) return;
            expect(Number.isInteger(Number(match[1])), id).toBe(true);
        });
    });

    it('el doblado se describe por progreso, no por desplazamiento', () => {
        // Tiene que poder seguir al dedo, y un desplazamiento fijo solo sirve
        // para una animación de duración cerrada.
        const enter = phaseState('curl', 'next', 'enter');
        expect(enter.curl).toBe(true);
        expect(enter.progress).toBe(1);
    });

    it('el doblado también informa de que es doblado en reposo', () => {
        // Quien pinta necesita saber que debe devolver la hoja con la geometría
        // del pliegue, no con un translate3d.
        const rest = phaseState('curl', 'next', 'rest');
        expect(rest.curl).toBe(true);
        expect(rest.progress).toBe(0);
    });

    it('la hoja nueva se dobla al contrario que la que se fue', () => {
        // Baja por el lado por el que se levantó la anterior.
        expect(phaseState('curl', 'next', 'enter').direction).toBe('prev');
        expect(phaseState('curl', 'prev', 'enter').direction).toBe('next');
    });

    it('«ninguna» se queda en reposo', () => {
        expect(phaseState('none', 'next', 'enter').transform).toBe('translate3d(0,0,0)');
        expect(phaseState('none', 'next', 'enter').veil).toBe(0);
    });

    it('un id desconocido no rompe: se comporta como «ninguna»', () => {
        expect(phaseState('espiral', 'next', 'enter').transform).toBe('translate3d(0,0,0)');
    });

    it('el velo del fundido tapa por completo', () => {
        // A opacidad 1 y con el color del fondo de la página, el texto aparece
        // desde el fondo sin haber tocado su alfa.
        expect(phaseState('fade', 'next', 'enter').veil).toBe(1);
    });

    it('«acercar» añade escala sin perder el desplazamiento', () => {
        const state = phaseState('zoom', 'next', 'enter');
        expect(state.transform).toContain('scale(');
        expect(state.transform).toContain('translate3d');
    });
});

describe('runTurn', () => {
    const build = () => ({ element: { style: {} }, veil: { style: {} } });

    it('cambia la página de inmediato, sin esperar a ninguna animación', () => {
        // **El arreglo del fallo.** La versión anterior sacaba la hoja vieja,
        // esperaba hasta 210 ms y entonces cambiaba. Al tocar el borde no pasaba
        // nada durante un quinto de segundo.
        const { element, veil } = build();
        const commit = vi.fn();

        runTurn({ element, veil, id: 'curl', direction: 'next', commit });

        expect(commit).toHaveBeenCalledOnce();
    });

    it('cancelar no impide el cambio de página', async () => {
        // Era el otro lado del mismo fallo: tocar dos veces seguidas cancelaba
        // el primer cambio antes de que ocurriera, así que dos toques daban cero
        // páginas.
        const { element, veil } = build();
        const commit = vi.fn();

        const turn = runTurn({ element, veil, id: 'curl', direction: 'next', commit });
        turn.cancel();
        await turn.done;

        expect(commit).toHaveBeenCalledOnce();
    });

    it('dos pases seguidos cambian dos páginas', async () => {
        const { element, veil } = build();
        const commit = vi.fn();

        const first = runTurn({ element, veil, id: 'curl', direction: 'next', commit });
        first.cancel();
        const second = runTurn({ element, veil, id: 'curl', direction: 'next', commit });
        await Promise.all([first.done, second.done]);

        expect(commit).toHaveBeenCalledTimes(2);
    });

    it('con movimiento reducido cambia la página sin animar nada', async () => {
        const { element, veil } = build();
        const commit = vi.fn();

        await runTurn({
            element, veil, id: 'slide', direction: 'next', commit, reducedMotion: true,
        }).done;

        expect(commit).toHaveBeenCalledOnce();
        expect(element.style.transform).toBe('');
    });

    it('deja el elemento limpio al terminar', async () => {
        // Dejar un transform o un will-change puestos mantiene el texto en una
        // capa compuesta, con otro suavizado que el resto de la app.
        const { element, veil } = build();
        await runTurn({
            element, veil, id: 'slide', direction: 'next', commit: () => {},
        }).done;

        expect(element.style.transform).toBe('');
        expect(element.style.willChange).toBe('');
        expect(element.style.transitionDuration).toBe('');
        expect(veil.style.opacity).toBe('');
    });

    it('espera al cambio de página si es asíncrono', async () => {
        // epub.js devuelve una promesa: animar la entrada antes de que resuelva
        // animaría la página vieja.
        const { element, veil } = build();
        let resolved = false;

        await runTurn({
            element, veil, id: 'fade', direction: 'next',
            commit: () => new Promise((resolve) => setTimeout(() => {
                resolved = true;
                resolve();
            }, 20)),
        }).done;

        expect(resolved).toBe(true);
    });

    it('sin elemento cambia la página igual', async () => {
        const commit = vi.fn();
        await runTurn({ element: null, id: 'slide', direction: 'next', commit }).done;
        expect(commit).toHaveBeenCalled();
    });

    it('funciona sin velo: el visor de PDF no lo monta', async () => {
        const { element } = build();
        const commit = vi.fn();
        await runTurn({ element, id: 'slide', direction: 'next', commit }).done;
        expect(commit).toHaveBeenCalled();
    });

    it('el doblado pide su geometría a quien se la inyecte', async () => {
        const { element, veil } = build();
        const state = vi.fn(() => ({ transform: 'rotateY(0deg)', origin: 'left center', shade: 0 }));
        const shade = vi.fn(() => 'linear-gradient(to right, #000, transparent)');

        await runTurn({
            element, veil, id: 'curl', direction: 'next',
            commit: () => {},
            curl: { state, shade },
        }).done;

        expect(state).toHaveBeenCalled();
        expect(shade).toHaveBeenCalledWith('prev');
    });
});
