/**
 * Animaciones al pasar página.
 *
 * Ninguna es un volteo 3D con curvatura de papel: eso se ve muy bien en un
 * vídeo de tienda y marea en una hora de lectura, además de dar tirones en gama
 * baja. Lo que hay aquí son transiciones cortas —entre 180 y 300 ms— que
 * comunican la dirección del movimiento sin llamar la atención.
 *
 * La animación se aplica al contenedor del lector, no dentro del iframe: epub.js
 * repinta el iframe entero al cambiar de página, así que animar su contenido
 * daría un parpadeo en lugar de una transición.
 */

export const PAGE_TRANSITIONS = {
    none: {
        label: 'Ninguna',
        description: 'Cambio instantáneo. Lo más rápido en móviles lentos.',
        duration: 0,
    },
    fade: {
        label: 'Fundido',
        description: 'La página aparece atenuándose. Discreta y suave.',
        duration: 200,
    },
    slide: {
        label: 'Deslizar',
        description: 'La página entra desde el lado hacia el que avanzas.',
        duration: 240,
    },
    push: {
        label: 'Empujar',
        description: 'Como pasar una hoja de verdad, con algo de recorrido.',
        duration: 300,
    },
    zoom: {
        label: 'Acercar',
        description: 'La página crece ligeramente al entrar.',
        duration: 220,
    },
};

export const DEFAULT_TRANSITION = 'slide';

/**
 * Clase CSS que hay que aplicar al contenedor para una transición y dirección.
 * @param {keyof PAGE_TRANSITIONS} id
 * @param {'next'|'prev'} direction
 */
export const transitionClass = (id, direction) => {
    if (!id || id === 'none' || !PAGE_TRANSITIONS[id]) return '';
    return `turn turn-${id} turn-${direction}`;
};

export const transitionDuration = (id) => PAGE_TRANSITIONS[id]?.duration ?? 0;

/**
 * Aplica la animación a un elemento y la retira al terminar.
 *
 * Devuelve una función de limpieza porque el usuario puede pasar páginas más
 * rápido de lo que dura la animación: sin cancelar la anterior, las clases se
 * acumularían y la siguiente no se vería.
 *
 * @param {HTMLElement} element
 * @param {string} id
 * @param {'next'|'prev'} direction
 */
export const runTransition = (element, id, direction) => {
    if (!element) return () => {};

    const className = transitionClass(id, direction);
    if (!className) return () => {};

    const classes = className.split(' ');
    // Quitar y volver a añadir en el mismo fotograma no reinicia la animación:
    // hay que forzar un reflujo entre medias.
    element.classList.remove('turn', 'turn-fade', 'turn-slide', 'turn-push', 'turn-zoom', 'turn-next', 'turn-prev');
    void element.offsetWidth;
    element.classList.add(...classes);

    const timer = setTimeout(
        () => element.classList.remove(...classes),
        transitionDuration(id) + 40
    );

    return () => {
        clearTimeout(timer);
        element.classList.remove(...classes);
    };
};
