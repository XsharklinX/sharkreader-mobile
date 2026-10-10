import React, { useState } from 'react';
import {
    IconStar, IconCheck, IconShare, IconTrash, IconBook, IconSearch,
    IconFolder, IconClose, IconChevronRight,
} from '../ui/icons.jsx';
import { searchMetadata, fetchCover, applyMetadata } from './metadata.js';
import CollectionsSheet from './CollectionsSheet.jsx';
import { resizeCoverDataUrl } from '../core/coverResize.js';
import { usePorts } from '../ports/index.js';
import { formatMinutes, estimateRemaining } from '../stats/derive.js';
import { normalizeDescription } from '../core/epubMeta.js';


/**
 * Ficha de libro.
 *
 * Rediseñada como una **portada grande con su información debajo**, no como una
 * fila de botones pequeños. Un libro se reconoce por su portada, así que es lo
 * primero y lo más grande; la sinopsis va completa —los EPUB la traen y estaba
 * sin usar—, y las acciones se agrupan por lo que hacen: leer, marcar,
 * organizar y editar.
 */
export default function BookSheet({ book, onClose, onOpen, onUpdate, onDelete, onExportNotes }) {
    const ports = usePorts();

    const [confirmDelete, setConfirmDelete] = useState(false);
    const [candidates, setCandidates] = useState(null);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState(null);
    const [showCollections, setShowCollections] = useState(false);
    const [editing, setEditing] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const [draft, setDraft] = useState({
        name: book.name || '',
        author: book.author || '',
        series: book.series || '',
        seriesIndex: book.seriesIndex || '',
        tags: book.tags || '',
        description: book.description || '',
    });

    const done = Math.round((book.progress || 0) * 100);
    const cover = book.coverUrl || book.coverBase64;
    const left = estimateRemaining(book);
    const annotations = book.bookmarks?.length || 0;
    const readable = Boolean(book.sourcePath);

    const tags = String(book.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);

    // La sinopsis de un EPUB llega a menudo con HTML dentro. Se muestra como
    // texto plano: renderizar HTML de un fichero ajeno dentro de la app no
    // compensa por lo poco que aporta.
    //
    // Va por el mismo normalizador que la ficha del lector. Antes tenía su propia
    // limpieza aquí, que borraba las etiquetas sin dejar nada en su sitio y no
    // resolvía las entidades: dos sitios de la app enseñaban la misma sinopsis de
    // dos formas distintas, y esta con `&#160;` sueltos y frases pegadas.
    const synopsis = normalizeDescription(book.description);

    const say = (message) => {
        setNotice(message);
        setTimeout(() => setNotice(null), 4000);
    };

    const saveEdits = async () => {
        const name = draft.name.trim() || book.name;
        const author = draft.author.trim();

        await onUpdate(book.id, {
            // customTitle/customAuthor son lo que distingue un dato editado por
            // el usuario del extraído del fichero: la búsqueda automática de
            // metadata respeta lo personalizado y no lo pisa.
            customTitle: name !== book.originalTitle ? name : '',
            customAuthor: author !== book.originalAuthor ? author : '',
            name,
            author,
            series: draft.series.trim(),
            seriesIndex: Number(draft.seriesIndex) || 0,
            tags: draft.tags.trim(),
            description: draft.description.trim(),
            metadataUpdatedAt: Date.now(),
        });
        setEditing(false);
        say('Cambios guardados.');
    };

    const pickCover = async () => {
        setBusy(true);
        try {
            const { dataUrl } = await ports.filePicker.pickImage();
            if (dataUrl) {
                // Se redimensiona con el mismo módulo que las portadas del EPUB:
                // sin eso, una foto de galería de 4 MB acabaría entera dentro del
                // registro del libro y del backup.
                const resized = await resizeCoverDataUrl(dataUrl);
                await onUpdate(book.id, { customCover: resized, metadataUpdatedAt: Date.now() });
                say('Portada actualizada.');
            }
        } catch (error) {
            say(error?.message || 'No se pudo usar esa imagen.');
        }
        setBusy(false);
    };

    const searchOnline = async () => {
        setBusy(true);
        const { results, offline } = await searchMetadata({
            title: book.originalTitle || book.name,
            author: book.author,
        });
        setBusy(false);

        if (offline) { say('Sin conexión. Esta función necesita internet.'); return; }
        if (results.length === 0) { say('No se ha encontrado nada para este título.'); return; }
        setCandidates(results);
    };

    const applyCandidate = async (candidate) => {
        setBusy(true);
        const coverImage = await fetchCover(candidate.coverUrl);
        await onUpdate(book.id, applyMetadata(book, candidate, coverImage));
        setBusy(false);
        setCandidates(null);
        say('Información actualizada.');
    };

    const FIELDS = [
        { key: 'name', label: 'Título' },
        { key: 'author', label: 'Autor' },
        { key: 'series', label: 'Serie' },
        { key: 'seriesIndex', label: 'Número en la serie', type: 'number' },
        { key: 'tags', label: 'Etiquetas, separadas por comas' },
    ];

    return (
        <div className="scrim" onClick={onClose} role="presentation">
            <section
                className="sheet book-sheet"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label={`Información de ${book.name}`}
            >
                <span className="grip" aria-hidden="true" />

                {/* ── La portada manda ── */}
                <header className="bs-hero">
                    <button
                        type="button"
                        className="bs-cover"
                        onClick={pickCover}
                        disabled={busy}
                        aria-label="Cambiar la portada"
                        style={cover ? undefined : { background: book.color }}
                    >
                        {cover
                            ? <img src={cover} alt="" />
                            : <span className="bs-cover-fallback">{book.name}</span>}
                        <span className="bs-cover-edit">Cambiar portada</span>
                    </button>

                    <h2 className="bs-title">{book.name}</h2>
                    <p className="bs-author">{book.author}</p>

                    <div className="bs-chips">
                        <span className="tag">{(book.type || 'epub').toUpperCase()}</span>
                        {book.series && (
                            <span className="tag">
                                {book.series}{book.seriesIndex ? ` #${book.seriesIndex}` : ''}
                            </span>
                        )}
                        {book.publisher && <span className="tag">{book.publisher}</span>}
                    </div>
                </header>

                {notice && <div className="banner" role="status">{notice}</div>}
                {busy && <div className="banner" role="status">Un momento…</div>}

                <div className="bs-progress">
                    <div className="goal-head">
                        <span>{book.isFinished ? 'Terminado' : done > 0 ? `${done}% leído` : 'Sin empezar'}</span>
                        <span className="mono">{left ? `quedan ${formatMinutes(left)}` : ''}</span>
                    </div>
                    <span className="bar">
                        <i className={book.isFinished ? 'ok' : ''} style={{ width: `${done}%` }} />
                    </span>
                    <div className="bs-stats">
                        <span><b className="mono">{formatMinutes(book.readingMinutes || 0)}</b> leídos</span>
                        <span><b className="mono">{annotations}</b> anotaciones</span>
                    </div>
                </div>

                {readable ? (
                    <button type="button" className="btn btn-primary btn-block" onClick={() => onOpen(book)}>
                        <IconBook size={18} />
                        {done > 0 ? 'Seguir leyendo' : 'Empezar a leer'}
                    </button>
                ) : (
                    <div className="banner banner-error">
                        Este libro vino de un backup: tienes su progreso y sus anotaciones,
                        pero falta el fichero. Impórtalo para poder abrirlo.
                    </div>
                )}

                {editing ? (
                    <section className="bs-section">
                        <h3 className="bs-heading">Editar información</h3>
                        <div className="bs-form">
                            {FIELDS.map((field) => (
                                <label className="bs-field" key={field.key}>
                                    <span className="option-desc">{field.label}</span>
                                    <div className="search">
                                        <input
                                            type={field.type || 'text'}
                                            value={draft[field.key]}
                                            onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                                            aria-label={field.label}
                                        />
                                    </div>
                                </label>
                            ))}
                            <label className="bs-field">
                                <span className="option-desc">Sinopsis</span>
                                <textarea
                                    className="note-input"
                                    rows={5}
                                    value={draft.description}
                                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                                    aria-label="Sinopsis"
                                />
                            </label>
                        </div>
                        <div className="sheet-actions">
                            <button type="button" className="btn" onClick={() => setEditing(false)}>Cancelar</button>
                            <button type="button" className="btn btn-primary" onClick={saveEdits}>Guardar</button>
                        </div>
                    </section>
                ) : (
                    <>
                        {synopsis && (
                            <section className="bs-section">
                                <h3 className="bs-heading">Sinopsis</h3>
                                <p className={`bs-synopsis${expanded ? ' open' : ''}`}>{synopsis}</p>
                                {synopsis.length > 220 && (
                                    <button type="button" className="link-btn bs-more" onClick={() => setExpanded((v) => !v)}>
                                        {expanded ? 'Ver menos' : 'Ver más'}
                                    </button>
                                )}
                            </section>
                        )}

                        {/* Notas sueltas del libro. Las llena, por ejemplo, traer
                            subrayados de otra app cuando alguno no se encuentra
                            en el texto: no se pierden, quedan aquí. */}
                        {book.notes?.trim() && (
                            <section className="bs-section">
                                <h3 className="bs-heading">Notas</h3>
                                <p className="bs-synopsis open bs-notas">{book.notes}</p>
                            </section>
                        )}

                        {tags.length > 0 && (
                            <section className="bs-section">
                                <h3 className="bs-heading">Etiquetas</h3>
                                <div className="bs-chips">
                                    {tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
                                </div>
                            </section>
                        )}

                        <div className="bs-toggles">
                            <button
                                type="button"
                                className={`bs-toggle${book.isFav ? ' on' : ''}`}
                                onClick={() => onUpdate(book.id, { isFav: !book.isFav })}
                                aria-pressed={book.isFav}
                            >
                                <IconStar size={20} filled={book.isFav} />
                                Favorito
                            </button>
                            <button
                                type="button"
                                className={`bs-toggle${book.isFinished ? ' on' : ''}`}
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
                        </div>

                        <div className="rows">
                            <button type="button" className="row" onClick={() => setEditing(true)}>
                                <span className="row-icon"><IconBook size={19} /></span>
                                <span className="row-txt">
                                    <span>Editar información</span>
                                    <span className="row-sub">Título, autor, serie, etiquetas y sinopsis</span>
                                </span>
                                <IconChevronRight size={18} />
                            </button>
                            <button type="button" className="row" onClick={searchOnline} disabled={busy}>
                                <span className="row-icon"><IconSearch size={19} /></span>
                                <span className="row-txt">
                                    <span>Buscar información online</span>
                                    <span className="row-sub">Portada y datos desde OpenLibrary</span>
                                </span>
                                <IconChevronRight size={18} />
                            </button>
                            <button type="button" className="row" onClick={() => setShowCollections(true)}>
                                <span className="row-icon"><IconFolder size={19} /></span>
                                <span className="row-txt"><span>Colecciones</span></span>
                                <IconChevronRight size={18} />
                            </button>
                            <button
                                type="button"
                                className="row"
                                onClick={() => onExportNotes(book)}
                                disabled={annotations === 0}
                            >
                                <span className="row-icon"><IconShare size={19} /></span>
                                <span className="row-txt">
                                    <span>Exportar anotaciones</span>
                                    <span className="row-sub">
                                        {annotations === 0 ? 'Todavía no hay ninguna' : `${annotations} en Markdown`}
                                    </span>
                                </span>
                                <IconChevronRight size={18} />
                            </button>
                            <button type="button" className="row" onClick={() => setConfirmDelete(true)}>
                                <span className="row-icon" style={{ color: 'var(--risk)' }}><IconTrash size={19} /></span>
                                <span className="row-txt">
                                    <span style={{ color: 'var(--risk)' }}>Borrar de la biblioteca</span>
                                </span>
                            </button>
                        </div>
                    </>
                )}

                {candidates && (
                    <section className="bs-section">
                        <div className="section-head">
                            <h3 className="bs-heading">¿Cuál es este libro?</h3>
                            <button type="button" className="icon-btn" onClick={() => setCandidates(null)} aria-label="Cancelar">
                                <IconClose size={18} />
                            </button>
                        </div>
                        <div className="rows">
                            {candidates.map((candidate) => (
                                <button type="button" className="row" key={candidate.key} onClick={() => applyCandidate(candidate)}>
                                    {candidate.coverUrl && (
                                        <img src={candidate.coverUrl} alt="" className="bs-candidate-cover" loading="lazy" />
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
                            <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>Cancelar</button>
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
