import { registerPlugin } from '@capacitor/core';

/**
 * La foto de la página, para el pliegue.
 *
 * Ver `SharkCapturePlugin.java` para el porqué. Aquí solo está el puente y una
 * cosa más: **la foto se pide una vez por página y se guarda**, porque durante
 * el gesto no hay tiempo de hacerla.
 */
const SharkCapture = registerPlugin('SharkCapture');

/** Cuánto vale una foto antes de considerarla vieja. */
const CADUCIDAD_MS = 30_000;

export const createPageCapture = () => {
    let ultima = null;

    return {
        /**
         * Hace la foto y la guarda. Devuelve `null` si no se pudo.
         *
         * Se llama cuando la página **acaba de asentarse**, no al empezar el
         * gesto: dibujar la vista y comprimirla cuesta decenas de milisegundos, y
         * dentro del arrastre eso es un tirón visible. Fuera de él no lo nota
         * nadie porque no está pasando nada más.
         */
        async take() {
            try {
                const foto = await SharkCapture.capture();
                if (!foto?.image) return null;
                ultima = { ...foto, at: Date.now() };
                return ultima;
            } catch {
                // En el navegador no existe el plugin, y en Android puede fallar
                // si la vista aún no tiene tamaño. En los dos casos el pliegue
                // sigue funcionando con las copias de HTML.
                ultima = null;
                return null;
            }
        },

        /** La última foto, si todavía vale. */
        last() {
            if (!ultima) return null;
            if (Date.now() - ultima.at > CADUCIDAD_MS) return null;
            return ultima;
        },

        /**
         * Se tira la foto.
         *
         * Al cambiar de página, de tema o de tipografía lo que se ve deja de ser
         * lo que hay guardado, y doblar una hoja con la foto de otra es peor que
         * doblarla sin foto: no es un fallo que se vea como fallo, se lee como si
         * la app hubiera perdido la página.
         */
        clear() {
            ultima = null;
        },
    };
};

export { SharkCapture };
