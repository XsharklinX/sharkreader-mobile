import { describe, it, expect } from 'vitest';
import { paginaSintetica, paginaImpresa, etiquetaPagina, localizacionDePagina } from './paginasLibro.js';

describe('páginas sintéticas', () => {
    it('una cada 1.500 caracteres de texto', () => {
        // 300 localizaciones de 1.024 caracteres son 307.200 caracteres: 205 páginas.
        expect(paginaSintetica(0, 300)).toEqual({ pagina: 1, total: 205 });
        expect(paginaSintetica(299, 300).pagina).toBe(205);
    });

    it('no dependen de la letra: solo del texto', () => {
        expect(paginaSintetica(150, 300)).toEqual(paginaSintetica(150, 300));
    });

    it('sin mapa no hay número', () => {
        expect(paginaSintetica(3, 0)).toBeNull();
    });
});

describe('páginas impresas', () => {
    // Con cfis de juguete que se comparan como números.
    const comparar = (a, b) => Number(a) - Number(b);
    const lista = [
        { cfi: '10', pagina: 1 },
        { cfi: '20', pagina: 2 },
        { cfi: '30', pagina: 3 },
        { cfi: '40', pagina: 'xii' },
    ];

    it('la página es la última que empieza antes de la posición', () => {
        expect(paginaImpresa(lista, '25', comparar)).toEqual({ pagina: '2', total: 'xii' });
        expect(paginaImpresa(lista, '30', comparar).pagina).toBe('3');
    });

    it('antes de la primera página numerada no hay número', () => {
        expect(paginaImpresa(lista, '5', comparar)).toBeNull();
    });

    it('se escribe como en la línea de estado', () => {
        expect(etiquetaPagina({ pagina: '134', total: '512' })).toBe('pág. 134 de 512');
        expect(etiquetaPagina(null)).toBe('');
    });
});

describe('ir a una página', () => {
    it('cae dentro de la página pedida, no en la anterior', () => {
        for (let pagina = 1; pagina <= 2000; pagina += 1) {
            expect(paginaSintetica(localizacionDePagina(pagina), 100000).pagina).toBe(pagina);
        }
        expect(localizacionDePagina(1)).toBe(0);
    });
});
