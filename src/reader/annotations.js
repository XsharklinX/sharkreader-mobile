import { normalizeAnnotationKind, normalizeAnnotationText } from '../core/annotationExport.js';
import { HIGHLIGHT_SWATCHES, HIGHLIGHT_LABEL_DEFAULTS } from '../core/highlightLabels.js';

/**
 * Anotaciones: subrayados, notas y marcadores.
 *
 * El formato es exactamente el del escritorio, porque un backup tiene que poder
 * ir y venir entre las dos apps sin conversiones:
 *
 *   { cfi, note, date, color, kind }
 *
 * `kind` es 'highlight', 'note' o ausente (marcador simple). En los subrayados,
 * `note` guarda un JSON con el texto marcado y el comentario del usuario — es el
 * formato estructurado que ya entiende `normalizeAnnotationText`.
 */

export const HIGHLIGHT_COLORS = Object.keys(HIGHLIGHT_SWATCHES);

export { HIGHLIGHT_SWATCHES, HIGHLIGHT_LABEL_DEFAULTS };

/** Fecha legible, no epoch: el escritorio guarda así este campo (heredado). */
const readableDate = (now = new Date()) => now.toLocaleDateString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
});

export const createHighlight = ({ cfi, text, color = 'yellow', comment = '' }) => ({
    cfi,
    kind: 'highlight',
    color,
    date: readableDate(),
    note: JSON.stringify({ text: String(text || '').slice(0, 2000), comment }),
});

export const createNote = ({ cfi, comment }) => ({
    cfi,
    kind: 'note',
    color: null,
    date: readableDate(),
    note: String(comment || ''),
});

export const createBookmark = ({ cfi, label = '' }) => ({
    cfi,
    kind: null,
    color: null,
    date: readableDate(),
    note: label,
});

/** Comentario asociado a un subrayado, si lo tiene. */
export const highlightComment = (bookmark) => {
    if (normalizeAnnotationKind(bookmark) !== 'highlight') return '';
    try {
        const parsed = JSON.parse(bookmark.note);
        return typeof parsed?.comment === 'string' ? parsed.comment : '';
    } catch {
        return '';
    }
};

export const withComment = (bookmark, comment) => {
    if (normalizeAnnotationKind(bookmark) !== 'highlight') {
        return { ...bookmark, note: String(comment || '') };
    }
    return {
        ...bookmark,
        note: JSON.stringify({ text: normalizeAnnotationText(bookmark), comment: String(comment || '') }),
    };
};

/**
 * Cambia color y comentario de un subrayado ya existente.
 *
 * Se conserva `date`: es la fecha en que se marcó el fragmento, no la de la
 * última vez que se tocó la nota. Refrescarla al editar reordenaría el panel de
 * anotaciones y perderías el orden de lectura, que es el que tiene sentido.
 *
 * Devuelve la lista sin tocar si el CFI no está — no crea nada nuevo, porque
 * editar algo que ya no existe es señal de un error en otro sitio.
 */
export const updateHighlight = (bookmarks = [], cfi, { color, comment } = {}) =>
    bookmarks.map((bookmark) => {
        if (bookmark.cfi !== cfi || normalizeAnnotationKind(bookmark) !== 'highlight') {
            return bookmark;
        }
        return {
            ...bookmark,
            color: color || bookmark.color,
            note: JSON.stringify({
                text: normalizeAnnotationText(bookmark),
                comment: comment === undefined ? highlightComment(bookmark) : String(comment),
            }),
        };
    });

/** Busca una anotación por posición y tipo, para abrir el editor. */
export const findAnnotation = (bookmarks = [], cfi, kind = 'highlight') =>
    bookmarks.find(
        (bookmark) => bookmark.cfi === cfi && normalizeAnnotationKind(bookmark) === kind
    ) || null;

/** Añade una anotación evitando duplicar la misma posición y tipo. */
export const addAnnotation = (bookmarks = [], annotation) => {
    const exists = bookmarks.some(
        (existing) => existing.cfi === annotation.cfi
            && normalizeAnnotationKind(existing) === normalizeAnnotationKind(annotation)
    );
    if (exists) {
        return bookmarks.map((existing) =>
            existing.cfi === annotation.cfi
                && normalizeAnnotationKind(existing) === normalizeAnnotationKind(annotation)
                ? annotation
                : existing
        );
    }
    return [...bookmarks, annotation];
};

export const removeAnnotation = (bookmarks = [], cfi, kind) =>
    bookmarks.filter((existing) =>
        !(existing.cfi === cfi && (!kind || normalizeAnnotationKind(existing) === kind))
    );

export const ANNOTATION_FILTERS = {
    all: { label: 'Todas', match: () => true },
    highlight: { label: 'Subrayados', match: (b) => normalizeAnnotationKind(b) === 'highlight' },
    note: { label: 'Notas', match: (b) => normalizeAnnotationKind(b) === 'note' },
    bookmark: { label: 'Marcadores', match: (b) => normalizeAnnotationKind(b) === 'bookmark' },
};

/**
 * Filtra por tipo y color para el panel de anotaciones.
 * @param {Array} bookmarks
 * @param {{kind?: string, color?: string|null}} criteria
 */
export const selectAnnotations = (bookmarks = [], { kind = 'all', color = null } = {}) => {
    const matchKind = ANNOTATION_FILTERS[kind]?.match || ANNOTATION_FILTERS.all.match;
    return bookmarks
        .filter(matchKind)
        .filter((bookmark) => !color || bookmark.color === color);
};

/** Cuenta por tipo, para las pastillas del panel. */
export const countByKind = (bookmarks = []) =>
    bookmarks.reduce((counts, bookmark) => {
        const kind = normalizeAnnotationKind(bookmark);
        counts[kind] = (counts[kind] || 0) + 1;
        counts.all = (counts.all || 0) + 1;
        return counts;
    }, {});
