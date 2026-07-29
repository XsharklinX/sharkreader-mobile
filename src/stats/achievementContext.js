/**
 * Contexto con el que se evalúan los logros.
 *
 * Las 59 condiciones del núcleo compartido esperan seis claves: `books`,
 * `stats`, `vocabulary`, `addons`, `addonConfig` y `yearlyGoal`. La mayoría se
 * protegen solas (`stats.hourlyLog || {}`), pero tres leen `vocabulary.length`
 * directamente. Pasar un contexto incompleto lanzaba un TypeError dentro de un
 * efecto de React que tumbaba toda la aplicación.
 *
 * Por eso el contexto se construye en un único sitio: cualquier pantalla que
 * evalúe logros usa esta función y nunca un objeto montado a mano.
 */

/** Funciones del escritorio que en móvil todavía no tienen equivalente. */
const MOBILE_DEFAULTS = {
    // El diccionario y el vocabulario llegan con el lector avanzado; hasta
    // entonces los tres logros de vocabulario simplemente no se cumplen.
    vocabulary: [],
    // El Workshop no está portado: ningún addon está activo.
    addons: {},
    addonConfig: {},
    yearlyGoal: 0,
};

/**
 * @param {Object[]} books
 * @param {Object} stats
 * @param {Object} [extra] Sobrescribe los valores por defecto cuando la función
 *                         correspondiente exista en móvil.
 */
export const buildAchievementContext = (books = [], stats = {}, extra = {}) => ({
    ...MOBILE_DEFAULTS,
    books: Array.isArray(books) ? books : [],
    stats: stats && typeof stats === 'object' ? stats : {},
    ...extra,
});
