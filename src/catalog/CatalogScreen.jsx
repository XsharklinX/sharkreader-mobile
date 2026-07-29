import React, { useState } from 'react';
import { useCatalog } from './useCatalog.js';
import { useBackHandler } from '../ui/useBackHandler.js';
import {
    IconArrowLeft, IconClose, IconFolder, IconBook, IconPlus, IconTrash, IconDownload,
} from '../ui/icons.jsx';

/**
 * Catálogos OPDS y Calibre.
 *
 * Dos pantallas en una: la lista de servidores guardados y, al entrar en uno, la
 * navegación por su árbol. Van juntas porque un catálogo se abre para buscar un
 * libro concreto y descargarlo, no para quedarse a vivir en él — separarlas en
 * dos pestañas obligaría a volver atrás para cambiar de servidor.
 */
export default function CatalogScreen({ onImport, onClose }) {
    const catalog = useCatalog();
    const [adding, setAdding] = useState(false);
    const [notice, setNotice] = useState(null);

    // Atrás sube un nivel del catálogo antes de cerrar la pantalla. Cerrar de
    // golpe desde dentro de una carpeta obligaría a rehacer todo el camino.
    useBackHandler(() => {
        if (adding) { setAdding(false); return true; }
        if (catalog.feed) {
            catalog.goUp().then((moved) => { if (!moved) catalog.close(); });
            return true;
        }
        return false;
    });

    const importEntry = async (entry) => {
        const result = await catalog.download(entry, onImport);
        setNotice(result.ok
            ? `«${entry.title}» está en tu biblioteca.`
            : result.error);
    };

    if (adding) {
        return <AddServer catalog={catalog} onDone={() => setAdding(false)} />;
    }

    // ── Dentro de un catálogo ────────────────────────────────────────────────
    if (catalog.feed) {
        return (
            <div className="screen">
                <header className="screen-head">
                    <button
                        type="button"
                        className="icon-btn"
                        onClick={() => catalog.goUp().then((moved) => { if (!moved) catalog.close(); })}
                        aria-label="Volver"
                    >
                        <IconArrowLeft size={22} />
                    </button>
                    <h1 className="screen-title">{catalog.feed.title}</h1>
                </header>

                {notice && (
                    <p className="notice" onClick={() => setNotice(null)} role="status">{notice}</p>
                )}
                {catalog.error && <p className="warn-note">{catalog.error}</p>}

                <div className="rows">
                    {catalog.feed.entries.map((entry) => (
                        <article className="catalog-row" key={entry.id}>
                            <button
                                type="button"
                                className="catalog-main"
                                onClick={() => (entry.kind === 'folder'
                                    ? catalog.open(entry.navigate)
                                    : importEntry(entry))}
                                disabled={catalog.downloading === entry.id}
                            >
                                <span className="catalog-icon">
                                    {entry.kind === 'folder' ? <IconFolder size={20} /> : <IconBook size={20} />}
                                </span>
                                <span className="catalog-txt">
                                    <span className="catalog-title">{entry.title}</span>
                                    {entry.author && <span className="catalog-author">{entry.author}</span>}
                                    {entry.summary && <span className="catalog-summary">{entry.summary}</span>}
                                </span>
                                {entry.kind === 'book' && (
                                    <span className="catalog-action">
                                        {catalog.downloading === entry.id
                                            ? <span className="spinner" aria-label="Descargando" />
                                            : <IconDownload size={18} />}
                                    </span>
                                )}
                            </button>
                        </article>
                    ))}
                </div>

                {catalog.loading && <p className="drawer-empty">Cargando…</p>}

                {/* Los catálogos grandes vienen paginados: sin esto solo se
                    vería la primera página de una biblioteca de miles. */}
                {catalog.feed.nextPage && !catalog.loading && (
                    <button type="button" className="btn btn-block" onClick={catalog.loadMore}>
                        Cargar más
                    </button>
                )}

                {catalog.feed.entries.length === 0 && !catalog.loading && (
                    <p className="drawer-empty">Esta sección del catálogo está vacía.</p>
                )}
            </div>
        );
    }

    // ── Lista de servidores ──────────────────────────────────────────────────
    return (
        <div className="screen">
            <header className="screen-head">
                <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
                    <IconClose size={22} />
                </button>
                <h1 className="screen-title">Catálogos</h1>
                <button type="button" className="icon-btn" onClick={() => setAdding(true)} aria-label="Añadir servidor">
                    <IconPlus size={22} />
                </button>
            </header>

            {catalog.error && <p className="warn-note">{catalog.error}</p>}

            {catalog.servers.length === 0 ? (
                <div className="empty">
                    <span className="empty-art"><IconFolder size={34} /></span>
                    <h2 className="empty-title">Sin catálogos</h2>
                    <p className="empty-body">
                        Conecta tu servidor de Calibre o cualquier catálogo OPDS para
                        traerte libros que ya son tuyos. SharkReader no aloja ni
                        distribuye libros: solo se conecta a donde tú le digas.
                    </p>
                    <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                        Añadir un catálogo
                    </button>
                </div>
            ) : (
                <div className="rows">
                    {catalog.servers.map((server) => (
                        <div className="row" key={server.id}>
                            <button
                                type="button"
                                className="row-txt catalog-server"
                                onClick={() => catalog.open(server.url, {
                                    user: server.user,
                                    password: server.password,
                                })}
                            >
                                <span>{server.name}</span>
                                <span className="option-desc">{server.url}</span>
                            </button>
                            <button
                                type="button"
                                className="icon-btn"
                                onClick={() => catalog.removeServer(server.id)}
                                aria-label={`Quitar ${server.name}`}
                            >
                                <IconTrash size={18} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/** Alta de un servidor. Se comprueba la conexión antes de guardarlo. */
function AddServer({ catalog, onDone }) {
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const [user, setUser] = useState('');
    const [password, setPassword] = useState('');
    const [checking, setChecking] = useState(false);
    const [failure, setFailure] = useState(null);

    const submit = async (event) => {
        event.preventDefault();
        setChecking(true);
        setFailure(null);
        try {
            await catalog.addServer(name, url, { user, password });
            onDone();
        } catch (error) {
            setFailure(error?.message || 'No se pudo conectar.');
        } finally {
            setChecking(false);
        }
    };

    return (
        <div className="screen">
            <header className="screen-head">
                <button type="button" className="icon-btn" onClick={onDone} aria-label="Cancelar">
                    <IconArrowLeft size={22} />
                </button>
                <h1 className="screen-title">Añadir catálogo</h1>
            </header>

            <form onSubmit={submit} className="form">
                <label className="field">
                    <span className="field-label">Dirección</span>
                    <input
                        className="text-input"
                        type="url"
                        inputMode="url"
                        autoCapitalize="none"
                        placeholder="192.168.1.40:8080"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        required
                    />
                    <span className="option-desc">
                        Si pones solo la dirección del servidor de Calibre, se busca su
                        catálogo en /opds automáticamente.
                    </span>
                </label>

                <label className="field">
                    <span className="field-label">Nombre</span>
                    <input
                        className="text-input"
                        type="text"
                        placeholder="Mi Calibre"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                    />
                </label>

                <label className="field">
                    <span className="field-label">Usuario</span>
                    <input
                        className="text-input"
                        type="text"
                        autoCapitalize="none"
                        value={user}
                        onChange={(event) => setUser(event.target.value)}
                    />
                    <span className="option-desc">Déjalo vacío si el servidor no pide identificación.</span>
                </label>

                <label className="field">
                    <span className="field-label">Contraseña</span>
                    <input
                        className="text-input"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                    />
                </label>

                {failure && <p className="warn-note">{failure}</p>}

                <button type="submit" className="btn btn-primary btn-block" disabled={checking}>
                    {checking ? 'Comprobando…' : 'Conectar y guardar'}
                </button>
            </form>
        </div>
    );
}
