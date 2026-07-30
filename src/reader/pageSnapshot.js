/**
 * La página visible, como imagen.
 *
 * ## Por qué hace falta
 *
 * El doblado de hoja necesita pintar el contenido de la página **dos veces a la
 * vez**: la parte que sigue plana y la parte doblada, reflejada. Un elemento del
 * DOM no puede estar en dos sitios, y el contenido vive dentro de un iframe que
 * epub.js gestiona.
 *
 * Moon+ Reader puede hacerlo porque pinta el texto él mismo a una textura. Aquí el
 * equivalente es rasterizar a un canvas: a partir de ahí es un mapa de bits que se
 * dibuja, se recorta y se refleja tantas veces como haga falta, a coste cero por
 * fotograma.
 *
 * ## Por qué se rasteriza el capítulo entero y se recorta después
 *
 * El primer intento fue pedirle al rasterizador que recortara la página visible:
 * `x: 722` para la tercera página. **Devolvía una imagen en blanco.** El
 * rasterizador clona el documento y lo maqueta en una ventana propia, y las
 * columnas CSS no caen en las mismas coordenadas que en el iframe real, así que ese
 * recuadro apuntaba a vacío. Desplazar el clon con una transformación tampoco
 * funcionó.
 *
 * Lo que sí funciona —comprobado en el dispositivo— es rasterizar desde el origen,
 * porque ahí empieza el contenido en los dos. Así que se rasteriza el capítulo
 * completo y **el recorte lo hacemos nosotros** al dibujar, con `drawImage`, que es
 * exacto porque controlamos las dos coordenadas.
 *
 * ## Por qué se prepara por adelantado
 *
 * Rasterizar cuesta unos 200 ms. Hacerlo al empezar el gesto metería ese retardo
 * justo donde más se nota. Se hace tras asentarse la página, en el tiempo muerto en
 * que el usuario está leyendo.
 *
 * Si no está listo —o el capítulo es demasiado ancho, ver `MAX_WIDTH`— el pliegue no
 * se dibuja y se pasa página deslizando: mejor una animación simple que un tirón.
 */

/** Tope de memoria: dos capítulos, el actual y el anterior. */
const CACHE_LIMIT = 2;

/**
 * Ancho máximo del capítulo que se rasteriza, en píxeles.
 *
 * El capítulo entero son todas sus páginas en fila, unos 400 px cada una. Veinte
 * páginas son 8.000 px, que como canvas ocupan unos 30 MB. Más allá no compensa —y
 * hay dispositivos donde un canvas de más de 16.384 px de lado devuelve vacío sin
 * avisar—, así que en capítulos muy largos se renuncia al pliegue.
 */
export const MAX_WIDTH = 9000;

export const createPageSnapshot = () => {
    /** @type {Map<string, {canvas: HTMLCanvasElement}>} */
    const cache = new Map();
    let rendering = false;
    let html2canvas = null;

    const remember = (key, value) => {
        cache.set(key, value);
        if (cache.size > CACHE_LIMIT) {
            cache.delete(cache.keys().next().value);
        }
    };

    return {
        has: (key) => cache.has(key),
        get: (key) => cache.get(key) || null,

        /**
         * Rasteriza el capítulo visible.
         *
         * @param {string} key        Identificador del capítulo.
         * @param {Window} view       Ventana del iframe del capítulo.
         * @param {string} background Color de fondo del tema.
         */
        async capture(key, view, background, offset = { x: 0, y: 0 }) {
            if (!view || rendering) return null;
            if (cache.has(key)) return cache.get(key);

            const doc = view.document;
            if (!doc?.body) return null;

            const width = Math.round(view.innerWidth || 0);
            const height = Math.round(view.innerHeight || 0);
            if (!width || !height) return null;

            rendering = true;
            try {
                // Carga diferida: son unos 50 KB y solo hacen falta con el doblado
                // activo, que no es la única transición.
                if (!html2canvas) {
                    const module = await import('html2canvas-pro');
                    html2canvas = module.default || module;
                }

                const canvas = await html2canvas(doc.body, {
                    x: 0,
                    y: 0,
                    width,
                    height,
                    /**
                     * `scrollX` es la opción que existe para esto: le dice al
                     * rasterizador desde qué desplazamiento mirar el documento.
                     *
                     * Recortar con `x` devolvía blanco —el clon maqueta las
                     * columnas en otras coordenadas— y desplazar el clon con una
                     * transformación tampoco. Esto sí es lo que la librería
                     * entiende por «la parte que se está viendo».
                     */
                    scrollX: -Math.round(offset.x || 0),
                    scrollY: -Math.round(offset.y || 0),
                    scale: 1,
                    backgroundColor: background || '#12171D',
                    logging: false,
                    useCORS: false,
                    allowTaint: true,
                    removeContainer: true,
                });

                if (!canvas?.width) return null;
                const entry = { canvas };
                remember(key, entry);
                return entry;
            } catch {
                // Rasterizar es una mejora visual: si falla, el pliegue no se
                // dibuja. Nunca debe impedir pasar página.
                return null;
            } finally {
                rendering = false;
            }
        },

        clear() {
            cache.clear();
        },
    };
};

/**
 * Dónde está la página visible dentro del capítulo rasterizado.
 *
 * epub.js desplaza el iframe para mostrar la página actual, así que la diferencia
 * entre el rectángulo del iframe y el del contenedor es exactamente el
 * desplazamiento que hay que aplicar al recortar.
 *
 * @returns {{x: number, y: number}} Desplazamiento en píxeles enteros.
 */
export const pageOffset = (view, containerRect) => {
    const frameRect = view?.frameElement?.getBoundingClientRect();
    if (!frameRect || !containerRect) return { x: 0, y: 0 };
    return {
        x: Math.max(0, Math.round(containerRect.left - frameRect.left)),
        y: Math.max(0, Math.round(containerRect.top - frameRect.top)),
    };
};
