import { describe, it, expect } from 'vitest';
import { pageInChapter } from './EpubEngine.js';

// Un visor de 400 px de ancho y un capítulo de cinco columnas: el iframe mide
// 2000 px y se desplaza 400 px por página.
const chapter = (shift) => pageInChapter({
    hostLeft: 0,
    hostWidth: 400,
    frameLeft: -shift,
    frameWidth: 2000,
});

describe('pageInChapter', () => {
    it('sin desplazar es la primera de cinco', () => {
        expect(chapter(0)).toEqual({ page: 1, total: 5 });
    });

    it('avanza al desplazarse el capítulo', () => {
        // Aquí estaba el fallo: epub.js seguía diciendo «1 / 5» tres páginas
        // después de haber pasado página.
        expect(chapter(400).page).toBe(2);
        expect(chapter(1200).page).toBe(4);
        expect(chapter(1600).page).toBe(5);
    });

    it('un desplazamiento a medias se redondea a la página más cercana', () => {
        // Durante el arrastre el iframe está entre dos columnas y el indicador no
        // debe enseñar una página que no existe.
        expect(chapter(390).page).toBe(2);
        expect(chapter(210).page).toBe(2);
    });

    it('nunca sale del capítulo', () => {
        expect(chapter(9999).page).toBe(5);
        expect(chapter(-9999).page).toBe(1);
    });

    it('en modo continuo no hay páginas que contar', () => {
        // El iframe es alto, no ancho: «página 3 de 7» no significaría nada.
        expect(pageInChapter({ hostLeft: 0, hostWidth: 400, frameLeft: 0, frameWidth: 400 })).toBeNull();
    });

    it('sin medidas todavía no inventa nada', () => {
        expect(pageInChapter({ hostLeft: 0, hostWidth: 0, frameLeft: 0, frameWidth: 0 })).toBeNull();
    });
});
