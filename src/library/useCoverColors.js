import { useEffect, useState } from 'react';
import { colorDominante } from './coverColor.js';

/**
 * El color de cada portada, calculado una vez y recordado.
 *
 * ## Por qué hace falta un hook y no una función
 *
 * Sacar el color de una portada obliga a cargar la imagen, pintarla en un lienzo
 * y leer sus píxeles. Con ciento treinta y seis libros eso no se puede hacer
 * mientras se dibuja la lista: bloquearía el hilo justo al abrir la app, que es
 * cuando menos se perdona.
 *
 * Así que se calcula en segundo plano, de uno en uno, y se guarda. La estantería
 * empieza con lomos neutros y se va tiñendo sola mientras la miras — que además
 * se ve bien, porque es exactamente lo que está pasando.
 *
 * ## Y se guarda de verdad
 *
 * El resultado va al almacenamiento de ajustes, así que la segunda vez que abres
 * la app los lomos ya están de su color. Sin eso, ciento treinta y seis lienzos
 * en cada arranque serían un gasto de batería para llegar al mismo sitio.
 */

export const CLAVE = 'library.coverColors';

/** A qué tamaño se mira la portada. Pequeño: se busca el color, no el detalle. */
export const MUESTRA = 48;

/** Cuánto se espera entre portadas, para no comerse el hilo al arrancar. */
export const RESPIRO_MS = 60;

const leerColor = (src) => new Promise((listo) => {
    const imagen = new Image();
    imagen.decoding = 'async';

    imagen.onload = () => {
        try {
            const lienzo = document.createElement('canvas');
            lienzo.width = MUESTRA;
            lienzo.height = MUESTRA;
            const ctx = lienzo.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(imagen, 0, 0, MUESTRA, MUESTRA);
            listo(colorDominante(ctx.getImageData(0, 0, MUESTRA, MUESTRA)));
        } catch {
            // Una portada que no se deja leer —otro origen, formato raro— se
            // queda sin color y el lomo sale neutro. No es motivo para nada más.
            listo(null);
        }
    };
    imagen.onerror = () => listo(null);
    imagen.src = src;
});

/**
 * @param {Object[]} books
 * @param {{getSetting: Function, setSetting: Function}} storage
 * @param {boolean} activo  Solo trabaja cuando la vista lo necesita.
 * @returns {Record<string, string>} id de libro → color
 */
export const useCoverColors = (books, storage, activo = true) => {
    const [colores, setColores] = useState({});

    useEffect(() => {
        if (!storage) return undefined;
        let vivo = true;
        storage.getSetting(CLAVE)
            .then((guardado) => { if (vivo && guardado) setColores(guardado); })
            .catch(() => {});
        return () => { vivo = false; };
    }, [storage]);

    useEffect(() => {
        if (!activo || !storage || !books?.length) return undefined;

        let cancelado = false;
        const nuevos = {};

        const trabajar = async () => {
            for (const libro of books) {
                if (cancelado) return;
                if (colores[libro.id]) continue;

                const src = libro.coverUrl || libro.coverBase64;
                if (!src) continue;

                const color = await leerColor(src);
                if (cancelado) return;
                if (color) {
                    nuevos[libro.id] = color;
                    // Se publica de uno en uno: la estantería se va tiñendo
                    // mientras la miras en vez de cambiar de golpe al final.
                    setColores((actual) => ({ ...actual, [libro.id]: color }));
                }

                await new Promise((sigue) => { setTimeout(sigue, RESPIRO_MS); });
            }

            if (cancelado || !Object.keys(nuevos).length) return;
            const guardado = (await storage.getSetting(CLAVE).catch(() => null)) || {};
            await storage.setSetting(CLAVE, { ...guardado, ...nuevos }).catch(() => {});
        };

        trabajar();
        return () => { cancelado = true; };
        // `colores` queda fuera a propósito: cambia en cada portada resuelta, y
        // tenerlo aquí reiniciaría el recorrido entero con cada una.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [books, storage, activo]);

    return colores;
};
