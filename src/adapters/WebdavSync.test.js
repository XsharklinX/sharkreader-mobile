import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWebdavSync, buildUrl, describeError } from './WebdavSync.js';

const config = { url: 'https://nube.ejemplo.com/remote.php/dav/sharkreader', user: 'ana', password: 'secreto' };
const sync = createWebdavSync(async () => config);

beforeEach(() => { vi.unstubAllGlobals(); });

describe('construcción de la URL', () => {
    it('une base y fichero sin duplicar barras', () => {
        expect(buildUrl('https://x.com/dav')).toBe('https://x.com/dav/sharkreader-sync.json');
        expect(buildUrl('https://x.com/dav/')).toBe('https://x.com/dav/sharkreader-sync.json');
        expect(buildUrl('https://x.com/dav///')).toBe('https://x.com/dav/sharkreader-sync.json');
    });

    it('tolera espacios alrededor de lo que pegue el usuario', () => {
        expect(buildUrl('  https://x.com/dav  ')).toBe('https://x.com/dav/sharkreader-sync.json');
    });
});

describe('mensajes de error', () => {
    it('traduce los códigos a algo accionable', () => {
        expect(describeError(401)).toMatch(/contraseña/i);
        expect(describeError(404)).toMatch(/carpeta/i);
        expect(describeError(500)).toMatch(/servidor/i);
    });

    it('un código desconocido no deja al usuario sin información', () => {
        expect(describeError(418)).toContain('418');
    });
});

describe('lectura', () => {
    it('devuelve el contenido remoto', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true, status: 200, text: async () => '{"books":[]}',
        })));
        expect(await sync.read()).toBe('{"books":[]}');
    });

    it('un 404 significa "aún no se ha sincronizado", no un error', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
        expect(await sync.read()).toBeNull();
    });

    it('un fichero vacío se trata como si no existiera', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => '   ' })));
        expect(await sync.read()).toBeNull();
    });

    it('unas credenciales malas fallan con un mensaje claro', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })));
        await expect(sync.read()).rejects.toThrow(/contraseña/i);
    });

    it('manda autenticación básica', async () => {
        const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => '{}' }));
        vi.stubGlobal('fetch', fetchMock);
        await sync.read();

        const headers = fetchMock.mock.calls[0][1].headers;
        expect(headers.Authorization).toMatch(/^Basic /);
        expect(atob(headers.Authorization.replace('Basic ', ''))).toBe('ana:secreto');
    });

    it('una contraseña con acentos no rompe la codificación', async () => {
        const withAccents = createWebdavSync(async () => ({ ...config, password: 'contraseña€' }));
        const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => '{}' }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(withAccents.read()).resolves.toBeDefined();
    });
});

describe('escritura', () => {
    it('sube el contenido con PUT', async () => {
        const fetchMock = vi.fn(async () => ({ ok: true, status: 201 }));
        vi.stubGlobal('fetch', fetchMock);

        await sync.write('{"books":[]}');
        expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
        expect(fetchMock.mock.calls[0][1].body).toBe('{"books":[]}');
    });

    it('un servidor que no acepta escritura lo dice', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 405 })));
        await expect(sync.write('{}')).rejects.toThrow(/escritura/i);
    });
});

describe('comprobación de conexión', () => {
    it('usa PROPFIND sobre la carpeta, no GET sobre el fichero', async () => {
        const fetchMock = vi.fn(async () => ({ ok: false, status: 207 }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await sync.test();
        expect(fetchMock.mock.calls[0][1].method).toBe('PROPFIND');
        expect(result.ok).toBe(true);
    });

    it('sin servidor accesible devuelve fallo en vez de lanzar', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('red caída'); }));
        const result = await sync.test();
        expect(result.ok).toBe(false);
        expect(result.message).toMatch(/contactar/i);
    });

    it('sin configurar no intenta conectarse', async () => {
        const empty = createWebdavSync(async () => ({ url: '', user: '' }));
        vi.stubGlobal('fetch', vi.fn());
        const result = await empty.test();

        expect(result.ok).toBe(false);
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe('sin configuración', () => {
    it('leer sin configurar avisa en lugar de fallar de forma opaca', async () => {
        const empty = createWebdavSync(async () => null);
        await expect(empty.read()).rejects.toThrow(/no está configurada/i);
    });
});
