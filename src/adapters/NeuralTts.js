import { NEURAL_VOICES } from '../core/ttsVoices.js';

/**
 * Voces neuronales a través de un proxy.
 *
 * ## Por qué hace falta un proxy y qué implica
 *
 * Las voces neuronales las sirve un proveedor de nube (Azure, Google, Amazon) y
 * todos cobran por carácter sintetizado. Llamarlos desde la app exigiría meter
 * una clave de API dentro del APK, y una clave dentro de un APK es una clave
 * pública: cualquiera puede extraerla y gastar contra ella. Por eso va contra un
 * servidor intermedio que guarda la clave y decide a quién sirve.
 *
 * **Ese servidor cuesta dinero todos los meses y hay que mantenerlo.** No viene
 * configurado ni existe uno «de SharkReader»: el usuario pone la dirección del
 * suyo. Poner uno por defecto significaría pagar la síntesis de voz de todos los
 * que instalen la app, y el día que se apagara —o se llenara— la función
 * dejaría de funcionar para todos a la vez sin que nadie pudiera arreglarlo.
 *
 * El repositorio incluye `docs/tts-proxy.md` con el servidor mínimo: son unas
 * cuarenta líneas y se despliega en cualquier sitio que ejecute Node.
 *
 * ## Lo que se manda por la red
 *
 * El texto que se va a leer. Nada más: ni qué libro es, ni quién lo lee, ni la
 * posición. Aun así **es texto del libro saliendo del dispositivo**, y por eso
 * la función viene apagada, se avisa al activarla y queda registrada en la
 * pantalla de privacidad junto al resto de conexiones.
 *
 * La voz del sistema sigue siendo la opción por defecto y funciona sin red.
 */

/** Cuánto texto se manda de una vez. Frases sueltas darían latencia por frase. */
const CHUNK_CHARS = 600;

/** Caché en memoria: volver atrás una página no vuelve a pedir ni a pagar. */
const CACHE_LIMIT = 12;

export const createNeuralTts = (getConfig) => {
    const cache = new Map();
    let current = null;

    const remember = (key, url) => {
        cache.set(key, url);
        if (cache.size > CACHE_LIMIT) {
            const oldest = cache.keys().next().value;
            URL.revokeObjectURL(cache.get(oldest));
            cache.delete(oldest);
        }
    };

    return {
        async isSupported() {
            const config = await getConfig();
            return Boolean(config?.enabled && config?.endpoint);
        },

        async listVoices() {
            const config = await getConfig();
            if (!config?.enabled || !config?.endpoint) return [];
            return NEURAL_VOICES;
        },

        /**
         * Sintetiza y reproduce.
         *
         * Se resuelve cuando **termina de sonar**, no cuando termina de
         * descargarse: el bucle de lectura encadena frases esperando a esta
         * promesa, y resolver al descargar solaparía todas las frases a la vez.
         */
        async speak(text, options = {}) {
            const config = await getConfig();
            if (!config?.endpoint) throw new Error('No hay servidor de voz configurado.');

            const voice = options.voiceId || config.voiceId || NEURAL_VOICES[0].id;
            const key = `${voice}:${options.rate || 1}:${text}`;

            let url = cache.get(key);
            if (!url) {
                const response = await fetch(config.endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
                    },
                    body: JSON.stringify({
                        text: text.slice(0, CHUNK_CHARS),
                        voice,
                        rate: options.rate || 1,
                    }),
                });

                if (!response.ok) {
                    throw new Error(`El servidor de voz respondió ${response.status}.`);
                }

                url = URL.createObjectURL(await response.blob());
                remember(key, url);
            }

            await new Promise((resolve, reject) => {
                const audio = new Audio(url);
                current = audio;
                audio.playbackRate = 1; // el ritmo lo aplica el servidor, no el reproductor
                audio.onended = () => { current = null; resolve(); };
                audio.onerror = () => { current = null; reject(new Error('No se pudo reproducir.')); };
                audio.play().catch(reject);
            });
        },

        async stop() {
            if (!current) return;
            current.pause();
            current.currentTime = 0;
            current = null;
        },

        async pause() { current?.pause(); },
        async resume() { await current?.play().catch(() => {}); },

        /** Comprueba que el servidor responde, para el botón de ajustes. */
        async test(endpoint, token) {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ text: 'Prueba de voz.', voice: NEURAL_VOICES[0].id, rate: 1 }),
            });
            if (!response.ok) throw new Error(`El servidor respondió ${response.status}.`);
            const blob = await response.blob();
            if (!blob.type.startsWith('audio/')) {
                throw new Error('El servidor no devolvió audio.');
            }
            return true;
        },
    };
};

/**
 * Elige entre la voz del sistema y la neuronal.
 *
 * La del sistema es la de por defecto y siempre está: funciona sin red, sin
 * servidor y sin coste. La neuronal solo entra si está configurada **y**
 * activada, y si falla se vuelve a la del sistema en lugar de dejar al usuario
 * sin voz a mitad de capítulo.
 */
export const createTtsRouter = (systemTts, neuralTts) => ({
    async isSupported() {
        return (await systemTts.isSupported()) || (await neuralTts.isSupported());
    },

    async listVoices() {
        const [system, neural] = await Promise.all([
            systemTts.listVoices(),
            neuralTts.listVoices(),
        ]);
        return [
            ...system.map((voice) => ({ ...voice, engine: 'system' })),
            ...neural.map((voice) => ({ ...voice, engine: 'neural' })),
        ];
    },

    async speak(text, options = {}) {
        if (options.engine === 'neural' && await neuralTts.isSupported()) {
            try {
                await neuralTts.speak(text, options);
                return;
            } catch {
                // Servidor caído, sin cobertura, cuota agotada: se sigue con la
                // voz del sistema. Quedarse callado a mitad de capítulo sería
                // mucho peor que cambiar de voz.
            }
        }
        await systemTts.speak(text, options);
    },

    async stop() {
        await Promise.all([systemTts.stop(), neuralTts.stop()]);
    },

    async pause() { await Promise.all([systemTts.pause(), neuralTts.pause()]); },
    async resume() { await Promise.all([systemTts.resume(), neuralTts.resume()]); },

    startService: (...args) => systemTts.startService?.(...args),
    stopService: (...args) => systemTts.stopService?.(...args),
    onCommand: (...args) => systemTts.onCommand?.(...args),
});
