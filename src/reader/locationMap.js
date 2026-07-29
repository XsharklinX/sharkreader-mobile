/**
 * Mapa de posiciones: cuándo se calcula y cuánto estorba.
 *
 * El mapa es lo que permite decir «vas por el 34 %», saltar a una posición y
 * estimar lo que queda. Se calcula una vez por libro recorriendo el spine
 * entero y en una novela larga son varios segundos.
 *
 * **El problema no era el que parecía.** Al mirarlo de cerca, epub.js ya cede el
 * hilo entre capítulos —espera 100 ms entre cada uno—, así que la app nunca
 * estuvo del todo bloqueada. Lo que pasaba es que la apertura del libro
 * *esperaba* al mapa entero antes de dar el libro por listo: la primera página
 * ya estaba renderizada detrás, pero la pantalla seguía diciendo «Abriendo…»
 * durante todo el cálculo. Se estaba haciendo esperar por un dato que no hace
 * falta para leer la primera página.
 *
 * Así que el mapa pasa a construirse **después** de abrir, en segundo plano, y
 * con dos ajustes:
 *
 *  - La espera entre capítulos baja de 100 ms a 24. Con cuarenta capítulos, los
 *    100 ms de serie son cuatro segundos de espera pura, sin contar el trabajo.
 *    24 ms sigue dejando un hueco por fotograma para pintar y atender al dedo.
 *  - Mientras no hay mapa, el porcentaje y el «quedan X minutos» no se
 *    inventan: se muestra el avance del capítulo, que sí se conoce desde el
 *    primer momento.
 *
 * **Por qué no un Web Worker**, que era el plan: epub.js construye el mapa
 * parseando el XHTML de cada capítulo con `DOMParser`, y `DOMParser` no existe
 * en el ámbito de un worker. Reimplementar el recorrido sin DOM obligaría a
 * reimplementar la generación de CFI, que es el formato del que dependen los
 * subrayados y la posición guardada de todos los libros que el usuario ya
 * tiene. El coste no se acerca al beneficio, sobre todo cuando el problema real
 * era el orden de arranque y no el cálculo.
 */

/** Espera entre capítulos, en ms. Ver arriba por qué no son los 100 de serie. */
export const SECTION_PAUSE_MS = 24;

/**
 * Estado del mapa para la interfaz.
 *
 * @param {{done: number, total: number, ready: boolean}} progress
 * @returns {{visible: boolean, percent: number, label: string}}
 */
export const mapStatus = ({ done = 0, total = 0, ready = false } = {}) => {
    if (ready || total === 0) return { visible: false, percent: 100, label: '' };

    const percent = Math.min(100, Math.round((done / total) * 100));

    // Por debajo del 5 % el aviso aparecería y desaparecería en libros cortos,
    // que molesta más de lo que informa. Y con el último capítulo procesado se
    // retira ya, sin esperar a que el guardado en disco confirme: el dato ya
    // está disponible y dejarlo puesto parecería que sigue trabajando.
    return {
        visible: percent >= 5 && done < total,
        percent,
        label: `Calculando posiciones… ${percent} %`,
    };
};

/**
 * Qué se muestra como progreso.
 *
 * **Siempre el porcentaje del libro.** Antes se enseñaba «47 min restantes»
 * cuando había datos suficientes, y eso tiene tres problemas:
 *
 *  1. Es una estimación sobre una estimación —tu ritmo medio aplicado a lo que
 *     queda— así que baila al leer más rápido o más despacio y da la sensación de
 *     que el libro cambia de largo.
 *  2. No sirve para orientarse. La pregunta al mirar ahí es «por dónde voy», y
 *     un tiempo no la responde: hay que hacer la cuenta al revés.
 *  3. **En modo continuo no había forma de calcularlo igual.** El tiempo restante
 *     se deduce de los minutos leídos y el progreso, y desplazando el progreso
 *     cambia de forma continua mientras los minutos no: el número saltaba.
 *
 * El porcentaje sale del mapa de posiciones, que es el mismo dato en los dos
 * modos: `locations.percentageFromCfi`. Un CFI es un CFI, esté paginado o
 * desplazándose, así que el medidor es idéntico y no hay dos cálculos que
 * mantener sincronizados.
 *
 * Mientras el mapa se construye no se puede saber el porcentaje del libro, solo
 * el del capítulo. Se dice cuál de los dos es en lugar de enseñar un cero.
 */
export const progressLabel = ({ ready, bookPercent = 0, chapterPercent = 0 }) => (ready
    ? { text: `${Math.round(bookPercent)} %`, of: 'del libro', exact: true }
    : { text: `${Math.round(chapterPercent)} %`, of: 'del capítulo', exact: false });
