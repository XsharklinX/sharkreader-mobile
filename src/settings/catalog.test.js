import { describe, it, expect } from 'vitest';
import { CATEGORIES, buildIndex, searchSettings } from './catalog.js';

describe('catálogo', () => {
    it('declara las seis categorías del rediseño', () => {
        expect(CATEGORIES).toHaveLength(6);
        expect(CATEGORIES.map((c) => c.id)).toEqual([
            'reading', 'appearance', 'sync', 'data', 'privacy', 'about',
        ]);
    });

    it('cada categoría tiene resumen y al menos una opción', () => {
        CATEGORIES.forEach((category) => {
            expect(category.summary, category.id).toBeTruthy();
            expect(category.items.length, category.id).toBeGreaterThan(0);
        });
    });

    it('los identificadores de opción no se repiten entre categorías', () => {
        const ids = buildIndex().map((entry) => entry.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('el índice arrastra la categoría de cada opción', () => {
        const entry = buildIndex().find((item) => item.id === 'sync-wifi');
        expect(entry.categoryId).toBe('sync');
        expect(entry.categoryLabel).toBe('Sincronización');
    });
});

describe('buscador', () => {
    it('encuentra por nombre visible', () => {
        const results = searchSettings('meta diaria');
        expect(results[0].id).toBe('goal-daily');
    });

    it('encuentra por sinónimo, aunque la palabra no salga en la app', () => {
        // «nube» no aparece en ninguna etiqueta, pero es como lo llama la gente.
        expect(searchSettings('nube').map((r) => r.id)).toContain('sync-server');
    });

    it('ignora los acentos en los dos sentidos', () => {
        expect(searchSettings('sincronizacion').length).toBeGreaterThan(0);
        expect(searchSettings('diccionário').length).toBeGreaterThan(0);
    });

    it('no distingue mayúsculas', () => {
        expect(searchSettings('SHARKY')[0].id).toBe('sharky');
    });

    it('el nombre pesa más que la palabra clave', () => {
        // «Tema de la aplicación» debe ganar a cualquier opción que solo tenga
        // «tema» entre sus sinónimos.
        expect(searchSettings('tema')[0].id).toBe('theme');
    });

    it('una consulta de una sola letra no devuelve media app', () => {
        expect(searchSettings('a')).toEqual([]);
        expect(searchSettings('')).toEqual([]);
    });

    it('algo que no existe devuelve lista vacía', () => {
        expect(searchSettings('bluetooth')).toEqual([]);
    });

    it('encuentra las opciones que más se buscan', () => {
        const casos = [
            ['backup', 'backup-import'],
            ['exportar notas', 'export-notes'],
            ['espacio', 'storage'],
            ['permisos', 'permissions'],
            ['volumen', 'volume-keys'],
            ['oscuro', 'theme'],
        ];
        casos.forEach(([query, expected]) => {
            expect(searchSettings(query).map((r) => r.id), query).toContain(expected);
        });
    });

    it('no devuelve duplicados', () => {
        const ids = searchSettings('exportar').map((r) => r.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
