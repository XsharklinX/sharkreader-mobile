/**
 * Cuentas de la paginación del modo lectura del PDF.
 *
 * El texto se compone en columnas CSS del ancho de la pantalla, igual que hace
 * epub.js con un capítulo: una columna es una página. Pasar página es mover la
 * tira una columna. Lo que hay aquí es cómo saber en qué columna cae cada
 * bloque, que es lo que permite volver a la misma frase al cambiar la letra y
 * decir en qué página del PDF vas.
 */

/** Paso entre columnas: ancho de una más el hueco que las separa. */
export const pasoDe = (ancho, hueco) => Math.max(1, ancho + hueco);

/** Columna en la que empieza un elemento, por su `offsetLeft` dentro de la tira. */
export const columnaDe = (izquierda, paso) => Math.max(0, Math.floor((izquierda + 1) / paso));

/** Cuántas columnas ocupa la tira entera. */
export const columnasDe = (anchoTotal, paso, hueco) =>
    Math.max(1, Math.round((anchoTotal + hueco) / paso));

/**
 * El bloque que manda en una columna: el último que **empieza** en ella o antes.
 *
 * Un párrafo que empezó en la columna anterior y sigue en esta es el que se está
 * leyendo, aunque no empiece aquí. Por eso no vale «el primero que empieza en
 * esta columna»: en una página que es toda continuación no habría ninguno.
 *
 * @param {Array<{columna: number, indice: number, pagina: number}>} bloques en orden
 * @param {number} columna
 */
export const anclaEn = (bloques, columna) => {
    let ancla = null;
    for (const bloque of bloques) {
        if (bloque.columna > columna) break;
        ancla = bloque;
    }
    return ancla || bloques[0] || null;
};

/**
 * La columna donde está el primer bloque de una página del PDF.
 *
 * Se usa al abrir: el libro se guardó en «página 41» y hay que aterrizar en la
 * columna donde empieza lo de la página 41. Si esa página no tiene bloques
 * —era una lámina que no se enseña, o se coció con la anterior— vale el primero
 * que venga después.
 */
export const columnaDePagina = (bloques, pagina) => {
    const encontrado = bloques.find((bloque) => bloque.pagina >= pagina);
    if (encontrado) return encontrado.columna;
    // Más allá del último bloque: la última columna, no la primera.
    return bloques.length ? bloques[bloques.length - 1].columna : 0;
};
