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

/**
 * Sobrescribe el fichero copiado con su versión convertida.
 *
 * Se usa cuando un TXT o un Markdown se transforma en EPUB durante la
 * importación: a partir de ahí lo que hay en disco ya es el EPUB, y el resto de
 * la app no necesita saber de dónde vino.
 *
 * @param {string} path Ruta absoluta dentro del almacenamiento privado.
 * @param {Blob} blob
 */
export const writeConvertedBook = async (path, blob) => {
    const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });

    // El plugin escribe por ruta absoluta porque el fichero vive donde él lo
    // dejó, fuera de los directorios que expone @capacitor/filesystem.
    await SharkPicker.writeBookFile({ path, data: base64 });
};

/**
 * Guarda un libro descargado de un catálogo y devuelve un `PickedBook`.
 *
 * Se devuelve con la misma forma que un fichero elegido a mano para que la
 * importación sea exactamente la misma: de dónde vino el fichero no debería
 * cambiar cómo se procesa.
 *
 * @param {string} name Nombre con extensión.
 * @param {Blob} blob
 */
export const saveDownloadedBook = async (name, blob) => {
    const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });

    const saved = await SharkPicker.saveDownloadedBook({ name, data: base64 });
    return { path: saved.path, name: saved.name, size: saved.size };
};

export const createSafPicker = () => ({
    /** @returns {Promise<{books: PickedBook[], failed: number, cancelled?: boolean}>} */
    pickBooks: () => SharkPicker.pickBooks(),

    /** @returns {Promise<{books: PickedBook[], failed: number, cancelled?: boolean}>} */
    pickFolder: () => SharkPicker.pickFolder(),

    /** Elige una imagen de la galería y la devuelve como data URL. */
    pickImage: () => SharkPicker.pickImage(),

    /** Selector con filtro de backup (.json y .zip), no de libro. */
    pickBackup: () => SharkPicker.pickBackup(),

    /**
     * Reclama el libro que otra app pidió abrir con «Abrir con SharkReader».
     * Devuelve `{ book: null }` si no hay ninguno pendiente.
     */
    consumePendingOpen: () => SharkPicker.consumePendingOpen(),

    /** @param {string} path */
    deleteBookFile: (path) => SharkPicker.deleteBookFile({ path }),
});

export { SharkPicker };
