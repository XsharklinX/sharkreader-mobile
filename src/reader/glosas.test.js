/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { palabrasDificiles, cargarConocidas, limiteDe } from './glosas.js';
import { rangosDe, pintarCapa, quitarCapa, glosaCorta, ID_CAPA } from './glosasCapa.js';

const conocidas = new Set(['the', 'was', 'in', 'of', 'heirs', 'male', 'on', 'distant', 'relation', 'and', 'their', 'mother', 'fortune', 'though', 'for', 'her', 'situation', 'life']);
const TEXTO = 'The estate was entailed, in default of heirs male, on a distant relation; and their mother\'s fortune, though ample for her situation in life.';

describe('palabrasDificiles', () => {
    it('elige las que no están entre las conocidas', () => {
        // «entailed» y «default» caen demasiado cerca de «estate»: se salta.
        expect(palabrasDificiles(TEXTO, conocidas)).toEqual(['estate', 'ample']);
    });

    it('deja aire entre una glosa y la siguiente', () => {
        const elegidas = palabrasDificiles(TEXTO, conocidas);
        expect(elegidas).not.toContain('entailed');
    });

    it('una palabra ya glosada en el capítulo no se repite', () => {
        const ya = new Set(['estate']);
        expect(palabrasDificiles(TEXTO, conocidas, ya)).not.toContain('estate');
    });

    it('no toca nombres propios', () => {
        expect(palabrasDificiles('They met Darcy yesterday morning.', new Set(['they', 'met', 'yesterday', 'morning']))).toEqual([]);
    });
});

describe('la capa de glosas', () => {
    it('encuentra cada palabra sin tocar el texto del libro', () => {
        document.body.innerHTML = '<p id="p">The estate was <em>entailed</em> on him.</p>';
        const p = document.getElementById('p');
        const antes = p.innerHTML;
        const rangos = rangosDe(document, new Map([[p, ['estate', 'entailed']]]));
        expect(rangos.map((r) => r.range.toString())).toEqual(['estate', 'entailed']);
        // Las posiciones del libro cuentan nodos: el capítulo no puede cambiar.
        expect(p.innerHTML).toBe(antes);
    });

    it('la capa cuelga de <html>, fuera del cuerpo del libro, y se quita sin rastro', () => {
        document.body.innerHTML = '<p id="p">The estate.</p>';
        const p = document.getElementById('p');
        const rangos = rangosDe(document, new Map([[p, ['estate']]]));
        // jsdom no maqueta: sin medidas no se pinta ninguna, pero la capa existe.
        pintarCapa(document, rangos, new Map([['estate', 'finca']]));
        const capa = document.getElementById(ID_CAPA);
        expect(capa.parentElement).toBe(document.documentElement);
        expect(document.body.contains(capa)).toBe(false);

        quitarCapa(document);
        expect(document.getElementById(ID_CAPA)).toBeNull();
        expect(document.documentElement.classList.length).toBe(0);
    });

    it('una glosa larga se recorta a dos palabras', () => {
        expect(glosaCorta('vinculada por ley a sus herederos.')).toBe('vinculada por');
    });
});

describe('listas de frecuencia', () => {
    it('cada nivel conoce más o menos palabras', async () => {
        const b1 = await cargarConocidas('en', 'b1');
        const c1 = await cargarConocidas('en', 'c1');
        expect(b1.size).toBe(limiteDe('b1'));
        expect(c1.size).toBe(limiteDe('c1'));
        expect(b1.has('the')).toBe(true);
    });

    it('sin lista para el idioma no hay glosas', async () => {
        expect(await cargarConocidas('ja', 'b1')).toBeNull();
    });
});
