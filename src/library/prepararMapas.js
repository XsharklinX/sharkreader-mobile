import { createEpubEngine } from '../reader/EpubEngine.js';
import { readBookBlob } from '../adapters/SafPicker.js';

/**
 * Prepara los mapas de posiciones antes de que hagan falta.
 *
 * ## Qué problema resuelve
 *
 * El mapa es lo que permite decir «vas por el 34 %» y saltar a un punto del
 * libro. Se calculaba la primera vez que abrías cada libro, y como tarda varios
 * segundos, lo que veía el usuario era un aviso apareciendo **mientras leía**,
 * por abajo, encima del texto. Nada de eso se entiende desde fuera: estás
 * leyendo tranquilo y de pronto la app se pone a cargar algo.
 *
 * Así que se prepara antes, al arrancar, cuando esperar es lo esperable.
 *
 * ## Por qué no para todos los libros
 *
 * Porque son minutos de trabajo y de batería. Calcular el mapa obliga a abrir
 * cada libro entero y recorrer su spine; con ciento treinta y seis libros eso es
 * un cuarto de hora de CPU para saber el porcentaje de libros que a lo mejor no
 * se abren nunca.
 *
 * Se preparan **los que ya has empezado**, del más reciente al más antiguo, que
 * son los que vas a abrir. El resto se calcula al abrirlos, como antes — pero
 * entonces el aviso ya no molesta, porque solo se ve con los controles abiertos.
 *
 * ## Cómo se porta
 *
 * De uno en uno y sin prisa. Cada libro se abre en un motor propio fuera de
 * pantalla, se calcula, se guarda y se cierra antes de pasar al siguiente: dos a
 * la vez se pelearían por el hilo y por la memoria, que en gama baja es lo que
 * hace que la app se cierre sola.
 */

/** Cuántos libros empezados se preparan como mucho. */
export const MAXIMO = 8;

/** Respiro entre libros. Deja hueco para que la interfaz vaya a lo suyo. */
export const RESPIRO_MS = 1200;

/** Espera inicial: el arranque de la app va primero. */
export const ESPERA_INICIAL_MS = 4000;

const LOCATIONS_KEY = (id) => `locations:${id}`;

/**
 * Qué libros hay que preparar y en qué orden.
 *
 * Solo los empezados —un libro sin abrir no necesita porcentaje— y los que
 * tienen fichero. Del más recién leído al más antiguo, que es el orden en que se
 * van a volver a abrir.
 */
export const porPreparar = (books = [], maximo = MAXIMO) => books
    .filter((libro) => libro?.sourcePath && (libro.progress || 0) > 0 && !libro.isFinished)
    .sort((a, b) => (b.lastReadDate || 0) - (a.lastReadDate || 0))
    .slice(0, maximo);

/**
 * Arranca la preparación en segundo plano.
 *
 * @returns {() => void} Función para cancelarla.
 */
export const prepararMapas = ({ storage, books, ahora = Date.now }) => {
    let cancelado = false;
    let motor = null;

    const esperar = (ms) => new Promise((listo) => { setTimeout(listo, ms); });

    const trabajar = async () => {
        // El arranque de la app va primero: abrir la biblioteca, pintar las
        // portadas y atender el primer toque. Esto puede esperar.
        await esperar(ESPERA_INICIAL_MS);

        for (const libro of porPreparar(books)) {
            if (cancelado) return;

            // Si ya tiene mapa no hay nada que hacer, y comprobarlo es una lectura
            // de un ajuste frente a varios segundos de cálculo.
            const guardado = await storage.getSetting(LOCATIONS_KEY(libro.id)).catch(() => null);
            if (guardado || cancelado) continue;

            try {
                const blob = await readBookBlob(libro.sourcePath);
                const data = await blob.arrayBuffer();
                if (cancelado) return;

                // Un contenedor fuera de pantalla: epub.js necesita un elemento
                // donde montar, pero aquí no se va a mirar nada.
                const oculto = document.createElement('div');
                oculto.style.cssText = 'position:absolute;width:1px;height:1px;left:-9999px;top:0;overflow:hidden';
                document.body.appendChild(oculto);

                motor = createEpubEngine();
                await motor.open(data, oculto, { flow: 'paginated' });
                if (cancelado) { motor.destroy(); oculto.remove(); return; }

                const mapa = await motor.buildLocations();
                if (mapa && !cancelado) await storage.setSetting(LOCATIONS_KEY(libro.id), mapa);

                motor.destroy();
                motor = null;
                oculto.remove();
            } catch {
                // Un libro que no se deja abrir aquí tampoco bloquea nada: se
                // calculará al abrirlo de verdad, o no se calculará.
                motor?.destroy?.();
                motor = null;
            }

            if (cancelado) return;
            await esperar(RESPIRO_MS);
        }
    };

    trabajar().catch(() => {});

    return () => {
        cancelado = true;
        motor?.destroy?.();
        motor = null;
    };
};
