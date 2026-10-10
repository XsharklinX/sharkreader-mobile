import { describe, it, expect } from 'vitest';
import { nombresEnTexto, analizarLibro, hastaAqui, contarEn, frasesCon } from './personajes.js';

const CAP1 = 'En un lugar de la Mancha vivía un hidalgo. Lo llamaban Alonso Quijano, pero él se hizo llamar Don Quijote. '
    + 'Don Quijote leía libros de caballerías. Su ama y su sobrina temían por él. Quería a Dulcinea del Toboso sin haberla visto. '
    + 'Salió de la Mancha una mañana. Don Quijote cabalgaba sin rumbo.';
const CAP2 = 'Entonces habló con Sancho Panza, un labrador vecino suyo. Sancho aceptó ser escudero de Don Quijote. '
    + 'Sancho llevaba su asno. Partieron hacia Barcelona con prisa, y en Barcelona descansaron. Sancho comía mucho. '
    + 'Desde Barcelona volvieron.';
const CAP3 = 'Mucho después, Sancho lloraba junto a Don Quijote, que murió en su cama. Sancho Panza no lo olvidó.';

describe('nombresEnTexto', () => {
    it('junta nombres de varias palabras y sus conectores', () => {
        const nombres = nombresEnTexto(CAP1).map((n) => n.nombre);
        expect(nombres).toContain('Don Quijote');
        expect(nombres).toContain('Dulcinea del Toboso');
        expect(nombres).toContain('Alonso Quijano');
    });

    it('marca si la palabra empieza frase', () => {
        const [primera] = nombresEnTexto('Mucho después llegó Sancho.');
        expect(primera).toMatchObject({ nombre: 'Mucho', inicio: true });
        expect(nombresEnTexto('Mucho después llegó Sancho.')[1]).toMatchObject({ nombre: 'Sancho', inicio: false });
    });

    it('«Sancho y Quijote» son dos', () => {
        const nombres = nombresEnTexto('Allí estaban Sancho y Quijote.').map((n) => n.nombre);
        expect(nombres).toEqual(['Allí', 'Sancho', 'Quijote']);
    });

    it('un tratamiento suelto no es un nombre', () => {
        expect(nombresEnTexto('Le dijo: — Señor, venga.').map((n) => n.nombre)).not.toContain('Señor');
    });
});

describe('analizarLibro', () => {
    const analisis = analizarLibro([CAP1, CAP2, CAP3], { minimo: 2 });
    const porNombre = Object.fromEntries(analisis.map((d) => [d.nombre, d]));

    it('cuenta los personajes y une las variantes', () => {
        expect(porNombre['Sancho Panza']).toBeDefined();
        expect(porNombre.Sancho).toBeUndefined();
        // Cuatro en el capítulo 2 y dos en el 3, contando los «Sancho» a secas.
        expect(porNombre['Sancho Panza'].total).toBe(6);
        expect(porNombre['Sancho Panza'].primero).toBe(1);
    });

    it('distingue un lugar por lo que va delante', () => {
        expect(porNombre.Barcelona.tipo).toBe('lugar');
        expect(porNombre['Don Quijote'].tipo).toBe('personaje');
    });

    it('una palabra que solo va al principio de frase no es un nombre', () => {
        expect(porNombre.Entonces).toBeUndefined();
        expect(porNombre.Mucho).toBeUndefined();
    });
});

describe('hastaAqui', () => {
    const analisis = analizarLibro([CAP1, CAP2, CAP3], { minimo: 2 });

    it('en el capítulo 1 todavía no existe Sancho', () => {
        const visibles = hastaAqui(analisis, 0, contarEn(CAP1, analisis.map((d) => d.nombre))).map((d) => d.nombre);
        expect(visibles).toContain('Don Quijote');
        expect(visibles).not.toContain('Sancho Panza');
    });

    it('no cuenta lo que hay después de donde vas', () => {
        const [quijote] = hastaAqui(analisis, 1, {}).filter((d) => d.nombre === 'Don Quijote');
        // Capítulo 1 entero (3) y nada del 2, porque no se ha pasado del principio.
        expect(quijote.total).toBe(3);
        expect(quijote.porCapitulo).toHaveLength(2);
    });
});

describe('frasesCon', () => {
    it('trae la primera aparición y las últimas, nunca las de después', () => {
        const frases = frasesCon([CAP1, CAP2], 'Sancho Panza');
        expect(frases[0].frase).toMatch(/^Entonces habló con Sancho Panza/);
        expect(frases.every((f) => !/murió/.test(f.frase))).toBe(true);
    });
});
