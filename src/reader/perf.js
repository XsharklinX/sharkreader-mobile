/**
 * Cronómetro de las dos esperas que se notan al leer.
 *
 * ## Por qué existe
 *
 * Hasta ahora la latencia se ha discutido a ojo: «va lento», «va fluido». A ojo
 * no se puede comparar con otro lector ni saber si un cambio ha servido, y ya ha
 * pasado varias veces que un arreglo *parecía* mejorar algo que no había
 * cambiado. Esto pone números a las dos esperas que el usuario sufre de verdad:
 *
 *   - **Pasar página**: desde que toca hasta que la página siguiente está
 *     pintada.
 *   - **Abrir el libro**: desde que se pide hasta que se ve la primera página.
 *
 * ## Qué significa «pintada»
 *
 * No basta con que epub.js diga que ha colocado el capítulo: eso es haber
 * cambiado el DOM, y el usuario no ve el DOM. La medida se cierra tras dos
 * fotogramas —`requestAnimationFrame` anidado—, que es cuando el navegador ya ha
 * compuesto y presentado lo que se cambió. Sin ese segundo fotograma se mide el
 * trabajo de JavaScript y se deja fuera justo la parte lenta, que es el pintado.
 *
 * ## Apagado por defecto
 *
 * Medir cuesta poco, pero no cuesta nada, y sobre todo llena la consola. Se
 * enciende desde la consola del WebView —o con `?perf` en la URL— y se lee con
 * `window.__perf.tabla()`. Al estar apagado, `iniciar` devuelve una función
 * vacía y no se guarda nada.
 */

/** Cuántas medidas se guardan de cada clase. Lo viejo se descarta. */
const MAXIMO = 60;

const registro = new Map();
let encendido = false;

/** Marca de tiempo monótona: `Date.now()` salta si el reloj del sistema cambia. */
const ahora = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Espera a que lo que se acaba de cambiar esté **presentado**.
 *
 * Un solo `requestAnimationFrame` se ejecuta *antes* del pintado del fotograma:
 * cerrar ahí mide el trabajo de JavaScript y deja fuera la composición. El
 * segundo fotograma solo puede empezar cuando el anterior ya se ha presentado,
 * así que ahí la página está de verdad en la pantalla.
 */
const trasPintar = (fn) => {
    if (typeof requestAnimationFrame !== 'function') { fn(); return; }
    requestAnimationFrame(() => requestAnimationFrame(fn));
};

/** Enciende o apaga la medición. Apagarla también vacía lo medido. */
export const medir = (valor = true) => {
    encendido = Boolean(valor);
    if (!encendido) registro.clear();
    return encendido;
};

/** ¿Se está midiendo? */
export const midiendo = () => encendido;

/**
 * Empieza a cronometrar algo y devuelve la función que lo cierra.
 *
 * Cerrar dos veces no cuenta dos veces: pasar página puede terminar por varios
 * caminos —el gesto, el temporizador de seguridad— y contar el segundo daría una
 * medida absurdamente larga que ensucia la mediana.
 *
 * @param {string} nombre
 * @returns {() => void}
 */
export const iniciar = (nombre) => {
    if (!encendido) return () => {};

    const desde = ahora();
    let cerrado = false;

    return () => {
        if (cerrado) return;
        cerrado = true;
        trasPintar(() => {
            const tardo = ahora() - desde;
            const lista = registro.get(nombre) || [];
            lista.push(tardo);
            if (lista.length > MAXIMO) lista.shift();
            registro.set(nombre, lista);

            // Cada medida se escribe además en la consola. En el teléfono no hay
            // forma de preguntar por la tabla —no hay consola interactiva—, pero
            // `adb logcat` sí recoge lo que la app escribe, y estando apagado por
            // defecto esto no ensucia nada.
            // eslint-disable-next-line no-console
            console.log(`[perf] ${nombre} ${Math.round(tardo)}ms`);
        });
    };
};

/**
 * Resumen de una serie de medidas.
 *
 * Se da la **mediana** y el **percentil 95**, no la media. La media de una
 * latencia miente: un solo tirón de 400 ms entre veinte páginas de 60 la sube
 * entera y parece que todo va mal, o al revés, esconde que una de cada veinte
 * páginas se atasca. Lo que se quiere saber es «cómo va normalmente» y «cómo va
 * cuando va mal», y eso son dos números.
 */
export const resumen = (medidas) => {
    if (!medidas?.length) return null;
    const orden = [...medidas].sort((a, b) => a - b);
    const en = (p) => orden[Math.min(orden.length - 1, Math.floor(p * orden.length))];
    return {
        veces: orden.length,
        mediana: Math.round(en(0.5)),
        p95: Math.round(en(0.95)),
        peor: Math.round(orden[orden.length - 1]),
    };
};

/** Todo lo medido, por nombre. */
export const tabla = () => {
    const salida = {};
    registro.forEach((medidas, nombre) => { salida[nombre] = resumen(medidas); });
    return salida;
};

/**
 * Deja el cronómetro a mano desde la consola del WebView.
 *
 * Es la única forma de tocarlo en el teléfono: no hay consola interactiva, pero
 * `adb logcat` sí recoge lo que la app escribe, así que `window.__perf.log()`
 * imprime la tabla y se lee desde el ordenador.
 */
export const exponer = (ventana = typeof window !== 'undefined' ? window : null) => {
    if (!ventana) return;
    ventana.__perf = {
        medir,
        midiendo,
        tabla,
        log: () => {
            // eslint-disable-next-line no-console
            console.log('[perf] ' + JSON.stringify(tabla()));
            return tabla();
        },
    };
};
