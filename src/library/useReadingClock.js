import { useEffect, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { applyReadingMinute } from '../core/readingProgress.js';
import { usePorts } from '../ports/index.js';

const STATS_KEY = 'stats';
const MINUTE = 60_000;

/**
 * Contador de minutos leídos.
 *
 * Suma un minuto al libro y a las estadísticas globales por cada minuto que la
 * app pasa en el lector con la pantalla en primer plano. El reloj se para
 * cuando la app se va a segundo plano — si no, dejar el móvil en el bolsillo
 * con el lector abierto inflaría la racha y las estadísticas.
 *
 * `applyReadingMinute` viene del núcleo compartido, así que las rachas se
 * calculan exactamente igual que en escritorio.
 */
export const useReadingClock = (book, updateBook) => {
    const ports = usePorts();
    const bookRef = useRef(book);
    bookRef.current = book;

    useEffect(() => {
        if (!book) return undefined;

        let active = true;
        let timer = null;

        const tick = async () => {
            const current = bookRef.current;
            if (!active || !current) return;

            updateBook(current.id, {
                readingMinutes: (current.readingMinutes || 0) + 1,
                lastReadDate: Date.now(),
            });

            try {
                const stats = (await ports.storage.getSetting(STATS_KEY)) || {};
                const { next } = applyReadingMinute(stats);
                await ports.storage.setSetting(STATS_KEY, next);
            } catch {
                // Perder un minuto de estadística no debe interrumpir la lectura.
            }
        };

        const start = () => {
            if (timer) return;
            timer = setInterval(tick, MINUTE);
        };

        const stop = () => {
            if (!timer) return;
            clearInterval(timer);
            timer = null;
        };

        start();

        let listener;
        CapApp.addListener('appStateChange', ({ isActive }) => {
            if (isActive) start();
            else stop();
        }).then((handle) => { listener = handle; });

        return () => {
            active = false;
            stop();
            listener?.remove();
        };
    }, [book?.id, ports, updateBook]);
};
