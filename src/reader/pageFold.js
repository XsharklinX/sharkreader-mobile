/**
 * Doblado de hoja, la geometría.
 *
 * ## Cómo lo hace Moon+ Reader y por qué se ve así
 *
 * En sus capturas se lee **el texto al revés** en la parte levantada. Eso no es
 * un efecto de sombra: es la propia página vista por detrás. Y hay un detalle que
 * lo explica todo: el doblez es una **línea recta**, no una curva.
 *
 * Una hoja de papel doblada por una línea recta produce, en la parte doblada,
 * exactamente el reflejo especular del contenido respecto a esa línea. No hace
 * falta perspectiva, ni malla, ni 3D: es una reflexión plana. Por eso el efecto
 * se ve nítido y no deformado — porque geométricamente *es* exacto.
 *
 * Lo que Moon+ tiene y nosotros no teníamos es **el contenido de la página como
 * imagen**, para poder pintarlo dos veces: una plana y otra reflejada. Él renderiza
 * el texto él mismo a una textura. Nosotros lo rasterizamos con `pageSnapshot.js`.
 *
 * ## Las tres capas
 *
 *   ┌─────────────┬───────────────┐
 *   │             │               │
 *   │  1. página  │  3. página    │   El doblez cae en `foldX`.
 *   │     nueva   │     vieja,    │
 *   │  (debajo)   │     reflejada │   A la izquierda del doblez, la hoja vieja
 *   │             │  ← dorso      │   sigue plana (capa 2, no dibujada aquí
 *   │             │               │   porque ocupa lo mismo que la 1).
 *   └─────────────┴───────────────┘
 *
 * En realidad son:
 *
 *  1. **Página nueva**, al fondo, quieta. Es el iframe vivo de epub.js.
 *  2. **Página vieja plana**, recortada a la izquierda del doblez.
 *  3. **Página vieja reflejada**, recortada al otro lado y espejada sobre la
 *     línea del doblez. Es el dorso.
 *
 * El doblez se mueve con el dedo: al principio está en el borde derecho —no se
 * ve nada doblado— y al final llega al izquierdo, con la hoja entera vuelta.
 */

/**
 * Posición del doblez para un progreso dado.
 *
 * En una hoja real, el doblez está en el punto medio entre el borde que se agarra
 * y donde está el dedo. Si el dedo ha recorrido la mitad del ancho, el doblez
 * está al 75 % — no al 50 —, y por eso al principio del gesto la parte doblada
 * crece el doble de rápido que se mueve el dedo. Reproducir esa relación es lo
 * que hace que se sienta como papel y no como una diapositiva.
 *
 * @param {number} progress 0 = sin doblar, 1 = hoja completamente vuelta.
 * @param {number} width    Ancho de la página.
 * @param {'next'|'prev'} direction
 * @returns {number} Posición horizontal del doblez, en píxeles enteros.
 */
export const foldPosition = (progress, width, direction = 'next') => {
    const t = Math.min(1, Math.max(0, progress));

    // Avanzando se agarra el borde derecho y el doblez viaja hacia la izquierda.
    // Retrocediendo, al contrario.
    const fold = direction === 'next'
        ? width * (1 - t)
        : width * t;

    // Entero: media unidad coloca cada letra a mitad de píxel y el texto se
    // redibuja distinto en cada fotograma. Es la misma razón que en el arrastre.
    return Math.round(fold) || 0;
};

/**
 * Recorte de la parte de la hoja vieja que sigue plana.
 *
 * Avanzando es todo lo que queda a la izquierda del doblez.
 */
export const flatClip = (foldX, width, direction = 'next') => (direction === 'next'
    ? `inset(0 ${Math.max(0, width - foldX)}px 0 0)`
    : `inset(0 0 0 ${Math.max(0, foldX)}px)`);

/**
 * Transformación del dorso: reflejo especular sobre la línea del doblez.
 *
 * `scaleX(-1)` con el origen en el doblez es literalmente lo que hace el papel al
 * plegarse. De ahí sale el texto al revés, y sale **exacto**, no aproximado.
 *
 * El `translateZ` fuerza una capa de composición para que el reflejo se mueva en
 * la GPU en lugar de repintarse en cada fotograma.
 */
export const backTransform = (foldX) =>
    `translate3d(0,0,0) scaleX(-1)`;

export const backOrigin = (foldX) => `${Math.round(foldX)}px center`;

/**
 * Recorte del dorso.
 *
 * El dorso solo existe entre el doblez y donde llega el papel doblado, que es a
 * la misma distancia por el otro lado. Sin este recorte, el reflejo asomaría por
 * el borde de la hoja y se vería texto invertido donde no toca.
 */
export const backClip = (foldX, width, direction = 'next') => {
    const reach = direction === 'next'
        ? Math.max(0, foldX)
        : Math.max(0, width - foldX);

    return direction === 'next'
        // Desde el doblez hacia la izquierda, tanto como papel haya doblado.
        ? `inset(0 ${Math.max(0, width - foldX)}px 0 ${Math.max(0, foldX - reach)}px)`
        : `inset(0 ${Math.max(0, width - foldX - reach)}px 0 ${Math.max(0, foldX)}px)`;
};

/**
 * Sombreado del dorso.
 *
 * El papel doblado no está iluminado igual que el que sigue plano: junto al
 * doblez casi no entra luz y hacia la punta va aclarándose. Sin este degradado el
 * reflejo parece una copia pegada en lugar de la otra cara de la hoja.
 *
 * Se devuelve la opacidad además del degradado porque al empezar el gesto la
 * hoja está casi plana y una sombra a plena intensidad delataría el truco.
 */
export const backShade = (progress, direction = 'next') => {
    const t = Math.min(1, Math.max(0, progress));
    return {
        gradient: direction === 'next'
            ? 'linear-gradient(to left, rgba(0,0,0,.34) 0%, rgba(0,0,0,.10) 42%, rgba(0,0,0,.02) 100%)'
            : 'linear-gradient(to right, rgba(0,0,0,.34) 0%, rgba(0,0,0,.10) 42%, rgba(0,0,0,.02) 100%)',
        // Sube rápido al principio y se estabiliza: es cuando el pliegue se
        // separa de la superficie y la sombra tiene sentido.
        opacity: Number(Math.min(1, t * 2.4).toFixed(3)),
    };
};

/**
 * Sombra que el papel doblado proyecta sobre la página de debajo.
 *
 * Es lo que da la sensación de que hay dos hojas y no un dibujo. Cae justo al
 * otro lado del doblez, sobre la página nueva.
 */
export const castShadow = (foldX, direction = 'next') => ({
    // Ancho de la banda de sombra. Fijo y estrecho: una sombra amplia parece
    // niebla, no una hoja a un milímetro de la otra.
    left: direction === 'next' ? Math.round(foldX) : Math.round(foldX) - 24,
    width: 24,
    gradient: direction === 'next'
        ? 'linear-gradient(to right, rgba(0,0,0,.26), rgba(0,0,0,0))'
        : 'linear-gradient(to left, rgba(0,0,0,.26), rgba(0,0,0,0))',
});

/**
 * Estado completo del pliegue. Es lo que consume el componente.
 *
 * Se calcula todo de una vez para que las cinco piezas —doblez, recorte plano,
 * dorso, su sombra y la proyectada— salgan siempre del mismo `foldX`. Calculadas
 * por separado, un redondeo distinto en cada una deja una costura de un píxel
 * justo en el doblez, que en una pantalla densa se ve como una línea clara.
 */
export const foldState = (progress, width, direction = 'next') => {
    const foldX = foldPosition(progress, width, direction);
    const shade = backShade(progress, direction);

    return {
        foldX,
        flatClip: flatClip(foldX, width, direction),
        backClip: backClip(foldX, width, direction),
        backTransform: backTransform(foldX),
        backOrigin: backOrigin(foldX),
        backShade: shade,
        shadow: castShadow(foldX, direction),
        // Al 0 no hay nada doblado: el componente puede ahorrarse pintar.
        visible: progress > 0.001,
    };
};
