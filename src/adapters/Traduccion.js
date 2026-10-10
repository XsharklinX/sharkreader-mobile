import { registerPlugin } from '@capacitor/core';

/**
 * Traducción en el teléfono. Ver `SharkTraduccionPlugin.java`.
 *
 * Lo traducido se recuerda mientras la app está abierta: volver a tocar un
 * párrafo, o que lo pidan las glosas para la misma palabra, no repite el
 * trabajo.
 */
const SharkTraduccion = registerPlugin('SharkTraduccion');

/** Idiomas que ofrece la app como destino. ML Kit admite más; estos son los que se eligen. */
export const IDIOMAS_TRADUCCION = [
    { id: 'es', label: 'Español' },
    { id: 'en', label: 'Inglés' },
    { id: 'fr', label: 'Francés' },
    { id: 'de', label: 'Alemán' },
    { id: 'it', label: 'Italiano' },
    { id: 'pt', label: 'Portugués' },
    { id: 'ca', label: 'Catalán' },
    { id: 'nl', label: 'Neerlandés' },
];

export const createTraduccion = () => {
    const memoria = new Map();
    const preparados = new Set();

    const preparar = async (de, a, { soloWifi = true } = {}) => {
        const par = `${de}>${a}`;
        if (preparados.has(par)) return;
        await SharkTraduccion.preparar({ de, a, soloWifi });
        preparados.add(par);
    };

    return {
        async descargados() {
            try {
                return (await SharkTraduccion.descargados())?.idiomas || [];
            } catch {
                return [];
            }
        },

        preparar,

        /**
         * @param {string} de idioma del libro
         * @param {string} a idioma al que se traduce
         * @param {string[]} textos
         * @returns {Promise<string[]>}
         */
        async traducir(de, a, textos, opciones) {
            if (de === a) return textos;
            const pendientes = textos.filter((t) => !memoria.has(`${de}>${a}:${t}`));
            if (pendientes.length) {
                await preparar(de, a, opciones);
                const { textos: traducidos } = await SharkTraduccion.traducir({ de, a, textos: pendientes });
                pendientes.forEach((t, i) => memoria.set(`${de}>${a}:${t}`, traducidos?.[i] || ''));
            }
            return textos.map((t) => memoria.get(`${de}>${a}:${t}`) || '');
        },
    };
};

export { SharkTraduccion };
