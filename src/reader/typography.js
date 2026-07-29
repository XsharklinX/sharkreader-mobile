/**
 * Tipografía del lector EPUB.
 *
 * epub.js renderiza cada capítulo dentro de un iframe, así que los ajustes del
 * usuario hay que inyectarlos como CSS dentro de ese iframe — el CSS de la app
 * no lo alcanza.
 *
 * El modo oscuro es el caso difícil: muchos EPUB traen `color` y
 * `background-color` incrustados en su propio CSS o en atributos en línea. Por
 * eso las reglas de tema usan `!important` y apuntan también a los elementos
 * concretos, igual que hace la versión de escritorio. Sin eso, un libro con
 * fondo blanco fijo sigue saliendo blanco en modo oscuro.
 */

export const DEFAULT_TYPOGRAPHY = {
    fontFamily: 'serif',
    fontSize: 18,
    lineHeight: 1.6,
    margin: 20,
    letterSpacing: 0,
    paragraphSpacing: 0.6,
    justify: true,
    hyphens: true,
};

export const FONT_FAMILIES = [
    { id: 'serif', label: 'Serif', stack: 'Georgia, "Times New Roman", serif' },
    { id: 'sans', label: 'Sans', stack: '"Segoe UI", Roboto, system-ui, sans-serif' },
    { id: 'mono', label: 'Mono', stack: '"Roboto Mono", ui-monospace, monospace' },
    { id: 'dyslexic', label: 'Dislexia', stack: '"OpenDyslexic", Verdana, sans-serif' },
];

/** Presets de un toque, los mismos cuatro que en escritorio. */
export const TYPOGRAPHY_PRESETS = {
    balanced: {
        label: 'Equilibrado',
        values: { fontSize: 18, lineHeight: 1.6, margin: 20, letterSpacing: 0, paragraphSpacing: 0.6, justify: true },
    },
    focus: {
        label: 'Enfoque',
        values: { fontSize: 20, lineHeight: 1.9, margin: 30, letterSpacing: 0.2, paragraphSpacing: 1, justify: false },
    },
    compact: {
        label: 'Compacto',
        values: { fontSize: 16, lineHeight: 1.4, margin: 12, letterSpacing: 0, paragraphSpacing: 0.3, justify: true },
    },
    accessible: {
        label: 'Accesible',
        values: { fontSize: 24, lineHeight: 2, margin: 24, letterSpacing: 0.6, paragraphSpacing: 1.2, justify: false },
    },
};

export const READER_THEMES = {
    dark:  { label: 'Oscuro', bg: '#0f172a', text: '#d7e3ec', link: '#38bdf8' },
    light: { label: 'Claro',  bg: '#ffffff', text: '#111827', link: '#0369a1' },
    sepia: { label: 'Sepia',  bg: '#f4ecd8', text: '#3b2f1e', link: '#8b5a2b' },
    black: { label: 'Negro',  bg: '#000000', text: '#c9c9c9', link: '#57b6e8' },
};

const fontStack = (id) =>
    FONT_FAMILIES.find((font) => font.id === id)?.stack || FONT_FAMILIES[0].stack;

/**
 * Construye el objeto de estilos que epub.js inyecta en el iframe.
 * @param {typeof DEFAULT_TYPOGRAPHY} typography
 * @param {keyof typeof READER_THEMES} themeId
 */
export const buildReaderStyles = (typography, themeId) => {
    const settings = { ...DEFAULT_TYPOGRAPHY, ...typography };
    const theme = READER_THEMES[themeId] || READER_THEMES.dark;

    // Neutralizar los colores del libro: se aplica a todo, incluidos los
    // elementos que traen color en un atributo `style` en línea.
    const forceColors = {
        'color': `${theme.text} !important`,
        'background-color': 'transparent !important',
        'background-image': 'none !important',
    };

    return {
        'html, body': {
            'background': `${theme.bg} !important`,
            'color': `${theme.text} !important`,
            'font-family': `${fontStack(settings.fontFamily)} !important`,
            'font-size': `${settings.fontSize}px !important`,
            'line-height': `${settings.lineHeight} !important`,
            'letter-spacing': `${settings.letterSpacing}px !important`,
            'padding': `0 ${settings.margin}px !important`,
            'text-align': settings.justify ? 'justify !important' : 'left !important',
            '-webkit-hyphens': settings.hyphens ? 'auto' : 'manual',
            'hyphens': settings.hyphens ? 'auto' : 'manual',
            // Sin esto, un toque largo en Android abre el menú de selección del
            // sistema antes de que la app pueda ofrecer subrayar.
            '-webkit-tap-highlight-color': 'transparent',
        },
        'p, div, span, li, td, th, blockquote, section, article': forceColors,
        'p': {
            'margin': `0 0 ${settings.paragraphSpacing}em 0 !important`,
            'text-indent': '0 !important',
        },
        'h1, h2, h3, h4, h5, h6': {
            'color': `${theme.text} !important`,
            'background': 'transparent !important',
            'line-height': '1.25 !important',
            'text-align': 'left !important',
        },
        'a, a *': {
            'color': `${theme.link} !important`,
            'text-decoration': 'underline',
        },
        // Las imágenes no se recolorean, solo se ajustan al ancho de página.
        'img, svg, image': {
            'max-width': '100% !important',
            'height': 'auto !important',
        },
        'pre, code': {
            'white-space': 'pre-wrap !important',
            'word-break': 'break-word !important',
            'color': `${theme.text} !important`,
        },
        'table': {
            'max-width': '100% !important',
            'display': 'block',
            'overflow-x': 'auto',
        },
        '::selection': {
            'background': 'rgba(56,189,248,0.35)',
        },
    };
};

/** Aplica un preset conservando la fuente y las opciones que no toca. */
export const applyPreset = (typography, presetId) => {
    const preset = TYPOGRAPHY_PRESETS[presetId];
    if (!preset) return typography;
    return { ...typography, ...preset.values };
};
