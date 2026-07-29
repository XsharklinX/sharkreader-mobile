import React, { useEffect, useState } from 'react';
import {
    loadCollections, createCollection, deleteCollection,
    renameCollection, toggleBookInCollection,
} from './collections.js';
import { usePorts } from '../ports/index.js';
import { IconClose, IconPlus, IconCheck, IconTrash } from '../ui/icons.jsx';

const EMOJIS = ['📚', '⭐', '🔥', '🌙', '🎯', '🧠', '💼', '🌱', '🗺️', '🎭'];

/**
 * Colecciones de un libro.
 *
 * Se abre desde la ficha del libro y muestra todas las colecciones con una
 * marca en las que ya lo contienen. Añadir y quitar es el mismo toque, que es
 * más rápido que entrar en cada colección a gestionar su lista.
 */
export default function CollectionsSheet({ book, onClose, onChange }) {
    const ports = usePorts();
    const [collections, setCollections] = useState([]);
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState('');
    const [emoji, setEmoji] = useState(EMOJIS[0]);

    useEffect(() => {
        loadCollections(ports.storage).then(setCollections).catch(() => {});
    }, [ports]);

    const apply = (next) => {
        setCollections(next);
        onChange?.(next);
    };

    const create = async () => {
        if (!name.trim()) return;
        const next = await createCollection(ports.storage, { name, emoji });
        // La colección recién creada ya incluye el libro desde el que se creó:
        // es lo que el usuario esperaba al pulsar «crear» desde aquí.
        const created = next[next.length - 1];
        apply(await toggleBookInCollection(ports.storage, created.id, book.id));
        setCreating(false);
        setName('');
    };

    return (
        <div className="scrim" onClick={onClose} role="presentation">
            <section
                className="sheet"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label="Colecciones"
            >
                <span className="grip" aria-hidden="true" />

                <div className="drawer-head">
                    <h2 className="section-title">Colecciones</h2>
                    <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
                        <IconClose size={20} />
                    </button>
                </div>

                {collections.length === 0 && !creating && (
                    <p className="card-body">
                        Todavía no tienes ninguna colección. Sirven para agrupar libros a tu
                        manera: por tema, por pendiente, por lo que quieras.
                    </p>
                )}

                {collections.length > 0 && (
                    <div className="rows">
                        {collections.map((collection) => {
                            const has = collection.bookIds.includes(book.id);
                            return (
                                <div className="row" key={collection.id}>
                                    <button
                                        type="button"
                                        className="row"
                                        style={{ padding: 0, minHeight: 'auto', background: 'none' }}
                                        onClick={async () => apply(
                                            await toggleBookInCollection(ports.storage, collection.id, book.id)
                                        )}
                                        aria-pressed={has}
                                    >
                                        <span className="row-icon" style={{ fontSize: 18 }}>{collection.emoji}</span>
                                        <span className="row-txt">
                                            <span>{collection.name}</span>
                                            <span className="row-sub">
                                                {collection.bookIds.length} libro{collection.bookIds.length === 1 ? '' : 's'}
                                            </span>
                                        </span>
                                        {has && <span style={{ color: 'var(--accent)' }}><IconCheck size={19} /></span>}
                                    </button>
                                    <button
                                        type="button"
                                        className="icon-btn"
                                        style={{ minWidth: 40 }}
                                        onClick={async () => apply(await deleteCollection(ports.storage, collection.id))}
                                        aria-label={`Borrar la colección ${collection.name}`}
                                    >
                                        <IconTrash size={17} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {creating ? (
                    <div className="card" style={{ background: 'var(--sf-2)' }}>
                        <div className="search">
                            <input
                                type="text"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                placeholder="Nombre de la colección"
                                aria-label="Nombre de la colección"
                                maxLength={40}
                                autoFocus
                            />
                        </div>
                        <div className="pills">
                            {EMOJIS.map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    className={`pill${emoji === option ? ' on' : ''}`}
                                    onClick={() => setEmoji(option)}
                                    aria-label={`Emoji ${option}`}
                                >
                                    {option}
                                </button>
                            ))}
                        </div>
                        <div className="sheet-actions">
                            <button type="button" className="btn" onClick={() => setCreating(false)}>
                                Cancelar
                            </button>
                            <button type="button" className="btn btn-primary" onClick={create} disabled={!name.trim()}>
                                Crear
                            </button>
                        </div>
                    </div>
                ) : (
                    <button type="button" className="btn btn-block" onClick={() => setCreating(true)}>
                        <IconPlus size={18} /> Nueva colección
                    </button>
                )}
            </section>
        </div>
    );
}
