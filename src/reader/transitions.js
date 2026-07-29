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
 * ## El error que introdujo el arreglo anterior
 *
 * La versión anterior hacía dos fases: sacaba la página vieja, **esperaba**, y
 * entonces cambiaba. Con el doblado de hoja esa espera era de 210 ms, así que al
 * tocar el borde no pasaba nada durante un quinto de segundo. Y peor: si se
 * tocaba otra vez en esa ventana, el segundo toque cancelaba el primero **antes
 * de que hubiera cambiado la página**, así que dos toques seguidos daban cero
 * páginas. Desde fuera eso es «los gestos no funcionan».
 *
 * Un test de integración del lector lo cazó en el primer intento; los 726 tests
 * de módulos que había no podían verlo porque cada pieza estaba bien y lo que
 * fallaba era la secuencia.
 *
 * **Ahora la página cambia primero y se anima la que entra.** Cero latencia: el
 * toque tiene efecto en el mismo fotograma. Y no hay fase de salida que animar,
 * porque no se puede: hay un solo iframe y la página vieja deja de existir en el
 * momento en que epub.js pinta la nueva. Enseñar la hoja saliendo exigiría tener
 * las dos a la vez, que es justo lo que este motor no da.
 *
 * La excepción es el arrastre: ahí la hoja vieja sí se ve salir, porque la mueve
 * el dedo mientras el contenido todavía no ha cambiado.
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
        description: 'La hoja entra girando sobre su borde. Arrastra para doblarla con el dedo.',
        in: 260,
        curl: true,
    },
    paper: {
        label: 'Hoja suelta',
        description: 'La siguiente entra desde el lado, como si estuviera debajo.',
        in: 220,
        shift: 100,
    },
    slide: {
        label: 'Deslizar',
        description: 'La página entra desde el lado hacia el que avanzas.',
        in: 190,
        shift: 34,
    },
    push: {
        label: 'Empujar',
        description: 'Con más recorrido, para que se note de dónde viene.',
        in: 260,
        shift: 72,
    },
    fade: {
        label: 'Fundido',
        description: 'La página aparece desde el color del fondo. Discreta.',
        in: 170,
        veil: true,
    },
    zoom: {
        label: 'Acercar',
        description: 'La página entra creciendo un poco.',
        in: 200,
        scale: 0.975,
    },
    none: {
        label: 'Ninguna',
        description: 'Cambio instantáneo. Lo más rápido y lo único sin coste.',
        in: 0,
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
 * Estado visual de la página que entra.
 *
 * Solo hay dos: de dónde viene (`enter`) y su sitio (`rest`). La fase de salida
 * ya no existe — ver la cabecera: con un solo iframe la página vieja deja de
 * existir en cuanto epub.js pinta la nueva, y esperar para animarla era lo que
 * metía un quinto de segundo de latencia en cada toque.
 *
 * Se devuelve como valores y no como clase CSS para poder redondear el
 * desplazamiento a píxeles enteros.
 *
 * @param {keyof PAGE_TRANSITIONS} id
 * @param {'next'|'prev'} direction
 * @param {'enter'|'rest'} phase
 */
export const phaseState = (id, direction, phase) => {
    const spec = PAGE_TRANSITIONS[id];
    const rest = { transform: 'translate3d(0,0,0)', veil: 0, duration: 0 };

    if (!spec || id === 'none' || phase === 'rest') {
        // En reposo el doblado también tiene que decir que es doblado: quien
        // pinta necesita saber que debe usar la geometría del pliegue para
        // volver la hoja a su sitio, no un translate3d.
        return spec?.curl && phase === 'rest'
            ? { curl: true, progress: 0, direction, veil: 0, duration: 0 }
            : rest;
    }

    // Avanzando, la página nueva viene desde la derecha; retrocediendo, desde la
    // izquierda. Es el sentido que dice hacia dónde te mueves en el libro.
    const from = direction === 'next' ? 1 : -1;

    if (spec.curl) {
        // El pliegue entra desde su ángulo máximo y se asienta. Al arrastrar, el
        // progreso lo pone el dedo en vez de esta función.
        return {
            curl: true,
            progress: 1,
            // Entrando se dobla al contrario que la que se fue: la hoja nueva
            // baja desde el lado por el que se levantó la anterior.
            direction: direction === 'next' ? 'prev' : 'next',
            veil: 0,
            duration: spec.in,
        };
    }

    // Redondeo a entero: media unidad coloca cada letra a mitad de píxel y se
    // redibuja distinta en cada fotograma. El `|| 0` evita un `-0px` escrito en
    // el estilo, que al depurar hace pensar que hay un signo mal.
    const shift = Math.round((spec.shift || 0) * from) || 0;
    const scale = spec.scale || 1;

    return {
        transform: scale === 1
            ? `translate3d(${shift}px,0,0)`
            : `translate3d(${shift}px,0,0) scale(${scale})`,
        // El velo lleva el color de fondo de la página, así que a opacidad 1 el
        // texto desaparece sin haber tocado su alfa.
        veil: spec.veil ? 1 : 0,
        duration: spec.in,
    };
};

/** Cuánto tarda la animación completa. */
export const transitionDuration = (id) => PAGE_TRANSITIONS[id]?.in || 0;

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
 * Cambia la página y anima la que entra.
 *
 * **La página cambia primero, sin esperar a nada.** Ver la cabecera: la versión
 * anterior animaba una salida y cambiaba después, y eso metía hasta 210 ms de
 * latencia en cada toque — además de perder el cambio entero si se volvía a
 * tocar en esa ventana.
 *
 * @param {Object} options
 * @param {HTMLElement} options.element  Contenedor que se mueve.
 * @param {HTMLElement} [options.veil]   Capa por encima: color de fondo o sombra.
 * @param {string} options.id
 * @param {'next'|'prev'} options.direction
 * @param {() => Promise<void>|void} options.commit  Cambia la página de verdad.
 * @param {boolean} [options.reducedMotion]
 * @param {{state: Function, shade: Function, perspective: number}} [options.curl]
 *   Geometría del pliegue. Se inyecta en lugar de importarla para que este
 *   módulo siga siendo puro tiempo y orden, sin saber de perspectivas.
 * @returns {{done: Promise<void>, cancel: () => void}}
 */
export const runTurn = ({
    element, veil, id, direction, commit, reducedMotion = false, curl = null,
}) => {
    let cancelled = false;

    const apply = (state, duration) => paint(element, veil, state, duration, curl);

    const settle = () => {
        if (!element) return;
        // Se limpia todo, incluida la promoción de capa. Dejar un `transform` o
        // un `will-change` puestos mantiene el texto en una capa compuesta, con
        // otro suavizado que el del resto de la app.
        element.style.transitionDuration = '';
        element.style.transform = '';
        element.style.transformOrigin = '';
        element.style.willChange = '';
        if (veil) {
            veil.style.transitionDuration = '';
            veil.style.opacity = '';
            veil.style.background = '';
        }
    };

    const done = (async () => {
        // 1. La página cambia YA. Es lo primero que se hace, siempre, incluso si
        //    la animación luego se cancela: el usuario ha pedido pasar página y
        //    tiene que pasar.
        await commit();

        const instant = reducedMotion || id === 'none' || !PAGE_TRANSITIONS[id];
        if (instant || cancelled || !element) { settle(); return; }

        // 2. La hoja nueva se coloca en su punto de partida, sin transición.
        element.style.willChange = 'transform';
        apply(phaseState(id, direction, 'enter'), 0);

        // Dos fotogramas: uno para que epub.js pinte el capítulo nuevo y otro
        // para que el navegador registre la posición de partida. Con uno solo,
        // algunos WebView se saltan la transición y la hoja aparece ya colocada.
        await frame();
        await frame();
        if (cancelled) { settle(); return; }

        // 3. Y se asienta.
        const duration = transitionDuration(id);
        apply(phaseState(id, direction, 'rest'), duration);
        await wait(duration);
        settle();
    })();

    return {
        done,
        // Cancelar solo detiene la animación. La página ya ha cambiado: es lo
        // que hace que tocar rápido varias veces avance varias páginas en vez de
        // no avanzar ninguna.
        cancel: () => { cancelled = true; settle(); },
    };
};
