/**
 * Animaciones al pasar página.
 *
 * ## Por qué la versión anterior se veía mal
 *
 * Las letras temblaban y se fusionaban al pasar página. No era una cuestión de
 * gusto: eran tres defectos sumados, todos en la misma animación.
 *
 * **1. Se animaba la opacidad del texto.** Cada transición hacía
 * `from { opacity: .25 }` sobre el contenedor del libro. Animar la opacidad de
 * un elemento con texto obliga al navegador a componer los glifos con canal
 * alfa, y el WebView de Android cambia de suavizado subpíxel a suavizado en
 * escala de grises mientras la capa es translúcida — y vuelve al acabar. Los
 * bordes de cada letra se redibujan con otro método dos veces por página. Eso
 * es el temblor.
 *
 * **2. La página vieja y la nueva se veían a la vez.** La animación duraba 240 ms
 * fijos y el cambio de contenido de epub.js llegaba de forma asíncrona a mitad.
 * Así que la primera mitad animaba el texto viejo y a media animación saltaba al
 * nuevo, con la opacidad a medias. Eso es la fusión.
 *
 * **3. Los desplazamientos no caían en píxeles enteros.** `translateX(46%)` da
 * posiciones fraccionarias, y una letra colocada a mitad de píxel se dibuja
 * distinta en cada fotograma.
 *
 * ## Cómo se arregla
 *
 * **El texto no se anima nunca.** Lo que se atenúa es un velo del color de fondo
 * de la página puesto por encima. Visualmente es idéntico a fundir el texto
 * —mismo color de destino— pero los glifos se quedan opacos y en la misma capa,
 * así que no se vuelven a rasterizar.
 *
 * **La animación va en dos fases encadenadas al cambio real.** Sale la página
 * vieja, se espera a que epub.js confirme el cambio, entra la nueva. Nunca hay
 * dos páginas visibles a la vez porque no se solapan en el tiempo.
 *
 * **Los desplazamientos son enteros y en `translate3d`.** Y la capa se promueve
 * una vez antes de empezar y se retira una vez al terminar, en lugar de que el
 * navegador la promueva y la degrade con cada animación.
 */

/**
 * Cada transición declara sus dos fases.
 *
 * Por norma la salida es corta: es tiempo en que el usuario ya ha pedido la
 * página y todavía no la tiene. La entrada puede permitirse más porque ahí el
 * contenido ya está delante.
 *
 * **`leadsWithOut` invierte ese reparto.** Hay transiciones en las que lo que se
 * mira es la hoja que se va —el doblado, la hoja suelta—: ahí la salida *es* la
 * animación y la entrada solo asienta la siguiente. Repartir al revés dejaría el
 * pliegue en un parpadeo y alargaría la parte que no aporta nada.
 */
export const PAGE_TRANSITIONS = {
    curl: {
        label: 'Doblar hoja',
        description: 'La hoja se levanta y gira sobre su borde, como el papel.',
        out: 210,
        in: 130,
        curl: true,
        veil: false,
        // Ver `leadsWithOut` más abajo.
        leadsWithOut: true,
    },
    paper: {
        label: 'Hoja suelta',
        description: 'La hoja se va y deja ver la siguiente, que estaba debajo.',
        out: 160,
        in: 120,
        shift: 100,
        veil: false,
        leadsWithOut: true,
    },
    none: {
        label: 'Ninguna',
        description: 'Cambio instantáneo. Lo más rápido y lo único sin coste.',
        out: 0,
        in: 0,
    },
    fade: {
        label: 'Fundido',
        description: 'La página se apaga y la siguiente aparece. Discreta.',
        out: 80,
        in: 120,
        veil: true,
    },
    slide: {
        label: 'Deslizar',
        description: 'La página sale por un lado y la siguiente entra por el otro.',
        out: 90,
        in: 140,
        shift: 26,
        veil: true,
    },
    push: {
        label: 'Empujar',
        description: 'Con más recorrido, como pasar una hoja de verdad.',
        out: 130,
        in: 190,
        shift: 64,
        veil: true,
    },
    zoom: {
        label: 'Acercar',
        description: 'La página se aleja un poco y la siguiente entra creciendo.',
        out: 90,
        in: 150,
        scale: 0.985,
        veil: true,
    },
};

/**
 * El doblado es la de por defecto.
 *
 * Es la que se parece a pasar una hoja, y es la única que además responde al
 * dedo de forma continua: arrastrando despacio se ve la hoja separarse en vez de
 * esperar a que la animación decida.
 */
export const DEFAULT_TRANSITION = 'curl';

/** ¿Esta transición dibuja un pliegue en perspectiva? */
export const usesCurl = (id) => Boolean(PAGE_TRANSITIONS[id]?.curl);

/**
 * Estado visual de una fase.
 *
 * Se devuelve como valores y no como clase CSS para que el desplazamiento pueda
 * redondearse a píxeles enteros: con una clase habría que fijarlo en la hoja de
 * estilos y `26px` en un contenedor con `transform` heredado no cae
 * necesariamente en un píxel del dispositivo.
 *
 * @param {keyof PAGE_TRANSITIONS} id
 * @param {'next'|'prev'} direction
 * @param {'out'|'in'|'rest'} phase
 * @returns {{transform: string, veil: number, duration: number}}
 */
export const phaseState = (id, direction, phase) => {
    const spec = PAGE_TRANSITIONS[id];
    const rest = { transform: 'translate3d(0,0,0)', veil: 0, duration: 0 };

    if (!spec || id === 'none' || phase === 'rest') return rest;

    // Avanzando, la página vieja sale hacia la izquierda y la nueva entra desde
    // la derecha. Retrocediendo, al contrario.
    const away = direction === 'next' ? -1 : 1;
    const sign = phase === 'out' ? away : -away;

    // Redondeo a entero: media unidad de desplazamiento coloca cada letra a
    // mitad de píxel y se redibuja distinta en cada fotograma.
    //
    // El `|| 0` final convierte el `-0` que sale al multiplicar cero por el
    // sentido. Es inofensivo para el navegador pero deja «translate3d(-0px…)»
    // escrito en el estilo, que al depurar hace pensar que hay un signo mal.
    const shift = Math.round((spec.shift || 0) * sign) || 0;
    const scale = spec.scale && phase !== 'rest' ? spec.scale : 1;

    // El doblado no se describe con desplazamiento: su geometría la calcula
    // `pageCurl.js` a partir del progreso, porque tiene que poder seguir al dedo
    // y no solo recorrer una animación de duración fija.
    if (spec.curl) {
        return {
            curl: true,
            // Salir es llevar la hoja al final del pliegue; entrar es traer la
            // siguiente desde su sitio, que apenas se mueve.
            progress: phase === 'out' ? 1 : 0,
            direction,
            veil: 0,
            duration: phase === 'out' ? spec.out : spec.in,
        };
    }

    return {
        transform: scale === 1
            ? `translate3d(${shift}px,0,0)`
            : `translate3d(${shift}px,0,0) scale(${scale})`,
        // El velo lleva el color de fondo de la página, así que a opacidad 1 el
        // texto desaparece sin haber tocado su alfa.
        veil: spec.veil ? 1 : 0,
        duration: phase === 'out' ? spec.out : spec.in,
    };
};

/** Duración total, para quien necesite saber cuánto tarda el gesto completo. */
export const transitionDuration = (id) => {
    const spec = PAGE_TRANSITIONS[id];
    return spec ? (spec.out || 0) + (spec.in || 0) : 0;
};

/**
 * Espera al siguiente fotograma.
 *
 * Con respaldo a `setTimeout` porque `requestAnimationFrame` no existe fuera de
 * un navegador — es el mismo patrón que en `locationMap.js`. Sin él, este módulo
 * solo se podría probar montando un DOM completo para comprobar una secuencia
 * que es pura lógica de orden.
 */
const frame = () => new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 16);
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pinta un estado, sea de desplazamiento o de pliegue.
 *
 * Se separa de `runTurn` porque el doblado necesita `pageCurl.js`, y meterlo
 * dentro dejaría este módulo con dos responsabilidades: la secuencia temporal y
 * la geometría. La secuencia es la misma para todas las transiciones.
 */
const paint = (element, veil, state, duration, curl) => {
    if (!element) return;
    element.style.transitionDuration = `${duration}ms`;

    if (state.curl && curl) {
        const geometry = curl.state(state.progress, state.direction, element.clientWidth || 0);
        element.style.transformOrigin = geometry.origin;
        element.style.transform = geometry.transform;
        if (veil) {
            veil.style.transitionDuration = `${duration}ms`;
            veil.style.background = curl.shade(state.direction);
            veil.style.opacity = String(geometry.shade);
        }
        return;
    }

    element.style.transform = state.transform;
    if (veil) {
        veil.style.transitionDuration = `${duration}ms`;
        veil.style.background = '';
        veil.style.opacity = String(state.veil);
    }
};

/**
 * Ejecuta el paso de página con su animación.
 *
 * A diferencia de la versión anterior, **esta función es la que cambia la
 * página**: la animación no puede sincronizarse con el cambio si no controla
 * cuándo ocurre.
 *
 * @param {Object} options
 * @param {HTMLElement} options.element  Contenedor que se mueve.
 * @param {HTMLElement} [options.veil]   Capa del color de fondo, por encima.
 * @param {string} options.id
 * @param {'next'|'prev'} options.direction
 * @param {() => Promise<void>|void} options.commit  Cambia la página de verdad.
 * @param {boolean} [options.skipOut]
 *   Se salta la fase de salida. Lo usa el arrastre: el dedo ya ha movido la
 *   página fuera, y volver a sacarla daría un salto.
 * @param {boolean} [options.reducedMotion]
 * @param {{state: Function, shade: Function, perspective: number}} [options.curl]
 *   Geometría del pliegue. Se inyecta en lugar de importarla para que este
 *   módulo siga siendo puro tiempo y orden, sin saber de perspectivas.
 * @returns {{done: Promise<void>, cancel: () => void}}
 */
export const runTurn = ({
    element, veil, id, direction, commit, skipOut = false, reducedMotion = false,
    curl = null,
}) => {
    let cancelled = false;

    const apply = (state, duration) => paint(element, veil, state, duration, curl);

    const settle = () => {
        if (!element) return;
        // Se limpia todo, incluida la promoción de capa. Dejar un `transform` o
        // un `will-change` puestos mantiene el texto en una capa compuesta, con
        // otro suavizado que el del resto de la app: al pasar página el libro se
        // veía sutilmente distinto que en reposo.
        element.style.transitionDuration = '';
        element.style.transform = '';
        element.style.transformOrigin = '';
        element.style.perspective = '';
        element.style.willChange = '';
        if (veil) {
            veil.style.transitionDuration = '';
            veil.style.opacity = '';
            veil.style.background = '';
        }
    };

    const done = (async () => {
        const instant = reducedMotion || id === 'none' || !PAGE_TRANSITIONS[id];

        if (instant) {
            await commit();
            return;
        }

        // La capa se promueve **antes** de empezar y una sola vez. Promoverla al
        // arrancar la animación fuerza una rasterización a mitad del primer
        // fotograma, que es el tirón inicial que se notaba.
        if (element) {
            element.style.willChange = 'transform';
            // La perspectiva se pone antes del primer fotograma: cambiarla a
            // mitad del giro reencuadra la hoja de golpe.
            if (PAGE_TRANSITIONS[id]?.curl && curl) {
                element.style.perspective = `${curl.perspective}px`;
            }
        }
        await frame();
        if (cancelled) { settle(); return; }

        if (!skipOut) {
            const out = phaseState(id, direction, 'out');
            apply(out, out.duration);
            await wait(out.duration);
            if (cancelled) { settle(); return; }
        }

        // El cambio de contenido ocurre con el velo puesto: es el único momento
        // en que las dos páginas existirían a la vez, y así no se ve ninguna.
        await commit();
        if (cancelled) { settle(); return; }

        // Dos fotogramas antes de entrar: uno para que epub.js pinte el capítulo
        // nuevo y otro para que el navegador registre la posición de partida. Con
        // uno solo, algunos WebView se saltan la transición de entrada.
        const entry = phaseState(id, direction, 'in');
        apply(entry, 0);
        await frame();
        await frame();
        if (cancelled) { settle(); return; }

        apply(phaseState(id, direction, 'rest'), entry.duration);
        await wait(entry.duration);
        settle();
    })();

    return {
        done,
        cancel: () => { cancelled = true; settle(); },
    };
};
