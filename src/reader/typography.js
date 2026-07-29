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
    fontFamily: 'serif',
    fontSize: 18,
    lineHeight: 1.6,
    margin: 20,
    letterSpacing: 0,
    paragraphSpacing: 0.7,
    justify: false,
    hyphens: true,
};

export const FONT_FAMILIES = [
    { id: 'serif', label: 'Serif', stack: 'Georgia, "Noto Serif", serif' },
    { id: 'sans', label: 'Sans', stack: 'Roboto, "Segoe UI", system-ui, sans-serif' },
    { id: 'slab', label: 'Slab', stack: '"Roboto Slab", Rockwell, Georgia, serif' },
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
    const settings = { ...DEFAULT_TYPOGRAPHY, ...typography };
    const theme = READER_THEMES[themeId] || READER_THEMES.dark;

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
            'font-family': `${fontStack(settings.fontFamily)} !important`,
            'font-size': `${settings.fontSize}px !important`,
            'line-height': `${settings.lineHeight} !important`,
            'letter-spacing': `${settings.letterSpacing}px !important`,
            'text-align': settings.justify ? 'justify !important' : 'left !important',
            '-webkit-hyphens': settings.hyphens ? 'auto' : 'manual',
            'hyphens': settings.hyphens ? 'auto' : 'manual',
            '-webkit-text-size-adjust': '100% !important',
            'text-size-adjust': '100% !important',
            '-webkit-tap-highlight-color': 'transparent',
        },
        // Nada puede ser más ancho que la columna. Es la otra mitad del arreglo
        // del desbordamiento: una tabla o una imagen grande empujaba el texto.
        '*': {
            'max-width': '100% !important',
            'box-sizing': 'border-box !important',
        },
        'p, div, span, li, td, th, blockquote, section, article, figure': forceColors,
        'p': {
            'margin': `0 0 ${settings.paragraphSpacing}em 0 !important`,
            'text-indent': '0 !important',
            'overflow-wrap': 'break-word',
            'word-wrap': 'break-word',
        },
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
        // Párrafo que está sonando en la lectura en voz alta. Es un resaltado
        // temporal, no un subrayado del usuario: no persiste ni se guarda.
        '.sr-speaking': {
            'background': 'rgba(56,189,248,.16) !important',
            'border-radius': '3px',
            'box-shadow': '0 0 0 4px rgba(56,189,248,.16)',
        },
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
