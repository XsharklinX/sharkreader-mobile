import React, { useState } from 'react';
import { IconStar, IconCheck, IconShare, IconTrash, IconBook, IconSearch, IconFolder } from '../ui/icons.jsx';
import { searchMetadata, fetchCover, applyMetadata } from './metadata.js';
import CollectionsSheet from './CollectionsSheet.jsx';
import { resizeCoverDataUrl } from '../core/coverResize.js';
import { usePorts } from '../ports/index.js';
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
    const [candidates, setCandidates] = useState(null);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState(null);
    const [showCollections, setShowCollections] = useState(false);
    const ports = usePorts();

    /**
     * Portada propia. Se redimensiona con el mismo módulo que las portadas
     * extraídas del EPUB: sin eso, una foto de galería de 4 MB se guardaría
     * entera dentro del registro del libro y en el backup.
     */
    const pickCover = async () => {
        setBusy(true);
        try {
            const { dataUrl } = await ports.filePicker.pickImage();
            if (dataUrl) {
                const resized = await resizeCoverDataUrl(dataUrl);
                await onUpdate(book.id, { customCover: resized, metadataUpdatedAt: Date.now() });
                setNotice('Portada actualizada.');
            }
        } catch (error) {
            setNotice(error?.message || 'No se pudo usar esa imagen.');
        }
        setBusy(false);
    };

    /**
     * Busca metadata en OpenLibrary. Solo cuando el usuario lo pide: una app
     * local-first no puede salir a internet por su cuenta con los títulos de tu
     * biblioteca.
     */
    const searchOnline = async () => {
        setBusy(true);
        setNotice(null);
        const { results, offline } = await searchMetadata({
            title: book.originalTitle || book.name,
            author: book.author,
        });
        setBusy(false);

        if (offline) { setNotice('Sin conexión. Esta función necesita internet.'); return; }
        if (results.length === 0) { setNotice('No se ha encontrado nada para este título.'); return; }
        setCandidates(results);
    };

    const applyCandidate = async (candidate) => {
        setBusy(true);
        // La portada se guarda como imagen, no como URL: la biblioteca tiene que
        // seguir funcionando sin conexión.
        const cover = await fetchCover(candidate.coverUrl);
        await onUpdate(book.id, applyMetadata(book, candidate, cover));
        setBusy(false);
        setCandidates(null);
        setNotice('Metadata actualizada.');
    };

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
                    <button
                        type="button"
                        className="detail-cover"
                        onClick={pickCover}
                        disabled={busy}
                        aria-label="Cambiar la portada"
                        style={cover ? undefined : { background: book.color }}
                    >
                        {cover
                            ? <img src={cover} alt="" style={{ width: '100%', display: 'block', aspectRatio: '2/3', objectFit: 'cover' }} />
                            : <span style={{ display: 'block', aspectRatio: '2/3' }} />}
                        <span className="detail-cover-hint">Cambiar</span>
                    </button>

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
                        className="detail-action"
                        onClick={searchOnline}
                        disabled={busy}
                    >
                        <IconSearch size={20} />
                        Metadata
                    </button>
                    <button
                        type="button"
                        className="detail-action"
                        onClick={() => setShowCollections(true)}
                    >
                        <IconFolder size={20} />
                        Colecciones
                    </button>
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

                {busy && <div className="banner" role="status">Buscando…</div>}
                {notice && <div className="banner" role="status">{notice}</div>}

                {candidates && (
                    <section className="section">
                        <div className="section-head">
                            <h3 className="section-title">¿Cuál es este libro?</h3>
                            <button type="button" className="link-btn" onClick={() => setCandidates(null)}>
                                Cancelar
                            </button>
                        </div>
                        <div className="rows">
                            {candidates.map((candidate) => (
                                <button
                                    type="button"
                                    className="row"
                                    key={candidate.key}
                                    onClick={() => applyCandidate(candidate)}
                                >
                                    {candidate.coverUrl && (
                                        <img
                                            src={candidate.coverUrl}
                                            alt=""
                                            style={{ width: 34, borderRadius: 4, flex: 'none' }}
                                            loading="lazy"
                                        />
                                    )}
                                    <span className="row-txt">
                                        <span>{candidate.title}</span>
                                        <span className="row-sub">
                                            {[candidate.author, candidate.year].filter(Boolean).join(' · ')}
                                        </span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {showCollections && (
                    <CollectionsSheet book={book} onClose={() => setShowCollections(false)} />
                )}

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
