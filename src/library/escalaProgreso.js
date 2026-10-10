/**
 * El progreso de un libro, entre esta app y el resto del mundo.
 *
 * ## El fallo que arregla
 *
 * Dentro del móvil el progreso va de 0 a 1 (es lo que da epub.js). En el
 * formato de backup —el que comparte con el escritorio, y el que valida
 * `backupValidation`, que lo limita a 0–100— va **en porcentaje**. El móvil
 * escribía sus fracciones tal cual y leía los porcentajes tal cual:
 *
 *  - Un libro al 45 % en el escritorio llegaba al móvil como «4.500 %».
 *  - Uno al 45 % en el móvil llegaba al escritorio como «0,45 %».
 *
 * Así que la conversión se hace aquí, en la frontera, y en ningún otro sitio:
 * dentro de la app todo sigue siendo fracción.
 *
 * ## Las copias antiguas del propio móvil
 *
 * Las que ya hay guardadas —copias automáticas, sincronizaciones, ficheros
 * exportados— están en fracción y no lo dicen. Se reconocen porque **ningún**
 * libro pasa de 1: en una biblioteca de verdad, en porcentaje, casi siempre hay
 * alguno por encima del 1 %. El único caso dudoso es una biblioteca entera sin
 * empezar, y ahí da igual: cero es cero en las dos escalas.
 */

const recortar = (valor, maximo) => Math.min(maximo, Math.max(0, Number(valor) || 0));

/** ¿Este backup está en fracción (copia antigua del móvil)? */
export const estaEnFraccion = (backup) => {
    const libros = Array.isArray(backup?.books) ? backup.books : [];
    return libros.length > 0 && libros.every((libro) => !(Number(libro?.progress) > 1));
};

/** Un backup cualquiera, con el progreso en porcentaje. */
export const backupEnPorcentaje = (backup) => {
    if (!backup || !Array.isArray(backup.books) || !estaEnFraccion(backup)) return backup;
    return {
        ...backup,
        books: backup.books.map((libro) => ({ ...libro, progress: recortar(Number(libro.progress) * 100, 100) })),
    };
};

/** Un registro de esta app (fracción) listo para salir en un backup. */
export const libroEnPorcentaje = (registro) => ({
    ...registro,
    progress: Math.round(recortar(registro?.progress, 1) * 100 * 100) / 100,
});

/** Un registro de un backup (porcentaje) listo para entrar en esta app. */
export const libroEnFraccion = (registro) => ({
    ...registro,
    progress: recortar(registro?.progress, 100) / 100,
});

/**
 * Repara un libro ya guardado con el progreso en porcentaje.
 *
 * Quien importó una copia del escritorio antes de este arreglo tiene libros con
 * `progress` de 45 en vez de 0,45. Dentro de la app nunca puede pasar de 1, así
 * que cualquier valor mayor es de ese fallo.
 */
export const progresoReparado = (libro) => (
    Number(libro?.progress) > 1
        ? { ...libro, progress: recortar(libro.progress, 100) / 100 }
        : libro
);
