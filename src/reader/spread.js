/**
 * Dos columnas cuando la pantalla es ancha.
 *
 * El problema que resuelve: en horizontal, un móvil da unos 780 px de ancho.
 * Con una sola columna eso son noventa caracteres por línea, y a partir de unos
 * setenta y cinco el ojo empieza a perder el salto de línea — vuelves y relees
 * la misma. Es el motivo real por el que un libro en papel apaisado siempre se
 * compone a dos columnas, y por el que leer en horizontal se siente peor que en
 * vertical aunque quepa más texto.
 *
 * El umbral está en 620 px y no en los 800 que trae epub.js por defecto: con 800
 * ningún móvil en horizontal llegaría nunca, que es justo el caso que esto
 * existe para arreglar. A 620 entran los móviles apaisados y las tablets, y se
 * quedan fuera los verticales, donde dos columnas darían cuarenta caracteres de
 * ancho y sobrarían.
 */

/** Ancho mínimo, en píxeles CSS, para que quepan dos columnas. */
export const SPREAD_MIN_WIDTH = 620;

export const SPREAD_MODES = {
    auto: { label: 'Automático', description: 'Dos columnas al girar el móvil' },
    none: { label: 'Una columna', description: 'Siempre una, gires como gires' },
};

/**
 * ¿Cuántas columnas tocan?
 *
 * @param {number} width Ancho disponible en píxeles CSS.
 * @param {'auto'|'none'} mode
 * @returns {1|2}
 */
export const columnsFor = (width, mode = 'auto') => {
    if (mode === 'none') return 1;
    return width >= SPREAD_MIN_WIDTH ? 2 : 1;
};

/** Valor que espera epub.js en `rendition.spread()`. */
export const spreadValue = (mode = 'auto') => (mode === 'none' ? 'none' : 'auto');

/**
 * Margen efectivo según el número de columnas.
 *
 * Con dos columnas el margen exterior configurado se reparte peor: el hueco
 * entre columnas ya separa los dos bloques de texto, así que mantener el margen
 * completo a los lados deja las columnas estrechas sin motivo. Se reduce a dos
 * tercios, con un mínimo de 12 px para que el texto no toque el borde de la
 * pantalla — en un móvil eso significa el dedo tapando la primera letra.
 *
 * @param {number} margin Margen configurado por el usuario.
 * @param {1|2} columns
 */
export const marginForColumns = (margin, columns) =>
    columns === 2 ? Math.max(12, Math.round(margin * 0.66)) : margin;
