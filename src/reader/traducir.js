import { detectLanguage, normalizeLang } from './detectLanguage.js';
import { IDIOMAS_TRADUCCION } from '../adapters/Traduccion.js';

/**
 * Traducir lo que se lee: idiomas y mensajes.
 *
 * El idioma del libro se deduce del texto que se ve y no del que declara el
 * EPUB: muchas traducciones conservan el `lang` del original, y traducir un
 * texto en español «desde el inglés» devuelve basura.
 */

export const DESTINO_POR_DEFECTO = () =>
    normalizeLang(globalThis.navigator?.language || 'es') || 'es';

export const nombreIdioma = (id) =>
    (IDIOMAS_TRADUCCION.find((i) => i.id === id)?.label || id).toLowerCase();

/** El idioma de un texto, con lo que declare el libro como respaldo. */
export const idiomaDe = (texto, declarado = '') =>
    normalizeLang(detectLanguage(texto) || declarado) || '';

/**
 * Un error de ML Kit, dicho de forma que se entienda.
 *
 * El caso que más va a pasar es el primero: el modelo del idioma no está y no
 * hay wifi para bajarlo.
 */
export const mensajeDeError = (error, de) => {
    const texto = String(error?.message || error || '');
    if (/descargar|download|wifi|network/i.test(texto)) {
        return `Para traducir del ${nombreIdioma(de)} hay que descargar ese idioma una vez (unos 30 MB). Conéctate a una wifi.`;
    }
    if (/no se puede traducir|unsupported/i.test(texto)) {
        return 'Este idioma no se puede traducir en el teléfono.';
    }
    return 'No se ha podido traducir.';
};

/**
 * Traduce un párrafo con los ajustes del usuario.
 *
 * @param {Object} opciones
 * @param {Object} opciones.traduccion puerto de traducción
 * @param {string} opciones.texto
 * @param {string} opciones.de idioma del libro
 * @param {{a?: string, soloWifi?: boolean}} [opciones.ajustes]
 */
export const traducirParrafo = async ({ traduccion, texto, de, ajustes = {} }) => {
    const a = ajustes.a || DESTINO_POR_DEFECTO();
    if (!traduccion) throw new Error('La traducción no está disponible en este dispositivo.');
    if (!de) throw new Error('No se sabe en qué idioma está este texto.');
    if (de === a) throw new Error(`Este texto ya está en ${nombreIdioma(a)}.`);
    try {
        const [traducido] = await traduccion.traducir(de, a, [texto], { soloWifi: ajustes.soloWifi !== false });
        return traducido;
    } catch (error) {
        throw new Error(mensajeDeError(error, de));
    }
};
