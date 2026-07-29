import { describe, it, expect } from 'vitest';
import { formatCitation, citationPreview } from './citation.js';

const source = {
    text: 'El tiempo es la sustancia de la que estoy hecho.',
    title: 'Ficciones',
    author: 'Jorge Luis Borges',
    chapter: 'Nueva refutación del tiempo',
    percent: 0.42,
};

describe('formatCitation', () => {
    it('compone la cita en texto plano con su procedencia', () => {
        const result = formatCitation(source, 'plain');
        expect(result).toContain('«El tiempo es la sustancia');
        expect(result).toContain('Ficciones');
        expect(result).toContain('Jorge Luis Borges');
        expect(result).toContain('42 %');
    });

    it('usa bloque de cita en markdown', () => {
        expect(formatCitation(source, 'markdown')).toMatch(/^> /);
        expect(formatCitation(source, 'markdown')).toContain('**Ficciones**');
    });

    it('pone el capítulo entrecomillado y el título en cursiva en el académico', () => {
        const result = formatCitation(source, 'academic');
        expect(result).toContain('*Ficciones*');
        expect(result).toContain('«Nueva refutación del tiempo»');
    });

    it('omite lo que el libro no declara en vez de inventarlo', () => {
        // Un EPUB sin autor no debe producir «Desconocido»: ensucia la cita y
        // no informa de nada.
        const result = formatCitation({ ...source, author: '' }, 'plain');
        expect(result).not.toContain('Desconocido');
        expect(result).toContain('Ficciones');
        expect(result).not.toContain('· ·');
    });

    it('devuelve solo la cita si no hay ningún dato del libro', () => {
        expect(formatCitation({ text: 'Hola' }, 'plain')).toBe('«Hola»');
    });

    it('normaliza los saltos y espacios que arrastra la selección', () => {
        // Seleccionar dentro del iframe trae la indentación del HTML.
        const messy = formatCitation({ text: '  uno\n   dos   tres ' }, 'plain');
        expect(messy).toBe('«uno dos tres»');
    });

    it('devuelve cadena vacía sin fragmento', () => {
        expect(formatCitation({ text: '   ', title: 'X' }, 'plain')).toBe('');
    });

    it('omite el porcentaje si no se conoce el progreso', () => {
        const result = formatCitation({ ...source, percent: undefined }, 'plain');
        expect(result).not.toContain('%');
    });
});

describe('citationPreview', () => {
    it('recorta el fragmento para poder comparar formatos', () => {
        const preview = citationPreview(source, 'plain');
        expect(preview).toContain('…');
        expect(preview.length).toBeLessThan(formatCitation(source, 'plain').length);
    });
});
