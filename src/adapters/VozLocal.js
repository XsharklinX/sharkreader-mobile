import { registerPlugin } from '@capacitor/core';

/**
 * Voz natural sin internet. Ver `SharkVozLocalPlugin.java`.
 *
 * ## Qué voces y por qué estas
 *
 * Voces Piper convertidas por sherpa-onnx. Solo se ofrecen las que tienen una
 * licencia clara para una app que se publica: dominio público, CC0, Unlicense o
 * CC-BY (con su atribución, que va en `atribucion`). Otras voces de Piper muy
 * conocidas —lessac, alan, riccardo— se entrenaron con datos de licencia
 * restrictiva o sin aclarar, y por eso no están.
 */
const SharkVozLocal = registerPlugin('SharkVozLocal');

const BASE = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models';

export const VOCES_LOCALES = [
    { id: 'es_ES-davefx-medium', nombre: 'Davefx', idioma: 'es', acento: 'España', voz: 'masculina', mb: 67, licencia: 'CC0' },
    { id: 'es_ES-sharvard-medium', nombre: 'Sharvard', idioma: 'es', acento: 'España', voz: 'femenina y masculina', mb: 80, licencia: 'CC BY 3.0', atribucion: 'Sharvard Corpus, Universidad de Edimburgo' },
    { id: 'es_MX-ald-medium', nombre: 'Ald', idioma: 'es', acento: 'México', voz: 'masculina', mb: 67, licencia: 'Unlicense' },
    { id: 'en_US-ljspeech-medium', nombre: 'LJ', idioma: 'en', acento: 'Estados Unidos', voz: 'femenina', mb: 67, licencia: 'dominio público' },
    { id: 'fr_FR-siwis-medium', nombre: 'Siwis', idioma: 'fr', acento: 'Francia', voz: 'femenina', mb: 67, licencia: 'CC BY 4.0', atribucion: 'SIWIS French Speech Synthesis Database' },
    { id: 'de_DE-thorsten-medium', nombre: 'Thorsten', idioma: 'de', acento: 'Alemania', voz: 'masculina', mb: 67, licencia: 'CC0' },
    { id: 'pt_BR-faber-medium', nombre: 'Faber', idioma: 'pt', acento: 'Brasil', voz: 'masculina', mb: 67, licencia: 'CC0' },
].map((v) => ({ ...v, url: `${BASE}/vits-piper-${v.id}.tar.bz2` }));

export const vozLocal = (id) => VOCES_LOCALES.find((v) => v.id === id) || null;

export const createLocalTts = () => {
    let voz = null;

    return {
        async instaladas() {
            try {
                return (await SharkVozLocal.instaladas())?.voces || [];
            } catch {
                return [];
            }
        },

        async isSupported() {
            return (await this.instaladas()).length > 0;
        },

        /** Con la misma forma que las demás voces, para el selector de la hoja de voz. */
        async listVoices() {
            const ids = await this.instaladas();
            return ids.map((id) => {
                const v = vozLocal(id);
                return {
                    id,
                    name: v ? `${v.nombre} · natural, sin conexión` : id,
                    lang: v?.idioma || '',
                    // Arriba del todo en la lista, que se ordena por calidad.
                    quality: 'very-high',
                };
            });
        },

        async descargar(id, alAvanzar) {
            const v = vozLocal(id);
            if (!v) throw new Error('Esa voz no existe.');
            const oyente = await SharkVozLocal.addListener('progreso', (datos) => {
                if (datos?.id === id) alAvanzar?.(datos);
            });
            try {
                await SharkVozLocal.descargar({ id, url: v.url });
            } finally {
                oyente.remove?.();
            }
        },

        cancelarDescarga: () => SharkVozLocal.cancelarDescarga().catch(() => {}),
        borrar: (id) => SharkVozLocal.borrar({ id }),

        async speak(text, { voiceId, rate = 1, pauseMs = 0 } = {}) {
            voz = voiceId || voz;
            if (!voz) throw new Error('No hay ninguna voz natural descargada.');
            await SharkVozLocal.hablar({ id: voz, texto: text, velocidad: rate });
            // La respiración entre frases (ver `prosody.js`): la voz del sistema
            // la hace con su propio silencio; aquí, esperando.
            if (pauseMs > 0) await new Promise((listo) => { setTimeout(listo, pauseMs); });
        },

        /** Genera la frase siguiente mientras suena esta, para que no haya pausas. */
        async prepare(text, { voiceId, rate = 1 } = {}) {
            const id = voiceId || voz;
            if (!id || !text) return;
            await SharkVozLocal.preparar({ id, texto: text, velocidad: rate }).catch(() => {});
        },

        stop: () => SharkVozLocal.parar().catch(() => {}),
        pause: () => SharkVozLocal.pausar().catch(() => {}),
        resume: () => SharkVozLocal.reanudar().catch(() => {}),
    };
};

export { SharkVozLocal };
