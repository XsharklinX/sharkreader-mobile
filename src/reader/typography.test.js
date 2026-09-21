import { describe, it, expect } from 'vitest';
import {
    buildReaderStyles,
    applyPreset,
    matchingPreset,
    clampFontSize,
    clampMargin,
    DEFAULT_TYPOGRAPHY,
    TYPOGRAPHY_PRESETS,
    READER_THEMES,
    FONT_SIZE_MIN,
    FONT_SIZE_MAX,
} from './typography.js';

/**
 * Estos tests fijan las dos reglas que causaron el texto gigante y desbordado
 * en el dispositivo. Ninguna es cosmética: si se rompen, el lector vuelve a ser
 * inusable.
 */

describe('reglas que evitan el desbordamiento', () => {
    const styles = buildReaderStyles(DEFAULT_TYPOGRAPHY, 'dark');

    it('html y body no llevan relleno: rompería el cálculo de columnas de epub.js', () => {
        expect(styles.html.padding).toBe('0 !important');
        expect(styles.html.margin).toBe('0 !important');
        expect(styles.body.padding).toBe('0 !important');
        expect(styles.body.margin).toBe('0 !important');
    });

    it('los márgenes de lectura no se inyectan dentro del iframe', () => {
        const wide = buildReaderStyles({ ...DEFAULT_TYPOGRAPHY, margin: 48 }, 'dark');
        const serialized = JSON.stringify(wide);
        // 48px solo debe aparecer si alguien reintroduce el padding en el body.
        expect(wide.body.padding).toBe('0 !important');
        expect(serialized).not.toContain('0 48px');
    });

    it('desactiva el ajuste automático de tamaño del WebView de Android', () => {
        expect(styles.html['text-size-adjust']).toBe('100% !important');
        expect(styles.html['-webkit-text-size-adjust']).toBe('100% !important');
        expect(styles.body['text-size-adjust']).toBe('100% !important');
    });

    it('nada puede ser más ancho que la columna', () => {
        expect(styles['*']['max-width']).toBe('100% !important');
        expect(styles['img, svg, image, video']['max-width']).toBe('100% !important');
        expect(styles.table['overflow-x']).toBe('auto');
    });
});

describe('tamaño de letra', () => {
    it('el tamaño pedido se aplica al body', () => {
        expect(buildReaderStyles({ fontSize: 22 }, 'dark').body['font-size']).toBe('22px !important');
    });

    it('se limita a un rango legible', () => {
        expect(clampFontSize(4)).toBe(FONT_SIZE_MIN);
        expect(clampFontSize(999)).toBe(FONT_SIZE_MAX);
        expect(clampFontSize(18.4)).toBe(18);
    });

    it('los márgenes también se limitan', () => {
        expect(clampMargin(-10)).toBe(0);
        expect(clampMargin(500)).toBe(48);
    });
});

describe('temas', () => {
    it('cada tema fuerza su fondo y su color de texto', () => {
        Object.entries(READER_THEMES).forEach(([id, theme]) => {
            const styles = buildReaderStyles(DEFAULT_TYPOGRAPHY, id);
            expect(styles.body.background).toBe(`${theme.bg} !important`);
            expect(styles.body.color).toBe(`${theme.text} !important`);
        });
    });

    const SELECTOR_TEXTO = 'p, div, span, li, td, th, blockquote, section, article, figure';

    it('en un tema claro respeta los colores que trae el libro', () => {
        // Un EPUB se compone para papel: sus colores están elegidos contra fondo
        // claro. Pisarlos borraba las versalitas y los títulos que compuso la
        // editorial — comparado con Moon+, ahí se ven en granate y aquí salían
        // todos del mismo gris.
        const styles = buildReaderStyles(DEFAULT_TYPOGRAPHY, 'sepia');
        const forced = styles[SELECTOR_TEXTO];
        expect(forced.color).toBeUndefined();
        expect(styles['h1, h2, h3, h4, h5, h6'].color).toBeUndefined();
    });

    it('en un tema oscuro sí los impone', () => {
        // Ahí esos mismos colores son una trampa: un rojo oscuro sobre negro no
        // se lee, y un libro con `color: #000` fijo desaparece.
        const styles = buildReaderStyles(DEFAULT_TYPOGRAPHY, 'dark');
        const forced = styles[SELECTOR_TEXTO];
        expect(forced.color).toBe(`${READER_THEMES.dark.text} !important`);
    });

    it('el fondo del libro se neutraliza en los dos casos', () => {
        // Un recuadro blanco puro sobre papel crema se ve como un parche, y es lo
        // único que rompe la textura de la hoja.
        ['sepia', 'dark'].forEach((tema) => {
            const forced = buildReaderStyles(DEFAULT_TYPOGRAPHY, tema)[SELECTOR_TEXTO];
            expect(forced['background-color'], tema).toBe('transparent !important');
        });
    });

    it('un tema desconocido cae al oscuro en vez de romper', () => {
        expect(() => buildReaderStyles(DEFAULT_TYPOGRAPHY, 'inventado')).not.toThrow();
    });

    it('todos los temas declaran si su interfaz es clara u oscura', () => {
        Object.values(READER_THEMES).forEach((theme) => {
            expect(['light', 'dark']).toContain(theme.ui);
        });
    });
});

describe('presets', () => {
    it('aplicar un preset cambia sus valores y conserva la fuente', () => {
        const current = { ...DEFAULT_TYPOGRAPHY, fontFamily: 'mono' };
        const next = applyPreset(current, 'accessible');
        expect(next.fontSize).toBe(TYPOGRAPHY_PRESETS.accessible.values.fontSize);
        expect(next.fontFamily).toBe('mono');
    });

    it('un preset desconocido no cambia nada', () => {
        expect(applyPreset(DEFAULT_TYPOGRAPHY, 'inventado')).toBe(DEFAULT_TYPOGRAPHY);
    });

    it('reconoce el preset activo para poder marcarlo', () => {
        const focus = applyPreset(DEFAULT_TYPOGRAPHY, 'focus');
        expect(matchingPreset(focus)).toBe('focus');
    });

    it('un ajuste manual deja de coincidir con el preset', () => {
        const tweaked = { ...applyPreset(DEFAULT_TYPOGRAPHY, 'focus'), fontSize: 15 };
        expect(matchingPreset(tweaked)).toBeNull();
    });
});
