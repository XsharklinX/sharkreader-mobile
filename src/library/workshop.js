import { WORKSHOP_ADDONS, getLocalizedText } from '../core/workshopModules.js';

/**
 * Addons del escritorio que no se portan a móvil.
 *
 * - watchedFolder: vigilar una carpeta en segundo plano necesita un servicio
 *   persistente que no compensa para esto.
 * - netflixView: es una vista alternativa de rejilla; en móvil la rejilla ya es
 *   de portadas, así que duplicaría la biblioteca sin aportar nada.
 * - externalSources: los catálogos OPDS y Calibre se aplazan a la v1.3.
 */
export const MOBILE_EXCLUDED_ADDONS = ['watchedFolder', 'netflixView', 'externalSources'];

/** Addons portables, ya con sus textos resueltos al idioma. */
export const getMobileAddons = (addons = WORKSHOP_ADDONS, lang = 'es') =>
    addons
        .filter((addon) => !MOBILE_EXCLUDED_ADDONS.includes(addon.id))
        .map((addon) => ({
            id: addon.id,
            label: getLocalizedText(addon.name, lang),
            desc: getLocalizedText(addon.desc, lang),
            category: addon.category,
        }));
