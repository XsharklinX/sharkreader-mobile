/**
 * Fuentes empaquetadas dentro del iframe del libro.
 *
 * Este es el problema que no es obvio: epub.js renderiza cada capítulo en un
 * iframe con su propio documento, y **las `@font-face` de la app no llegan
 * ahí**. Declarar Literata en el CSS de la aplicación no hace absolutamente
 * nada para el texto del libro.
 *
 * Tampoco basta con inyectar la regla `@font-face` con una ruta relativa: el
 * documento del iframe tiene otra base, así que la ruta no resuelve. Hay que
 * pasar la fuente ya cargada.
 *
 * La solución: se leen los ficheros una sola vez, se convierten a data URI y se
 * inyecta esa hoja completa dentro de cada capítulo que epub.js monte. Es un
 * coste de memoria asumible —423 KB en total, compartidos— a cambio de que el
 * libro se componga con la fuente correcta.
 */

// Vite resuelve estas rutas a URLs del bundle en tiempo de compilación.
const FONT_MODULES = import.meta.glob('../fonts/*.woff2', {
    query: '?url',
    import: 'default',
    eager: true,
});

/** Familias que se ofrecen al usuario, con el prefijo de fichero que las produce. */
export const BUNDLED_FAMILIES = [
    { id: 'literata', family: 'Literata', prefix: 'literata' },
    { id: 'source-serif', family: 'Source Serif 4', prefix: 'source-serif' },
    { id: 'atkinson', family: 'Atkinson Hyperlegible', prefix: 'atkinson' },
];

let cachedCss = null;

const toDataUri = async (url) => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
};

/**
 * Construye la hoja de estilos con las fuentes ya incrustadas.
 *
 * Se calcula una sola vez por sesión: convertir 423 KB a base64 en cada
 * capítulo sería un desperdicio notable en gama baja.
 */
export const buildFontFaceCss = async () => {
    if (cachedCss) return cachedCss;

    const declarations = [];

    for (const family of BUNDLED_FAMILIES) {
        const entries = Object.entries(FONT_MODULES)
            .filter(([path]) => path.includes(`/${family.prefix}-`));

        for (const [, url] of entries) {
            try {
                const dataUri = await toDataUri(url);
                declarations.push(
                    `@font-face{font-family:'${family.family}';`
                    + `font-style:normal;font-weight:400 700;font-display:swap;`
                    + `src:url(${dataUri}) format('woff2');}`
                );
            } catch {
                // Una fuente que no carga no debe impedir abrir el libro: el
                // lector cae a la familia del sistema.
            }
        }
    }

    cachedCss = declarations.join('\n');
    return cachedCss;
};

/** ¿Está esta familia empaquetada con la app? */
export const isBundled = (id) => BUNDLED_FAMILIES.some((family) => family.id === id);
