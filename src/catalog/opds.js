/**
 * Catálogos OPDS y Calibre.
 *
 * OPDS es un Atom con convenciones: cada `<entry>` es un libro o una carpeta, y
 * lo que distingue una cosa de otra es el `rel` de sus enlaces. Lo usan Calibre
 * (su «content server»), Standard Ebooks, Project Gutenberg, calibre-web, COPS y
 * casi cualquier servidor de biblioteca personal.
 *
 * **SharkReader no distribuye libros.** Esto conecta con servidores que ya son
 * del usuario o con catálogos de dominio público. La app no aloja nada ni actúa
 * de intermediario.
 *
 * ## Por qué se parsea con DOMParser y no con una librería
 *
 * Hace falta un XML bien formado, que es exactamente lo que un feed Atom es. Y
 * `DOMParser` ya está en el WebView: añadir un parser de XML al bundle por esto
 * serían cientos de KB para todos por una función que usará una minoría.
 *
 * ## Las dos versiones de OPDS
 *
 * La 1.x es Atom/XML y es la que sirve prácticamente todo lo que existe hoy,
 * Calibre incluido. La 2.0 es JSON y casi nadie la ha adoptado. Se soportan las
 * dos porque distinguirlas es mirar el `Content-Type`, pero el peso está en la
 * 1.x, que es lo que la gente va a conectar de verdad.
 */

/** Tipos MIME de libro que sabemos abrir, en orden de preferencia. */
export const ACQUIRABLE_TYPES = [
    'application/epub+zip',
    'application/pdf',
    'application/vnd.comicbook+zip',
    'application/x-cbz',
    'text/plain',
];

const REL_ACQUISITION = 'http://opds-spec.org/acquisition';
const REL_IMAGE = 'http://opds-spec.org/image';
const REL_THUMB = 'http://opds-spec.org/image/thumbnail';

/**
 * Resuelve una URL relativa contra la del catálogo.
 *
 * Los feeds mezclan absolutas y relativas sin criterio, y Calibre las da
 * relativas casi siempre. Sin resolverlas, la mitad de las descargas apuntarían
 * a ninguna parte.
 */
export const resolveUrl = (href, base) => {
    if (!href) return '';
    try {
        return new URL(href, base).toString();
    } catch {
        return href;
    }
};

/** ¿Este enlace descarga un libro? */
const isAcquisition = (rel = '', type = '') =>
    rel.startsWith(REL_ACQUISITION) && ACQUIRABLE_TYPES.some((mime) => type.startsWith(mime));

/**
 * ¿Este enlace lleva a otro nivel del catálogo?
 *
 * Un feed de navegación y uno de adquisición son los dos `atom+xml`; lo que los
 * separa es el perfil en el tipo. Se aceptan los dos: desde el punto de vista
 * del usuario, los dos son «entrar en una carpeta».
 */
const isNavigation = (type = '') => type.includes('atom+xml') || type.includes('opds-catalog');

const attr = (element, name) => element?.getAttribute(name) || '';

const textOf = (parent, tag) => {
    const node = parent.getElementsByTagName(tag)[0];
    return (node?.textContent || '').trim();
};

/**
 * Convierte un feed OPDS 1.x en entradas manejables.
 *
 * @param {string} xml
 * @param {string} baseUrl URL desde la que se pidió, para resolver relativas.
 */
export const parseOpdsFeed = (xml, baseUrl) => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');

    // `parsererror` es cómo DOMParser informa de XML inválido: no lanza. Sin
    // comprobarlo, un servidor que devuelva una página de error HTML daría un
    // catálogo vacío en lugar de un mensaje.
    if (doc.getElementsByTagName('parsererror').length > 0) {
        throw new Error('El servidor no devolvió un catálogo válido.');
    }

    const feed = doc.getElementsByTagName('feed')[0];
    if (!feed) throw new Error('Esto no parece un catálogo OPDS.');

    const title = textOf(feed, 'title') || 'Catálogo';

    // Paginación: los catálogos grandes la usan y sin ella solo se vería la
    // primera página de una biblioteca de miles de títulos.
    let nextPage = '';
    for (const link of feed.getElementsByTagName('link')) {
        if (link.parentNode !== feed) continue;
        if (attr(link, 'rel') === 'next') nextPage = resolveUrl(attr(link, 'href'), baseUrl);
    }

    const entries = [];

    for (const entry of doc.getElementsByTagName('entry')) {
        const links = [...entry.getElementsByTagName('link')];

        const downloads = [];
        let cover = '';
        let navigate = '';

        links.forEach((link) => {
            const rel = attr(link, 'rel');
            const type = attr(link, 'type');
            const href = resolveUrl(attr(link, 'href'), baseUrl);

            if (isAcquisition(rel, type)) {
                downloads.push({ url: href, type });
            } else if (rel === REL_IMAGE || rel === REL_THUMB) {
                // La miniatura solo se usa si no hay portada: pesa menos pero
                // se ve peor, y en una rejilla de portadas se nota.
                if (!cover || rel === REL_IMAGE) cover = href;
            } else if (!rel.startsWith(REL_ACQUISITION) && isNavigation(type)) {
                navigate = href;
            }
        });

        // Orden de preferencia: si un libro está en EPUB y en PDF, se coge el
        // EPUB, que es reflowable y se lee mejor en un móvil.
        downloads.sort((a, b) =>
            ACQUIRABLE_TYPES.indexOf(a.type.split(';')[0])
            - ACQUIRABLE_TYPES.indexOf(b.type.split(';')[0]));

        entries.push({
            id: textOf(entry, 'id') || attr(entry, 'id') || navigate || downloads[0]?.url || '',
            title: textOf(entry, 'title') || 'Sin título',
            author: textOf(entry, 'name'),
            summary: stripTags(textOf(entry, 'summary') || textOf(entry, 'content')).slice(0, 400),
            updated: textOf(entry, 'updated'),
            cover,
            // Una entrada con descargas es un libro; una con enlace de
            // navegación, una carpeta. Si trae las dos cosas —pasa en algunos
            // catálogos— manda el libro, que es lo que el usuario quiere.
            kind: downloads.length > 0 ? 'book' : navigate ? 'folder' : 'unknown',
            downloads,
            navigate,
        });
    }

    return { title, entries: entries.filter((entry) => entry.kind !== 'unknown'), nextPage };
};

/** Los resúmenes de OPDS traen HTML incrustado y se muestran como texto. */
export const stripTags = (text) => String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * OPDS 2.0, que es JSON.
 *
 * Se normaliza a la misma forma que la 1.x para que la pantalla no tenga que
 * saber con cuál está hablando.
 */
export const parseOpds2Feed = (json, baseUrl) => {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const entries = [];

    (data.publications || []).forEach((publication) => {
        const meta = publication.metadata || {};
        const downloads = (publication.links || [])
            .filter((link) => ACQUIRABLE_TYPES.some((mime) => String(link.type || '').startsWith(mime)))
            .map((link) => ({ url: resolveUrl(link.href, baseUrl), type: link.type }));

        entries.push({
            id: meta.identifier || downloads[0]?.url || '',
            title: meta.title || 'Sin título',
            author: [].concat(meta.author || []).map((a) => a?.name || a).filter(Boolean).join(', '),
            summary: stripTags(meta.description).slice(0, 400),
            cover: resolveUrl((publication.images || [])[0]?.href, baseUrl),
            kind: downloads.length > 0 ? 'book' : 'unknown',
            downloads,
            navigate: '',
        });
    });

    (data.navigation || []).forEach((item) => {
        entries.push({
            id: item.href,
            title: item.title || 'Sin título',
            author: '',
            summary: '',
            cover: '',
            kind: 'folder',
            downloads: [],
            navigate: resolveUrl(item.href, baseUrl),
        });
    });

    return {
        title: data.metadata?.title || 'Catálogo',
        entries: entries.filter((entry) => entry.kind !== 'unknown'),
        nextPage: resolveUrl(
            (data.links || []).find((link) => link.rel === 'next')?.href,
            baseUrl
        ),
    };
};

/**
 * Normaliza lo que el usuario escribe como dirección del servidor.
 *
 * Nadie escribe el protocolo. Y en el caso de Calibre, casi nadie sabe que la
 * ruta del catálogo es `/opds` — se copia la del navegador, que es la raíz.
 */
export const normalizeCatalogUrl = (input) => {
    let url = String(input || '').trim();
    if (!url) return '';

    if (!/^https?:\/\//i.test(url)) url = `http://${url}`;

    try {
        const parsed = new URL(url);
        // Raíz pelada: se asume Calibre, que es con diferencia el servidor
        // personal más extendido, y su catálogo cuelga de /opds.
        if (parsed.pathname === '/' || parsed.pathname === '') parsed.pathname = '/opds';
        return parsed.toString();
    } catch {
        return '';
    }
};

/** Cabecera de autenticación básica, que es la que usa Calibre. */
export const basicAuthHeader = (user, password) =>
    user ? { Authorization: `Basic ${btoa(`${user}:${password || ''}`)}` } : {};
