/**
 * Tipografía del lector EPUB.
 *
 * epub.js renderiza cada capítulo dentro de un iframe y lo pagina con columnas
 * CSS, así que hay dos reglas que no se pueden romper:
 *
 *  1. **Nada de padding ni margin en `html` o `body`.** epub.js calcula el ancho
 *     de columna a partir del ancho del contenedor; cualquier relleno dentro del
 *     documento descuadra esa cuenta y el texto se sale de la pantalla. Los
 *     márgenes de lectura se aplican al contenedor, fuera del iframe.
 *  2. **`text-size-adjust: 100%` es obligatorio.** El WebView de Android infla
 *     por su cuenta el tamaño de letra de los documentos que considera "de
 *     escritorio" — y un capítulo de EPUB sin viewport lo es. Sin esta regla el
 *     texto sale gigante por mucho que se fije `font-size`.
 *
 * Las dos cosas juntas eran la causa del texto enorme y desbordado.
 */

/**
 * Los valores de partida componen como un libro, no como una web.
 *
 * Antes eran interlineado 1,6, párrafos separados por 0,7em de aire y sin
 * sangría — la composición de un artículo en pantalla. Medido contra Moon+ en el
 * mismo teléfono, eso enseñaba un 40 % menos de texto por pantalla: 38,6 px de
 * alto de línea contra 28,3, y catorce líneas menos.
 *
 * Un libro impreso usa interlineado corto y sangría de primera línea, y por eso
 * cabe el doble sin cansar: el ojo no salta huecos en blanco entre párrafos.
 * Mezclar sangría **y** espacio es el error de composición más común, así que se
 * elige uno — y el que hace que parezca un libro es la sangría.
 */
export const DEFAULT_TYPOGRAPHY = {
    fontFamily: 'literata',
    fontSize: 18,
    lineHeight: 1.38,
    // Margen lateral. Los de arriba y abajo van aparte y no valen lo mismo: ver
    // `marginTop`.
    margin: 14,
    /**
     * Márgenes de arriba y de abajo, por separado.
     *
     * No quieren el mismo valor que los laterales ni el mismo entre ellos. A los
     * lados el margen es aire de sujeción —donde va el pulgar—, arriba es solo
     * respiración, y abajo tiene que convivir con la línea de estado, que ya pone
     * texto ahí. Un único valor para los cuatro obliga a elegir cuál de los tres
     * problemas se resuelve.
     *
     * Estos valores son los que la app tenía fijos en el CSS, así que quien no
     * los toque no nota ningún cambio.
     */
    marginTop: 28,
    marginBottom: 34,
    letterSpacing: 0,
    /**
     * Peso del cuerpo de texto.
     *
     * Las tres fuentes empaquetadas son variables de 400 a 700, así que 500 es un
     * peso real y no una negrita sintética. Importa más de lo que parece: en una
     * pantalla a pleno brillo, o al sol, un trazo de 400 se lava y cuesta leer;
     * en una pantalla tenue de noche, un 500 empasta. Es el mismo texto pidiendo
     * cosas distintas según dónde se lea.
     */
    fontWeight: 400,
    paragraphSpacing: 0.7,
    // 'space' separa párrafos con aire; 'indent' los pega y sangra la primera
    // línea, que es como está compuesto cualquier libro en papel.
    paragraphStyle: 'indent',
    // Idioma para la partición de palabras. 'auto' usa el que declare el EPUB,
    // que muchos declaran mal o no declaran.
    hyphenLang: 'auto',
    // Justificado, que es como está compuesto cualquier libro. Solo se sostiene
    // con guionado: sin partir palabras se abren ríos de espacio entre ellas, y
    // por eso los dos van juntos y no por separado.
    justify: true,
    hyphens: true,
    // 'paginated' (por defecto) o 'scrolled': hay quien prefiere desplazar
    // en vez de pasar página, y epub.js soporta las dos formas de flujo.
    flow: 'paginated',
    // Ajustes de accesibilidad para dislexia: más aire entre letras, palabras
    // y líneas, sin justificar y sin partir palabras.
    dyslexia: false,
    // Dos columnas cuando la pantalla es ancha. Una línea de 90 caracteres es
    // ilegible: en horizontal y en tablet, una sola columna castiga la lectura.
    spread: 'auto',
    // Letra capitular al empezar capítulo. Detalle pequeño que hace que un
    // capítulo parezca un capítulo.
    dropCap: false,
    // Cuelga comillas y rayas de diálogo fuera del margen para que el borde
    // izquierdo del texto se vea recto.
    hangingPunctuation: false,
    // Modo tinta electrónica: contraste máximo, sin animaciones ni capas de
    // color. Ver READER_THEMES.eink.
    eink: false,
};

/**
 * Familias de lectura.
 *
 * Las tres primeras viajan dentro del APK: no dependen de lo que traiga el
 * sistema, así que el libro se ve igual en cualquier dispositivo. Georgia y
 * Roboto se quedan como respaldo para quien las prefiera, pero ya no son la
 * opción por defecto — ninguna se diseñó para leer novelas en seis pulgadas.
 */
export const FONT_FAMILIES = [
    { id: 'literata', label: 'Literata', stack: 'Literata, Georgia, serif', bundled: true },
    { id: 'source-serif', label: 'Source Serif', stack: '"Source Serif 4", Georgia, serif', bundled: true },
    { id: 'atkinson', label: 'Atkinson', stack: '"Atkinson Hyperlegible", Verdana, sans-serif', bundled: true },
    { id: 'serif', label: 'Georgia', stack: 'Georgia, "Noto Serif", serif' },
    { id: 'sans', label: 'Sans', stack: 'Roboto, "Segoe UI", system-ui, sans-serif' },
    { id: 'mono', label: 'Mono', stack: '"Roboto Mono", ui-monospace, monospace' },
];

/** Presets de un toque, los mismos que en escritorio. */
export const TYPOGRAPHY_PRESETS = {
    /**
     * El de por defecto, y el que compone como un libro impreso.
     *
     * Va primero porque es el que se quiere el 90 % de las veces. Los otros tres
     * existen para casos concretos —vista cansada, pantalla pequeña, dislexia— y
     * ninguno debería ser el punto de partida.
     */
    book: {
        label: 'Libro',
        values: { fontSize: 18, lineHeight: 1.38, margin: 14, letterSpacing: 0, paragraphSpacing: 0.7, justify: true, paragraphStyle: 'indent' },
    },
    balanced: {
        label: 'Equilibrado',
        values: { fontSize: 18, lineHeight: 1.6, margin: 20, letterSpacing: 0, paragraphSpacing: 0.7, justify: false, paragraphStyle: 'space' },
    },
    focus: {
        label: 'Enfoque',
        values: { fontSize: 20, lineHeight: 1.9, margin: 32, letterSpacing: 0.2, paragraphSpacing: 1, justify: false, paragraphStyle: 'space' },
    },
    compact: {
        label: 'Compacto',
        values: { fontSize: 16, lineHeight: 1.45, margin: 14, letterSpacing: 0, paragraphSpacing: 0.4, justify: true, paragraphStyle: 'indent' },
    },
    accessible: {
        label: 'Accesible',
        values: { fontSize: 23, lineHeight: 2, margin: 20, letterSpacing: 0.5, paragraphSpacing: 1.2, justify: false, paragraphStyle: 'space' },
    },
};

export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 32;
export const MARGIN_MIN = 0;
export const MARGIN_MAX = 48;

/**
 * Los temas de lectura.
 *
 * ## Contraste
 *
 * Los textos eran grises azulados buscando suavidad, y el precio era definición:
 * cada letra en un WebView se compone con suavizado en escala de grises, y sobre
 * un gris de fondo eso se lee como texto lavado. Subidos, el rango va de 11 a 16
 * en vez de 9 a 13 — comprobado en `temas.test.js`, no a ojo.
 *
 * ## Grano
 *
 * `grain` dice si el tema se pinta con textura de papel. Lo que hace que una
 * página se vea como una hoja de verdad no es el color: es que el fondo **no sea
 * uniforme**. Medido sobre Moon+, su papel oscila entre 220 y 237 de luminosidad.
 *
 * El grano lo pinta el contenedor del lector, fuera del iframe del libro — ver
 * `reader-chrome.css`. Dentro pelearía con la paginación por columnas de epub.js.
 */
export const READER_THEMES = {
    dark:  { label: 'Oscuro', bg: '#12171D', text: '#E7ECF1', link: '#7CC6F0', ui: 'dark' },
    black: { label: 'Negro',  bg: '#000000', text: '#E4E4E4', link: '#6FB9E8', ui: 'dark' },
    sepia: { label: 'Sepia',  bg: '#EFE4CE', text: '#33291B', link: '#8A5A20', ui: 'light', grain: true },
    cream: { label: 'Crema',  bg: '#F7F1E6', text: '#241F18', link: '#7A5416', ui: 'light', grain: true },
    paper: { label: 'Papel',  bg: '#E9E5E2', text: '#101010', link: '#1064A8', ui: 'light', grain: true },
    // Pergamino: el más cálido de los claros, para leer de día sin blanco.
    parchment: { label: 'Pergamino', bg: '#E8DCC0', text: '#2E2517', link: '#7A5416', ui: 'light', grain: true },
    night: { label: 'Noche',  bg: '#0F1B2A', text: '#CBD8E3', link: '#6FB2DE', ui: 'dark' },
    // Noche cálida: negro con texto crema y sin una gota de azul. Es el que se
    // usa de madrugada — el azul de los temas fríos es justo lo que despierta.
    warmnight: { label: 'Noche cálida', bg: '#1A1815', text: '#D6CCBA', link: '#C9A227', ui: 'dark', grain: true },
    // Tinta electrónica: negro sobre blanco puros. En un panel reflectante el
    // contraste real ya es bajo de por sí, así que cualquier gris —de los que
    // en un móvil se agradecen— se vuelve ilegible. Aquí no se suaviza nada.
    eink:  { label: 'E-Ink',  bg: '#FFFFFF', text: '#000000', link: '#000000', ui: 'light' },
};

/**
 * Ajustes que impone el modo tinta electrónica.
 *
 * No es solo un tema. Un panel e-ink refresca por partículas: cualquier
 * animación deja rastro de la imagen anterior, y las capas semitransparentes
 * —el atenuador, el filtro cálido— se convierten en tramas de puntos porque el
 * panel no tiene niveles intermedios que dar. Lo que en un móvil son detalles
 * agradables, ahí son defectos visibles.
 *
 * Y el trazo fino desaparece: la tinta se expande un poco al asentarse y una
 * fuente de peso normal sale lavada, así que se sube el peso.
 */
export const EINK_OVERRIDES = {
    theme: 'eink',
    transition: 'none',
    dim: 0,
    warm: 0,
    drag: false,
    fontWeight: 500,
};

const fontStack = (id) =>
    FONT_FAMILIES.find((font) => font.id === id)?.stack || FONT_FAMILIES[0].stack;

/**
 * Los valores de composición de antes de que la página se compusiera como un
 * libro. Se guardan para poder reconocer quién nunca tocó nada.
 */
const COMPOSICION_ANTIGUA = {
    lineHeight: 1.6,
    margin: 20,
    paragraphStyle: 'space',
    justify: false,
};

/**
 * Trae a un libro ya empezado la composición nueva — si nunca la tocó.
 *
 * Los ajustes de tipografía se guardan **por libro**, así que cambiar los valores
 * de partida solo arregla los libros que se abran a partir de ahora. Un lector con
 * ciento treinta y seis libros empezados no vería el cambio en ninguno, que es lo
 * que pasó al probarlo: la página seguía con aire entre párrafos y sin sangría.
 *
 * La regla es la única defendible: **si coincide exactamente con lo que había por
 * defecto, es que nadie lo eligió** — es un valor heredado, no una preferencia. Y
 * si cambió aunque sea uno de los cuatro, se respeta todo, porque quien ajusta el
 * interlineado a mano no quiere que se lo muevan.
 */
export const migrarComposicion = (guardada) => {
    // Sin nada guardado no hay nada que migrar: los valores de partida ya son
    // los nuevos.
    if (!guardada) return guardada;

    const sinTocar = Object.entries(COMPOSICION_ANTIGUA)
        .every(([clave, valor]) => guardada[clave] === valor);

    if (!sinTocar) return guardada;

    return {
        ...guardada,
        lineHeight: DEFAULT_TYPOGRAPHY.lineHeight,
        margin: DEFAULT_TYPOGRAPHY.margin,
        paragraphStyle: DEFAULT_TYPOGRAPHY.paragraphStyle,
        justify: DEFAULT_TYPOGRAPHY.justify,
    };
};

export const clampFontSize = (value) =>
    Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(value)));

export const clampMargin = (value) =>
    Math.min(MARGIN_MAX, Math.max(MARGIN_MIN, Math.round(value)));

/**
 * Estilos que epub.js inyecta dentro del iframe de cada capítulo.
 * @param {typeof DEFAULT_TYPOGRAPHY} typography
 * @param {keyof typeof READER_THEMES} themeId
 */
export const buildReaderStyles = (typography, themeId) => {
    const base = { ...DEFAULT_TYPOGRAPHY, ...typography };
    const theme = READER_THEMES[themeId] || READER_THEMES.dark;

    // El modo dislexia no es solo una fuente: lo que más ayuda es el aire entre
    // letras, palabras y líneas, no justificar y no partir palabras al final de
    // línea. Esos cuatro ajustes se aplican encima de lo que haya configurado.
    const settings = base.dyslexia
        ? {
            ...base,
            letterSpacing: Math.max(base.letterSpacing, 1.2),
            lineHeight: Math.max(base.lineHeight, 1.9),
            justify: false,
            hyphens: false,
        }
        : base;

    // Atkinson Hyperlegible viaja dentro del APK, así que el modo dislexia ya no
    // depende de que el usuario tenga instalada una fuente concreta. La versión
    // anterior pedía OpenDyslexic por nombre y casi nadie la tiene: el modo se
    // quedaba en cambiar espaciados.
    const family = base.dyslexia
        ? '"Atkinson Hyperlegible", Verdana, Tahoma, sans-serif'
        : fontStack(settings.fontFamily);

    // Sangría de primera línea frente a espacio entre párrafos. Un libro en
    // papel usa sangría y párrafos pegados; el espacio es convención de web.
    // Mezclar las dos cosas es el error de composición más común.
    const indented = settings.paragraphStyle === 'indent';

    /**
     * Sin esto no funcionaba deslizar para pasar página.
     *
     * El WebView de Android decide **él** qué hacer con un arrastre en cuanto
     * detecta movimiento: si el documento no declara lo contrario, se queda el
     * gesto para desplazar la página y emite `pointercancel`. A partir de ahí no
     * llegan más `pointermove` ni el `pointerup`, así que el arrastre no se
     * pintaba nunca y el deslizamiento tampoco se llegaba a evaluar. Los toques
     * seguían funcionando porque no hay movimiento que interceptar — que es
     * exactamente el síntoma que se veía: se pasaba página tocando los bordes
     * pero deslizar no hacía nada.
     *
     * Paginado: `none`, no hay nada que desplazar y el gesto es nuestro.
     * Desplazamiento: `pan-y`, el vertical es del navegador y el horizontal
     * nuestro.
     */
    const touchAction = settings.flow === 'scrolled' ? 'pan-y' : 'none';

    /**
     * Cuándo se pisan los colores que trae el libro.
     *
     * Muchos EPUB llevan color incrustado en su CSS o en atributos en línea. Se
     * pisaban **siempre**, con `!important` sobre cada elemento, y el precio era
     * alto: las versalitas, los títulos de capítulo y los ornamentos que compuso
     * la editorial desaparecían en gris. Comparado con Moon+ en el mismo libro,
     * ahí se ven un «2» y un «VIN REACCIONÓ DE INMEDIATO» en granate; en el
     * nuestro salía todo del mismo color.
     *
     * La distinción es de sentido común: **un EPUB se compone para papel**. Sus
     * colores están elegidos contra un fondo claro, así que en un tema claro se
     * respetan enteros y el libro se ve como lo pensó su editor.
     *
     * En un tema oscuro esos mismos colores son una trampa —un rojo oscuro sobre
     * negro no se lee, y un libro con `color: #000` fijo desaparece— así que ahí
     * sí se imponen. Quien quiera ver el libro tal cual lo compuso el editor tiene
     * los cuatro temas claros, que es donde esos colores tienen sentido.
     */
    const respetarColoresDelLibro = theme.ui === 'light';

    const forceColors = respetarColoresDelLibro
        ? {
            // Ni siquiera en claro se deja el fondo del libro: un recuadro blanco
            // puro sobre papel crema se ve como un parche, y es lo único que
            // rompe la textura de la hoja.
            'background-color': 'transparent !important',
            'background-image': 'none !important',
        }
        : {
            'color': `${theme.text} !important`,
            'background-color': 'transparent !important',
            'background-image': 'none !important',
        };

    return {
        'html': {
            // Ni padding ni margin: rompen el cálculo de columnas de epub.js.
            'padding': '0 !important',
            'margin': '0 !important',
            'background': `${theme.bg} !important`,
            // Sin esto el WebView de Android agranda el texto por su cuenta.
            '-webkit-text-size-adjust': '100% !important',
            'text-size-adjust': '100% !important',
            'touch-action': touchAction,
        },
        'body': {
            'padding': '0 !important',
            'margin': '0 !important',
            'background': `${theme.bg} !important`,
            'color': `${theme.text} !important`,
            'font-family': `${family} !important`,
            'font-size': `${settings.fontSize}px !important`,
            'line-height': `${settings.lineHeight} !important`,
            'letter-spacing': `${settings.letterSpacing}px !important`,
            'text-align': settings.justify ? 'justify !important' : 'left !important',
            '-webkit-hyphens': settings.hyphens ? 'auto' : 'manual',
            'hyphens': settings.hyphens ? 'auto' : 'manual',
            '-webkit-text-size-adjust': '100% !important',
            'text-size-adjust': '100% !important',
            'word-spacing': settings.dyslexia ? '0.16em !important' : 'normal',
            '-webkit-tap-highlight-color': 'transparent',
            'touch-action': touchAction,
            // En tinta electrónica el trazo fino se pierde: la tinta se expande
            // al asentarse y un peso normal sale lavado. Ahí manda el panel, no
            // la preferencia.
            ...(base.eink
                ? { 'font-weight': `${EINK_OVERRIDES.fontWeight} !important` }
                : { 'font-weight': `${settings.fontWeight || 400} !important` }),
        },
        // Nada puede ser más ancho que la columna. Es la otra mitad del arreglo
        // del desbordamiento: una tabla o una imagen grande empujaba el texto.
        '*': {
            'max-width': '100% !important',
            'box-sizing': 'border-box !important',
        },
        'p, div, span, li, td, th, blockquote, section, article, figure': forceColors,
        'p': {
            'margin': indented ? '0 !important' : `0 0 ${settings.paragraphSpacing}em 0 !important`,
            'text-indent': indented ? '1.4em !important' : '0 !important',
            'overflow-wrap': 'break-word',
            'word-wrap': 'break-word',
            // Evita que una línea suelta quede al principio o al final de la
            // columna. Es el defecto de composición más visible que existe y
            // hasta ahora no hacíamos nada por impedirlo.
            'orphans': '2',
            'widows': '2',
        },
        // Con sangría, el primer párrafo de una sección no se sangra: se sangra
        // para indicar «esto continúa», y después de un título no continúa nada.
        ...(indented ? {
            'h1 + p, h2 + p, h3 + p, h4 + p, h5 + p, h6 + p, hr + p, blockquote + p': {
                'text-indent': '0 !important',
            },
        } : {}),
        'h1, h2, h3, h4, h5, h6': {
            // En claro no se toca: el color de un título de capítulo es una
            // decisión de composición del editor, no un accidente.
            ...(respetarColoresDelLibro ? {} : { 'color': `${theme.text} !important` }),
            'background': 'transparent !important',
            'line-height': '1.25 !important',
            'text-align': 'left !important',
            'margin': '1.2em 0 .6em !important',
        },
        'a, a *': {
            'color': `${theme.link} !important`,
            'text-decoration': 'none',
            'border-bottom': `1px solid ${theme.link}66`,
        },
        // Las imágenes no se recolorean: solo se ajustan a la página.
        'img, svg, image, video': {
            'max-width': '100% !important',
            'max-height': '85vh !important',
            'height': 'auto !important',
            'object-fit': 'contain',
        },
        'pre, code': {
            'white-space': 'pre-wrap !important',
            'overflow-wrap': 'break-word !important',
            'font-size': '.88em !important',
            ...(respetarColoresDelLibro ? {} : { 'color': `${theme.text} !important` }),
        },
        'table': {
            'display': 'block',
            'overflow-x': 'auto',
            'font-size': '.9em !important',
        },
        'blockquote': {
            'margin': '1em 0 !important',
            'padding-left': '1em !important',
            'border-left': `2px solid ${theme.text}40 !important`,
            'font-style': 'italic',
        },
        '::selection': { 'background': 'rgba(56,189,248,.35)' },
        // Lo que está sonando en la lectura en voz alta. Es un resaltado
        // temporal, no un subrayado del usuario: no persiste ni se guarda.
        //
        // Tres selectores para lo mismo porque hay tres formas de pintarlo
        // según lo que soporte el WebView: el rango sin tocar el DOM, la frase
        // envuelta en <mark>, y el párrafo entero como último recurso.
        '::highlight(sr-spoken)': {
            'background-color': 'rgba(56,189,248,.22)',
            'color': `${theme.text}`,
        },
        'mark.sr-speaking-sentence': {
            'background': 'rgba(56,189,248,.22) !important',
            'color': `${theme.text} !important`,
            'border-radius': '3px',
            'padding': '0 1px',
        },
        '.sr-speaking': {
            'background': 'rgba(56,189,248,.16) !important',
            'border-radius': '3px',
            'box-shadow': '0 0 0 4px rgba(56,189,248,.16)',
        },
        // Puntuación colgada. La sangría negativa saca el signo fuera de la
        // caja de texto; `text-indent` sirve porque solo afecta a la primera
        // línea, que es justo donde está el signo. Los anchos salen de medir
        // los propios caracteres: una raya ronda el cuadratín, una comilla
        // latina la mitad.
        //
        // Con sangría de primera línea las dos cosas se suman en el mismo
        // `text-indent`: la clase gana en especificidad y borraría la sangría
        // si se pusiera el valor negativo a secas, y un diálogo aparecería
        // sacado de la caja mientras el resto de párrafos van sangrados.
        ...(base.hangingPunctuation ? {
            '.sr-hang-dash': {
                'text-indent': `${(indented ? 1.4 : 0) - 0.62}em !important`,
            },
            '.sr-hang-quote': {
                'text-indent': `${(indented ? 1.4 : 0) - 0.34}em !important`,
            },
        } : {}),
        // Letra capitular. Solo en el primer párrafo de un capítulo y solo si
        // no es el que sigue a otro texto: una capitular a mitad de página no
        // señala nada y parece un error de composición.
        //
        // Va con `float` y no con `initial-letter` porque este último todavía
        // no funciona en el WebView de Android, y fallaría en silencio dejando
        // una letra normal donde se esperaba el efecto.
        // `.sr-ya-capitular` lo pone el motor cuando el editor ya compuso una
        // capitular en ese capítulo. Ver `dropCap.js`: encima de la del libro, la
        // nuestra daba dos letras grandes seguidas o una letra gigante sobre una
        // ilustración, que es peor que no tener ninguna.
        ...(base.dropCap ? {
            'body:not(.sr-ya-capitular) p:first-of-type::first-letter, body:not(.sr-ya-capitular) h1 + p::first-letter, body:not(.sr-ya-capitular) h2 + p::first-letter': {
                'float': 'left',
                'font-size': '3.1em',
                // El interlineado de la capitular se fija a 1 para que ocupe
                // exactamente tres líneas; con el del cuerpo bailaría según el
                // espaciado que tenga puesto el usuario.
                'line-height': '.86',
                'padding-right': '.06em',
                'padding-top': '.06em',
                'font-weight': '600',
                'color': `${theme.text} !important`,
            },
        } : {}),
    };
};

/** Aplica un preset conservando la fuente y lo que no toca. */
export const applyPreset = (typography, presetId) => {
    const preset = TYPOGRAPHY_PRESETS[presetId];
    if (!preset) return typography;
    return { ...typography, ...preset.values };
};

/** ¿Coincide la configuración actual con algún preset? Para marcarlo activo. */
export const matchingPreset = (typography) =>
    Object.entries(TYPOGRAPHY_PRESETS).find(([, preset]) =>
        Object.entries(preset.values).every(([key, value]) => typography[key] === value)
    )?.[0] || null;
