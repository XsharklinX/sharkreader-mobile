/**
 * Metadata y portadas desde OpenLibrary.
 *
 * Sin registro y sin clave de API — es la razón por la que el escritorio la
 * eligió y sigue siendo válida aquí. Se usa solo cuando el usuario lo pide
 * explícitamente desde la ficha de un libro: una app que se vende como
 * local-first no puede salir a internet por su cuenta con los títulos de tu
 * biblioteca.
 */

const SEARCH = 'https://openlibrary.org/search.json';
const COVER = 'https://covers.openlibrary.org/b/id';

/** Limpia un título de los adornos que traen los nombres de fichero. */
export const cleanTitle = (raw = '') => String(raw)
    .replace(/\.[^/.]+$/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Convierte un resultado de OpenLibrary a nuestro formato. */
export const parseResult = (doc) => ({
    key: doc.key || '',
    title: doc.title || '',
    author: (doc.author_name || [])[0] || '',
    year: doc.first_publish_year || null,
    publisher: (doc.publisher || [])[0] || '',
    pages: doc.number_of_pages_median || null,
    subjects: (doc.subject || []).slice(0, 6),
    coverId: doc.cover_i || null,
    coverUrl: doc.cover_i ? `${COVER}/${doc.cover_i}-L.jpg` : null,
});

/**
 * Busca candidatos para un libro.
 *
 * @returns {Promise<{results: Object[], offline: boolean}>}
 */
export const searchMetadata = async ({ title, author = '', isbn = '' }) => {
    // Un ISBN identifica la edición exacta: se busca por él y no por el título,
    // que en un fichero llamado «9788497592208.pdf» no existe.
    const query = isbn ? '' : cleanTitle(title);
    if (!query && !isbn) return { results: [], offline: false };

    const params = new URLSearchParams(isbn ? { q: `isbn:${isbn}`, limit: '3' } : { title: query, limit: '8' });
    if (!isbn && author && author !== 'Autor desconocido') params.set('author', author);

    try {
        const response = await fetch(`${SEARCH}?${params}`);
        if (!response.ok) return { results: [], offline: false };
        const data = await response.json();
        return {
            results: (data.docs || []).map(parseResult).filter((item) => item.title),
            offline: false,
        };
    } catch {
        return { results: [], offline: true };
    }
};

/**
 * Descarga una portada y la devuelve como data URL para guardarla con el libro.
 *
 * Se guarda la imagen, no la URL: la biblioteca tiene que seguir funcionando
 * sin conexión, y una portada que solo carga con red rompería esa promesa.
 */
export const fetchCover = async (coverUrl) => {
    if (!coverUrl) return null;
    try {
        const response = await fetch(coverUrl);
        if (!response.ok) return null;
        const blob = await response.blob();
        // Una portada "no encontrada" de OpenLibrary vuelve como una imagen de
        // 1 píxel; se descarta por tamaño en lugar de guardarla como válida.
        if (blob.size < 1000) return null;

        return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
};

/**
 * Campos que aplicar al libro a partir de un resultado elegido.
 *
 * Solo se toca lo que el usuario no haya editado a mano: si puso un título
 * propio, una búsqueda automática no debe pisarlo.
 */
export const applyMetadata = (book, result, coverBase64 = null) => {
    const changes = { metadataUpdatedAt: Date.now() };

    if (!book.customTitle && result.title) changes.originalTitle = result.title;
    if (!book.customAuthor && result.author) changes.originalAuthor = result.author;
    if (result.publisher && !book.publisher) changes.publisher = result.publisher;
    if (result.subjects?.length && !book.tags) changes.tags = result.subjects.join(', ');
    if (coverBase64) changes.customCover = coverBase64;

    return changes;
};
