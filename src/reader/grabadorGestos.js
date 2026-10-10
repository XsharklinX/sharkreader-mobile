import { createGestureHandlers } from './useGestures.js';
import { createPageDrag } from './pageDrag.js';

/**
 * Gestos que no vuelven a romperse.
 *
 * ## El problema
 *
 * En el historial hay más de diez commits arreglando los gestos o el pliegue.
 * Las pruebas pasaban en verde mientras el gesto fallaba en el teléfono, porque
 * usaban toques de laboratorio: un punto abajo, un punto arriba, sin temblor,
 * sin el `pointercancel` que Android mete cuando cree que el gesto es suyo, sin
 * los eventos táctiles intercalados.
 *
 * ## Lo que hay aquí
 *
 *  - Un **grabador**: en modo depuración guarda cada gesto tal como llega del
 *    WebView —tiempos, posiciones, tamaño del contacto, número de dedos— y lo
 *    que el lector decidió hacer con él.
 *  - Un **reproductor**: pasa una traza grabada por los mismos manejadores que
 *    usa el lector (`createGestureHandlers` + `createPageDrag`, cableados igual
 *    que en `ReaderScreen`) y devuelve qué decidirían hoy.
 *
 * Las trazas se guardan en `gestos-reales/` con la decisión correcta, y una
 * prueba las reproduce todas. Un cambio que rompa un gesto real deja de pasar.
 *
 * ## Cómo grabar en el teléfono
 *
 * Con el móvil conectado y `chrome://inspect` abierto, en la consola del WebView:
 *
 *     __gestos.encender()      // a partir de aquí se graba
 *     // …hacer los gestos en el libro…
 *     copy(__gestos.exportar()) // al portapapeles del ordenador
 *
 * Cada traza exportada se pega en un fichero de `gestos-reales/`, se le pone
 * nombre y la decisión esperada, y ya forma parte de las pruebas.
 */

const MAXIMO = 200;

const resumirEvento = (tipo, evento, t0) => ({
    t: Math.round((evento.timeStamp ?? performance.now()) - t0),
    tipo,
    x: Math.round(evento.clientX ?? evento.touches?.[0]?.clientX ?? 0),
    y: Math.round(evento.clientY ?? evento.touches?.[0]?.clientY ?? 0),
    ...(evento.width ? { w: Math.round(evento.width), h: Math.round(evento.height || 0) } : {}),
    ...(evento.touches ? { dedos: evento.touches.length, toques: [...evento.touches].map((t) => [Math.round(t.clientX), Math.round(t.clientY)]) } : {}),
});

export const createGrabador = () => {
    let encendido = false;
    const trazas = [];
    let actual = null;

    const cerrar = () => {
        if (!actual) return;
        trazas.push(actual);
        if (trazas.length > MAXIMO) trazas.shift();
        actual = null;
    };

    return {
        encender(valor = true) { encendido = valor; },
        encendido: () => encendido,

        /**
         * Envuelve los manejadores de eventos del lector para grabarlos. Los
         * manejadores siguen haciendo exactamente lo mismo.
         */
        envolver(handlers) {
            const eventos = ['onPointerDown', 'onPointerMove', 'onPointerUp', 'onPointerCancel', 'onTouchStart', 'onTouchMove', 'onTouchEnd'];
            for (const nombre of eventos) {
                const original = handlers[nombre];
                if (typeof original !== 'function') continue;
                handlers[nombre] = (evento, ...resto) => {
                    if (encendido) {
                        if (nombre === 'onPointerDown' && !actual) {
                            actual = { t0: evento.timeStamp ?? performance.now(), ancho: handlers.getWidth?.() || 0, alto: handlers.getHeight?.() || 0, eventos: [], decisiones: [] };
                        }
                        actual?.eventos.push(resumirEvento(nombre, evento, actual.t0));
                    }
                    const salida = original(evento, ...resto);
                    if (encendido && (nombre === 'onPointerUp' || nombre === 'onPointerCancel')) {
                        // Las decisiones llegan en el mismo turno o el siguiente.
                        setTimeout(cerrar, 0);
                    }
                    return salida;
                };
            }
            return handlers;
        },

        /** Lo que hizo el lector con el gesto en curso: «next», «chrome»… */
        decision(nombre) {
            if (encendido && actual) actual.decisiones.push(nombre);
            else if (encendido && trazas.length) trazas[trazas.length - 1].decisiones.push(nombre);
        },

        exportar: () => JSON.stringify(trazas.map(({ t0, ...resto }) => resto), null, 1),
        vaciar() { trazas.length = 0; actual = null; },
    };
};

export const grabadorGestos = createGrabador();

export const exponerGrabador = (ventana = typeof window !== 'undefined' ? window : null) => {
    if (!ventana) return;
    ventana.__gestos = {
        encender: () => grabadorGestos.encender(true),
        apagar: () => grabadorGestos.encender(false),
        exportar: grabadorGestos.exportar,
        vaciar: grabadorGestos.vaciar,
    };
};

/** Un evento sintético con la forma que reciben los manejadores. */
const eventoDe = (e, ancho) => {
    const toques = (e.toques || []).map(([x, y]) => ({ clientX: x, clientY: y }));
    return {
        clientX: e.x,
        clientY: e.y,
        width: e.w,
        height: e.h,
        touches: e.toques ? toques : undefined,
        timeStamp: e.t,
        cancelable: true,
        preventDefault() {},
        currentTarget: { clientWidth: ancho },
    };
};

/**
 * Reproduce una traza por los manejadores del lector y dice qué decidirían.
 *
 * El reloj lo pone quien llama (con `vi.useFakeTimers`): aquí solo se avanza.
 *
 * @param {{ancho: number, alto: number, eventos: Object[]}} traza
 * @param {(ms: number) => void} avanzarReloj
 * @returns {string[]} decisiones: «next», «prev», «chrome», «pellizco»…
 */
export const reproducir = (traza, avanzarReloj) => {
    const decisiones = [];
    const ancho = traza.ancho || 400;
    const alto = traza.alto || 800;
    const handlers = createGestureHandlers({
        onNext: () => decisiones.push('next'),
        onPrev: () => decisiones.push('prev'),
        onToggleChrome: () => decisiones.push('chrome'),
        getWidth: () => ancho,
        getHeight: () => alto,
        onPinchStart: () => {},
        onPinchMove: () => {},
        onPinchEnd: () => decisiones.push('pellizco'),
    });
    // El arrastre, cableado como en `ReaderScreen`.
    const arrastre = createPageDrag({
        getWidth: () => ancho,
        isEnabled: () => true,
        onMove: () => {},
        onCancel: () => {},
        onCommit: (direccion) => decisiones.push(direccion),
    });
    handlers.onDragDown = arrastre.down;
    handlers.onDragMove = arrastre.move;
    handlers.onDragUp = arrastre.up;
    handlers.onDragCancel = arrastre.cancel;

    let t = 0;
    for (const e of traza.eventos) {
        if (e.t > t) { avanzarReloj(e.t - t); t = e.t; }
        handlers[e.tipo]?.(eventoDe(e, ancho));
    }
    avanzarReloj(50);
    return decisiones;
};
