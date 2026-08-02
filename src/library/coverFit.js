/**
 * Cómo encajar una portada en su celda.
 *
 * ## El problema
 *
 * La rejilla necesita celdas del mismo alto: filas de distinta altura se ven como
 * una lista rota, y es justo lo que la vista de estante se inventó para arreglar.
 * Pero las cubiertas de los EPUB vienen de todo: una novela típica ronda el 2:3,
 * un cómic es casi cuadrado y algún manual es apaisado.
 *
 * Rellenar siempre la celda —`object-fit: cover`— corta lo que sobra, y lo que
 * sobra en una portada cuadrada metida en un hueco 2:3 es **un tercio de la
 * imagen, casi siempre por arriba**, que es donde va el título. En una rejilla de
 * 136 libros eso convierte en irreconocibles justo los que no son novelas.
 *
 * ## La regla
 *
 * Si el recorte es imperceptible, se recorta; si no, se respeta la portada.
 *
 * El umbral está en el 8 % de diferencia de proporción. Por debajo se pierden unos
 * milímetros de borde que nadie echa en falta y a cambio la celda queda llena. Por
 * encima aparecen bandas, y para que no se vean como un fallo se rellenan con la
 * propia cubierta desenfocada: el hueco pertenece a la imagen en vez de ser un
 * rectángulo gris del sistema.
 */

/** Proporción de la celda de la rejilla: ancho / alto. */
export const RATIO_CELDA = 2 / 3;

/** Diferencia de proporción que se acepta recortar sin avisar. */
export const TOLERANCIA = 0.08;

/**
 * @param {number} ancho  Ancho natural de la imagen, en píxeles.
 * @param {number} alto   Alto natural.
 * @param {number} [ratioCelda]
 * @returns {'rellena'|'contiene'} `rellena` recorta para llenar; `contiene` deja bandas.
 */
export const ajusteDePortada = (ancho, alto, ratioCelda = RATIO_CELDA) => {
    // Sin medidas todavía se rellena: es lo que hace bien el 90 % de las veces, y
    // es mejor que la celda cambie de aspecto una vez a que parpadee al revés.
    if (!ancho || !alto || !ratioCelda) return 'rellena';

    const ratio = ancho / alto;

    // La diferencia se mide en proporción relativa y no en resta: entre 0,5 y 0,58
    // hay lo mismo que entre 1,5 y 1,74, y restando el segundo caso parecería
    // cinco veces peor.
    const desvio = Math.abs(ratio - ratioCelda) / ratioCelda;

    return desvio <= TOLERANCIA ? 'rellena' : 'contiene';
};

/**
 * Cuánto se perdería al recortar, de 0 a 1.
 *
 * No lo usa la rejilla; existe para poder decir en una prueba «esta portada pierde
 * el 33 %» en vez de comparar cadenas, que es lo que hace que un umbral mal puesto
 * pase desapercibido.
 */
export const recortePerdido = (ancho, alto, ratioCelda = RATIO_CELDA) => {
    if (!ancho || !alto || !ratioCelda) return 0;

    const ratio = ancho / alto;
    // Al rellenar se escala hasta cubrir y se corta el lado que sobra.
    return ratio > ratioCelda
        ? 1 - ratioCelda / ratio   // sobra ancho: se cortan los lados
        : 1 - ratio / ratioCelda;  // sobra alto: se corta arriba y abajo
};
