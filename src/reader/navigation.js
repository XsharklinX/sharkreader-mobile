/**
 * Saltar a un punto concreto del libro escribiéndolo.
 *
 * Un EPUB no tiene páginas: el mismo libro tiene 300 «páginas» con letra grande
 * y 180 con letra pequeña, y cambian en cuanto tocas el tamaño. Lo que sí es
 * estable es el mapa de localizaciones, que reparte el libro en trozos de igual
 * número de caracteres. Eso es lo que usamos como página, y por eso el total
 * cambia con la tipografía pero la posición dentro del texto no.
 *
 * Se aceptan tres formas de escribirlo porque cada una responde a una intención
 * distinta:
 *
 *   «120»    → la localización 120 (volver a un sitio anotado a mano)
 *   «35%»    → el 35% del libro (retomar por la barra de progreso)
 *   «12/340» → la página 12 de un total de 340 que el usuario tiene delante,
 *              que puede no coincidir con nuestro total actual; se reescala.
 *
 * La tercera existe porque alguien que viene de otra app o de la edición en
 * papel piensa en «página 12 de 340», y descartar ese formato obligaría a hacer
 * la regla de tres a mano.
 */

/**
 * Interpreta lo que el usuario ha escrito.
 *
 * @param {string} input
 * @param {number} totalLocations Total actual del mapa de localizaciones.
 * @returns {{kind: 'percent'|'location', value: number, label: string}|null}
 *   `value` es 0–1 para 'percent' y un índice para 'location'. `null` si lo
 *   escrito no significa nada, para no saltar a ciegas.
 */
export const parseGoTo = (input, totalLocations = 0) => {
    const text = String(input || '').trim().replace(',', '.');
    if (!text) return null;

    // «35%» o «35 %»
    const percentMatch = text.match(/^(\d{1,3}(?:\.\d+)?)\s*%$/);
    if (percentMatch) {
        const percent = Number(percentMatch[1]);
        if (percent < 0 || percent > 100) return null;
        return {
            kind: 'percent',
            value: percent / 100,
            label: `${formatNumber(percent)} % del libro`,
        };
    }

    // «pág. 134», «p 134», «página xii»: el número de página estable —el de la
    // edición impresa o el sintético—. Ver `paginasLibro.js`.
    const paginaMatch = text.match(/^p(?:á|a)?g?(?:ina)?\.?\s*([0-9]+|[ivxlc]+)$/i);
    if (paginaMatch) {
        return { kind: 'pagina', value: paginaMatch[1].toLowerCase(), label: `Página ${paginaMatch[1]}` };
    }

    // «12/340»: se reescala al total que tenemos ahora. Sin total propio no hay
    // forma de traducirlo, así que se rechaza en vez de adivinar.
    const fractionMatch = text.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (fractionMatch) {
        const page = Number(fractionMatch[1]);
        const outOf = Number(fractionMatch[2]);
        if (outOf <= 0 || page < 1 || page > outOf) return null;
        return {
            kind: 'percent',
            value: (page - 1) / outOf,
            label: `Página ${page} de ${outOf}`,
        };
    }

    // Un número suelto es una localización de las nuestras.
    const plainMatch = text.match(/^\d+$/);
    if (plainMatch) {
        const location = Number(text);
        // La localización 0 existe (el principio), pero el usuario cuenta desde
        // 1 porque es lo que se le muestra en la barra inferior.
        if (location < 1) return null;
        if (totalLocations > 0 && location > totalLocations) return null;
        return {
            kind: 'location',
            value: location - 1,
            label: totalLocations > 0
                ? `Posición ${location} de ${totalLocations}`
                : `Posición ${location}`,
        };
    }

    return null;
};

/** Sin decimales cuando es entero: «35 %», no «35.0 %». */
const formatNumber = (value) =>
    Number.isInteger(value) ? String(value) : value.toFixed(1);

/**
 * Texto de ayuda bajo el campo. Cambia según el total esté calculado o no,
 * porque mientras el mapa se genera no se puede prometer un rango.
 */
export const goToHint = (totalLocations = 0) =>
    totalLocations > 0
        ? `Escribe una página (pág. 134), una posición (1–${totalLocations}) o un porcentaje (35 %).`
        : 'Escribe un porcentaje (35 %) o una página (12/340).';
