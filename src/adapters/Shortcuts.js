import { registerPlugin, Capacitor } from '@capacitor/core';

const SharkShortcuts = registerPlugin('SharkShortcuts');
const SharkWidget = registerPlugin('SharkWidget');

/**
 * Accesos directos del icono y widget de continuar leyendo.
 *
 * Los dos enseñan lo mismo desde sitios distintos —mantener pulsado el icono, y
 * la pantalla de inicio— y los dos existen para ahorrar el mismo recorrido:
 * abrir la app, esperar a la biblioteca, encontrar el libro.
 *
 * Se actualizan cuando cambia el orden de lectura reciente, no en cada página:
 * escribir en `SharedPreferences` y redibujar el widget en cada cambio de
 * página sería trabajo constante para mover una barra de progreso un píxel.
 */

/** Los que se ofrecen: últimos leídos sin terminar y con fichero disponible. */
export const recentForShortcuts = (books = [], limit = 4) =>
    books
        .filter((book) => (book.lastReadDate || 0) > 0 && book.sourcePath && !book.isFinished)
        .sort((a, b) => (b.lastReadDate || 0) - (a.lastReadDate || 0))
        .slice(0, limit);

/**
 * El libro que va en el widget.
 *
 * Deliberadamente el mismo criterio que la tarjeta «continuar» de la
 * biblioteca: si el widget y la app señalaran libros distintos, uno de los dos
 * estaría mintiendo.
 */
export const currentForWidget = (books = []) =>
    books
        .filter((book) => (book.progress || 0) > 0 && !book.isFinished && book.sourcePath)
        .sort((a, b) => (b.lastReadDate || 0) - (a.lastReadDate || 0))[0] || null;

const isNative = () => Capacitor.getPlatform() === 'android';

export const publishShortcuts = async (books) => {
    if (!isNative()) return;
    try {
        await SharkShortcuts.setBooks({
            books: recentForShortcuts(books).map((book) => ({
                id: book.id,
                title: book.name || 'Libro',
                cover: book.coverPath || '',
            })),
        });
    } catch {
        // Los accesos directos son un extra: un fabricante que no los soporte
        // no puede impedir que la app funcione.
    }
};

export const publishWidget = async (books) => {
    if (!isNative()) return;
    const book = currentForWidget(books);
    try {
        await SharkWidget.setCurrentBook(book ? {
            id: book.id,
            title: book.name || 'Libro',
            author: book.author || '',
            cover: book.coverPath || '',
            progress: Math.round((book.progress || 0) * 100),
        } : { id: '' });
    } catch {
        // Ver arriba.
    }
};

/**
 * Lee el libro que pide un acceso directo o el widget.
 *
 * Llega como `sharkreader://book/<id>`. Se devuelve solo el id; quien llama
 * decide si ese libro todavía existe — puede haberse borrado desde que se creó
 * el acceso directo, y abrir un libro inexistente sería peor que ignorarlo.
 */
export const bookIdFromUrl = (url) => {
    const match = String(url || '').match(/^sharkreader:\/\/book\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
};

/** ¿Es el acceso directo de «añadir libro»? */
export const isImportUrl = (url) => String(url || '') === 'sharkreader://import';
