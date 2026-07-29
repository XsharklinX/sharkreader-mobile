import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { registerPlugin } from '@capacitor/core';

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

export const createAndroidTts = () => {
    let speaking = false;
    let cancelled = false;

    return {
        /** Voces del sistema, con las españolas primero. */
        async listVoices() {
            try {
                const { voices } = await TextToSpeech.getSupportedVoices();
                return (voices || [])
                    .map((voice, index) => ({
                        id: String(index),
                        name: voice.name || voice.voiceURI || `Voz ${index + 1}`,
                        lang: voice.lang || '',
                    }))
                    .sort((a, b) => {
                        const aEs = a.lang.startsWith('es') ? 0 : 1;
                        const bEs = b.lang.startsWith('es') ? 0 : 1;
                        return aEs - bEs || a.name.localeCompare(b.name);
                    });
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
        async speak(text, { rate = 1, voiceId = null, lang = 'es-ES' } = {}) {
            if (!text?.trim()) return;
            cancelled = false;
            speaking = true;
            try {
                await TextToSpeech.speak({
                    text,
                    lang,
                    rate,
                    pitch: 1,
                    volume: 1,
                    category: 'playback',
                    ...(voiceId !== null ? { voice: Number(voiceId) } : {}),
                });
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
