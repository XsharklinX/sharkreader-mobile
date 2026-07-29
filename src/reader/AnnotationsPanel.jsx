import React, { useMemo, useState } from 'react';
import {
    ANNOTATION_FILTERS, HIGHLIGHT_SWATCHES, HIGHLIGHT_LABEL_DEFAULTS,
    selectAnnotations, countByKind, highlightComment,
} from './annotations.js';
import { normalizeAnnotationKind, normalizeAnnotationText } from '../core/annotationExport.js';
import { IconShare, IconClose, IconHighlight, IconSearch } from '../ui/icons.jsx';

/**
 * Notas, subrayados y marcadores del libro.
 *
 * ## Qué cambió en el rediseño
 *
 * Cada entrada decía «Subrayado · 14/03/2026» y el fragmento. Con doce
 * subrayados del mismo libro eso son doce fragmentos sueltos: para saber cuál
 * era el que buscabas había que abrirlos de uno en uno, porque la fecha no
 * distingue nada —todos se marcaron el mismo día leyendo el mismo capítulo—.
 *
 * Ahora cada entrada lleva **el capítulo y el porcentaje**, que es lo que sitúa
 * un fragmento dentro del libro, y **el comentario se ve en la lista** en vez de
 * solo al entrar: el comentario es justo lo que distingue un subrayado de un
 * recorte, y era lo único que estaba escondido.
 *
 * El fragmento se compone con la tipografía de lectura y el comentario con la de
 * la interfaz. Son dos voces distintas —el libro y tú— y con la misma fuente
 * había que leerlas para saber cuál era cuál.
 */
export default function AnnotationsPanel({
    bookmarks, chapterOf, progressOf, onJump, onDelete, onEdit, onExport, onClose,
}) {
    const [kind, setKind] = useState('all');
    const [color, setColor] = useState(null);
    const [query, setQuery] = useState('');

    const counts = useMemo(() => countByKind(bookmarks), [bookmarks]);

    const visible = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return selectAnnotations(bookmarks, { kind, color })
            .filter((bookmark) => {
                if (!needle) return true;
                // Se busca en el fragmento **y** en el comentario: quien escribió
                // «revisar esto» lo busca por su nota, no por el texto del libro.
                return `${normalizeAnnotationText(bookmark)} ${highlightComment(bookmark)}`
                    .toLowerCase()
                    .includes(needle);
            })
            .slice()
            .reverse();
    }, [bookmarks, kind, color, query]);

    return (
        <div className="scrim" onClick={onClose} role="presentation">
            <aside
                className="drawer"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label="Notas y subrayados"
            >
                <div className="drawer-head">
                    <h2 className="section-title">
                        Notas
                        {bookmarks.length > 0 && <span className="pill-count">{bookmarks.length}</span>}
                    </h2>
                    <button
                        type="button"
                        className="icon-btn"
                        onClick={onExport}
                        disabled={bookmarks.length === 0}
                        aria-label="Exportar a Markdown"
                    >
                        <IconShare size={20} />
                    </button>
                    <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
                        <IconClose size={20} />
                    </button>
                </div>

                {/* La búsqueda solo aparece cuando hay bastante que buscar: en un
                    libro con tres subrayados es un campo que estorba. */}
                {bookmarks.length >= 8 && (
                    <div className="search">
                        <IconSearch size={18} />
                        <input
                            type="search"
                            placeholder="Buscar en tus notas…"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            aria-label="Buscar en tus notas"
                        />
                    </div>
                )}

                {/* Tipo y color en la misma fila. Antes eran dos filas de filtros
                    apiladas y ocupaban más que los propios resultados. */}
                <div className="annot-filters">
                    {Object.entries(ANNOTATION_FILTERS).map(([id, filter]) => (
                        <button
                            key={id}
                            type="button"
                            className={`pill${kind === id ? ' on' : ''}`}
                            onClick={() => setKind(id)}
                            aria-pressed={kind === id}
                        >
                            {filter.label}
                            {counts[id] > 0 && <span className="pill-count">{counts[id]}</span>}
                        </button>
                    ))}

                    <span className="annot-sep" aria-hidden="true" />

                    {Object.entries(HIGHLIGHT_SWATCHES).map(([id, swatch]) => (
                        <button
                            key={id}
                            type="button"
                            className={`swatch sm${color === id ? ' on' : ''}`}
                            style={{ background: swatch }}
                            onClick={() => setColor(color === id ? null : id)}
                            aria-label={`Filtrar por ${HIGHLIGHT_LABEL_DEFAULTS[id].toLowerCase()}`}
                            aria-pressed={color === id}
                        />
                    ))}
                </div>

                <div className="drawer-list">
                    {visible.length === 0 ? (
                        <div className="empty" style={{ padding: 'var(--sp-6) var(--sp-4)' }}>
                            <span className="empty-art" style={{ width: 64, height: 64 }}>
                                <IconHighlight size={28} />
                            </span>
                            <p className="empty-body">
                                {bookmarks.length === 0
                                    ? 'Mantén pulsado sobre el texto para subrayar o añadir una nota.'
                                    : query.trim()
                                        ? 'Ninguna nota contiene eso.'
                                        : 'Ninguna anotación coincide con el filtro.'}
                            </p>
                        </div>
                    ) : (
                        visible.map((bookmark, index) => {
                            const entryKind = normalizeAnnotationKind(bookmark);
                            const comment = highlightComment(bookmark);
                            const chapter = chapterOf?.(bookmark.cfi) || '';
                            const percent = progressOf?.(bookmark.cfi);

                            return (
                                <article className="annot" key={`${bookmark.cfi}-${entryKind}-${index}`}>
                                    <button
                                        type="button"
                                        className="annot-body"
                                        onClick={() => onJump(bookmark.cfi)}
                                    >
                                        {/* Capítulo y posición: es lo que sitúa el
                                            fragmento. La fecha no distinguía nada
                                            —todos se marcaron el mismo día—. */}
                                        <span className="annot-where">
                                            {bookmark.color && (
                                                <span
                                                    className="annot-dot"
                                                    style={{ background: HIGHLIGHT_SWATCHES[bookmark.color] }}
                                                    aria-hidden="true"
                                                />
                                            )}
                                            <span className="annot-chapter">
                                                {chapter || ANNOTATION_FILTERS[entryKind]?.label || 'Marcador'}
                                            </span>
                                            {Number.isFinite(percent) && (
                                                <span className="annot-pct">{Math.round(percent * 100)} %</span>
                                            )}
                                        </span>

                                        <span className="annot-text">
                                            {normalizeAnnotationText(bookmark) || '(sin texto)'}
                                        </span>

                                        {/* El comentario en la lista: es lo que
                                            distingue un subrayado de un recorte. */}
                                        {comment && <span className="annot-comment">{comment}</span>}
                                    </button>

                                    <div className="annot-actions">
                                        {entryKind === 'highlight' && onEdit && (
                                            <button
                                                type="button"
                                                className="annot-act"
                                                onClick={() => onEdit(bookmark.cfi)}
                                                aria-label="Editar subrayado"
                                            >
                                                Editar
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className="annot-act danger"
                                            onClick={() => onDelete(bookmark.cfi, entryKind)}
                                            aria-label="Borrar anotación"
                                        >
                                            Borrar
                                        </button>
                                    </div>
                                </article>
                            );
                        })
                    )}
                </div>
            </aside>
        </div>
    );
}
