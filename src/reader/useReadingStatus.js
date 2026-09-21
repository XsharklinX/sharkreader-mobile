import { useEffect, useState } from 'react';

/**
 * Hora y batería para la línea de estado del lector.
 *
 * ## Por qué la app enseña algo que ya enseña Android
 *
 * Porque mientras se lee, la barra del sistema está oculta. Leyendo de noche se
 * mira la hora cada poco, y si para verla hay que sacar el chrome —o peor, salir
 * del libro— la app está obligando a interrumpir la lectura para algo que cabe en
 * una línea de ocho píxeles.
 *
 * Es lo que hace Moon+ y es de las pocas cosas suyas que conviene copiar tal cual.
 *
 * ## Por qué se actualiza tan poco
 *
 * La hora, al cambiar de minuto y no cada segundo: un reloj sin segundos que se
 * repinta sesenta veces por minuto es trabajo tirado, y en una página de texto
 * cualquier repintado compite con el desplazamiento.
 *
 * La batería solo cuando el sistema avisa de que cambió. La API de batería emite
 * eventos; sondearla con un temporizador sería gastar batería para enseñar la
 * batería.
 */
export const useReadingStatus = (activo = true) => {
    const [hora, setHora] = useState(() => formatearHora(new Date()));
    const [bateria, setBateria] = useState(null);

    // ── La hora ──────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!activo) return undefined;

        let timer = null;

        const programar = () => {
            const ahora = new Date();
            setHora(formatearHora(ahora));

            // Se despierta justo al cambiar de minuto, no cada sesenta segundos:
            // con un intervalo fijo el reloj va desfasado hasta medio minuto.
            const faltan = 60000 - (ahora.getSeconds() * 1000 + ahora.getMilliseconds());
            timer = setTimeout(programar, faltan + 50);
        };

        programar();
        return () => clearTimeout(timer);
    }, [activo]);

    // ── La batería ───────────────────────────────────────────────────────────
    useEffect(() => {
        if (!activo || typeof navigator === 'undefined' || !navigator.getBattery) return undefined;

        let vivo = true;
        let fuente = null;
        const leer = () => {
            if (vivo && fuente) setBateria(Math.round(fuente.level * 100));
        };

        navigator.getBattery().then((bat) => {
            if (!vivo) return;
            fuente = bat;
            leer();
            bat.addEventListener('levelchange', leer);
        }).catch(() => {
            // Sin API de batería no se enseña el dato. Inventarlo sería peor que
            // no tenerlo, y la línea funciona igual con hora y capítulo.
        });

        return () => {
            vivo = false;
            fuente?.removeEventListener?.('levelchange', leer);
        };
    }, [activo]);

    return { hora, bateria };
};

/** Formato de 24 horas con dos cifras, que es como se lee de reojo. */
export const formatearHora = (fecha) => {
    const h = String(fecha.getHours()).padStart(2, '0');
    const m = String(fecha.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
};
