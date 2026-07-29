import { useEffect, useState } from 'react';
import { layoutFor, showsTwoPanes } from './layout.js';

/**
 * Tamaño de la ventana y modo de disposición.
 *
 * Se escucha `resize` y no una media query por dos motivos: en un plegable el
 * cambio de tamaño no siempre cruza un corte de media query —abrir y cerrar la
 * bisagra a veces solo cambia la proporción— y aquí hace falta el número, no un
 * booleano, para repartir el ancho entre los dos paneles.
 *
 * El estado se calcula una vez en el primer render en lugar de empezar en cero:
 * arrancar en `compact` y saltar a `expanded` al primer efecto haría parpadear
 * la disposición entera cada vez que se abre la app en una tablet.
 */
export const useLayout = () => {
    const [size, setSize] = useState(() => ({
        width: typeof window === 'undefined' ? 0 : window.innerWidth,
        height: typeof window === 'undefined' ? 0 : window.innerHeight,
    }));

    useEffect(() => {
        let frame = null;

        const measure = () => {
            // Se mide en el siguiente fotograma: durante el pliegue de un
            // plegable llegan decenas de eventos seguidos, y recomponer la
            // pantalla en cada uno da un tirón muy visible.
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                setSize({ width: window.innerWidth, height: window.innerHeight });
            });
        };

        window.addEventListener('resize', measure);
        window.addEventListener('orientationchange', measure);

        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', measure);
            window.removeEventListener('orientationchange', measure);
        };
    }, []);

    return {
        ...size,
        mode: layoutFor(size.width, size.height),
        twoPanes: showsTwoPanes(size.width, size.height),
    };
};
