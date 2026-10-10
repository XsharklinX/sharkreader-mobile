import { describe, it, expect, vi } from 'vitest';
import {
    PAGE_TRANSITIONS, DEFAULT_TRANSITION, phaseState, transitionDuration,
    runTurn, normalizeTransition, duracionDeSalida, SALIDA_MINIMA, usesCurl,
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

    it('hay exactamente tres', () => {
        // Había siete, y seis eran la misma línea de código con otro número.
        // Ofrecer siete variantes de lo mismo es no haber decidido cuál es la
        // buena y pasarle la decisión al usuario. Quedan las tres que son
        // decisiones de verdad: doblar el papel, deslizar y no animar nada.
        expect(Object.keys(PAGE_TRANSITIONS)).toEqual(['curl', 'none', 'slide']);
    });

    it('ninguna dura tanto como para estorbar al pasar páginas seguidas', () => {
        Object.keys(PAGE_TRANSITIONS).forEach((id) => {
            expect(transitionDuration(id), id).toBeLessThanOrEqual(320);
        });
    });

    it('la de por defecto es el doblado de hoja', () => {
        // El doblado sigue en el catálogo y se puede elegir, pero hoy tiene un
        // fallo reproducido: con él activo, arrastrar no pasa página. La de por
        // defecto no puede ser un efecto roto.
        //
        // Deslizar está medido en el libro que fallaba: doce arrastres seguidos
        // entre 58 y 63 ms, sin una sola variación.
        expect(DEFAULT_TRANSITION).toBe('curl');
    });


    it('solo el doblado dibuja pliegue', () => {
        // `usesCurl` decide si hay que preparar las copias del capítulo, que
        // cuesta montar dos iframes. Con cualquier otra no se monta nada.
        expect(usesCurl('curl')).toBe(true);
        expect(usesCurl('slide')).toBe(false);
        expect(usesCurl('none')).toBe(false);
        expect(usesCurl(undefined)).toBe(false);
    });
});

describe('normalizeTransition', () => {
    it('las que ya no existen caen en la de por defecto', () => {
        // Un libro empezado cuando había siete trae `paper` o `fade` guardado en
        // sus preferencias. Sin esto, el selector se abriría sin nada marcado.
        ['paper', 'push', 'fade', 'zoom'].forEach((viejo) => {
            expect(normalizeTransition(viejo), viejo).toBe(DEFAULT_TRANSITION);
        });
    });

    it('las que existen se respetan', () => {
        expect(normalizeTransition('curl')).toBe('curl');
        expect(normalizeTransition('slide')).toBe('slide');
        expect(normalizeTransition('none')).toBe('none');
    });

    it('sin valor guardado, la de por defecto', () => {
        expect(normalizeTransition(undefined)).toBe(DEFAULT_TRANSITION);
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

    it('«ninguna» se queda en reposo', () => {
        expect(phaseState('none', 'next', 'enter').transform).toBe('translate3d(0,0,0)');
        expect(phaseState('none', 'next', 'enter').veil).toBe(0);
    });

    it('un id desconocido no rompe: se comporta como «ninguna»', () => {
        expect(phaseState('espiral', 'next', 'enter').transform).toBe('translate3d(0,0,0)');
    });

    it('deslizar no toca el velo', () => {
        // El velo solo existía para el fundido, que se fue con las otras cinco.
        expect(phaseState('slide', 'next', 'enter').veil).toBe(0);
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

        runTurn({ element, veil, id: 'slide', direction: 'next', commit });

        expect(commit).toHaveBeenCalledOnce();
    });

    it('cancelar no impide el cambio de página', async () => {
        // Era el otro lado del mismo fallo: tocar dos veces seguidas cancelaba
        // el primer cambio antes de que ocurriera, así que dos toques daban cero
        // páginas.
        const { element, veil } = build();
        const commit = vi.fn();

        const turn = runTurn({ element, veil, id: 'slide', direction: 'next', commit });
        turn.cancel();
        await turn.done;

        expect(commit).toHaveBeenCalledOnce();
    });

    it('dos pases seguidos cambian dos páginas', async () => {
        const { element, veil } = build();
        const commit = vi.fn();

        const first = runTurn({ element, veil, id: 'slide', direction: 'next', commit });
        first.cancel();
        const second = runTurn({ element, veil, id: 'slide', direction: 'next', commit });
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
            element, veil, id: 'slide', direction: 'next',
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

});

describe('duracionDeSalida', () => {
    it('sin impulso dura lo de siempre', () => {
        expect(duracionDeSalida('slide', 0)).toBe(transitionDuration('slide'));
    });

    it('con más impulso, menos tiempo', () => {
        // Es lo que hace la inercia: más velocidad, menos tiempo para recorrer lo
        // mismo. Con duración fija, el gesto se siente desconectado del dedo.
        const suave = duracionDeSalida('slide', 0.3);
        const fuerte = duracionDeSalida('slide', 2.5);
        expect(fuerte).toBeLessThan(suave);
        expect(suave).toBeLessThan(transitionDuration('slide'));
    });

    it('nunca baja del suelo: por debajo se ve un corte, no un movimiento', () => {
        expect(duracionDeSalida('slide', 50)).toBeGreaterThanOrEqual(SALIDA_MINIMA);
    });

    it('el sentido del impulso da igual: lo que cuenta es la fuerza', () => {
        expect(duracionDeSalida('slide', -1.4)).toBe(duracionDeSalida('slide', 1.4));
    });

    it('sin animación no hay duración que estirar', () => {
        expect(duracionDeSalida('none', 2)).toBe(0);
    });

    it('un impulso absurdo no rompe la cuenta', () => {
        for (const malo of [NaN, undefined, null, 'rápido']) {
            expect(duracionDeSalida('slide', malo)).toBe(transitionDuration('slide'));
        }
    });
});
