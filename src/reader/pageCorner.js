/**
 * Doblado de esquina: la geometría de verdad del papel.
 *
 * ## Por qué no vale un doblez vertical
 *
 * El primer pliegue doblaba por una línea vertical, de arriba abajo. Eso no es
 * lo que hace una hoja cuando la coges: **se agarra por una esquina**, y
 * entonces el doblez sale en diagonal y el trozo levantado es un triángulo que
 * se va estrechando. Comparado con Moon+ al lado, la línea recta vertical
 * delataba el truco al instante — parecía una cortina, no papel.
 *
 * ## El modelo, en una frase
 *
 * Si sujetas la esquina `C` y la llevas hasta donde está el dedo `P`, el papel
 * se dobla por la **mediatriz** del segmento `C→P`: la línea donde las dos
 * mitades se tocan. Todo lo que queda del lado de la esquina se refleja sobre
 * esa línea, y ahí va a parar — por eso la esquina acaba exactamente bajo el
 * dedo. No es una aproximación: es la misma construcción que hace el papel.
 *
 * ```
 *        ┌───────────────────┐
 *        │                   │        C  esquina agarrada
 *        │      página       │        P  dedo
 *        │       nueva       │        M  punto medio de C→P
 *        │              ╲    │        ╲  el doblez (mediatriz)
 *        │      P·   M   ╲   │
 *        │        ╲      ╲   │        El triángulo bajo el doblez es
 *        │         ╲ dorso╲  │        el dorso: la hoja vieja reflejada.
 *        └──────────────────C┘
 * ```
 *
 * ## Qué hace falta calcular
 *
 * Tres recortes y una transformación:
 *
 *  - **`flatClip`**: lo que sigue plano de la hoja vieja. Es el rectángulo menos
 *    el triángulo.
 *  - **`backClip`**: el triángulo que se dobla, en coordenadas de la hoja **sin
 *    reflejar** — el recorte se aplica antes de la transformación.
 *  - **`backTransform`**: la reflexión sobre el doblez, que en CSS es girar,
 *    voltear y desgirar con el origen en el doblez.
 *  - **`shadeClip`**: dónde cae ese triángulo una vez reflejado, que es donde hay
 *    que pintarle la luz y la sombra. No coincide con `backClip`, y confundirlos
 *    pinta la sombra sobre la mitad que no toca.
 *
 * Todo es geometría pura y se prueba sin navegador, que es justo lo que faltaba
 * cuando el pliegue se veía mal: no había forma de comprobar el recorte más que
 * mirándolo en el teléfono.
 */

/** Las cuatro esquinas por las que se puede agarrar una hoja. */
export const ESQUINAS = {
    'bottom-right': (w, h) => ({ x: w, y: h }),
    'top-right': (w) => ({ x: w, y: 0 }),
    'bottom-left': (w, h) => ({ x: 0, y: h }),
    'top-left': () => ({ x: 0, y: 0 }),
};

/**
 * Qué esquina se está agarrando.
 *
 * El lado lo manda el sentido —avanzando se agarra la derecha— y la altura, el
 * dedo: si tocas arriba, se levanta la esquina de arriba. Es lo que hace que el
 * gesto se sienta tuyo y no una animación que va a su aire.
 */
export const esquinaDe = (direction, y, height) => {
    const arriba = height > 0 && y < height / 2;
    if (direction === 'prev') return arriba ? 'top-left' : 'bottom-left';
    return arriba ? 'top-right' : 'bottom-right';
};

/** Punto medio. */
const medio = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Recorta un polígono con una recta y se queda con un lado.
 *
 * Es el algoritmo de Sutherland–Hodgman reducido a un solo borde. Se usa dos
 * veces —una por cada lado del doblez— y de ahí salen el triángulo doblado y lo
 * que sigue plano, sin solaparse ni dejar hueco, que es la propiedad que hace
 * falta: cualquier desajuste entre los dos aparece como una costura de texto
 * repetido justo en el doblez.
 *
 * @param {{x:number,y:number}[]} poligono
 * @param {{x:number,y:number}} punto  Un punto de la recta.
 * @param {{x:number,y:number}} normal Normal de la recta; se conserva el lado al
 *                                     que apunta.
 */
export const cortar = (poligono, punto, normal) => {
    const dentro = (p) => (p.x - punto.x) * normal.x + (p.y - punto.y) * normal.y >= 0;
    const corte = (a, b) => {
        const da = (a.x - punto.x) * normal.x + (a.y - punto.y) * normal.y;
        const db = (b.x - punto.x) * normal.x + (b.y - punto.y) * normal.y;
        const t = da / (da - db);
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    };

    const salida = [];
    for (let i = 0; i < poligono.length; i += 1) {
        const actual = poligono[i];
        const siguiente = poligono[(i + 1) % poligono.length];
        const actualDentro = dentro(actual);
        const siguienteDentro = dentro(siguiente);

        if (actualDentro) salida.push(actual);
        if (actualDentro !== siguienteDentro) salida.push(corte(actual, siguiente));
    }
    return salida;
};

/** Refleja un punto sobre la recta que pasa por `punto` con normal `normal`. */
export const reflejar = (p, punto, normal) => {
    const largo = Math.hypot(normal.x, normal.y) || 1;
    const nx = normal.x / largo;
    const ny = normal.y / largo;
    const d = (p.x - punto.x) * nx + (p.y - punto.y) * ny;
    return { x: p.x - 2 * d * nx, y: p.y - 2 * d * ny };
};

/** Un polígono como `clip-path`. Redondeado a un decimal: más es ruido. */
export const aClip = (puntos) => (puntos.length < 3
    ? 'polygon(0 0, 0 0, 0 0)'
    : `polygon(${puntos.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(', ')})`);

/**
 * Estado completo del doblado de esquina.
 *
 * @param {{x:number,y:number}} dedo   Dónde está el dedo, en la hoja.
 * @param {number} width
 * @param {number} height
 * @param {string} esquina             Clave de `ESQUINAS`.
 * @param {{dark?: boolean}} opciones
 */
export const cornerState = (dedo, width, height, esquina = 'bottom-right', { dark = false } = {}) => {
    const hoja = [
        { x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height },
    ];
    const C = (ESQUINAS[esquina] || ESQUINAS['bottom-right'])(width, height);

    // El dedo no puede pasarse de la esquina opuesta: más allá el papel ya está
    // del todo vuelto y seguir estirando solo produce geometría imposible.
    const P = {
        x: Math.max(0, Math.min(width, dedo.x)),
        y: Math.max(0, Math.min(height, dedo.y)),
    };

    const dx = P.x - C.x;
    const dy = P.y - C.y;
    const recorrido = Math.hypot(dx, dy);

    // Sin recorrido no hay doblez: la hoja está entera y plana.
    if (recorrido < 1) {
        return {
            visible: false,
            angulo: 0,
            flatClip: aClip(hoja),
            backClip: aClip([]),
            shadeClip: aClip([]),
            backTransform: 'none',
            backOrigin: `${C.x}px ${C.y}px`,
            crease: null,
            progreso: 0,
        };
    }

    const M = medio(C, P);
    // La normal del doblez apunta de la esquina hacia el dedo: el lado que se
    // dobla es el de la esquina, así que para quedárnoslo se invierte.
    const normal = { x: dx / recorrido, y: dy / recorrido };
    const haciaEsquina = { x: -normal.x, y: -normal.y };

    const doblado = cortar(hoja, M, haciaEsquina);
    const plano = cortar(hoja, M, normal);
    const reflejado = doblado.map((p) => reflejar(p, M, normal));

    // Ángulo del doblez: perpendicular a C→P.
    const angulo = (Math.atan2(dy, dx) * 180) / Math.PI + 90;

    // La diagonal de la hoja es el recorrido máximo posible; sirve para saber
    // cuánto de vuelta está la página sin depender del tamaño de pantalla.
    const progreso = Math.min(1, recorrido / (Math.hypot(width, height) || 1));

    return {
        visible: true,
        angulo,
        flatClip: aClip(plano),
        backClip: aClip(doblado),
        shadeClip: aClip(reflejado),
        /**
         * Reflexión sobre el doblez.
         *
         * En CSS una reflexión sobre una recta cualquiera se escribe girando la
         * recta hasta la horizontal, volteando, y desgirando. El origen va en el
         * punto medio, que es por donde pasa el doblez.
         */
        backTransform: `rotate(${angulo.toFixed(2)}deg) scaleY(-1) rotate(${(-angulo).toFixed(2)}deg)`,
        backOrigin: `${M.x.toFixed(1)}px ${M.y.toFixed(1)}px`,
        crease: {
            // El filo se dibuja como una línea larga centrada en el punto medio y
            // girada: más fácil de pintar que recortar otro polígono, y no se nota
            // que sobra porque el recorte del dorso la corta.
            x: M.x,
            y: M.y,
            angulo,
            largo: Math.hypot(width, height) * 2,
            gradient: dark
                ? 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,.34), rgba(255,255,255,0))'
                : 'linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,.26), rgba(0,0,0,0))',
        },
        progreso,
    };
};
