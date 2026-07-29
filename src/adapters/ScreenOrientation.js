import { ScreenOrientation } from '@capacitor/screen-orientation';

/**
 * Bloqueo de orientación.
 *
 * Leer tumbado es el caso que lo justifica: el sensor gira la página cada vez
 * que te mueves y hay que enderezar el móvil para seguir leyendo. Es el momento
 * en que más se usa la app y el único en que la rotación automática estorba.
 *
 * Se guarda «vertical», «horizontal» o «automática», no un ángulo: al usuario le
 * importa la forma de la página, no si el móvil está a 90 o a 270 grados.
 */

export const ORIENTATION_MODES = {
    auto:      { label: 'Automática', description: 'Sigue el sensor del dispositivo' },
    portrait:  { label: 'Vertical',   description: 'Bloqueada en vertical' },
    landscape: { label: 'Horizontal', description: 'Bloqueada en horizontal, dos columnas' },
};

export const createScreenOrientation = () => ({
    /** @param {keyof typeof ORIENTATION_MODES} mode */
    async lock(mode) {
        try {
            if (!mode || mode === 'auto') {
                await ScreenOrientation.unlock();
                return;
            }
            // 'portrait' y 'landscape' dejan que el sistema elija entre normal e
            // invertida, que es lo que se quiere: bloquear en «horizontal» no
            // debería obligar a sujetar el móvil por un lado concreto.
            await ScreenOrientation.lock({ orientation: mode });
        } catch {
            // Algunos fabricantes ignoran la petición y hay tablets donde no
            // aplica. No es motivo para romper la apertura del libro.
        }
    },

    async unlock() {
        try { await ScreenOrientation.unlock(); } catch { /* ver arriba */ }
    },

    /** @returns {Promise<'portrait'|'landscape'>} */
    async current() {
        try {
            const { type } = await ScreenOrientation.orientation();
            return String(type || '').startsWith('landscape') ? 'landscape' : 'portrait';
        } catch {
            return 'portrait';
        }
    },

    /**
     * Avisa al girar. El lector lo necesita para decidir si caben dos columnas:
     * `resize` del WebView llega antes de que Android termine la animación de
     * rotación, y medir en ese momento da el ancho antiguo.
     */
    async onChange(handler) {
        try {
            const listener = await ScreenOrientation.addListener(
                'screenOrientationChange',
                ({ type }) => handler(String(type || '').startsWith('landscape') ? 'landscape' : 'portrait')
            );
            return () => listener.remove();
        } catch {
            return () => {};
        }
    },
});
