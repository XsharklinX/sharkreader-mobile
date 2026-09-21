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
 * Recorte del dorso: **la otra mitad de la hoja**.
 *
 * El recorte se aplica en las coordenadas propias del elemento, antes de
 * reflejarlo. Así que lo que hay que recortar aquí no es dónde acaba el dorso en
 * pantalla, sino **qué trozo de la página se dobla**: el que queda al otro lado
 * del doblez que el trozo que sigue plano. Por eso esto es exactamente el
 * complemento de `flatClip`, y así es imposible que las dos mitades se pisen.
 *
 * **Aquí estaba el desastre.** Se recortaba el mismo trozo que sigue plano, no
 * el que se dobla. Al reflejarlo sobre el doblez, esa copia caía encima de la
 * página nueva y se veía texto al revés donde tenía que verse la página
 * siguiente — con una banda junto al doblez donde las dos se mezclaban y el
 * texto salía ilegible.
 */
export const backClip = (foldX, width, direction = 'next') => (direction === 'next'
    ? `inset(0 0 0 ${Math.max(0, foldX)}px)`
    : `inset(0 ${Math.max(0, width - foldX)}px 0 0)`);

/**
 * Dónde cae el papel doblado una vez reflejado.
 *
 * El reflejo sobre el doblez manda el trozo doblado al otro lado: un papel de
 * ancho `W - foldX` acaba ocupando desde `2·foldX - W` hasta el doblez. Esta es
 * la única pieza que necesita saberlo, porque la sombra del dorso **no se
 * refleja** —se dibuja encima, ya en coordenadas de pantalla— y sin esto se
 * pintaría sobre la mitad que no toca.
 */
export const shadeClip = (foldX, width, direction = 'next') => {
    if (direction === 'next') {
        const borde = Math.max(0, 2 * foldX - width);
        return `inset(0 ${Math.max(0, width - foldX)}px 0 ${borde}px)`;
    }
    const borde = Math.min(width, 2 * foldX);
    return `inset(0 ${Math.max(0, width - borde)}px 0 ${Math.max(0, foldX)}px)`;
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
export const backShade = (progress, direction = 'next', { dark = false } = {}) => {
    const t = Math.min(1, Math.max(0, progress));
    const hacia = direction === 'next' ? 'to left' : 'to right';

    /**
     * **En un tema oscuro la sombra tiene que ser luz.**
     *
     * Medido en el teléfono: con el degradado negro sobre una página casi negra,
     * entre el dorso y la página nueva había **un nivel** de diferencia. Ensombrecer
     * lo que ya está a oscuras no ensombrece nada, así que el dorso se veía como
     * texto al revés flotando, no como el reverso de una hoja.
     *
     * Lo que distingue una hoja levantada de la que está debajo no es que sea
     * oscura, es que **recibe otra luz**. En un tema claro eso se pinta como
     * sombra; en uno oscuro, como un velo de claridad hacia el doblez, que es la
     * parte más levantada y la que más luz coge.
     */
    /**
     * El degradado va de claro a oscuro **en el mismo trazo**, no de sombra a
     * nada.
     *
     * Una hoja levantada tiene dos cosas a la vez: el doblez, que es lo más alto
     * y lo que más luz coge, y el filo suelto, que es lo que más se aleja y cae
     * en sombra. Con un degradado que solo aclaraba junto al doblez, el dorso
     * quedaba tan legible como la página de debajo y el ojo veía dos textos
     * peleándose en lugar de una hoja volviéndose.
     */
    const gradient = dark
        ? `linear-gradient(${hacia}, rgba(255,255,255,.20) 0%, rgba(255,255,255,.04) 38%, rgba(0,0,0,.30) 100%)`
        : `linear-gradient(${hacia}, rgba(0,0,0,.30) 0%, rgba(0,0,0,.08) 40%, rgba(0,0,0,.42) 100%)`;

    return {
        gradient,
        // Sube rápido al principio y se estabiliza: es cuando el pliegue se
        // separa de la superficie y la sombra tiene sentido.
        opacity: Number(Math.min(1, t * 2.4).toFixed(3)),
    };
};

/**
 * El filo del doblez.
 *
 * Es la pieza que hace que se lea como papel en cualquier tema: en el pliegue de
 * una hoja real hay una línea donde la luz rebota, y es lo primero que ve el ojo.
 * Sin ella, el dorso y la página nueva se tocan con un corte plano que parece un
 * recorte, que es exactamente lo que parecía.
 *
 * Estrecha a propósito —tres píxeles— porque un filo ancho deja de ser un filo y
 * pasa a ser una banda.
 */
export const crease = (foldX, { dark = false } = {}) => ({
    left: Math.round(foldX) - 1,
    width: 3,
    gradient: dark
        ? 'linear-gradient(to right, rgba(255,255,255,0), rgba(255,255,255,.30), rgba(255,255,255,0))'
        : 'linear-gradient(to right, rgba(0,0,0,0), rgba(0,0,0,.22), rgba(0,0,0,0))',
});

/**
 * Sombra que el papel doblado proyecta sobre la página de debajo.
 *
 * Es lo que da la sensación de que hay dos hojas y no un dibujo. Cae justo al
 * otro lado del doblez, sobre la página nueva.
 */
export const castShadow = (foldX, direction = 'next', { dark = false } = {}) => ({
    // Ancho de la banda de sombra. Fijo y estrecho: una sombra amplia parece
    // niebla, no una hoja a un milímetro de la otra.
    left: direction === 'next' ? Math.round(foldX) : Math.round(foldX) - 24,
    width: 24,
    // En oscuro se rebaja: una sombra negra sobre una página casi negra no se
    // ve, y a plena intensidad solo ensucia el borde.
    gradient: direction === 'next'
        ? `linear-gradient(to right, rgba(0,0,0,${dark ? '.45' : '.26'}), rgba(0,0,0,0))`
        : `linear-gradient(to left, rgba(0,0,0,${dark ? '.45' : '.26'}), rgba(0,0,0,0))`,
});

/**
 * Estado completo del pliegue. Es lo que consume el componente.
 *
 * Se calcula todo de una vez para que las cinco piezas —doblez, recorte plano,
 * dorso, su sombra y la proyectada— salgan siempre del mismo `foldX`. Calculadas
 * por separado, un redondeo distinto en cada una deja una costura de un píxel
 * justo en el doblez, que en una pantalla densa se ve como una línea clara.
 */
export const foldState = (progress, width, direction = 'next', { dark = false } = {}) => {
    const foldX = foldPosition(progress, width, direction);
    const shade = backShade(progress, direction, { dark });

    return {
        foldX,
        flatClip: flatClip(foldX, width, direction),
        backClip: backClip(foldX, width, direction),
        backTransform: backTransform(foldX),
        backOrigin: backOrigin(foldX),
        shadeClip: shadeClip(foldX, width, direction),
        backShade: shade,
        shadow: castShadow(foldX, direction, { dark }),
        crease: crease(foldX, { dark }),
        // Al 0 no hay nada doblado: el componente puede ahorrarse pintar.
        visible: progress > 0.001,
    };
};
