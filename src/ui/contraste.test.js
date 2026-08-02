import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Contraste de los colores declarados en los tokens.
 *
 * ## Por qué esto es una prueba y no una revisión a ojo
 *
 * Los cinco tonos del menú lateral estaban escritos para el tema oscuro y sobre
 * blanco caían a 1,4:1 — el ámbar era prácticamente invisible—. No se vio en
 * ninguna captura porque *se leía algo*, y «se lee algo» es justo el punto donde
 * el ojo deja de avisar y el número no.
 *
 * El mínimo para un elemento gráfico es 3:1 (WCAG 1.4.11). Aquí se exige 3:1 y se
 * comprueban los dos temas, porque el fallo apareció al añadir el claro.
 */

const css = readFileSync('src/styles/tokens.css', 'utf8');

/** Lee un token de dentro de un bloque concreto. */
const token = (bloque, nombre) => {
    const desde = css.indexOf(bloque);
    if (desde === -1) throw new Error(`No existe el bloque ${bloque}`);
    const hasta = css.indexOf('}', desde);
    const trozo = css.slice(desde, hasta);
    const match = new RegExp(`${nombre}:\\s*([^;]+);`).exec(trozo);
    if (!match) throw new Error(`No existe ${nombre} en ${bloque}`);
    return match[1].trim();
};

const canal = (valor) => {
    const c = valor / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminancia = ([r, g, b]) => 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);

const leerColor = (valor) => {
    const hex = /^#([0-9a-f]{6})$/i.exec(valor);
    if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));

    const rgba = /rgba?\(([^)]+)\)/.exec(valor);
    if (rgba) {
        const partes = rgba[1].split(',').map((p) => Number(p.trim()));
        return partes.slice(0, 3).concat(partes[3] ?? 1);
    }
    throw new Error(`Color no reconocido: ${valor}`);
};

/** Un color translúcido sobre un fondo opaco da un color opaco. */
const sobre = (color, fondo) => {
    const alfa = color[3] ?? 1;
    return color.slice(0, 3).map((c, i) => Math.round(c * alfa + fondo[i] * (1 - alfa)));
};

const contraste = (a, b) => {
    const [alto, bajo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
    return (alto + 0.05) / (bajo + 0.05);
};

const TONOS = ['sky', 'amber', 'blue', 'green', 'pink'];

const TEMAS = [
    { nombre: 'oscuro', bloque: ':root {', superficie: '--sf-1' },
    { nombre: 'claro', bloque: ':root.theme-light {', superficie: '--sf-1' },
];

describe('contraste de los tonos del menú lateral', () => {
    TEMAS.forEach(({ nombre, bloque, superficie }) => {
        TONOS.forEach((tono) => {
            it(`${tono} sobre su pastilla, en tema ${nombre}`, () => {
                const fondoPanel = leerColor(token(bloque, superficie));
                const pastilla = sobre(leerColor(token(bloque, `--tone-${tono}-bg`)), fondoPanel);
                const icono = leerColor(token(bloque, `--tone-${tono}`));

                expect(contraste(icono, pastilla)).toBeGreaterThanOrEqual(3);
            });
        });
    });
});

describe('contraste del texto', () => {
    TEMAS.forEach(({ nombre, bloque }) => {
        it(`el texto principal sobre el fondo, en tema ${nombre}`, () => {
            const fondo = leerColor(token(bloque, '--bg'));
            const texto = leerColor(token(bloque, '--text'));
            // 4,5:1 es el mínimo para texto normal.
            expect(contraste(texto, fondo)).toBeGreaterThanOrEqual(4.5);
        });

        it(`el texto secundario sobre la superficie, en tema ${nombre}`, () => {
            const fondo = leerColor(token(bloque, '--sf-1'));
            const texto = leerColor(token(bloque, '--text-2'));
            expect(contraste(texto, fondo)).toBeGreaterThanOrEqual(4.5);
        });

        it(`el acento como texto sobre la superficie, en tema ${nombre}`, () => {
            // Es la razón por la que el acento en claro es #0369A1 y no #0EA5E9:
            // se usa como color de texto en etiquetas y porcentajes.
            const fondo = leerColor(token(bloque, '--sf-1'));
            const acento = leerColor(token(bloque, '--accent'));
            expect(contraste(acento, fondo)).toBeGreaterThanOrEqual(4.5);
        });
    });
});
