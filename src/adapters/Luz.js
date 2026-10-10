import { registerPlugin } from '@capacitor/core';

/**
 * El sensor de luz ambiente. Ver `SharkLuzPlugin.java` y `confortLuz.js`.
 *
 * Fuera de Android —en el navegador, en las pruebas— no hay sensor: `escuchar`
 * devuelve `null` y el lector sigue con lo que el usuario haya elegido, que es
 * lo mismo que pasaba antes de que existiera esto.
 */
const SharkLuz = registerPlugin('SharkLuz');

export const createLuz = () => ({
    async disponible() {
        try {
            return Boolean((await SharkLuz.disponible())?.disponible);
        } catch {
            return false;
        }
    },

    /**
     * Empieza a recibir lecturas. Devuelve la función que las corta, o `null`
     * si no hay sensor.
     *
     * @param {(lux: number) => void} alLeer
     */
    async escuchar(alLeer) {
        try {
            const oyente = await SharkLuz.addListener('luz', (datos) => alLeer(Number(datos?.lux) || 0));
            await SharkLuz.empezar();
            return () => {
                oyente.remove?.();
                SharkLuz.parar().catch(() => {});
            };
        } catch {
            return null;
        }
    },
});
