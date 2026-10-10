/**
 * Sincronización por WebDAV.
 *
 * Quinto y último puerto. Cierra el círculo con el escritorio, que es nuestro
 * diferencial más defendible: el mismo fichero de sync que escribe SharkReader
 * en el PC lo lee el móvil, y la fusión por campo del núcleo resuelve los
 * conflictos sin perder nada.
 *
 * WebDAV y no Drive a propósito: funciona con Nextcloud, ownCloud, Koofr,
 * Infomaniak o un servidor propio, sin registrar la app en ningún sitio ni
 * pedir al usuario que conceda acceso a toda su nube. Coherente con una app que
 * se vende como local-first.
 *
 * El escritorio usa la librería `webdav` de Node; aquí se hace con `fetch` y
 * cabeceras, que es todo lo que hace falta para leer y escribir un fichero.
 */

/**
 * El nombre que usa el escritorio, con guion bajo.
 *
 * El móvil usaba `sharkreader-sync.json`, con guion, así que los dos escribían
 * en ficheros distintos de la misma carpeta y **nunca se encontraban**: la
 * promesa de este puerto no se cumplía. El antiguo se sigue leyendo si el bueno
 * no existe, para no perder lo que ya estuviera subido desde el móvil.
 */
const FILE_NAME = 'sharkreader_sync.json';
const LEGACY_FILE_NAME = 'sharkreader-sync.json';

const authHeader = ({ user, password }) =>
    `Basic ${btoa(unescape(encodeURIComponent(`${user}:${password}`)))}`;

/** Une la base y el nombre de fichero sin duplicar ni perder barras. */
export const buildUrl = (baseUrl, fileName = FILE_NAME) => {
    const base = String(baseUrl || '').trim().replace(/\/+$/, '');
    return `${base}/${fileName}`;
};

/** Mensaje entendible a partir del código HTTP. */
export const describeError = (status) => {
    if (status === 401 || status === 403) return 'Usuario o contraseña incorrectos.';
    if (status === 404) return 'La carpeta no existe en el servidor.';
    if (status === 405) return 'El servidor no acepta escritura en esa ruta.';
    if (status >= 500) return 'El servidor ha fallado. Inténtalo más tarde.';
    return `El servidor respondió ${status}.`;
};

export const createWebdavSync = (getConfig) => {
    const request = async (method, url, body) => {
        const config = await getConfig();
        if (!config?.url || !config?.user) {
            throw new Error('La sincronización no está configurada.');
        }

        const response = await fetch(url || buildUrl(config.url), {
            method,
            headers: {
                Authorization: authHeader(config),
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            ...(body ? { body } : {}),
        });

        return { response, config };
    };

    return {
        /**
         * Lee el fichero remoto. Un 404 no es un error: significa que todavía
         * no se ha sincronizado nunca desde ningún dispositivo.
         */
        async read() {
            let { response, config } = await request('GET');
            if (response.status === 404) {
                ({ response } = await request('GET', buildUrl(config.url, LEGACY_FILE_NAME)));
            }
            if (response.status === 404) return null;
            if (!response.ok) throw new Error(describeError(response.status));
            const text = await response.text();
            return text?.trim() ? text : null;
        },

        async write(content) {
            const { response } = await request('PUT', null, content);
            if (!response.ok) throw new Error(describeError(response.status));
        },

        /**
         * Comprueba las credenciales sin escribir nada.
         *
         * Se usa PROPFIND en lugar de GET porque la carpeta puede existir sin
         * que exista aún el fichero: un 404 del fichero no dice nada sobre si
         * la configuración es correcta.
         */
        async test() {
            const config = await getConfig();
            if (!config?.url || !config?.user) {
                return { ok: false, message: 'Faltan datos de conexión.' };
            }

            try {
                const response = await fetch(String(config.url).replace(/\/+$/, ''), {
                    method: 'PROPFIND',
                    headers: { Authorization: authHeader(config), Depth: '0' },
                });

                // 207 Multi-Status es la respuesta correcta de PROPFIND.
                if (response.status === 207 || response.ok) {
                    return { ok: true, message: 'Conexión correcta.' };
                }
                return { ok: false, message: describeError(response.status) };
            } catch {
                return { ok: false, message: 'No se pudo contactar con el servidor.' };
            }
        },
    };
};
