import { describe, it, expect, vi } from 'vitest';
import {
    PAGE_TRANSITIONS, DEFAULT_TRANSITION, phaseState, transitionDuration, runTurn,
} from './transitions.js';

describe('catálogo de transiciones', () => {
    it('todas tienen etiqueta, descripción y sus dos fases', () => {
        Object.entries(PAGE_TRANSITIONS).forEach(([id, spec]) => {
            expect(spec.label, id).toBeTruthy();
            expect(spec.description, id).toBeTruthy();
            expect(typeof spec.out, id).toBe('number');
            expect(typeof spec.in, id).toBe('number');
        });
    });

    it('«ninguna» no dura nada: es la opción sin coste', () => {
        expect(transitionDuration('none')).toBe(0);
    });

    it('la salida es corta salvo cuando es la protagonista', () => {
        // Salir es tiempo en que el usuario ya ha pedido la página y aún no la
        // tiene, así que conviene que sea breve.
        Object.entries(PAGE_TRANSITIONS).forEach(([id, spec]) => {
            if (spec.out === 0 || spec.leadsWithOut) return;
            expect(spec.out, id).toBeLessThan(spec.in);
        });
    });

    it('las que enseñan la hoja que se va invierten el reparto', () => {
        // Ahí la salida **es** la animación que se mira. Al revés, el pliegue
        // quedaría en un parpadeo y se alargaría la parte que no aporta nada.
        Object.entries(PAGE_TRANSITIONS)
            .filter(([, spec]) => spec.leadsWithOut)
            .forEach(([id, spec]) => {
                expect(spec.out, id).toBeGreaterThan(spec.in);
            });
        expect(PAGE_TRANSITIONS.curl.leadsWithOut).toBe(true);
    });

    it('hay al menos seis formas de pasar página', () => {
        // Con dos opciones no hay nada que elegir. Una app de lectura que se
        // usa horas al día tiene que dejar ajustar esto.
        expect(Object.keys(PAGE_TRANSITIONS).length).toBeGreaterThanOrEqual(6);
    });

    it('ninguna dura tanto como para estorbar al pasar páginas seguidas', () => {
        Object.keys(PAGE_TRANSITIONS).forEach((id) => {
            expect(transitionDuration(id), id).toBeLessThanOrEqual(340);
        });
    });

    it('la de por defecto existe', () => {
        expect(PAGE_TRANSITIONS[DEFAULT_TRANSITION]).toBeTruthy();
    });
});

describe('phaseState', () => {
    it('el doblado se describe por progreso, no por desplazamiento', () => {
        // Tiene que poder seguir al dedo, y un desplazamiento fijo solo sirve
        // para una animación de duración cerrada.
        const out = phaseState('curl', 'next', 'out');
        expect(out.curl).toBe(true);
        expect(out.progress).toBe(1);
        expect(phaseState('curl', 'next', 'in').progress).toBe(0);
    });

    it('nunca toca la opacidad del texto: solo transform y velo', () => {
        // Es el arreglo del temblor. Animar la opacidad de un elemento con texto
        // hace que el WebView cambie de suavizado subpíxel a escala de grises
        // mientras dura, y los glifos se redibujan con otro método.
        const state = phaseState('slide', 'next', 'out');
        expect(state).not.toHaveProperty('opacity');
        expect(state.transform).toContain('translate3d');
    });

    it('la página vieja sale en sentido contrario al que entra la nueva', () => {
        const out = phaseState('slide', 'next', 'out');
        const entry = phaseState('slide', 'next', 'in');
        expect(out.transform).toContain('-26px');
        expect(entry.transform).toContain('26px');
        expect(entry.transform).not.toContain('-26px');
    });

    it('retroceder invierte los dos sentidos', () => {
        expect(phaseState('slide', 'prev', 'out').transform).toContain('26px');
        expect(phaseState('slide', 'prev', 'in').transform).toContain('-26px');
    });

    it('el desplazamiento cae en píxeles enteros', () => {
        // Media unidad coloca cada letra a mitad de píxel y se redibuja distinta
        // en cada fotograma. Era la tercera causa del temblor.
        Object.keys(PAGE_TRANSITIONS).forEach((id) => {
            ['out', 'in'].forEach((phase) => {
                // El doblado no describe su geometría aquí: la calcula
                // `pageCurl.js` a partir del progreso, y allí se comprueba.
                const { transform } = phaseState(id, 'next', phase);
                const match = transform?.match(/(-?[\d.]+)px/);
                if (!match) return;
                expect(Number.isInteger(Number(match[1])), `${id}/${phase}`).toBe(true);
            });
        });
    });

    it('el estado de reposo no lleva desplazamiento ni velo', () => {
        const rest = phaseState('push', 'next', 'rest');
        expect(rest.transform).toBe('translate3d(0,0,0)');
        expect(rest.veil).toBe(0);
    });

    it('«ninguna» se queda en reposo en cualquier fase', () => {
        expect(phaseState('none', 'next', 'out').veil).toBe(0);
        expect(phaseState('none', 'next', 'out').transform).toBe('translate3d(0,0,0)');
    });

    it('un id desconocido no rompe: se comporta como «ninguna»', () => {
        expect(phaseState('espiral', 'next', 'out').transform).toBe('translate3d(0,0,0)');
    });

    it('el velo tapa por completo, para que el cambio no se vea', () => {
        // A opacidad 1 y con el color del fondo de la página, el texto
        // desaparece sin haber tocado su alfa, y el cambio de contenido ocurre
        // debajo sin que se vean las dos páginas.
        expect(phaseState('fade', 'next', 'out').veil).toBe(1);
    });

    it('«acercar» añade escala sin perder el desplazamiento', () => {
        const state = phaseState('zoom', 'next', 'out');
        expect(state.transform).toContain('scale(');
        expect(state.transform).toContain('translate3d');
    });
});

describe('runTurn', () => {
    const build = () => ({ element: { style: {} }, veil: { style: {} } });

    it('cambia la página **después** de la fase de salida, no a la vez', async () => {
        // Este es el arreglo de la fusión: antes se lanzaban la animación y el
        // cambio en el mismo tic, y epub.js cambiaba el texto a mitad de la
        // animación con la opacidad a medias.
        const { element, veil } = build();
        const commit = vi.fn();

        const turn = runTurn({ element, veil, id: 'slide', direction: 'next', commit });

        // Todavía no: primero tiene que salir la página vieja.
        expect(commit).not.toHaveBeenCalled();
        await turn.done;
        expect(commit).toHaveBeenCalledOnce();
    });

    it('con movimiento reducido cambia la página sin animar nada', async () => {
        const { element, veil } = build();
        const commit = vi.fn();

        await runTurn({
            element, veil, id: 'slide', direction: 'next', commit, reducedMotion: true,
        }).done;

        expect(commit).toHaveBeenCalledOnce();
        expect(element.style.transform).toBeUndefined();
    });

    it('«ninguna» cambia la página sin tocar los estilos', async () => {
        const { element, veil } = build();
        const commit = vi.fn();
        await runTurn({ element, veil, id: 'none', direction: 'next', commit }).done;
        expect(commit).toHaveBeenCalledOnce();
        expect(element.style.transform).toBeUndefined();
    });

    it('deja el elemento limpio al terminar', async () => {
        // Dejar un transform o un will-change puestos mantiene el texto en una
        // capa compuesta, con otro suavizado que el resto de la app: al pasar
        // página el libro se veía sutilmente distinto que en reposo.
        const { element, veil } = build();
        await runTurn({
            element, veil, id: 'slide', direction: 'next', commit: () => {},
        }).done;

        expect(element.style.transform).toBe('');
        expect(element.style.willChange).toBe('');
        expect(element.style.transitionDuration).toBe('');
        expect(veil.style.opacity).toBe('');
    });

    it('cancelar deja el elemento limpio', async () => {
        const { element, veil } = build();
        const turn = runTurn({
            element, veil, id: 'push', direction: 'next', commit: () => {},
        });
        turn.cancel();
        await turn.done;

        expect(element.style.transform).toBe('');
        expect(element.style.willChange).toBe('');
    });

    it('saltarse la salida sigue cambiando la página', async () => {
        // Lo usa el arrastre: el dedo ya ha sacado la página fuera, y repetir la
        // salida daría un salto hacia atrás antes de completar el gesto.
        const { element, veil } = build();
        const commit = vi.fn();

        await runTurn({
            element, veil, id: 'slide', direction: 'next', skipOut: true, commit,
        }).done;

        expect(commit).toHaveBeenCalledOnce();
    });

    it('espera al cambio de página si es asíncrono', async () => {
        // epub.js devuelve una promesa: entrar antes de que resuelva animaría la
        // página vieja otra vez.
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

    it('sin elemento no lanza', async () => {
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
