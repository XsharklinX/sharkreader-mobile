import { describe, it, expect } from 'vitest';
import { frasesDe, frasesClave, recortarParaResumen, vinetasDe } from './resumen.js';

const CAPITULO = `Ismael llega a New Bedford en pleno invierno buscando un barco ballenero que lo lleve al mar.
Hace frío y no tiene casi dinero. La posada del Chorro de la Ballena es la única que puede pagar.
—¿Una cama? —preguntó.
El posadero le dice que tendrá que compartir la cama con un arponero llamado Queequeg.
Ismael tiene miedo de Queequeg al principio, pero acaba descubriendo que el arponero es un buen hombre.
Por la mañana los dos amigos desayunan juntos y Queequeg le enseña su arpón.
Llovía.`;

describe('frasesDe', () => {
    it('parte en frases y descarta las que no dicen nada', () => {
        const frases = frasesDe(CAPITULO);
        expect(frases.some((f) => f === 'Llovía.')).toBe(false);
        expect(frases[0]).toMatch(/^Ismael llega/);
    });
});

describe('frasesClave', () => {
    it('elige las frases que mejor representan el capítulo, en su orden', () => {
        const clave = frasesClave(CAPITULO, { maximo: 2, nombres: ['Queequeg', 'Ismael'] });
        expect(clave).toHaveLength(2);
        expect(clave.join(' ')).toMatch(/Queequeg/);
        // En el orden del capítulo, no en el de la puntuación.
        expect(CAPITULO.indexOf(clave[0])).toBeLessThan(CAPITULO.indexOf(clave[1]));
    });

    it('no elige una línea de diálogo suelta', () => {
        expect(frasesClave(CAPITULO, { maximo: 3 }).some((f) => f.startsWith('—'))).toBe(false);
    });
});

describe('preparar el texto para la IA', () => {
    it('recorta por el medio y deja principio y final', () => {
        const largo = Array.from({ length: 5000 }, (_, i) => `p${i}`).join(' ');
        const recortado = recortarParaResumen(largo, 100);
        expect(recortado.startsWith('p0 ')).toBe(true);
        expect(recortado.endsWith('p4999')).toBe(true);
        expect(recortado.split(' ').length).toBeLessThan(110);
    });

    it('limpia las viñetas del modelo', () => {
        expect(vinetasDe('* Ismael llega.\n* Conoce a Queequeg.')).toEqual(['Ismael llega.', 'Conoce a Queequeg.']);
    });
});
