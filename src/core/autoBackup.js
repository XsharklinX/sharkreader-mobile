/**
 * Copias de seguridad automáticas: cuándo se hacen y cuáles se conservan.
 *
 * ## Por qué existe
 *
 * La app ya sabía exportar una copia, pero había que acordarse de pedirla y de
 * guardarla en algún sitio. Una copia que depende de que el usuario se acuerde
 * es una copia que no existe el día que hace falta — y el día que hizo falta,
 * una biblioteca de 136 libros con su progreso y sus subrayados se perdió
 * entera al borrarse los datos de la app.
 *
 * ## Dónde se guarda, y por qué no dentro de la app
 *
 * En una carpeta que el usuario elige una vez. Guardar la copia en el
 * almacenamiento de la app no protege de lo único de lo que hay que protegerse:
 * borrar los datos o desinstalar se lleva la copia junto con lo que copiaba. Una
 * carpeta del almacenamiento compartido sobrevive a las dos cosas, y con el
 * Storage Access Framework no hace falta pedir ningún permiso: el usuario señala
 * la carpeta y la app solo puede tocar esa.
 *
 * ## Varias copias, no una
 *
 * Sobrescribir siempre el mismo fichero convierte cualquier error en pérdida
 * total: si lo que se guarda está mal —o el guardado se corta a la mitad— la
 * única copia buena se ha ido. Se conservan las últimas, así que hay a dónde
 * volver.
 *
 * Este módulo no toca ficheros: decide. Está en `core` porque la política es la
 * misma en cualquier plataforma y porque así se puede probar entera sin un
 * teléfono delante.
 */

/** Cuántas copias se conservan. Ver arriba por qué no es una. */
export const COPIAS = 5;

/**
 * Cada cuánto se hace una copia, como mucho.
 *
 * No se copia en cada cambio: una biblioteca grande son megas de JSON y
 * escribirlos cada vez que avanzas una página gastaría batería para guardar lo
 * mismo. Un día es el plazo en el que perder lo hecho todavía duele poco.
 */
export const CADA_MS = 24 * 60 * 60 * 1000;

/** Nombre de la copia de un día. El nombre ordena por sí solo. */
export const nombreCopia = (fecha) => {
    const d = new Date(fecha);
    const p = (n) => String(n).padStart(2, '0');
    return `sharkreader-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
};

/**
 * ¿Toca copiar?
 *
 * @param {{ultima?: number, carpeta?: string|null, libros?: number}} estado
 * @param {number} ahora
 */
export const tocaCopiar = ({ ultima = 0, carpeta = null, libros = 0 } = {}, ahora = Date.now()) => {
    // Sin carpeta elegida no hay dónde escribir, y sin libros no hay nada que
    // guardar: una copia vacía encima de las buenas sería peor que no copiar.
    if (!carpeta || libros <= 0) return false;
    return ahora - ultima >= CADA_MS;
};

/**
 * Cuáles sobran.
 *
 * Recibe las copias de la carpeta —ya ordenadas de más reciente a más antigua—
 * y devuelve las que hay que borrar. Se comparan por nombre, no por fecha del
 * sistema de ficheros: algunos proveedores de documentos devuelven la fecha en
 * cero y ordenar por ella dejaría el borrado a suertes.
 *
 * @param {{name: string, uri: string}[]} copias
 * @param {number} conservar
 */
export const sobran = (copias = [], conservar = COPIAS) => {
    const nuestras = copias.filter((c) => /^sharkreader-\d{4}-\d{2}-\d{2}\.json$/.test(c?.name || ''));
    const ordenadas = [...nuestras].sort((a, b) => b.name.localeCompare(a.name));
    return ordenadas.slice(Math.max(0, conservar));
};

/**
 * Qué contar al usuario sobre el estado de sus copias.
 *
 * Es la única parte de esto que el usuario ve, así que dice lo que importa:
 * cuándo fue la última y dónde están. «Activado» no informa de nada; «hace dos
 * días» sí.
 *
 * @param {{carpeta?: string|null, etiqueta?: string, ultima?: number}} estado
 * @param {number} ahora
 */
export const resumenCopias = ({ carpeta = null, etiqueta = '', ultima = 0 } = {}, ahora = Date.now()) => {
    if (!carpeta) {
        return {
            activo: false,
            titulo: 'Sin copias automáticas',
            detalle: 'Elige una carpeta y tu biblioteca se guardará sola cada día.',
        };
    }

    if (!ultima) {
        return {
            activo: true,
            titulo: etiqueta || 'Carpeta elegida',
            detalle: 'Todavía sin copias. Se hará la primera enseguida.',
        };
    }

    const dias = Math.floor((ahora - ultima) / (24 * 60 * 60 * 1000));
    const cuando = dias <= 0 ? 'hoy' : (dias === 1 ? 'ayer' : `hace ${dias} días`);
    return {
        activo: true,
        titulo: etiqueta || 'Carpeta elegida',
        detalle: `Última copia ${cuando}.`,
    };
};
