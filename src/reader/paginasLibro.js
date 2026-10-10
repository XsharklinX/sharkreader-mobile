/**
 * Números de página que no cambian.
 *
 * ## El problema
 *
 * La línea de estado decía «3 / 7»: la página dentro del capítulo, que depende
 * del tamaño de letra y del móvil. Con letra 22 pasaba a «5 / 11». No había forma
 * de decir a alguien «estoy en la página 134», ni de citar.
 *
 * ## Dos fuentes, en este orden
 *
 *  1. **La paginación impresa.** Muchos EPUB 3 —y los que vienen de editorial—
 *     traen una lista con dónde empieza cada página de la edición en papel. Es
 *     la buena: la misma que la del libro físico, la que se cita.
 *  2. **Páginas sintéticas**, cuando el libro no la trae: una cada 1.500
 *     caracteres de texto, sobre el mapa de posiciones que ya se calcula. Al
 *     contar texto y no pantalla, no cambian con la letra ni con el móvil.
 */

/** Caracteres por localización del mapa de epub.js. Ver `LOCATIONS_CHARS`. */
export const CARACTERES_POR_LOCALIZACION = 1024;

/** Caracteres por página sintética: lo que cabe en una página de novela impresa. */
export const CARACTERES_POR_PAGINA = 1500;

/**
 * Página sintética de una localización.
 *
 * @param {number} indice localización actual (desde 0)
 * @param {number} total localizaciones del libro
 * @returns {{pagina: number, total: number} | null}
 */
export const paginaSintetica = (indice, total) => {
    if (!total || total < 1 || indice < 0) return null;
    const porPagina = CARACTERES_POR_PAGINA / CARACTERES_POR_LOCALIZACION;
    return {
        pagina: Math.min(Math.floor(indice / porPagina) + 1, Math.ceil(total / porPagina)),
        total: Math.ceil(total / porPagina),
    };
};

/**
 * La página impresa en la que cae una posición: la última que **empieza** antes.
 *
 * @param {Array<{cfi: string, pagina: string}>} lista en orden de lectura
 * @param {string} cfi posición actual
 * @param {(a: string, b: string) => number} comparar como `EpubCFI.compare`
 * @returns {{pagina: string, total: string} | null}
 */
export const paginaImpresa = (lista, cfi, comparar) => {
    if (!lista?.length || !cfi) return null;
    let bajo = 0;
    let alto = lista.length - 1;
    let encontrada = -1;
    while (bajo <= alto) {
        const medio = (bajo + alto) >> 1;
        if (comparar(lista[medio].cfi, cfi) <= 0) {
            encontrada = medio;
            bajo = medio + 1;
        } else {
            alto = medio - 1;
        }
    }
    // Antes de la primera página numerada —portada, créditos— no hay número.
    if (encontrada < 0) return null;
    return { pagina: String(lista[encontrada].pagina), total: String(lista[lista.length - 1].pagina) };
};

/** El texto de la línea de estado: «pág. 134 de 512». */
/**
 * La localización donde empieza una página sintética.
 *
 * Hacia arriba, no hacia abajo: la página 30 empieza en la localización 42,48,
 * y la 42 todavía cuenta como página 29. Con `floor`, «ir a la página 30»
 * llevaba a la 29.
 */
export const localizacionDePagina = (pagina) =>
    Math.max(0, Math.ceil(((pagina - 1) * CARACTERES_POR_PAGINA) / CARACTERES_POR_LOCALIZACION));

export const etiquetaPagina = (datos) => (datos ? `pág. ${datos.pagina} de ${datos.total}` : '');
