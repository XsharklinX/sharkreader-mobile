import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { registerPlugin } from '@capacitor/core';
import { rankVoices } from '../reader/prosody.js';

/**
 * Plugin nativo que mantiene vivo el proceso mientras se lee y publica la
 * sesión multimedia. La síntesis sigue ocurriendo aquí, en JavaScript.
 */
const SharkSpeech = registerPlugin('SharkSpeech');

/**
 * Lectura en voz alta con el motor del sistema Android.
 *
 * El escritorio usa las voces neuronales de Edge, que dependen de sockets de
 * Node y no existen aquí. El motor del sistema es la alternativa correcta para
 * la v1: en español su calidad es buena, funciona sin conexión y no obliga a
 * montar un proxy propio.
 *
 * El troceo del texto lo sigue haciendo `core/ttsChunks.js`, que es puro y se
 * comparte con el escritorio: cortar por frases y no por párrafos es lo que
 * permite que cambiar de voz o de velocidad retome cerca de donde ibas.
 */

export const SPEECH_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/**
 * Tonos ofrecidos.
 *
 * El tono estaba fijo en 1 y no había forma de corregir una voz demasiado aguda
 * o demasiado plana. El rango es estrecho a propósito: por debajo de 0,85 la voz
 * se vuelve cavernosa y por encima de 1,15 suena a dibujos animados.
 */
export const SPEECH_PITCHES = [0.85, 0.925, 1, 1.075, 1.15];

/**
 * ¿El identificador de voz es un índice del respaldo o un nombre nativo?
 *
 * El plugin de Capacitor identifica las voces por su posición en la lista; el
 * nuestro por el nombre que da Android («es-es-x-eef-local»). `speak` espera un
 * número en el primer caso y una cadena en el segundo.
 */
const isIndexId = (id) => /^\d+$/.test(String(id));

export const createAndroidTts = () => {
    let speaking = false;
    let cancelled = false;

    return {
        /**
         * Voces del sistema, ordenadas por lo bien que van a sonar.
         *
         * Se pide primero al plugin nativo, que es el único que sabe la
         * **calidad** de cada voz y si necesita conexión. Android no ordena su
         * lista por nada, así que sin ese dato se cogía la primera — y en un
         * móvil con tres voces españolas podía ser la de calidad «very-low».
         *
         * El plugin de Capacitor queda como respaldo: responde antes pero solo
         * da nombre e idioma, así que sus voces salen sin insignia de calidad en
         * lugar de con una inventada.
         */
        async listVoices(lang = 'es') {
            try {
                const native = await SharkSpeech.listVoices();
                if (native?.ready && native.voices?.length) {
                    return rankVoices(native.voices, lang);
                }
            } catch {
                // Sigue al respaldo.
            }

            try {
                const { voices } = await TextToSpeech.getSupportedVoices();
                return rankVoices(
                    (voices || []).map((voice, index) => ({
                        // El índice es lo que espera `TextToSpeech.speak`.
                        id: String(index),
                        name: voice.name || voice.voiceURI || `Voz ${index + 1}`,
                        lang: voice.lang || '',
                        quality: null,
                        network: false,
                    })),
                    lang
                );
            } catch {
                return [];
            }
        },

        /**
         * Habla un fragmento y **resuelve cuando termina de sonar**.
         *
         * Eso es lo que permite encadenar frases desde el llamante sin llevar
         * la cuenta de tiempos: el bucle de reproducción simplemente espera.
         */
        async speak(text, {
            rate = 1, pitch = 1, voiceId = null, lang = 'es-ES', pauseMs = 0,
        } = {}) {
            if (!text?.trim()) return;
            cancelled = false;
            speaking = true;
            try {
                await TextToSpeech.speak({
                    text,
                    lang,
                    rate,
                    pitch,
                    volume: 1,
                    category: 'playback',
                    // El identificador nativo es el nombre de la voz; el del
                    // respaldo es un índice. Se distingue por la forma.
                    ...(voiceId === null || voiceId === undefined
                        ? {}
                        : { voice: isIndexId(voiceId) ? Number(voiceId) : String(voiceId) }),
                });

                /**
                 * Pausa antes de la frase siguiente.
                 *
                 * **Esto es lo que más hacía que sonara a máquina.** Un motor de
                 * voz devuelve el control en cuanto suena la última sílaba, no
                 * añade silencio: el bucle pedía la frase siguiente en el mismo
                 * instante y la lectura salía sin respiración. Una persona se
                 * para en un punto.
                 *
                 * Se hace con una espera y no con `playSilentUtterance` porque
                 * hay motores de terceros que no lo implementan y devuelven
                 * error, mientras que esperar funciona en todos.
                 */
                if (pauseMs > 0 && !cancelled) {
                    await new Promise((resolve) => setTimeout(resolve, pauseMs));
                }
            } finally {
                speaking = false;
            }
        },

        /**
         * El motor del sistema no expone pausa real: solo parar. Se para y el
         * llamante retoma desde la frase actual, que con frases cortas es
         * indistinguible de una pausa.
         */
        async pause() {
            await this.stop();
        },

        async resume() {
            // Lo gestiona el bucle de reproducción del lector, que sabe por qué
            // frase iba.
        },

        async stop() {
            cancelled = true;
            speaking = false;
            try { await TextToSpeech.stop(); } catch { /* no estaba hablando */ }
        },

        isSpeaking: () => speaking,
        isCancelled: () => cancelled,

        async isSupported() {
            try {
                const { voices } = await TextToSpeech.getSupportedVoices();
                return Array.isArray(voices) && voices.length > 0;
            } catch {
                return false;
            }
        },

        // ── Servicio en segundo plano ────────────────────────────────────────

        /** Arranca o actualiza la notificación multimedia. */
        async startService({ title, chapter, playing = true }) {
            try {
                await SharkSpeech.start({ title, chapter, playing });
            } catch {
                // Si el sistema rechaza el servicio (permiso de notificaciones
                // denegado), la lectura sigue funcionando con la app abierta:
                // solo se pierde el segundo plano. No es motivo para abortar.
            }
        },

        async stopService() {
            try { await SharkSpeech.stop(); } catch { /* no estaba activo */ }
        },

        /**
         * Botones de la notificación y de los auriculares.
         * @param {(command: string) => void} handler
         * @returns {Promise<() => void>} función para dejar de escuchar
         */
        async onCommand(handler) {
            const subscription = await SharkSpeech.addListener(
                'speechCommand',
                ({ command }) => handler(command)
            );
            return () => subscription.remove();
        },
    };
};
