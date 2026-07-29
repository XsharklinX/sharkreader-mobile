/**
 * Rejilla de nueve zonas con acción asignable.
 *
 * Hasta ahora la pantalla se repartía en tres franjas verticales fijas y
 * escritas en el código. Eso deja fuera dos cosas que la gente pide siempre:
 *
 *  - **Invertir los lados.** Quien lee en árabe o hebreo, y mucha gente zurda,
 *    espera lo contrario de lo que traemos.
 *  - **Usar la altura.** Con solo tres franjas, la mitad de la pantalla no
 *    puede hacer nada distinto de la otra mitad, y hay acciones —marcador,
 *    índice, voz— que se quedan siempre a dos toques de distancia.
 *
 * La rejilla se numera como el teclado numérico, de arriba a abajo:
 *
 *   ┌───┬───┬───┐
 *   │ 0 │ 1 │ 2 │   arriba
 *   ├───┼───┼───┤
 *   │ 3 │ 4 │ 5 │   medio
 *   ├───┼───┼───┤
 *   │ 6 │ 7 │ 8 │   abajo
 *   └───┴───┴───┘
 *
 * **Las columnas no son iguales.** Las laterales se quedan en el 18 % con tope
 * de 140 px, igual que antes: es el ancho que abarca un pulgar sin cambiar de
 * postura, y en una tablet un tercio de pantalla por lado sería una banda muerta
 * enorme. Las filas sí se reparten en tres partes iguales, porque ahí no hay un
 * gesto de referencia que imponga un tamaño.
 */

/**
 * Ancho de las zonas laterales, como fracción del ancho de página.
 *
 * Era 0.28. Con casi un tercio de pantalla por lado, el centro «real» —lo que
 * uno percibe como el medio— quedaba dentro de la zona de paso de página, y
 * tocar un poco a la izquierda del centro retrocedía. 0.18 deja el 64 %
 * central libre, que ya se lee claramente como centro.
 */
export const TAP_ZONE = 0.18;

/**
 * Tope absoluto de la zona lateral, en píxeles.
 *
 * En una tablet, un 18 % de 1200 px son 216 px de banda muerta a cada lado:
 * media pantalla dedicada a pasar página. El toque es del mismo tamaño en
 * cualquier pantalla —un pulgar— así que la zona también debe serlo a partir
 * de cierto ancho.
 */
export const TAP_ZONE_MAX_PX = 140;

/** Ancho efectivo de la zona lateral para un ancho de página dado. */
export const tapZoneWidth = (width) =>
    Math.min(TAP_ZONE_MAX_PX, width * TAP_ZONE);

/**
 * Acciones que se pueden asignar.
 *
 * `none` existe y es importante: en un móvil grande, la zona inferior central
 * queda justo donde se apoya el pulgar al sujetarlo, y hay quien necesita
 * apagarla para no pasar página sin querer.
 */
export const GESTURE_ACTIONS = {
    none:      { label: 'Nada',            description: 'La zona no responde' },
    next:      { label: 'Página siguiente', description: 'Avanza una página' },
    prev:      { label: 'Página anterior',  description: 'Retrocede una página' },
    chrome:    { label: 'Mostrar controles', description: 'Enseña u oculta las barras' },
    toc:       { label: 'Índice',           description: 'Abre el índice del libro' },
    bookmark:  { label: 'Marcador',         description: 'Pone o quita un marcador aquí' },
    speech:    { label: 'Leer en voz alta',  description: 'Arranca o para la voz' },
    brightness:{ label: 'Brillo',            description: 'Abre los ajustes de pantalla' },
    goto:      { label: 'Ir a…',            description: 'Salta a una posición concreta' },
    back:      { label: 'Volver atrás',      description: 'Deshace el último salto' },
};

/** Nueve zonas, de la 0 a la 8. */
export const ZONE_COUNT = 9;

export const ZONE_LABELS = [
    'Arriba izquierda', 'Arriba centro', 'Arriba derecha',
    'Centro izquierda', 'Centro', 'Centro derecha',
    'Abajo izquierda', 'Abajo centro', 'Abajo derecha',
];

/**
 * Reparto por defecto: **el mismo comportamiento de siempre.**
 *
 * Toda la columna izquierda retrocede, toda la derecha avanza y la central
 * enseña los controles. Quien no entre nunca en esta pantalla no debe notar que
 * la rejilla existe — una función nueva no puede cambiarle los gestos a nadie
 * por su cuenta.
 */
export const DEFAULT_GESTURE_GRID = [
    'prev', 'chrome', 'next',
    'prev', 'chrome', 'next',
    'prev', 'chrome', 'next',
];

/**
 * Zona en la que cae un punto.
 *
 * @param {number} x       Horizontal, en coordenadas del documento del libro.
 * @param {number} y       Vertical, en las mismas coordenadas.
 * @param {number} width
 * @param {number} height
 * @returns {number} Índice de 0 a 8.
 */
export const zoneIndexAt = (x, y, width, height) => {
    const side = tapZoneWidth(width);
    const column = x < side ? 0 : x > width - side ? 2 : 1;

    // Las filas sí van en tercios: no hay un gesto de referencia que imponga
    // otra cosa, y una franja superior estrecha sería difícil de acertar.
    const row = height > 0
        ? Math.min(2, Math.max(0, Math.floor((y / height) * 3)))
        : 1;

    return row * 3 + column;
};

/**
 * Acción configurada para un punto de la pantalla.
 *
 * Una rejilla corrupta o incompleta —un ajuste guardado por una versión
 * anterior, un backup a medias— no puede dejar la pantalla muerta: se cae al
 * reparto por defecto zona a zona, no de golpe, para conservar lo que sí sea
 * válido.
 */
export const actionAt = (grid, x, y, width, height) => {
    const index = zoneIndexAt(x, y, width, height);
    const action = Array.isArray(grid) ? grid[index] : undefined;
    return GESTURE_ACTIONS[action] ? action : DEFAULT_GESTURE_GRID[index];
};

/** Normaliza una rejilla venida de disco o de un backup. */
export const normalizeGrid = (grid) =>
    DEFAULT_GESTURE_GRID.map((fallback, index) => {
        const value = Array.isArray(grid) ? grid[index] : undefined;
        return GESTURE_ACTIONS[value] ? value : fallback;
    });

/** Cambia una zona devolviendo una rejilla nueva. */
export const withZone = (grid, index, action) => {
    const next = normalizeGrid(grid);
    if (index >= 0 && index < ZONE_COUNT && GESTURE_ACTIONS[action]) {
        next[index] = action;
    }
    return next;
};

/** Intercambia las columnas laterales. Es el ajuste que más se pide. */
export const mirrorGrid = (grid) => {
    const source = normalizeGrid(grid);
    const mirrored = [...source];
    for (let row = 0; row < 3; row += 1) {
        mirrored[row * 3] = source[row * 3 + 2];
        mirrored[row * 3 + 2] = source[row * 3];
    }
    return mirrored;
};

/**
 * ¿Se puede pasar página con algún toque?
 *
 * Sirve para avisar en la pantalla de ajustes. Dejar las nueve zonas sin
 * `next` es una configuración legítima —quien pase página solo deslizando— pero
 * también es lo que pasa al trastear sin querer, y descubrirlo a mitad de un
 * capítulo sin saber qué has tocado es desagradable.
 */
export const canTurnPages = (grid) => {
    const normalized = normalizeGrid(grid);
    return normalized.includes('next') && normalized.includes('prev');
};
