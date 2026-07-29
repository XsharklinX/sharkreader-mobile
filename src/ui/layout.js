/**
 * Adaptación a tablets y plegables.
 *
 * El problema de una app de móvil en una tablet no es que se vea pequeña: es
 * que se ve *estirada*. Una lista pensada para 390 px de ancho puesta a 1100
 * deja una línea de texto de treinta caracteres flotando en medio de un desierto
 * gris, y una rejilla de portadas se convierte en portadas gigantes con tres por
 * fila. Ninguna de las dos cosas se arregla escalando.
 *
 * Lo que sí lo arregla es usar el ancho para enseñar **más cosas a la vez**, que
 * es lo que hace un plegable abierto o una tablet en horizontal: biblioteca a la
 * izquierda, libro a la derecha, sin perder de vista dónde estabas.
 *
 * ## Los cortes
 *
 * No son los de Bootstrap ni los de Material. Salen de lo que cabe:
 *
 *  - **< 600 px** — un móvil, en cualquier orientación. Una cosa cada vez.
 *  - **600–899 px** — móvil en horizontal, plegable cerrado, tablet pequeña en
 *    vertical. Cabe más contenido pero no dos paneles útiles: el de la
 *    izquierda quedaría por debajo de los 320 px en los que una lista de libros
 *    deja de ser legible.
 *  - **≥ 900 px** — plegable abierto o tablet en horizontal. Aquí sí caben los
 *    dos: 360 para la lista y el resto para el libro, que es más de lo que
 *    tiene un móvil entero.
 */

export const BREAKPOINT_MEDIUM = 600;
export const BREAKPOINT_WIDE = 900;

/** Ancho fijo del panel de biblioteca en modo dos paneles. */
export const SIDE_PANEL_WIDTH = 360;

/**
 * Modo de disposición para un tamaño de ventana.
 *
 * @param {number} width
 * @param {number} height
 * @returns {'compact'|'medium'|'expanded'}
 */
export const layoutFor = (width, height = 0) => {
    if (width >= BREAKPOINT_WIDE) return 'expanded';
    if (width >= BREAKPOINT_MEDIUM) return 'medium';
    return 'compact';
};

/**
 * ¿Se muestran los dos paneles a la vez?
 *
 * Solo en `expanded`, y solo con altura suficiente. Un móvil muy alargado en
 * horizontal puede pasar de 900 px de ancho con 380 de alto: ahí dos paneles
 * darían dos columnas de ocho líneas cada una, que es peor que una.
 */
export const showsTwoPanes = (width, height) =>
    layoutFor(width) === 'expanded' && height >= 480;

/**
 * Columnas de la rejilla de portadas.
 *
 * Se calcula por ancho disponible y no por número fijo de columnas: es lo que
 * mantiene la portada del mismo tamaño en un móvil y en una tablet, en vez de
 * hacerla crecer hasta ocupar media pantalla.
 *
 * @param {number} width      Ancho disponible para la rejilla.
 * @param {boolean} compact   Densidad compacta de ajustes.
 */
export const gridColumns = (width, compact = false) => {
    const target = compact ? 108 : 150;
    const gap = 12;
    return Math.max(2, Math.floor((width + gap) / (target + gap)));
};

/**
 * Ancho de contenido para pantallas de una sola columna.
 *
 * En una tablet, un formulario de ajustes a todo lo ancho da etiquetas a la
 * izquierda y controles a un palmo de distancia, y hay que barrer la pantalla
 * con la vista para relacionarlos. Se limita y se centra.
 */
export const contentMaxWidth = (width) =>
    (width >= BREAKPOINT_MEDIUM ? 680 : width);
