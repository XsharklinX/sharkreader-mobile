import React, { useMemo, useState } from 'react';
import BookCard from '../library/BookCard.jsx';
import { selectBooks, FILTERS, SORTS } from '../library/useLibrary.js';

/**
 * Biblioteca: rejilla de portadas con búsqueda, filtros y orden.
 *
 * El estado vive en `useLibrary`, que se instancia una sola vez en App para que
 * cambiar de pestaña no vuelva a leer la base de datos.
 */
export default function LibraryScreen({ library, onOpenBook }) {
    const { books, status, error, importing, importFiles, importFolder, clearError } = library;

    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [sort, setSort] = useState('recent');
    const [showSort, setShowSort] = useState(false);
    const [notice, setNotice] = useState(null);

    const visible = useMemo(
        () => selectBooks(books, { query, filter, sort }),
        [books, query, filter, sort]
    );

    const runImport = async (mode) => {
        const result = mode === 'folder' ? await importFolder() : await importFiles();
        if (result.cancelled || result.error) return;

        const parts = [];
        if (result.imported) parts.push(`${result.imported} importado${result.imported === 1 ? '' : 's'}`);
        if (result.duplicates) parts.push(`${result.duplicates} ya estaban`);
        if (result.failed) parts.push(`${result.failed} con error`);
        setNotice(parts.length ? parts.join(' · ') : 'No se encontraron libros.');
        setTimeout(() => setNotice(null), 4000);
    };

    if (status === 'loading') {
        return (
            <div className="screen">
                <div className="empty">
                    <span className="empty-emoji" aria-hidden="true">🦈</span>
                    <p className="empty-body">Abriendo la biblioteca…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="screen">
            <header className="lib-head">
                <div>
                    <h1 className="screen-title">Biblioteca</h1>
                    <p className="screen-sub">
                        {books.length === 0 ? 'Sin libros todavía' :
                            `${books.length} libro${books.length === 1 ? '' : 's'}` +
                            (visible.length !== books.length ? ` · ${visible.length} visible${visible.length === 1 ? '' : 's'}` : '')}
                    </p>
                </div>
                <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setShowSort((open) => !open)}
                    aria-expanded={showSort}
                    aria-label="Cambiar orden"
                >
                    ⇅
                </button>
            </header>

            {showSort && (
                <div className="sortbar" role="group" aria-label="Ordenar por">
                    {Object.entries(SORTS).map(([id, option]) => (
                        <button
                            key={id}
                            type="button"
                            className={`pill-btn${sort === id ? ' on' : ''}`}
                            onClick={() => { setSort(id); setShowSort(false); }}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            )}

            {books.length > 0 && (
                <>
                    <input
                        type="search"
                        className="search"
                        placeholder="Buscar título, autor o etiqueta…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        aria-label="Buscar en la biblioteca"
                    />

                    <div className="pills" role="group" aria-label="Filtrar biblioteca">
                        {Object.entries(FILTERS).map(([id, option]) => (
                            <button
                                key={id}
                                type="button"
                                className={`pill-btn${filter === id ? ' on' : ''}`}
                                onClick={() => setFilter(id)}
                                aria-pressed={filter === id}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </>
            )}

            {error && (
                <div className="banner banner-error" role="alert">
                    <span>{error}</span>
                    <button type="button" className="banner-close" onClick={clearError} aria-label="Cerrar">×</button>
                </div>
            )}

            {notice && <div className="banner" role="status">{notice}</div>}

            {importing && (
                <div className="banner" role="status">
                    {importing.phase === 'picking'
                        ? 'Esperando a que elijas…'
                        : `Importando ${importing.done} de ${importing.total}${importing.name ? ` — ${importing.name}` : ''}`}
                    {importing.total > 0 && (
                        <span className="banner-bar" aria-hidden="true">
                            <i style={{ width: `${Math.round((importing.done / importing.total) * 100)}%` }} />
                        </span>
                    )}
                </div>
            )}

            {books.length === 0 ? (
                <div className="empty">
                    <span className="empty-emoji" aria-hidden="true">🦈</span>
                    <h2 className="empty-title">Tu biblioteca está vacía</h2>
                    <p className="empty-body">
                        Importa los EPUB y PDF que ya tengas en el móvil. Se copian dentro
                        de la app, así que siguen funcionando aunque muevas los originales.
                    </p>
                    <div className="empty-actions">
                        <button type="button" className="btn btn-primary" onClick={() => runImport('files')} disabled={!!importing}>
                            Elegir libros
                        </button>
                        <button type="button" className="btn" onClick={() => runImport('folder')} disabled={!!importing}>
                            Importar carpeta
                        </button>
                    </div>
                </div>
            ) : visible.length === 0 ? (
                <div className="empty">
                    <span className="empty-emoji" aria-hidden="true">🔍</span>
                    <h2 className="empty-title">Nada coincide</h2>
                    <p className="empty-body">Prueba con otra búsqueda o quita el filtro.</p>
                    <button type="button" className="btn" onClick={() => { setQuery(''); setFilter('all'); }}>
                        Limpiar filtros
                    </button>
                </div>
            ) : (
                <div className="grid-books">
                    {visible.map((book) => (
                        <BookCard key={book.id} book={book} onOpen={onOpenBook} />
                    ))}
                </div>
            )}

            {books.length > 0 && (
                <button
                    type="button"
                    className="fab"
                    onClick={() => runImport('files')}
                    disabled={!!importing}
                    aria-label="Importar libros"
                >
                    +
                </button>
            )}
        </div>
    );
}
