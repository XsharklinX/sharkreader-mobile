import { registerPlugin } from '@capacitor/core';

/** La IA del teléfono para resumir. Ver `SharkResumenPlugin.java`. */
const SharkResumen = registerPlugin('SharkResumen');

export const createResumen = () => ({
    /** «disponible», «descargable», «descargando» o «no». */
    async estado() {
        try {
            return (await SharkResumen.estado())?.estado || 'no';
        } catch {
            return 'no';
        }
    },

    async descargar(alAvanzar) {
        const oyente = await SharkResumen.addListener('descarga', (datos) => alAvanzar?.(datos));
        try {
            await SharkResumen.descargar();
        } finally {
            oyente.remove?.();
        }
    },

    /** Resume un texto **en inglés**; devuelve las viñetas tal como vienen. */
    async resumir(texto) {
        return (await SharkResumen.resumir({ texto }))?.resumen || '';
    },
});
