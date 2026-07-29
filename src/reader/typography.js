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

export const DEFAULT_TYPOGRAPHY = {
    fontFamily: 'literata',
    fontSize: 18,
    lineHeight: 1.6,
    margin: 20,
    letterSpacing: 0,
    paragraphSpacing: 0.7,
    // 'space' separa párrafos con aire; 'indent' los pega y sangra la primera
    // línea, que es como está compuesto cualquier libro en papel.
    paragraphStyle: 'space',
    // Idioma para la partición de palabras. 'auto' usa el que declare el EPUB,
    // que muchos declaran mal o no declaran.
    hyphenLang: 'auto',
    justify: false,
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
    balanced: {
        label: 'Equilibrado',
        values: { fontSize: 18, lineHeight: 1.6, margin: 20, letterSpacing: 0, paragraphSpacing: 0.7, justify: false },
    },
    focus: {
        label: 'Enfoque',
        values: { fontSize: 20, lineHeight: 1.9, margin: 32, letterSpacing: 0.2, paragraphSpacing: 1, justify: false },
    },
    compact: {
        label: 'Compacto',
        values: { fontSize: 16, lineHeight: 1.45, margin: 14, letterSpacing: 0, paragraphSpacing: 0.4, justify: true },
    },
    accessible: {
        label: 'Accesible',
        values: { fontSize: 23, lineHeight: 2, margin: 20, letterSpacing: 0.5, paragraphSpacing: 1.2, justify: false },
    },
};

export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 32;
export const MARGIN_MIN = 0;
export const MARGIN_MAX = 48;

export const READER_THEMES = {
    dark:  { label: 'Oscuro', bg: '#12171D', text: '#C9D3DB', link: '#6BB8E8', ui: 'dark' },
    black: { label: 'Negro',  bg: '#000000', text: '#B4B4B4', link: '#5AA9DB', ui: 'dark' },
    sepia: { label: 'Sepia',  bg: '#F3E9D6', text: '#4A3A26', link: '#8A5A20', ui: 'light' },
    cream: { label: 'Crema',  bg: '#FBF7F0', text: '#2E2A24', link: '#7A5416', ui: 'light' },
    paper: { label: 'Papel',  bg: '#FFFFFF', text: '#1A1A1A', link: '#1064A8', ui: 'light' },
    night: { label: 'Noche',  bg: '#0F1B2A', text: '#A9BCCB', link: '#5FA8D8', ui: 'dark' },
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

    // Muchos EPUB traen color y fondo incrustados en su CSS o en atributos en
    // línea. Sin `!important` sobre los elementos concretos, un libro con fondo
    // blanco fijo sigue saliendo blanco en modo oscuro.
    const forceColors = {
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
            // En tinta electrónica el trazo fino se pierde: la tinta se expande
            // al asentarse y un peso normal sale lavado.
            ...(base.eink ? { 'font-weight': `${EINK_OVERRIDES.fontWeight} !important` } : {}),
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
            'color': `${theme.text} !important`,
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
            'color': `${theme.text} !important`,
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
        ...(base.dropCap ? {
            'p:first-of-type::first-letter, h1 + p::first-letter, h2 + p::first-letter': {
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
