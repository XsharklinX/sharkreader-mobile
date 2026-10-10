import { CapacitorHttp } from '@capacitor/core';

/**
 * Hablar con SharkReader de escritorio por la red de casa.
 *
 * El escritorio sirve, mientras está abierto, tres rutas bajo su clave:
 *
 *  - `GET  /<clave>/hola`                   quién es (nombre del equipo, id)
 *  - `GET  /<clave>/sharkreader_sync.json`  su backup portable, en porcentaje
 *  - `PUT  /<clave>/sharkreader_sync.json`  recibe el fusionado y lo aplica
 *
 * ## Por qué `CapacitorHttp` y no `fetch`
 *
 * La app se sirve desde `https://localhost` dentro del WebView, y una petición a
 * `http://192.168.1.20` desde ahí es contenido mixto: el WebView la bloquea sin
 * llegar a hacerla. `CapacitorHttp` la hace desde Android, fuera del WebView.
 * Para que Android la deje salir sin cifrar está `network_security_config.xml`:
 * un ordenador de casa no tiene certificado.
 *
 * Todo con tiempo límite corto: si el ordenador está apagado o en otra red, la
 * app no puede quedarse esperando.
 */

const FICHERO = 'sharkreader_sync.json';

const pedir = async (opciones, limite) => CapacitorHttp.request({
    ...opciones,
    connectTimeout: Math.min(limite, 4000),
    readTimeout: limite,
    responseType: 'text',
});

/** El cuerpo como texto, venga como venga: con JSON, el plugin lo entrega ya interpretado. */
const comoTexto = (datos) => (typeof datos === 'string' ? datos : JSON.stringify(datos ?? ''));

export const createEscritorio = () => ({
    /** @returns {Promise<{nombre: string, id: string}>} */
    async hola(direccion) {
        let respuesta;
        try {
            respuesta = await pedir({ url: `${direccion}/hola`, method: 'GET' }, 4000);
        } catch {
            throw new Error('No se encuentra el ordenador. ¿Está SharkReader abierto y en la misma wifi?');
        }
        if (respuesta.status === 404) throw new Error('La clave no coincide. Cópiala otra vez de Ajustes en el ordenador.');
        if (respuesta.status < 200 || respuesta.status >= 300) throw new Error(`El ordenador respondió ${respuesta.status}.`);
        const datos = typeof respuesta.data === 'string' ? JSON.parse(respuesta.data) : respuesta.data;
        if (datos?.app !== 'SharkReader') throw new Error('En esa dirección no hay un SharkReader.');
        return { nombre: datos.nombre || 'Ordenador', id: datos.id || '' };
    },

    async leer(direccion, limite = 6000) {
        const respuesta = await pedir({ url: `${direccion}/${FICHERO}`, method: 'GET' }, limite);
        if (respuesta.status < 200 || respuesta.status >= 300) throw new Error(`El ordenador respondió ${respuesta.status}.`);
        return comoTexto(respuesta.data);
    },

    async escribir(direccion, contenido) {
        const respuesta = await pedir({
            url: `${direccion}/${FICHERO}`,
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            data: contenido,
        }, 15000);
        if (respuesta.status < 200 || respuesta.status >= 300) throw new Error(`El ordenador respondió ${respuesta.status}.`);
    },
});
