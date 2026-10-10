import { registerPlugin } from '@capacitor/core';

/** No molestar mientras lees. Ver `SharkNoMolestarPlugin.java`. */
const SharkNoMolestar = registerPlugin('SharkNoMolestar');

export const createNoMolestar = () => ({
    /** `{ permitido, activo }`: si Android ha dado el acceso y si está puesto ahora. */
    async estado() {
        try {
            return await SharkNoMolestar.estado();
        } catch {
            return { permitido: false, activo: false };
        }
    },

    /** Abre la pantalla de Android donde se concede el acceso. */
    pedirPermiso: () => SharkNoMolestar.pedirPermiso(),

    /** Lo pone si se puede. Nunca falla: sin acceso, simplemente no hace nada. */
    async activar() {
        try {
            return Boolean((await SharkNoMolestar.activar())?.activo);
        } catch {
            return false;
        }
    },

    desactivar: () => SharkNoMolestar.desactivar().catch(() => {}),
});
