import { registerPlugin } from '@capacitor/core';

/**
 * El servidor local de la app. Ver `SharkServidorPlugin.java`.
 *
 * Dos usos: recibir libros desde el navegador del ordenador, y atender a
 * SharkReader de escritorio (`/api/...`). Lo segundo se resuelve en JavaScript:
 * el plugin reenvía cada petición y espera lo que se le conteste aquí.
 */
const SharkServidor = registerPlugin('SharkServidor');

export const createServidor = () => ({
    /** @returns {Promise<{direccion: string, ip: string, puerto: number, clave: string}>} */
    iniciar: () => SharkServidor.iniciar(),
    parar: () => SharkServidor.parar().catch(() => {}),

    /**
     * Libros que llegan. `alEmpezar` recibe nombre y tamaño en cuanto empieza la
     * subida; `alTerminar`, el libro ya guardado con la forma de `PickedBook`.
     *
     * @returns {Promise<() => void>} quitar los oyentes
     */
    async alRecibir({ alEmpezar, alTerminar }) {
        const oyentes = await Promise.all([
            SharkServidor.addListener('recibiendo', (datos) => alEmpezar?.(datos)),
            SharkServidor.addListener('recibido', (libro) => alTerminar?.(libro)),
        ]);
        return () => oyentes.forEach((oyente) => oyente.remove?.());
    },

    /**
     * Atiende las peticiones de la API.
     *
     * @param {(peticion: {metodo: string, ruta: string, cuerpo: string}) => Promise<{estado?: number, tipo?: string, cuerpo: string}>} atender
     * @returns {Promise<() => void>}
     */
    async alPedir(atender) {
        const oyente = await SharkServidor.addListener('peticion', async (peticion) => {
            let respuesta;
            try {
                respuesta = await atender(peticion);
            } catch (error) {
                respuesta = { estado: 500, tipo: 'text/plain', cuerpo: error?.message || 'Error' };
            }
            await SharkServidor.responder({
                id: peticion.id,
                estado: respuesta?.estado ?? 200,
                tipo: respuesta?.tipo ?? 'application/json',
                cuerpo: respuesta?.cuerpo ?? '',
            }).catch(() => {});
        });
        return () => oyente.remove?.();
    },
});

export { SharkServidor };
