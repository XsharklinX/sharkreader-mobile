import { registerPlugin, Capacitor } from '@capacitor/core';

/**
 * Puente con el plugin nativo SharkPicker.
 *
 * El plugin ya deja cada libro copiado en el almacenamiento privado de la app,
 * así que aquí no se transfieren bytes: solo llega metadata y una ruta local.
 * Leer el contenido es responsabilidad de `readBookBlob()`, que usa el scheme
 * de Capacitor para que el WebView acceda al fichero directamente.
 */
const SharkPicker = registerPlugin('SharkPicker');

/**
 * @typedef {Object} PickedBook
 * @property {string} id    Identificador generado en el momento de copiar.
 * @property {string} name  Nombre original del fichero.
 * @property {'epub'|'pdf'} type
 * @property {number} size  Tamaño en bytes.
 * @property {string} path  Ruta absoluta dentro del almacenamiento privado.
 * @property {string} uri   URI de SAF de origen, solo informativa.
 */

/**
 * Lee un libro ya importado. `convertFileSrc` traduce la ruta nativa a una URL
 * que el WebView puede pedir por HTTP local — sin base64 y sin copiar el
 * fichero otra vez en memoria de JavaScript.
 *
 * @param {string} path
 * @returns {Promise<Blob>}
 */
export const readBookBlob = async (path) => {
    const url = Capacitor.convertFileSrc(path);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`No se pudo leer el libro (${response.status}).`);
    }
    return response.blob();
};

export const createSafPicker = () => ({
    /** @returns {Promise<{books: PickedBook[], failed: number, cancelled?: boolean}>} */
    pickBooks: () => SharkPicker.pickBooks(),

    /** @returns {Promise<{books: PickedBook[], failed: number, cancelled?: boolean}>} */
    pickFolder: () => SharkPicker.pickFolder(),

    /** Selector con filtro de backup (.json y .zip), no de libro. */
    pickBackup: () => SharkPicker.pickBackup(),

    /** @param {string} path */
    deleteBookFile: (path) => SharkPicker.deleteBookFile({ path }),
});

export { SharkPicker };
