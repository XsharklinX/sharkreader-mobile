import { SharkPicker } from '../adapters/SafPicker.js';
import { buildBackup, parseBackupFile } from './backup.js';
import { nombreCopia, tocaCopiar, sobran, COPIAS } from '../core/autoBackup.js';

/**
 * El que ejecuta la política de copias.
 *
 * La decisión —cuándo copiar, qué conservar— vive en `core/autoBackup.js` y se
 * prueba sin teléfono. Aquí solo se mueven bytes: leer la biblioteca, escribir
 * el fichero en la carpeta que eligió el usuario y borrar lo que sobra.
 */

/** Dónde se guarda el estado de las copias. */
export const CARPETA_KEY = 'backup.folder';
export const ETIQUETA_KEY = 'backup.folderLabel';
export const ULTIMA_KEY = 'backup.lastRun';

const aBase64 = (texto) => {
    // `btoa` no admite caracteres fuera de Latin-1, y un backup lleva títulos de
    // libros con tildes, comillas tipográficas y a veces japonés. Se codifica a
    // UTF-8 antes de pasarlo a base64, que es lo que el lado nativo descodifica.
    const bytes = new TextEncoder().encode(texto);
    let binario = '';
    // De mil en mil: `String.fromCharCode(...bytes)` con un array grande revienta
    // la pila de llamadas, y un backup son megas.
    for (let i = 0; i < bytes.length; i += 1024) {
        binario += String.fromCharCode(...bytes.subarray(i, i + 1024));
    }
    return btoa(binario);
};

const deBase64 = (base64) => {
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
    return new TextDecoder().decode(bytes);
};

/** Lee el estado guardado de las copias. */
export const leerEstado = async (storage) => ({
    carpeta: (await storage.getSetting(CARPETA_KEY)) || null,
    etiqueta: (await storage.getSetting(ETIQUETA_KEY)) || '',
    ultima: Number(await storage.getSetting(ULTIMA_KEY)) || 0,
});

/**
 * Pide una carpeta al usuario y la recuerda.
 *
 * @returns {Promise<{carpeta: string|null, etiqueta: string}>}
 */
export const elegirCarpeta = async (storage) => {
    const elegida = await SharkPicker.pickBackupFolder();
    if (!elegida?.uri) return { carpeta: null, etiqueta: '' };

    await storage.setSetting(CARPETA_KEY, elegida.uri);
    await storage.setSetting(ETIQUETA_KEY, elegida.label || '');
    return { carpeta: elegida.uri, etiqueta: elegida.label || '' };
};

/** Deja de copiar. No borra lo ya copiado: es del usuario. */
export const olvidarCarpeta = async (storage) => {
    await storage.setSetting(CARPETA_KEY, '');
    await storage.setSetting(ETIQUETA_KEY, '');
};

/**
 * Hace una copia ahora, pase lo que pase.
 *
 * @returns {Promise<{ok: boolean, nombre?: string, error?: string}>}
 */
export const copiarAhora = async ({ storage, books, ahora = Date.now() }) => {
    const { carpeta } = await leerEstado(storage);
    if (!carpeta) return { ok: false, error: 'No hay carpeta de copias elegida.' };

    try {
        const stats = (await storage.getSetting('stats')) || {};
        const achievements = (await storage.getSetting('achievements')) || {};
        const backup = buildBackup(books, stats, achievements);
        const nombre = nombreCopia(ahora);

        await SharkPicker.writeBackup({
            uri: carpeta,
            name: nombre,
            data: aBase64(JSON.stringify(backup)),
        });

        // La fecha se apunta **después** de escribir. Apuntarla antes haría que
        // un fallo de escritura pareciera una copia hecha, y nadie volvería a
        // intentarlo hasta el día siguiente.
        await storage.setSetting(ULTIMA_KEY, ahora);

        await rotar(carpeta);
        return { ok: true, nombre };
    } catch (error) {
        return { ok: false, error: error?.message || 'No se pudo guardar la copia.' };
    }
};

/** Borra las copias que sobran. Nunca toca ficheros que no ha escrito la app. */
const rotar = async (carpeta) => {
    try {
        const { files } = await SharkPicker.listBackups({ uri: carpeta });
        for (const vieja of sobran(files || [], COPIAS)) {
            await SharkPicker.deleteBackup({ uri: vieja.uri });
        }
    } catch {
        // Si la rotación falla se queda alguna copia de más, que es el lado
        // seguro del error.
    }
};

/**
 * Copia si toca. Es lo que se llama al arrancar y al dejar la app en segundo
 * plano.
 */
export const copiarSiToca = async ({ storage, books, ahora = Date.now() }) => {
    const estado = await leerEstado(storage);
    if (!tocaCopiar({ ...estado, libros: books?.length || 0 }, ahora)) return { ok: false, omitida: true };
    return copiarAhora({ storage, books, ahora });
};

/** Las copias que hay en la carpeta, de la más reciente a la más antigua. */
export const listarCopias = async (storage) => {
    const { carpeta } = await leerEstado(storage);
    if (!carpeta) return [];
    try {
        const { files } = await SharkPicker.listBackups({ uri: carpeta });
        return files || [];
    } catch {
        return [];
    }
};

/**
 * Lee una copia de la carpeta y la deja validada, lista para fusionar.
 *
 * Pasa por `parseBackupFile`, igual que un backup elegido a mano: una copia
 * automática no merece menos comprobaciones que una traída de fuera. Si se
 * escribió a medias, aquí se descubre — y no después de haber machacado la
 * biblioteca con ella.
 */
export const leerCopia = async (uri) => {
    const { data } = await SharkPicker.readBackup({ uri });
    const texto = deBase64(data);
    // `parseBackupFile` envuelve el resultado en `{ backup, warnings }`. Lo que
    // se devuelve aquí es el backup: ver `mergeIntoLibrary`, donde pasar el
    // envoltorio hacía que no se restaurara nada sin decirlo.
    const { backup } = await parseBackupFile(new Blob([texto], { type: 'application/json' }), 'copia.json');
    return backup;
};
