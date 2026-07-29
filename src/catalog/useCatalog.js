import { useCallback, useEffect, useRef, useState } from 'react';
import { usePorts } from '../ports/index.js';
import {
    parseOpdsFeed, parseOpds2Feed, normalizeCatalogUrl, basicAuthHeader,
} from './opds.js';

const SERVERS_KEY = 'catalogServers';

/**
 * Navegación por un catálogo OPDS y descarga de libros.
 *
 * ## Historial propio
 *
 * El catálogo es un árbol y hay que poder subir un nivel. Se guarda la pila de
 * URLs visitadas en lugar de apoyarse en el historial del navegador: dentro de
 * un WebView el historial ya lo usa la navegación de la app, y mezclar los dos
 * haría que «atrás» a veces saliera de la pantalla y a veces subiera de carpeta.
 */
export const useCatalog = () => {
    const ports = usePorts();

    const [servers, setServers] = useState([]);
    const [feed, setFeed] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [downloading, setDownloading] = useState(null);

    // Pila de URLs. La última es donde estás.
    const stack = useRef([]);
    const auth = useRef({});

    useEffect(() => {
        ports.storage.getSetting(SERVERS_KEY)
            .then((stored) => setServers(Array.isArray(stored) ? stored : []))
            .catch(() => {});
    }, [ports]);

    const persist = useCallback(async (next) => {
        setServers(next);
        await ports.storage.setSetting(SERVERS_KEY, next);
    }, [ports]);

    /**
     * Descarga y parsea un feed.
     *
     * El tipo de contenido decide el parser. Un servidor que no lo declare bien
     * —los hay— cae al parser de Atom, que es lo que sirve casi todo.
     */
    const fetchFeed = useCallback(async (url, credentials) => {
        const response = await fetch(url, {
            headers: {
                Accept: 'application/atom+xml, application/opds+json, */*',
                ...basicAuthHeader(credentials?.user, credentials?.password),
            },
        });

        if (response.status === 401) {
            throw new Error('El servidor pide usuario y contraseña.');
        }
        if (!response.ok) {
            throw new Error(`El servidor respondió ${response.status}.`);
        }

        const type = response.headers.get('content-type') || '';
        const body = await response.text();

        return type.includes('json')
            ? parseOpds2Feed(body, url)
            : parseOpdsFeed(body, url);
    }, []);

    const open = useCallback(async (url, credentials, { push = true } = {}) => {
        setLoading(true);
        setError(null);
        try {
            const result = await fetchFeed(url, credentials || auth.current);
            if (credentials) auth.current = credentials;
            if (push) stack.current.push(url);
            setFeed({ ...result, url });
            return true;
        } catch (failure) {
            setError(failure?.message || 'No se pudo abrir el catálogo.');
            return false;
        } finally {
            setLoading(false);
        }
    }, [fetchFeed]);

    /** Sube un nivel. Devuelve false si ya estabas en la raíz. */
    const goUp = useCallback(async () => {
        if (stack.current.length <= 1) return false;
        stack.current.pop();
        const previous = stack.current[stack.current.length - 1];
        await open(previous, null, { push: false });
        return true;
    }, [open]);

    const close = useCallback(() => {
        stack.current = [];
        auth.current = {};
        setFeed(null);
        setError(null);
    }, []);

    /** Carga la página siguiente y la añade a la lista, sin perder lo que ya hay. */
    const loadMore = useCallback(async () => {
        if (!feed?.nextPage || loading) return;
        setLoading(true);
        try {
            const next = await fetchFeed(feed.nextPage, auth.current);
            setFeed((current) => ({
                ...next,
                title: current.title,
                url: current.url,
                entries: [...current.entries, ...next.entries],
            }));
        } catch (failure) {
            setError(failure?.message || 'No se pudo cargar el resto del catálogo.');
        } finally {
            setLoading(false);
        }
    }, [feed, loading, fetchFeed]);

    // ── Servidores guardados ─────────────────────────────────────────────────

    const addServer = useCallback(async (name, rawUrl, credentials) => {
        const url = normalizeCatalogUrl(rawUrl);
        if (!url) throw new Error('La dirección no es válida.');

        // Se comprueba antes de guardar: un servidor guardado que no responde es
        // una entrada muerta en la lista que el usuario no sabrá por qué falla.
        await fetchFeed(url, credentials);

        const server = {
            id: `${Date.now()}`,
            name: name?.trim() || new URL(url).hostname,
            url,
            user: credentials?.user || '',
            // La contraseña se guarda en la base de datos privada de la app, no
            // en el llavero de Android. Es el mismo nivel que la contraseña de
            // WebDAV, que ya se guardaba así, y está documentado en Privacidad.
            password: credentials?.password || '',
        };

        await persist([...servers, server]);
        return server;
    }, [servers, persist, fetchFeed]);

    const removeServer = useCallback(
        (id) => persist(servers.filter((server) => server.id !== id)),
        [servers, persist]
    );

    /**
     * Descarga un libro del catálogo y lo importa.
     *
     * Se descarga entero a memoria antes de importarlo. Para un EPUB —unos
     * pocos MB— es lo razonable; para un PDF de cien MB no lo sería, pero
     * partirlo en trozos exigiría que el servidor admita rangos, y muchos
     * catálogos personales no lo hacen.
     */
    const download = useCallback(async (entry, importFile) => {
        const source = entry.downloads[0];
        if (!source) return { ok: false, error: 'Esta entrada no ofrece descarga.' };

        setDownloading(entry.id);
        try {
            const response = await fetch(source.url, {
                headers: basicAuthHeader(auth.current.user, auth.current.password),
            });
            if (!response.ok) throw new Error(`El servidor respondió ${response.status}.`);

            const blob = await response.blob();
            const name = fileNameFor(entry, source.type);
            await importFile(name, blob);
            return { ok: true };
        } catch (failure) {
            return { ok: false, error: failure?.message || 'No se pudo descargar.' };
        } finally {
            setDownloading(null);
        }
    }, []);

    return {
        servers, feed, loading, error, downloading,
        open, goUp, close, loadMore, addServer, removeServer, download,
        canGoUp: stack.current.length > 1,
    };
};

/**
 * Nombre de fichero para el libro descargado.
 *
 * El título del catálogo puede traer barras, dos puntos y comillas, que en un
 * nombre de fichero rompen la escritura o crean carpetas sin querer.
 */
export const fileNameFor = (entry, mime = '') => {
    const clean = String(entry.title || 'libro')
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 90);

    const extension = mime.includes('pdf') ? 'pdf'
        : mime.includes('comicbook') || mime.includes('cbz') ? 'cbz'
        : mime.includes('plain') ? 'txt'
        : 'epub';

    return `${clean}.${extension}`;
};
