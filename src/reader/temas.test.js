import { describe, it, expect } from 'vitest';
import { READER_THEMES, DEFAULT_TYPOGRAPHY, TYPOGRAPHY_PRESETS, migrarComposicion } from './typography.js';

/**
 * Los temas de lectura, medidos.
 *
 * Es texto que alguien va a mirar durante horas seguidas, así que el contraste no
 * puede quedar «a ojo». El mínimo para texto normal es 4,5:1; aquí se exige mucho
 * más porque un tema de lectura que se queda en el mínimo legal cansa.
 */

const canal = (valor) => {
    const c = valor / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminancia = (hex) => {
    const limpio = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(limpio.slice(i, i + 2), 16));
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
};

const contraste = (a, b) => {
    const [alto, bajo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
    return (alto + 0.05) / (bajo + 0.05);
};

describe('contraste de los temas de lectura', () => {
    Object.entries(READER_THEMES).forEach(([id, tema]) => {
        it(`${id}: el texto sobre su fondo`, () => {
            // 10:1 y no 4,5: el mínimo legal vale para una etiqueta de interfaz,
            // no para una novela de cuatrocientas páginas.
            expect(contraste(tema.text, tema.bg)).toBeGreaterThanOrEqual(10);
        });

        it(`${id}: los enlaces se distinguen del texto y se leen sobre el fondo`, () => {
            // Un enlace que no se distingue del texto no es un enlace; uno que no
            // se lee sobre el fondo es una trampa.
            expect(contraste(tema.link, tema.bg)).toBeGreaterThanOrEqual(3);
        });
    });

    it('e-ink es el de más contraste de todos', () => {
        // En un panel reflectante el contraste real ya es bajo de por sí, así que
        // cualquier gris que en un móvil se agradece allí se vuelve ilegible.
        const eink = contraste(READER_THEMES.eink.text, READER_THEMES.eink.bg);
        Object.entries(READER_THEMES)
            .filter(([id]) => id !== 'eink')
            .forEach(([id, tema]) => {
                expect(eink, id).toBeGreaterThanOrEqual(contraste(tema.text, tema.bg));
            });
    });
});

describe('el grano', () => {
    it('solo lo llevan los temas claros', () => {
        // Sobre negro, el grano no se lee como fibra de papel: se lee como ruido
        // de sensor. La única excepción es «noche cálida», que es un papel oscuro
        // y no una pantalla apagada.
        Object.entries(READER_THEMES)
            .filter(([, tema]) => tema.grain)
            .forEach(([id, tema]) => {
                expect(tema.ui === 'light' || id === 'warmnight', id).toBe(true);
            });
    });

    it('e-ink nunca lleva grano', () => {
        // El panel tendría que refrescar el ruido partícula a partícula.
        expect(READER_THEMES.eink.grain).toBeFalsy();
    });
});

describe('los valores de partida componen como un libro', () => {
    it('sangra la primera línea en vez de separar con aire', () => {
        // Medido contra Moon+ en el mismo teléfono: con aire entre párrafos se
        // enseñaba un 40 % menos de texto por pantalla.
        expect(DEFAULT_TYPOGRAPHY.paragraphStyle).toBe('indent');
    });

    it('el interlineado es de libro, no de web', () => {
        expect(DEFAULT_TYPOGRAPHY.lineHeight).toBeLessThanOrEqual(1.45);
    });

    it('justifica, y por eso necesita partir palabras', () => {
        // Los dos van juntos: justificar sin guionado abre ríos de espacio.
        expect(DEFAULT_TYPOGRAPHY.justify).toBe(true);
        expect(DEFAULT_TYPOGRAPHY.hyphens).toBe(true);
    });

    it('el preset «Libro» es el primero de la lista', () => {
        // Es el que se quiere casi siempre, así que es el primero que se toca.
        expect(Object.keys(TYPOGRAPHY_PRESETS)[0]).toBe('book');
    });

    it('cada preset dice cómo separa los párrafos', () => {
        // Sin esto, cambiar de preset dejaba puesta la sangría del anterior y
        // salía la mezcla de sangría y aire, que es el error más común.
        Object.entries(TYPOGRAPHY_PRESETS).forEach(([id, preset]) => {
            expect(preset.values.paragraphStyle, id).toBeTruthy();
        });
    });

    it('el preset «Libro» coincide con los valores de partida', () => {
        // Si no coincidieran, tocar el preset que ya está puesto cambiaría la
        // página — y eso hace dudar de cuál está activo.
        const libro = TYPOGRAPHY_PRESETS.book.values;
        expect(libro.lineHeight).toBe(DEFAULT_TYPOGRAPHY.lineHeight);
        expect(libro.margin).toBe(DEFAULT_TYPOGRAPHY.margin);
        expect(libro.paragraphStyle).toBe(DEFAULT_TYPOGRAPHY.paragraphStyle);
        expect(libro.justify).toBe(DEFAULT_TYPOGRAPHY.justify);
    });
});

describe('migrarComposicion', () => {
    const ANTIGUA = { lineHeight: 1.6, margin: 20, paragraphStyle: 'space', justify: false };

    it('trae la composición nueva a quien nunca la tocó', () => {
        // Los ajustes se guardan por libro, así que cambiar los valores de
        // partida solo arregla los libros nuevos. Con 136 empezados, eso es no
        // arreglar nada.
        const migrada = migrarComposicion({ ...ANTIGUA, fontSize: 18 });
        expect(migrada.paragraphStyle).toBe('indent');
        expect(migrada.lineHeight).toBe(DEFAULT_TYPOGRAPHY.lineHeight);
        expect(migrada.justify).toBe(true);
    });

    it('conserva lo que no es composición', () => {
        const migrada = migrarComposicion({ ...ANTIGUA, fontFamily: 'atkinson', dyslexia: true });
        expect(migrada.fontFamily).toBe('atkinson');
        expect(migrada.dyslexia).toBe(true);
    });

    it('si cambió aunque sea un valor, no se toca nada', () => {
        // Quien ajusta el interlineado a mano no quiere que se lo muevan.
        const suyo = { ...ANTIGUA, lineHeight: 1.9 };
        expect(migrarComposicion(suyo)).toEqual(suyo);

        const otro = { ...ANTIGUA, justify: true };
        expect(migrarComposicion(otro)).toEqual(otro);
    });

    it('sin nada guardado no inventa un objeto', () => {
        // Los valores de partida ya son los nuevos: no hay nada que migrar.
        expect(migrarComposicion(undefined)).toBeUndefined();
        expect(migrarComposicion(null)).toBeNull();
    });

    it('migrar dos veces da lo mismo que migrar una', () => {
        const una = migrarComposicion({ ...ANTIGUA });
        expect(migrarComposicion(una)).toEqual(una);
    });
});
