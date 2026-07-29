import { describe, it, expect } from 'vitest';
import {
    createHighlight,
    createNote,
    createBookmark,
    highlightComment,
    withComment,
    addAnnotation,
    removeAnnotation,
    selectAnnotations,
    countByKind,
    updateHighlight,
    findAnnotation,
} from './annotations.js';
import { normalizeAnnotationKind, normalizeAnnotationText } from '../core/annotationExport.js';

describe('formato compatible con el escritorio', () => {
    it('un subrayado se reconoce como tal desde el núcleo compartido', () => {
        const highlight = createHighlight({ cfi: 'epubcfi(/6/4!/2)', text: 'El miedo mata la mente', color: 'yellow' });
        expect(normalizeAnnotationKind(highlight)).toBe('highlight');
        expect(normalizeAnnotationText(highlight)).toBe('El miedo mata la mente');
    });

    it('una nota se reconoce como nota', () => {
        const note = createNote({ cfi: 'epubcfi(/6/4!/4)', comment: 'Revisar esto' });
        expect(normalizeAnnotationKind(note)).toBe('note');
        expect(normalizeAnnotationText(note)).toBe('Revisar esto');
    });

    it('un marcador simple no lleva tipo', () => {
        const bookmark = createBookmark({ cfi: 'epubcfi(/6/4!/6)' });
        expect(normalizeAnnotationKind(bookmark)).toBe('bookmark');
    });

    it('el texto marcado se recorta para no inflar el registro', () => {
        const highlight = createHighlight({ cfi: 'x', text: 'a'.repeat(5000) });
        expect(normalizeAnnotationText(highlight).length).toBe(2000);
    });
});

describe('comentarios', () => {
    it('un subrayado guarda texto y comentario por separado', () => {
        const highlight = createHighlight({ cfi: 'x', text: 'cita', comment: 'me gusta' });
        expect(normalizeAnnotationText(highlight)).toBe('cita');
        expect(highlightComment(highlight)).toBe('me gusta');
    });

    it('añadir un comentario conserva el texto marcado', () => {
        const highlight = createHighlight({ cfi: 'x', text: 'cita' });
        const updated = withComment(highlight, 'nuevo comentario');
        expect(normalizeAnnotationText(updated)).toBe('cita');
        expect(highlightComment(updated)).toBe('nuevo comentario');
    });

    it('un subrayado sin comentario devuelve cadena vacía', () => {
        expect(highlightComment(createHighlight({ cfi: 'x', text: 'cita' }))).toBe('');
    });

    it('editar una nota cambia su texto directamente', () => {
        const note = createNote({ cfi: 'x', comment: 'viejo' });
        expect(normalizeAnnotationText(withComment(note, 'nuevo'))).toBe('nuevo');
    });
});

describe('añadir y quitar', () => {
    it('añade una anotación nueva', () => {
        const result = addAnnotation([], createHighlight({ cfi: 'a', text: 'uno' }));
        expect(result).toHaveLength(1);
    });

    it('subrayar dos veces la misma posición reemplaza, no duplica', () => {
        const first = addAnnotation([], createHighlight({ cfi: 'a', text: 'uno', color: 'yellow' }));
        const second = addAnnotation(first, createHighlight({ cfi: 'a', text: 'uno', color: 'blue' }));
        expect(second).toHaveLength(1);
        expect(second[0].color).toBe('blue');
    });

    it('un subrayado y una nota en la misma posición conviven', () => {
        const withHighlight = addAnnotation([], createHighlight({ cfi: 'a', text: 'uno' }));
        const both = addAnnotation(withHighlight, createNote({ cfi: 'a', comment: 'nota' }));
        expect(both).toHaveLength(2);
    });

    it('quitar por tipo respeta las otras anotaciones de la misma posición', () => {
        const bookmarks = [
            createHighlight({ cfi: 'a', text: 'uno' }),
            createNote({ cfi: 'a', comment: 'nota' }),
        ];
        const result = removeAnnotation(bookmarks, 'a', 'highlight');
        expect(result).toHaveLength(1);
        expect(normalizeAnnotationKind(result[0])).toBe('note');
    });

    it('quitar sin tipo elimina todo lo de esa posición', () => {
        const bookmarks = [
            createHighlight({ cfi: 'a', text: 'uno' }),
            createNote({ cfi: 'a', comment: 'nota' }),
            createNote({ cfi: 'b', comment: 'otra' }),
        ];
        expect(removeAnnotation(bookmarks, 'a')).toHaveLength(1);
    });
});

describe('filtrado del panel', () => {
    const bookmarks = [
        createHighlight({ cfi: '1', text: 'uno', color: 'yellow' }),
        createHighlight({ cfi: '2', text: 'dos', color: 'blue' }),
        createHighlight({ cfi: '3', text: 'tres', color: 'yellow' }),
        createNote({ cfi: '4', comment: 'nota' }),
        createBookmark({ cfi: '5' }),
    ];

    it('filtra por tipo', () => {
        expect(selectAnnotations(bookmarks, { kind: 'highlight' })).toHaveLength(3);
        expect(selectAnnotations(bookmarks, { kind: 'note' })).toHaveLength(1);
        expect(selectAnnotations(bookmarks, { kind: 'bookmark' })).toHaveLength(1);
    });

    it('filtra por color', () => {
        expect(selectAnnotations(bookmarks, { color: 'yellow' })).toHaveLength(2);
    });

    it('combina tipo y color', () => {
        const result = selectAnnotations(bookmarks, { kind: 'highlight', color: 'blue' });
        expect(result).toHaveLength(1);
        expect(result[0].cfi).toBe('2');
    });

    it('cuenta por tipo para las pastillas', () => {
        const counts = countByKind(bookmarks);
        expect(counts).toMatchObject({ all: 5, highlight: 3, note: 1, bookmark: 1 });
    });
});

describe('updateHighlight', () => {
    const highlight = createHighlight({
        cfi: 'epubcfi(/6/4!/4/2)',
        text: 'un fragmento',
        color: 'yellow',
        comment: 'primera idea',
    });

    it('cambia el color conservando el texto marcado', () => {
        const [updated] = updateHighlight([highlight], highlight.cfi, { color: 'green' });
        expect(updated.color).toBe('green');
        expect(normalizeAnnotationText(updated)).toBe('un fragmento');
    });

    it('cambia el comentario sin tocar el color', () => {
        const [updated] = updateHighlight([highlight], highlight.cfi, { comment: 'segunda idea' });
        expect(highlightComment(updated)).toBe('segunda idea');
        expect(updated.color).toBe('yellow');
    });

    it('permite vaciar el comentario', () => {
        const [updated] = updateHighlight([highlight], highlight.cfi, { comment: '' });
        expect(highlightComment(updated)).toBe('');
    });

    it('conserva la fecha del subrayado, no la de la edición', () => {
        // Refrescarla reordenaría el panel y se perdería el orden de lectura,
        // que es el único orden que significa algo ahí.
        const [updated] = updateHighlight([highlight], highlight.cfi, { color: 'blue' });
        expect(updated.date).toBe(highlight.date);
    });

    it('no crea nada si el CFI no existe', () => {
        const list = [highlight];
        expect(updateHighlight(list, 'epubcfi(/otro)', { color: 'blue' })).toEqual(list);
    });

    it('ignora las anotaciones que no son subrayados', () => {
        const note = createNote({ cfi: 'epubcfi(/6/4!/4/9)', comment: 'nota suelta' });
        const [updated] = updateHighlight([note], note.cfi, { color: 'green' });
        expect(updated).toEqual(note);
    });
});

describe('findAnnotation', () => {
    it('encuentra el subrayado de una posición', () => {
        const highlight = createHighlight({ cfi: 'epubcfi(/6/4!/4/2)', text: 'x' });
        const bookmark = createBookmark({ cfi: 'epubcfi(/6/4!/4/2)' });
        // Misma posición, tipos distintos: tiene que devolver el que se pide.
        expect(findAnnotation([bookmark, highlight], 'epubcfi(/6/4!/4/2)')).toBe(highlight);
    });

    it('devuelve null si no está', () => {
        expect(findAnnotation([], 'epubcfi(/nada)')).toBeNull();
    });
});
