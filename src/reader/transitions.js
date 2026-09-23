/**
 * Animaciones al pasar página.
 *
 * ## Dos opciones, no siete
 *
 * Aquí hubo siete: doblar, hoja suelta, deslizar, empujar, fundido, acercar y
 * ninguna. Seis eran la misma línea de código con otro número, y las siete
 * miniaturas del selector eran el mismo dibujo. Ofrecer siete variantes de lo
 * mismo no es dar opciones: es no haber decidido cuál es la buena y pasarle la
 * decisión al usuario.
 *
 * Quedan dos. **Deslizar** es la de por defecto, y **ninguna** para quien quiera
 * el cambio instantáneo o lea en tinta electrónica.
 *
 * ## Por qué el doblado de hoja no está, y esta vez con la causa medida
 *
 * Estuvo tres veces y funcionaba: pliegue en diagonal por la esquina, dorso
 * reflejado del color del papel, la página correcta a los dos lados. El problema
 * nunca fue la geometría.
 *
 * Para doblar una página hay que tenerla **dos veces**, y con epub.js la única
 * forma era montar dos iframes con el capítulo entero dentro. Medido en un libro
 * normal: 605 KB de HTML y 583 KB de CSS por copia, 2,4 MB de documento vivo
 * mientras se lee, reconstruidos en cada cambio de capítulo.
 *
 * Eso explica los dos síntomas que no se conseguían reproducir a mano: que el
 * lector se congelara de vez en cuando, y que fuera **más rápido o más lento según
 * el libro** — porque dependía del tamaño del capítulo, no del código.
 *
 * Vuelve el día que lo que se doble sea un mapa de bits pedido al motor de
 * páginas, que es lo único que la GPU mueve sin nada que preparar. Hasta entonces
 * no se envía: un lector que pasa página igual de rápido en cualquier libro es
 * mejor producto que uno con un efecto bonito que a veces se cuelga.
 *
 * ## Por qué el texto no se anima nunca
 *
 * Las letras temblaban y se fusionaban al pasar página, y eran tres defectos
 * sumados en la misma animación.
 *
 * **1. Se animaba la opacidad del texto.** Animar la opacidad de un elemento con
 * texto obliga al navegador a componer los glifos con canal alfa, y el WebView de
 * Android cambia de suavizado subpíxel a suavizado en escala de grises mientras la
 * capa es translúcida — y vuelve al acabar. Cada letra se redibuja con otro método
 * dos veces por página. Eso era el temblor.
 *
 * **2. La página vieja y la nueva se veían a la vez.** La animación duraba 240 ms
 * fijos y el cambio de contenido de epub.js llegaba de forma asíncrona a mitad. La
 * primera mitad animaba el texto viejo y a media animación saltaba al nuevo, con la
 * opacidad a medias. Eso era la fusión.
 *
 * **3. Los desplazamientos no caían en píxeles enteros.** `translateX(46%)` da
 * posiciones fraccionarias, y una letra a mitad de píxel se dibuja distinta en cada
 * fotograma.
 *
 * Lo que se atenúa ahora es un velo del color de fondo de la página puesto por
 * encima: visualmente idéntico a fundir el texto, pero los glifos se quedan opacos
 * y en la misma capa.
 *
 * ## El orden importa
 *
 * Una versión anterior sacaba la página vieja, **esperaba**, y cambiaba después.
 * Eso metía hasta 210 ms de latencia en cada toque, y si se tocaba otra vez en esa
 * ventana el segundo toque cancelaba el primero antes de que hubiera cambiado nada:
 * dos toques daban cero páginas. Desde fuera eso es «los gestos no funcionan».
 *
 * **Ahora la página cambia primero y se anima la que entra.** El toque tiene efecto
 * en el mismo fotograma. No hay fase de salida porque no puede haberla: con un solo
 * iframe la página vieja deja de existir en cuanto epub.js pinta la nueva.
 *
 * La excepción es el arrastre: ahí la hoja vieja sí se ve moverse, porque la mueve
 * el dedo mientras el contenido todavía no ha cambiado.
 */

/** Las dos formas de pasar página. */
export const PAGE_TRANSITIONS = {
    none: {
        label: 'Ninguna',
        description: 'Cambio instantáneo. Lo más rápido y lo único sin coste.',
        in: 0,
    },
    /**
     * Deslizar: la única que puede ser perfecta siempre.
     *
     * Mueve **un** elemento con una transformación. No monta nada, no copia nada
     * y no depende del tamaño del capítulo, que es lo que hundía al doblado de
     * hoja.
     *
     * Los 34 px de entrada no son un desplazamiento completo a propósito: la
     * página no viene de fuera de la pantalla, se **asienta**. Un recorrido largo
     * obliga al ojo a seguir el texto mientras se mueve y cansa a las cien
     * páginas; uno corto se lee como que la hoja se ha posado.
     */
    slide: {
        label: 'Deslizar',
        description: 'La página se asienta desde el lado hacia el que avanzas.',
        in: 190,
        shift: 34,
    },
};

/**
 * La de por defecto: deslizar.
 *
 * El doblado de hoja se ha retirado por tercera y última vez, y esta vez con la
 * causa medida y no supuesta. Para doblar una página hacía falta tenerla dos
 * veces, y la única forma de conseguirlo con epub.js era montar dos iframes con
 * el capítulo entero dentro: en un libro normal son 1,19 MB de HTML y CSS por
 * copia, 2,4 MB de documento vivo mientras se lee, reconstruidos en cada cambio
 * de capítulo.
 *
 * Eso explica exactamente los síntomas que se veían y que no se conseguían
 * reproducir a mano: que el lector se congelara de vez en cuando, y que fuera
 * más rápido o más lento **según el libro** — porque dependía del tamaño del
 * capítulo.
 *
 * Deslizar mueve un solo elemento con una transformación. No monta nada, no
 * copia nada y no puede quedarse a medias: cuesta lo mismo en un libro de
 * cuarenta páginas que en uno de mil.
 */
export const DEFAULT_TRANSITION = 'slide';

/**
 * Devuelve una transición válida.
 *
 * Los libros guardan la suya en sus preferencias, y por ahí quedan
 * `curl`, `paper`, `push`, `fade` y `zoom` de cuando había siete. Sin esto, un
 * libro empezado antes abriría el selector sin nada marcado.
 */
export const normalizeTransition = (id) => (
    PAGE_TRANSITIONS[id] ? id : DEFAULT_TRANSITION
);

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

    if (!spec || id === 'none' || phase === 'rest') return rest;

    // Avanzando, la página nueva viene desde la derecha; retrocediendo, desde la
    // izquierda. Es el sentido que dice hacia dónde te mueves en el libro.
    const from = direction === 'next' ? 1 : -1;

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

/** Escribe un estado en la capa. */
const paint = (element, veil, state, duration) => {
    if (!element) return;
    element.style.transitionDuration = `${duration}ms`;
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
 * @returns {{done: Promise<void>, cancel: () => void}}
 */
export const runTurn = ({
    element, veil, id, direction, commit, reducedMotion = false,
}) => {
    let cancelled = false;

    const apply = (state, duration) => paint(element, veil, state, duration);

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
