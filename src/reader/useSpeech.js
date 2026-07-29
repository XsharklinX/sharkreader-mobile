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
export const useSpeech = ({ getPageText, onSentence, onNextPage, title = '', chapter = '' }) => {
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
    // salir del libro, y el servicio en primer plano dejaría una notificación
    // huérfana.
    useEffect(() => () => {
        running.current = false;
        ports.tts.stop().catch(() => {});
        ports.tts.stopService?.().catch?.(() => {});
    }, [ports]);

    // La notificación refleja lo que suena. Se actualiza al cambiar de estado o
    // de capítulo, no en cada frase: reescribirla cien veces por página haría
    // parpadear la notificación en la pantalla de bloqueo.
    const metaRef = useRef({ title, chapter });
    metaRef.current = { title, chapter };

    useEffect(() => {
        if (state === 'idle') {
            ports.tts.stopService?.().catch?.(() => {});
            return;
        }
        ports.tts.startService?.({
            title: metaRef.current.title,
            chapter: metaRef.current.chapter,
            playing: state === 'speaking',
        }).catch?.(() => {});
    }, [state, chapter, ports]);

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

    const toggle = useCallback(
        () => (state === 'speaking' ? pause() : state === 'paused' ? resume() : start()),
        [state, pause, resume, start]
    );

    // ── Temporizador de apagado ──────────────────────────────────────────────
    // «Para en 30 minutos»: quien escucha para dormirse no quiere despertarse
    // tres capítulos más adelante sin saber por dónde iba.
    const [sleepAt, setSleepAt] = useState(null);
    const stopRef = useRef(stop);
    stopRef.current = stop;

    useEffect(() => {
        if (!sleepAt) return undefined;
        const remaining = sleepAt - Date.now();
        if (remaining <= 0) {
            stopRef.current();
            setSleepAt(null);
            return undefined;
        }
        const timer = setTimeout(() => {
            stopRef.current();
            setSleepAt(null);
        }, remaining);
        return () => clearTimeout(timer);
    }, [sleepAt]);

    const setSleepTimer = useCallback((minutes) => {
        setSleepAt(minutes ? Date.now() + minutes * 60_000 : null);
    }, []);

    // Botones de la notificación y de los auriculares. Se registran una sola vez
    // y leen el estado a través de las funciones más recientes, que van en una
    // ref para no volver a suscribirse en cada render.
    const commandsRef = useRef({});
    commandsRef.current = { toggle, pause, resume, stop };

    useEffect(() => {
        let unsubscribe;
        ports.tts.onCommand?.((command) => {
            const api = commandsRef.current;
            if (command === 'toggle') api.toggle();
            else if (command === 'play') api.resume();
            else if (command === 'pause') api.pause();
            else if (command === 'stop') api.stop();
        }).then((remove) => { unsubscribe = remove; }).catch(() => {});

        return () => unsubscribe?.();
    }, [ports]);

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
        /** Índice de la frase que suena, para poder saltar tocando un párrafo. */
        sleepAt,
        setSleepTimer,
        currentIndex: () => index.current,
        sentences: () => queue.current,
        toggle,
    };
};
