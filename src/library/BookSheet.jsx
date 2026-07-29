import React, { useState } from 'react';
import { IconStar, IconCheck, IconShare, IconTrash, IconBook } from '../ui/icons.jsx';
import { formatMinutes } from '../stats/derive.js';
import { estimateRemaining } from './ContinueCard.jsx';

/**
 * Ficha de libro.
 *
 * Es una hoja y no una pantalla completa a propósito: para una consulta rápida
 * —¿cuánto llevo?, ¿lo marco como terminado?— navegar y volver sobra. La hoja
 * deja la biblioteca visible detrás, se cierra deslizando y mantiene los
 * controles en la zona del pulgar.
 */
export default function BookSheet({ book, onClose, onOpen, onUpdate, onDelete, onExportNotes }) {
    const [confirmDelete, setConfirmDelete] = useState(false);

    const done = Math.round((book.progress || 0) * 100);
    const cover = book.coverUrl || book.coverBase64;
    const left = estimateRemaining(book);
    const annotations = book.bookmarks?.length || 0;
    const readable = Boolean(book.sourcePath);

    const tags = String(book.tags || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 4);

    return (
        <div className="scrim" onClick={onClose} role="presentation">
            <section
                className="sheet"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label={`Ficha de ${book.name}`}
            >
                <span className="grip" aria-hidden="true" />

                <div className="detail-top">
                    <span className="detail-cover" style={cover ? undefined : { background: book.color }}>
                        {cover
                            ? <img src={cover} alt="" style={{ width: '100%', display: 'block', aspectRatio: '2/3', objectFit: 'cover' }} />
                            : <span style={{ display: 'block', aspectRatio: '2/3' }} />}
                    </span>

                    <div className="detail-meta">
                        <h2 className="detail-title">{book.name}</h2>
                        <span className="detail-author">{book.author}</span>
                        <div className="detail-tags">
                            <span className="tag">{(book.type || 'epub').toUpperCase()}</span>
                            {book.series && <span className="tag">{book.series}</span>}
                            {tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
                        </div>
                    </div>
                </div>

                <div className="setting">
                    <div className="goal-head">
                        <span>{book.isFinished ? 'Terminado' : `${done}% leído`}</span>
                        <span className="mono">{left ? `quedan ${formatMinutes(left)}` : ''}</span>
                    </div>
                    <span className="bar"><i className={book.isFinished ? 'ok' : ''} style={{ width: `${done}%` }} /></span>
                </div>

                <div className="detail-stats">
                    <div className="detail-stat">
                        <b>{formatMinutes(book.readingMinutes || 0).replace(' min', '′').replace(' h', 'h')}</b>
                        <span>leídos</span>
                    </div>
                    <div className="detail-stat">
                        <b>{annotations}</b>
                        <span>anotaciones</span>
                    </div>
                    <div className="detail-stat">
                        <b>{book.rating || '—'}</b>
                        <span>valoración</span>
                    </div>
                </div>

                {readable ? (
                    <button type="button" className="btn btn-primary btn-block" onClick={() => onOpen(book)}>
                        <IconBook size={18} />
                        {done > 0 ? 'Seguir leyendo' : 'Empezar a leer'}
                    </button>
                ) : (
                    <div className="banner">
                        Este libro vino de un backup: tienes su progreso y sus anotaciones,
                        pero falta el fichero. Impórtalo para poder abrirlo.
                    </div>
                )}

                <div className="detail-actions">
                    <button
                        type="button"
                        className={`detail-action${book.isFav ? ' on' : ''}`}
                        onClick={() => onUpdate(book.id, { isFav: !book.isFav })}
                        aria-pressed={book.isFav}
                    >
                        <IconStar size={20} filled={book.isFav} />
                        Favorito
                    </button>

                    <button
                        type="button"
                        className={`detail-action${book.isFinished ? ' on' : ''}`}
                        onClick={() => onUpdate(book.id, {
                            isFinished: !book.isFinished,
                            dateFinished: book.isFinished ? null : Date.now(),
                            progress: book.isFinished ? book.progress : 1,
                        })}
                        aria-pressed={book.isFinished}
                    >
                        <IconCheck size={20} />
                        Terminado
                    </button>

                    <button
                        type="button"
                        className="detail-action"
                        onClick={() => onExportNotes(book)}
                        disabled={annotations === 0}
                    >
                        <IconShare size={20} />
                        Notas
                    </button>

                    <button
                        type="button"
                        className="detail-action danger"
                        onClick={() => setConfirmDelete(true)}
                    >
                        <IconTrash size={20} />
                        Borrar
                    </button>
                </div>

                {confirmDelete && (
                    <div className="card" style={{ background: 'var(--sf-2)' }}>
                        <p className="card-body">
                            Se borrarán el libro, su progreso y sus {annotations} anotaciones,
                            además del fichero copiado dentro de la app. No se puede deshacer.
                        </p>
                        <div className="sheet-actions">
                            <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={() => { onDelete(book.id); onClose(); }}
                            >
                                Borrar
                            </button>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
