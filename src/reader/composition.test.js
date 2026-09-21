import { describe, it, expect } from 'vitest';
import { buildReaderStyles, DEFAULT_TYPOGRAPHY, FONT_FAMILIES } from './typography.js';

/**
 * Fase A: la página bien compuesta. Estos tests fijan las decisiones de
 * composición, que son invisibles en el código pero se ven en cada línea.
 */

describe('familias empaquetadas', () => {
    it('la fuente por defecto es una que viaja en el APK', () => {
        const family = FONT_FAMILIES.find((f) => f.id === DEFAULT_TYPOGRAPHY.fontFamily);
        expect(family?.bundled).toBe(true);
    });

    it('hay tres familias empaquetadas y las del sistema siguen disponibles', () => {
        expect(FONT_FAMILIES.filter((f) => f.bundled)).toHaveLength(3);
        expect(FONT_FAMILIES.some((f) => !f.bundled)).toBe(true);
    });

    it('cada familia declara respaldo del sistema por si la fuente no carga', () => {
        FONT_FAMILIES.forEach((family) => {
            expect(family.stack.split(',').length, family.id).toBeGreaterThan(1);
        });
    });
});

describe('modo dislexia', () => {
    it('usa Atkinson, que sí está empaquetada', () => {
        const styles = buildReaderStyles({ ...DEFAULT_TYPOGRAPHY, dyslexia: true }, 'dark');
        expect(styles.body['font-family']).toContain('Atkinson Hyperlegible');
    });

    it('ya no depende de OpenDyslexic, que casi nadie tiene instalada', () => {
        const styles = buildReaderStyles({ ...DEFAULT_TYPOGRAPHY, dyslexia: true }, 'dark');
        expect(styles.body['font-family']).not.toContain('OpenDyslexic');
    });

    it('sigue aplicando el aire entre letras y palabras', () => {
        const styles = buildReaderStyles({ ...DEFAULT_TYPOGRAPHY, dyslexia: true }, 'dark');
        expect(parseFloat(styles.body['letter-spacing'])).toBeGreaterThanOrEqual(1.2);
        expect(styles.body['word-spacing']).toContain('0.16em');
    });

    it('nunca justifica ni parte palabras en modo dislexia', () => {
        const styles = buildReaderStyles(
            { ...DEFAULT_TYPOGRAPHY, dyslexia: true, justify: true, hyphens: true },
            'dark'
        );
        expect(styles.body['text-align']).toContain('left');
        expect(styles.body.hyphens).toBe('manual');
    });
});

describe('párrafos: sangría o espacio, nunca los dos', () => {
    it('por defecto sangra y pega los párrafos, como un libro', () => {
        // Medido contra Moon+ en el mismo teléfono: con aire entre párrafos se
        // enseñaba un 40 % menos de texto por pantalla.
        const styles = buildReaderStyles(DEFAULT_TYPOGRAPHY, 'dark');
        expect(styles.p['text-indent']).toContain('1.4em');
        expect(styles.p.margin).toBe('0 !important');
    });

    it('con espacio, ni sangra ni pega', () => {
        // El modo sigue existiendo para quien lo prefiera; lo que cambió es cuál
        // es el punto de partida.
        const styles = buildReaderStyles({ ...DEFAULT_TYPOGRAPHY, paragraphStyle: 'space' }, 'dark');
        expect(styles.p['text-indent']).toBe('0 !important');
        expect(styles.p.margin).toContain('em');
    });

    it('con sangría, los párrafos van pegados', () => {
        const styles = buildReaderStyles({ ...DEFAULT_TYPOGRAPHY, paragraphStyle: 'indent' }, 'dark');
        expect(styles.p['text-indent']).toContain('1.4em');
        expect(styles.p.margin).toBe('0 !important');
    });

    it('el primer párrafo tras un título no se sangra', () => {
        // Se sangra para decir «esto continúa», y después de un título no
        // continúa nada.
        const styles = buildReaderStyles({ ...DEFAULT_TYPOGRAPHY, paragraphStyle: 'indent' }, 'dark');
        const rule = styles['h1 + p, h2 + p, h3 + p, h4 + p, h5 + p, h6 + p, hr + p, blockquote + p'];
        expect(rule['text-indent']).toBe('0 !important');
    });

    it('sin sangría no se genera esa regla, para no ensuciar la hoja', () => {
        const styles = buildReaderStyles({ ...DEFAULT_TYPOGRAPHY, paragraphStyle: 'space' }, 'dark');
        expect(styles['h1 + p, h2 + p, h3 + p, h4 + p, h5 + p, h6 + p, hr + p, blockquote + p']).toBeUndefined();
    });
});

describe('líneas viudas y huérfanas', () => {
    it('se piden dos líneas mínimas a cada lado del salto', () => {
        const styles = buildReaderStyles(DEFAULT_TYPOGRAPHY, 'dark');
        expect(styles.p.orphans).toBe('2');
        expect(styles.p.widows).toBe('2');
    });
});

describe('reglas que no se pueden romper', () => {
    it('el arreglo del texto gigante sigue en pie tras los cambios de Fase A', () => {
        const styles = buildReaderStyles({ ...DEFAULT_TYPOGRAPHY, paragraphStyle: 'indent' }, 'sepia');
        expect(styles.html.padding).toBe('0 !important');
        expect(styles.body.padding).toBe('0 !important');
        expect(styles.body['text-size-adjust']).toBe('100% !important');
    });
});
