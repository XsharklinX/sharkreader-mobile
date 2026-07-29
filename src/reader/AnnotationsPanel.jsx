import React, { useMemo, useState } from 'react';
import {
    ANNOTATION_FILTERS, HIGHLIGHT_SWATCHES, HIGHLIGHT_LABEL_DEFAULTS,
    selectAnnotations, countByKind, highlightComment,
} from './annotations.js';
import { normalizeAnnotationKind, normalizeAnnotationText } from '../core/annotationExport.js';
import { IconShare, IconClose, IconTrash, IconHighlight } from '../ui/icons.jsx';

export default function AnnotationsPanel({ bookmarks, onJump, onDelete, onExport, onClose }) {
    const [kind, setKind] = useState('all');
    const [color, setColor] = useState(null);

    const counts = useMemo(() => countByKind(bookmarks), [bookmarks]);
    const visible = useMemo(
        () => selectAnnotations(bookmarks, { kind, color }).slice().reverse(),
        [bookmarks, kind, color]
    );

    return (
        <div className="scrim" onClick={onClose} role="presentation">
            <aside
                className="drawer"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label="Anotaciones"
            >
                <div className="drawer-head">
                    <h2 className="section-title">Anotaciones</h2>
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

                <div className="pills">
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
                </div>

                <div className="swatches" style={{ justifyContent: 'flex-start', gap: 'var(--sp-2)' }}>
                    <button
                        type="button"
                        className={`pill${color === null ? ' on' : ''}`}
                        onClick={() => setColor(null)}
                    >
                        Todos
                    </button>
                    {Object.entries(HIGHLIGHT_SWATCHES).map(([id, swatch]) => (
                        <button
                            key={id}
                            type="button"
                            className={`swatch${color === id ? ' on' : ''}`}
                            style={{ background: swatch, width: 36, height: 36 }}
                            onClick={() => setColor(color === id ? null : id)}
                            aria-label={HIGHLIGHT_LABEL_DEFAULTS[id]}
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
                                    : 'Ninguna anotación coincide con el filtro.'}
                            </p>
                        </div>
                    ) : (
                        visible.map((bookmark, index) => {
                            const entryKind = normalizeAnnotationKind(bookmark);
                            const comment = highlightComment(bookmark);
                            return (
                                <article className="annotation" key={`${bookmark.cfi}-${entryKind}-${index}`}>
                                    <button type="button" className="annotation-body" onClick={() => onJump(bookmark.cfi)}>
                                        <span className="annotation-head">
                                            {bookmark.color && (
                                                <span
                                                    className="annotation-dot"
                                                    style={{ background: HIGHLIGHT_SWATCHES[bookmark.color] }}
                                                    aria-hidden="true"
                                                />
                                            )}
                                            <span>{ANNOTATION_FILTERS[entryKind]?.label || 'Marcador'}</span>
                                            <span className="mono">· {bookmark.date}</span>
                                        </span>
                                        <span className="annotation-text">
                                            {normalizeAnnotationText(bookmark) || '(sin texto)'}
                                        </span>
                                        {comment && <span className="annotation-comment">{comment}</span>}
                                    </button>
                                    <button
                                        type="button"
                                        className="icon-btn"
                                        style={{ minWidth: 40 }}
                                        onClick={() => onDelete(bookmark.cfi, entryKind)}
                                        aria-label="Borrar anotación"
                                    >
                                        <IconTrash size={18} />
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
