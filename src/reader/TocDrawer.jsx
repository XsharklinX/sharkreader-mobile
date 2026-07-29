import React, { useEffect, useRef, useState } from 'react';

/**
 * Índice y búsqueda dentro del libro, en un panel deslizante.
 *
 * Las dos cosas comparten panel porque responden a la misma intención — "llévame
 * a otro sitio del libro" — y en una pantalla de móvil no hay hueco para dos
 * paneles distintos.
 */
export default function TocDrawer({ toc, onSelect, onClose, onSearch }) {
    const [tab, setTab] = useState('toc');
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        if (tab === 'search') inputRef.current?.focus();
    }, [tab]);

    const runSearch = async (event) => {
        event.preventDefault();
        const needle = query.trim();
        if (needle.length < 2) return;
        setSearching(true);
        const found = await onSearch(needle);
        setResults(found);
        setSearching(false);
    };

    const filteredToc = query.trim() && tab === 'toc'
        ? toc.filter((entry) => entry.label.toLowerCase().includes(query.trim().toLowerCase()))
        : toc;

    return (
        <div className="sheet-backdrop" onClick={onClose} role="presentation">
            <aside
                className="drawer"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label="Índice y búsqueda"
            >
                <div className="drawer-tabs">
                    <button
                        type="button"
                        className={`pill-btn${tab === 'toc' ? ' on' : ''}`}
                        onClick={() => setTab('toc')}
                    >
                        Índice
                    </button>
                    <button
                        type="button"
                        className={`pill-btn${tab === 'search' ? ' on' : ''}`}
                        onClick={() => setTab('search')}
                    >
                        Buscar
                    </button>
                    <button type="button" className="icon-btn ghost" onClick={onClose} aria-label="Cerrar">×</button>
                </div>

                <form onSubmit={runSearch}>
                    <input
                        ref={inputRef}
                        type="search"
                        className="search"
                        placeholder={tab === 'toc' ? 'Filtrar capítulos…' : 'Buscar en el libro…'}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        aria-label={tab === 'toc' ? 'Filtrar capítulos' : 'Buscar en el libro'}
                    />
                </form>

                <div className="drawer-list">
                    {tab === 'toc' ? (
                        filteredToc.length === 0 ? (
                            <p className="drawer-empty">
                                {toc.length === 0 ? 'Este libro no trae índice.' : 'Ningún capítulo coincide.'}
                            </p>
                        ) : (
                            filteredToc.map((entry) => (
                                <button
                                    key={entry.id}
                                    type="button"
                                    className="drawer-item"
                                    style={{ paddingLeft: `${12 + entry.depth * 14}px` }}
                                    onClick={() => onSelect(entry.href)}
                                >
                                    {entry.label || '(sin título)'}
                                </button>
                            ))
                        )
                    ) : searching ? (
                        <p className="drawer-empty">Buscando…</p>
                    ) : results.length === 0 ? (
                        <p className="drawer-empty">
                            {query.trim().length < 2
                                ? 'Escribe al menos dos letras y pulsa intro.'
                                : 'Sin resultados.'}
                        </p>
                    ) : (
                        <>
                            <p className="drawer-count mono">{results.length} resultados</p>
                            {results.map((result, index) => (
                                <button
                                    key={`${result.cfi}-${index}`}
                                    type="button"
                                    className="drawer-item drawer-result"
                                    onClick={() => onSelect(result.cfi)}
                                >
                                    …{result.excerpt.trim()}…
                                </button>
                            ))}
                        </>
                    )}
                </div>
            </aside>
        </div>
    );
}
