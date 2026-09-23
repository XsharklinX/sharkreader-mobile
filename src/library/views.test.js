import { describe, it, expect } from 'vitest';
import { normalizeView, grupoDe, agrupar, LIBRARY_VIEWS, DEFAULT_VIEW } from './views.js';

const libro = (extra) => ({ name: 'Sin título', author: 'Anónimo', ...extra });

describe('normalizeView', () => {
    it('respeta una vista que existe', () => {
        expect(normalizeView('list')).toBe('list');
        expect(normalizeView('shelf')).toBe('shelf');
    });

    it('la densidad compacta de antes era una vista', () => {
        // `density: 'compact'` era un interruptor aparte en Ajustes que en realidad
        // significaba exactamente esta vista. Sin esto, quien la tuviera puesta
        // abriría la biblioteca sin ninguna vista marcada.
        expect(normalizeView(undefined, 'compact')).toBe('compact');
        expect(normalizeView('grid', 'compact')).toBe('grid');
    });

    it('sin nada guardado, la de por defecto', () => {
        expect(normalizeView(undefined, undefined)).toBe(DEFAULT_VIEW);
        expect(normalizeView('inventada')).toBe(DEFAULT_VIEW);
    });

    it('cada una dice a qué pregunta responde, y ninguna repite pregunta', () => {
        // Son cinco desde que existe la estantería de lomos, que es la única que
        // contesta «¿qué tengo?». Lo que importa no es cuántas hay sino que
        // ninguna sobre: si dos vistas contestan lo mismo, una es ruido.
        const vistas = Object.values(LIBRARY_VIEWS);
        expect(vistas.length).toBeGreaterThanOrEqual(4);
        expect(new Set(vistas.map((v) => v.hint)).size).toBe(vistas.length);
        vistas.forEach((vista) => {
            expect(vista.label).toBeTruthy();
            expect(vista.hint).toBeTruthy();
        });
    });
});

describe('grupoDe', () => {
    it('por título, la primera letra', () => {
        expect(grupoDe(libro({ name: 'Carmilla' }), 'title')).toBe('C');
    });

    it('las tildes no hacen grupo aparte', () => {
        // «Álvarez» va con la A. Con un grupo propio acabaría al final de la lista,
        // que es donde nadie lo busca.
        expect(grupoDe(libro({ name: 'Ángeles' }), 'title')).toBe('A');
        expect(grupoDe(libro({ author: 'Álvarez' }), 'author')).toBe('A');
    });

    it('números y símbolos van juntos', () => {
        // Un grupo «1» con un libro y otro «¿» con otro son dos encabezados para
        // dos libros.
        expect(grupoDe(libro({ name: '1984' }), 'title')).toBe('#');
        expect(grupoDe(libro({ name: '¿Quién?' }), 'title')).toBe('#');
    });

    it('por serie, el nombre de la saga', () => {
        expect(grupoDe(libro({ series: 'Empíreo' }), 'serie')).toBe('Empíreo');
        expect(grupoDe(libro({}), 'serie')).toBe('Sin serie');
    });

    it('por fecha, el mes con la inicial en mayúscula', () => {
        const grupo = grupoDe(libro({ dateAdded: new Date('2026-03-14').getTime() }), 'added');
        expect(grupo).toMatch(/^[A-ZÁÉÍÓÚ]/);
        expect(grupo).toContain('2026');
    });

    it('los órdenes que no admiten grupos devuelven nada', () => {
        // Por reciente o por progreso, un encabezado sería una raya arbitraria en
        // medio de la lista.
        expect(grupoDe(libro({}), 'recent')).toBeNull();
        expect(grupoDe(libro({}), 'progress')).toBeNull();
    });
});

describe('agrupar', () => {
    const lista = [
        libro({ name: 'Alas de sangre' }),
        libro({ name: 'Almendra' }),
        libro({ name: 'Carmilla' }),
    ];

    it('parte la lista por su encabezado', () => {
        const grupos = agrupar(lista, 'title');
        expect(grupos.map((g) => g.titulo)).toEqual(['A', 'C']);
        expect(grupos[0].libros).toHaveLength(2);
    });

    it('sin grupos devuelve la lista entera en un solo bloque', () => {
        const grupos = agrupar(lista, 'recent');
        expect(grupos).toHaveLength(1);
        expect(grupos[0].titulo).toBeNull();
        expect(grupos[0].libros).toHaveLength(3);
    });

    it('no reordena: agrupa lo que le dan como está', () => {
        // Si agrupara por su cuenta saldría la misma letra dos veces cuando la
        // lista no viene ordenada por ese criterio, y eso es exactamente lo que
        // hay que ver — es señal de que el orden y el grupo no coinciden.
        const desordenada = [
            libro({ name: 'Alas' }),
            libro({ name: 'Carmilla' }),
            libro({ name: 'Almendra' }),
        ];
        expect(agrupar(desordenada, 'title').map((g) => g.titulo)).toEqual(['A', 'C', 'A']);
    });

    it('con la lista vacía no revienta', () => {
        expect(agrupar([], 'title')).toEqual([{ titulo: null, libros: [] }]);
    });
});
