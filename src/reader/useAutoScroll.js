import { useCallback, useEffect, useRef, useState } from 'react';
import { registerPlugin } from '@capacitor/core';

const SharkKeys = registerPlugin('SharkKeys');

/** Segundos por página, de más lento a más rápido. */
export const AUTOSCROLL_SPEEDS = [60, 45, 35, 25, 18, 12];
export const DEFAULT_SPEED_INDEX = 2;

/**
 * Avance automático y teclas de volumen.
 *
 * El autoscroll pasa página sola cada N segundos. En modo paginado eso es lo
 * correcto —no hay nada que desplazar—, y la velocidad se expresa en segundos
 * por página, que es lo que el usuario puede juzgar: «me da tiempo a leerla o
 * no».
 *
 * Las teclas de volumen se capturan solo mientras el lector está abierto. Fuera
 * de él el volumen tiene que seguir siendo el volumen, o la app parece rota.
 */
export const useAutoScroll = ({ onNext, onPrev, enabled = true }) => {
    const [running, setRunning] = useState(false);
    const [speedIndex, setSpeedIndex] = useState(DEFAULT_SPEED_INDEX);

    const actionsRef = useRef({ onNext, onPrev });
    actionsRef.current = { onNext, onPrev };

    // ── Avance automático ────────────────────────────────────────────────────
    useEffect(() => {
        if (!running) return undefined;
        const interval = setInterval(
            () => actionsRef.current.onNext(),
            AUTOSCROLL_SPEEDS[speedIndex] * 1000
        );
        return () => clearInterval(interval);
    }, [running, speedIndex]);

    // ── Teclas de volumen ────────────────────────────────────────────────────
    useEffect(() => {
        if (!enabled) return undefined;

        let unsubscribe;
        SharkKeys.setCapture({ enabled: true }).catch(() => {});

        SharkKeys.addListener('volumeKey', ({ direction }) => {
            // Subir volumen avanza y bajar retrocede: es el sentido que usan los
            // lectores dedicados y el que la mayoría espera.
            if (direction === 'up') actionsRef.current.onNext();
            else actionsRef.current.onPrev();
        }).then((subscription) => { unsubscribe = () => subscription.remove(); })
          .catch(() => {});

        return () => {
            // Devolver el control del volumen al salir del lector es obligatorio.
            SharkKeys.setCapture({ enabled: false }).catch(() => {});
            unsubscribe?.();
        };
    }, [enabled]);

    const faster = useCallback(
        () => setSpeedIndex((index) => Math.min(AUTOSCROLL_SPEEDS.length - 1, index + 1)),
        []
    );
    const slower = useCallback(() => setSpeedIndex((index) => Math.max(0, index - 1)), []);

    return {
        running,
        start: () => setRunning(true),
        stop: () => setRunning(false),
        toggle: () => setRunning((value) => !value),
        secondsPerPage: AUTOSCROLL_SPEEDS[speedIndex],
        speedIndex,
        faster,
        slower,
        canGoFaster: speedIndex < AUTOSCROLL_SPEEDS.length - 1,
        canGoSlower: speedIndex > 0,
    };
};
