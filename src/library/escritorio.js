import { mergeBackupData } from '../core/backupMerge.js';
import { getBookDedupKey, getBookTitleDedupKey } from '../core/bookModel.js';

/**
 * El móvil y SharkReader de escritorio, por la wifi de casa.
 *
 * ## Qué resuelve
 *
 * Seguir en el móvil por donde ibas en el portátil, y al revés, sin cuenta, sin
 * nube y sin montar un servidor WebDAV. El escritorio escucha en la red local
 * mientras está abierto; el móvil, que es el que va y viene, le pregunta al
 * abrir la app, al abrir un libro y al cerrarlo.
 *
 * Por la red viaja el mismo backup portable que ya entienden las dos apps, y se
 * fusiona con el mismo `mergeBackupData` del núcleo compartido.
 *
 * ## Lo que no hace
 *
 * Traer al móvil libros que solo están en el ordenador: llegarían sin fichero
 * y no se podrían abrir. Solo se actualizan los que están en los dos lados.
 */

/** Puerto en el que escucha el escritorio si no se dice otro. */
export const PUERTO_ESCRITORIO = 47321;

/**
 * Convierte lo que el usuario teclea en una dirección utilizable.
 *
 * Acepta «192.168.1.20:47321/k7f2qa», con o sin `http://`, con espacios y con
 * la barra final. Sin puerto se pone el de siempre. Devuelve `null` si no tiene
 * forma de dirección local con clave.
 */
export const normalizarDireccion = (texto) => {
    let limpio = String(texto || '').trim().replace(/\s+/g, '').replace(/\/+$/, '');
    if (!limpio) return null;
    limpio = limpio.replace(/^https?:\/\//i, '');

    const partes = limpio.match(/^([a-z0-9.-]+)(?::(\d{2,5}))?\/([a-z0-9]{4,32})$/i);
    if (!partes) return null;
    const [, host, puerto, clave] = partes;
    return `http://${host}:${puerto || PUERTO_ESCRITORIO}/${clave.toLowerCase()}`;
};

/** El registro remoto que corresponde a un libro del móvil, por las claves de identidad del núcleo. */
export const registroRemoto = (libro, remotos = []) => {
    if (!libro) return null;
    const porId = remotos.find((r) => r?.id === libro.id);
    if (porId) return porId;
    const claves = [getBookDedupKey(libro), getBookTitleDedupKey(libro)].filter(Boolean);
    return remotos.find((r) => {
        const suyas = [getBookDedupKey(r), getBookTitleDedupKey(r)].filter(Boolean);
        return suyas.some((clave) => claves.includes(clave));
    }) || null;
};

/**
 * Fusiona la copia del escritorio con la del móvil, sin libros fantasma.
 *
 * Las dos copias van en porcentaje (ver `escalaProgreso.js`).
 *
 * @param {Object} local backup del móvil
 * @param {Object} remoto backup del escritorio
 * @returns {Object} backup fusionado, solo con los libros del móvil
 */
export const fusionarConEscritorio = (local, remoto) => {
    const fusion = mergeBackupData(local, remoto);
    const propios = new Set((local.books || []).map((libro) => libro.id));
    return { ...fusion, books: fusion.books.filter((libro) => propios.has(libro.id)) };
};

/** Margen para considerar «más reciente» una posición del otro dispositivo. */
const MARGEN_MS = 30_000;

const marcaDeProgreso = (libro) => Number(libro?.progressUpdatedAt || libro?.lastReadDate || 0);

/**
 * ¿Hay que proponer ir a donde se iba en el ordenador?
 *
 * Solo si allí se leyó **después** que aquí y la posición es otra. Si es la
 * misma, o si lo último fue aquí, no se molesta: la propuesta tiene que
 * aparecer cuando sirve y no cada vez que se abre un libro.
 *
 * @param {Object} libro libro del móvil (progreso en fracción)
 * @param {Object} remoto registro del escritorio (progreso en porcentaje)
 */
export const propuestaDePosicion = (libro, remoto) => {
    if (!libro || !remoto?.lastLocation) return null;
    if (marcaDeProgreso(remoto) <= marcaDeProgreso(libro) + MARGEN_MS) return null;
    if (String(remoto.lastLocation) === String(libro.lastLocation || '')) return null;

    const progreso = Math.min(1, Math.max(0, Number(remoto.progress || 0) / 100));
    if (Math.abs(progreso - Number(libro.progress || 0)) < 0.002) return null;

    return { cfi: String(remoto.lastLocation), progreso, cuando: marcaDeProgreso(remoto) };
};

/** «hace 20 min», «hace 3 h», «ayer», «hace 4 días». */
export const haceCuanto = (marca, ahora = Date.now()) => {
    const minutos = Math.max(0, Math.round((ahora - marca) / 60000));
    if (minutos < 1) return 'ahora mismo';
    if (minutos < 60) return `hace ${minutos} min`;
    const horas = Math.round(minutos / 60);
    if (horas < 24) return `hace ${horas} h`;
    const dias = Math.round(horas / 24);
    return dias === 1 ? 'ayer' : `hace ${dias} días`;
};
