import { useCallback, useEffect, useRef, useState } from 'react';
import { splitIntoSpeechChunks } from '../core/ttsChunks.js';
import { usePorts } from '../ports/index.js';

const PREFS_KEY = 'speech';

export const DEFAULT_SPEECH = { rate: 1, voiceId: null };

/**
 * Lectura en voz alta de lo que hay en pantalla.
 *
 * El bucle es deliberadamente simple: se cogen las frases de la página visible,
 * se hablan una a una esperando a que cada una termine, y al acabar la última se
 * pasa de página y se vuelve a empezar. Como el motor resuelve al terminar de
 * sonar, no hace falta estimar duraciones ni sincronizar temporizadores.
 *
 * Frases y no párrafos: cortar fino es lo que permite cambiar de velocidad o de
 * voz y retomar cerca de donde ibas, en vez de volver al principio del párrafo.
 */
export const useSpeech = ({ getPageText, onSentence, onNextPage }) => {
    const ports = usePorts();
    const [state, setState] = useState('idle'); // idle | speaking | paused
    const [settings, setSettings] = useState(DEFAULT_SPEECH);
    const [voices, setVoices] = useState([]);
    const [supported, setSupported] = useState(true);

    // El bucle vive en refs: si dependiera del estado de React, cada frase
    // provocaría un render y el bucle se reiniciaría a mitad de reproducción.
    const running = useRef(false);
    const queue = useRef([]);
    const index = useRef(0);
    const settingsRef = useRef(settings);
    settingsRef.current = settings;

    useEffect(() => {
        let alive = true;
        (async () => {
            const [stored, available, isSupported] = await Promise.all([
                ports.storage.getSetting(PREFS_KEY),
                ports.tts.listVoices(),
                ports.tts.isSupported(),
            ]);
            if (!alive) return;
            setSettings({ ...DEFAULT_SPEECH, ...(stored || {}) });
            setVoices(available);
            setSupported(isSupported);
        })().catch(() => {});
        return () => { alive = false; };
    }, [ports]);

    // Parar al desmontar es obligatorio: si no, la voz sigue sonando después de
    // salir del libro.
    useEffect(() => () => {
        running.current = false;
        ports.tts.stop().catch(() => {});
    }, [ports]);

    const runLoop = useCallback(async () => {
        while (running.current) {
            if (index.current >= queue.current.length) {
                // Se acabó la página: se pasa a la siguiente y se recarga la cola.
                const advanced = await onNextPage();
                if (!advanced || !running.current) break;

                // Pequeña espera para que epub.js termine de pintar la página
                // antes de leer su texto.
                await new Promise((resolve) => setTimeout(resolve, 350));
                queue.current = splitIntoSpeechChunks(getPageText() || '');
                index.current = 0;
                if (queue.current.length === 0) break;
            }

            const sentence = queue.current[index.current];
            onSentence?.(sentence, index.current);

            await ports.tts.speak(sentence, settingsRef.current);
            if (!running.current) break;
            index.current += 1;
        }

        if (!running.current) return;
        running.current = false;
        setState('idle');
        onSentence?.(null, -1);
    }, [ports, getPageText, onNextPage, onSentence]);

    const start = useCallback(async () => {
        const text = getPageText();
        if (!text?.trim()) return;

        queue.current = splitIntoSpeechChunks(text);
        index.current = 0;
        running.current = true;
        setState('speaking');
        runLoop();
    }, [getPageText, runLoop]);

    const pause = useCallback(async () => {
        running.current = false;
        await ports.tts.stop();
        setState('paused');
    }, [ports]);

    const resume = useCallback(async () => {
        if (queue.current.length === 0) {
            await start();
            return;
        }
        running.current = true;
        setState('speaking');
        runLoop();
    }, [runLoop, start]);

    const stop = useCallback(async () => {
        running.current = false;
        queue.current = [];
        index.current = 0;
        await ports.tts.stop();
        setState('idle');
        onSentence?.(null, -1);
    }, [ports, onSentence]);

    /** Cambiar velocidad o voz retoma en la frase actual, no desde el principio. */
    const updateSettings = useCallback(async (changes) => {
        const next = { ...settingsRef.current, ...changes };
        setSettings(next);
        settingsRef.current = next;
        await ports.storage.setSetting(PREFS_KEY, next);

        if (running.current) {
            running.current = false;
            await ports.tts.stop();
            running.current = true;
            runLoop();
        }
    }, [ports, runLoop]);

    /** Empezar a leer desde una frase concreta, al tocar un párrafo. */
    const speakFrom = useCallback(async (sentenceIndex) => {
        running.current = false;
        await ports.tts.stop();
        index.current = Math.max(0, Math.min(sentenceIndex, queue.current.length - 1));
        running.current = true;
        setState('speaking');
        runLoop();
    }, [ports, runLoop]);

    return {
        state,
        settings,
        voices,
        supported,
        isSpeaking: state === 'speaking',
        start,
        pause,
        resume,
        stop,
        updateSettings,
        speakFrom,
        toggle: () => (state === 'speaking' ? pause() : state === 'paused' ? resume() : start()),
    };
};
