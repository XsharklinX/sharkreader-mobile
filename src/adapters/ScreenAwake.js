import { registerPlugin } from '@capacitor/core';

/**
 * Que la pantalla no se apague mientras se lee.
 *
 * El interruptor «Mantener la pantalla encendida» llevaba tiempo en Ajustes
 * **sin nada detrás**: se podía encender y apagar y no hacía absolutamente nada.
 * Este es el puente que faltaba.
 *
 * Lo pide el lector al abrir un libro y lo suelta al cerrarlo. El lado nativo se
 * encarga de soltarlo también al irse la app a segundo plano y de reponerlo al
 * volver, que es lo que evita quedarse con la pantalla clavada encendida al
 * salir a mirar una notificación.
 */
const SharkScreen = registerPlugin('SharkScreen');

export const createScreenAwake = () => ({
    /** @param {boolean} activo */
    async set(activo) {
        try {
            if (activo) await SharkScreen.keepAwake();
            else await SharkScreen.allowSleep();
        } catch {
            // Sin el plugin —en el navegador, durante el desarrollo— esto no es
            // un error: simplemente la pantalla se comporta como siempre.
        }
    },

    /** Para poder comprobarlo desde fuera sin adivinar. */
    async isOn() {
        try {
            const { value } = await SharkScreen.isKeptAwake();
            return Boolean(value);
        } catch {
            return false;
        }
    },
});

export { SharkScreen };
