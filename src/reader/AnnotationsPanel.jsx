import React, { useMemo, useState } from 'react';
import {
    ANNOTATION_FILTERS,
    HIGHLIGHT_SWATCHES,
    HIGHLIGHT_LABEL_DEFAULTS,
    selectAnnotations,
    countByKind,
    highlightComment,
} from './annotations.js';
import { normalizeAnnotationKind, normalizeAnnotationText } from '../core/annotationExport.js';

const KIND_ICON = { highlight: '🖍', note: '📝', bookmark: '🔖' };

/**
 * Panel de anotaciones del libro abierto.
 *
 * Filtrable por tipo y por color, igual que en escritorio. Tocar una entrada
 * salta a esa posición del libro; el botón de borrar está separado para que no
 * se pulse sin querer al saltar.
 */
export default function AnnotationsPanel({ bookmarks, onJump, onDelete, onExport, onClose }) {
    const [kind, setKind] = useState('all');
    const [color, setColor] = useState(null);

    const counts = useMemo(() => countByKind(bookmarks), [bookmarks]);
    const visible = useMemo(
        () => selectAnnotations(bookmarks, { kind, color }).slice().reverse(),
        [bookmarks, kind, color]
    );

    return (
        <div className="sheet-backdrop" onClick={onClose} role="presentation">
            <aside
                className="drawer"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label="Anotaciones"
            >
                <div className="drawer-tabs">
                    <span className="setting-label">Anotaciones</span>
                    <button
                        type="button"
                        className="icon-btn ghost"
                        onClick={onExport}
                        disabled={bookmarks.length === 0}
                        aria-label="Exportar a Markdown"
                    >
                        ↗
                    </button>
                    <button type="button" className="icon-btn ghost" onClick={onClose} aria-label="Cerrar">×</button>
                </div>

                <div className="pills">
                    {Object.entries(ANNOTATION_FILTERS).map(([id, filter]) => (
                        <button
                            key={id}
                            type="button"
                            className={`pill-btn${kind === id ? ' on' : ''}`}
                            onClick={() => setKind(id)}
                            aria-pressed={kind === id}
                        >
                            {filter.label}
                            {counts[id] > 0 && <span className="mono"> {counts[id]}</span>}
                        </button>
                    ))}
                </div>

                <div className="pills">
                    <button
                        type="button"
                        className={`pill-btn${color === null ? ' on' : ''}`}
                        onClick={() => setColor(null)}
                    >
                        Todos los colores
                    </button>
                    {Object.entries(HIGHLIGHT_SWATCHES).map(([id, swatch]) => (
                        <button
                            key={id}
                            type="button"
                            className={`swatch${color === id ? ' on' : ''}`}
                            style={{ background: swatch }}
                            onClick={() => setColor(color === id ? null : id)}
                            aria-label={HIGHLIGHT_LABEL_DEFAULTS[id]}
                            aria-pressed={color === id}
                        />
                    ))}
                </div>

                <div className="drawer-list">
                    {visible.length === 0 ? (
                        <p className="drawer-empty">
                            {bookmarks.length === 0
                                ? 'Todavía no has subrayado nada. Mantén pulsado sobre el texto para empezar.'
                                : 'Ninguna anotación coincide con el filtro.'}
                        </p>
                    ) : (
                        visible.map((bookmark, index) => {
                            const entryKind = normalizeAnnotationKind(bookmark);
                            const comment = highlightComment(bookmark);
                            return (
                                <article className="annotation" key={`${bookmark.cfi}-${entryKind}-${index}`}>
                                    <button
                                        type="button"
                                        className="annotation-body"
                                        onClick={() => onJump(bookmark.cfi)}
                                    >
                                        <span className="annotation-head">
                                            <span aria-hidden="true">{KIND_ICON[entryKind]}</span>
                                            {bookmark.color && (
                                                <span
                                                    className="annotation-dot"
                                                    style={{ background: HIGHLIGHT_SWATCHES[bookmark.color] }}
                                                    aria-hidden="true"
                                                />
                                            )}
                                            <span className="annotation-date mono">{bookmark.date}</span>
                                        </span>
                                        <span className="annotation-text">
                                            {normalizeAnnotationText(bookmark) || '(sin texto)'}
                                        </span>
                                        {comment && <span className="annotation-comment">{comment}</span>}
                                    </button>
                                    <button
                                        type="button"
                                        className="icon-btn ghost"
                                        onClick={() => onDelete(bookmark.cfi, entryKind)}
                                        aria-label="Borrar anotación"
                                    >
                                        🗑
                                    </button>
                                </article>
                            );
                        })
                    )}
                </div>
            </aside>
        </div>
    );
}
