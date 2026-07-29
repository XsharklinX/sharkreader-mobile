import React, { useEffect, useRef, useState } from 'react';
import { IconSearch, IconClose } from '../ui/icons.jsx';

/**
 * Índice y búsqueda dentro del libro.
 *
 * Comparten panel porque responden a la misma intención —«llévame a otro sitio
 * del libro»— y en móvil no hay hueco para dos paneles distintos. El capítulo
 * actual va marcado, que es lo primero que se busca al abrir un índice.
 */
export default function TocDrawer({ toc, initialTab = 'toc', currentChapter, onSelect, onClose, onSearch }) {
    const [tab, setTab] = useState(initialTab);
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
        setResults(await onSearch(needle));
        setSearching(false);
    };

    const filteredToc = query.trim() && tab === 'toc'
        ? toc.filter((entry) => entry.label.toLowerCase().includes(query.trim().toLowerCase()))
        : toc;

    return (
        <div className="scrim" onClick={onClose} role="presentation">
            <aside
                className="drawer"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label="Índice y búsqueda"
            >
                <div className="drawer-head">
                    <div className="segmented" style={{ flex: 1 }}>
                        <button type="button" className={tab === 'toc' ? 'on' : ''} onClick={() => setTab('toc')}>
                            Índice
                        </button>
                        <button type="button" className={tab === 'search' ? 'on' : ''} onClick={() => setTab('search')}>
                            Buscar
                        </button>
                    </div>
                    <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
                        <IconClose size={20} />
                    </button>
                </div>

                <form onSubmit={runSearch} className="search">
                    <IconSearch size={18} />
                    <input
                        ref={inputRef}
                        type="search"
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
                                    className={`drawer-item${entry.label === currentChapter ? ' current' : ''}`}
                                    style={{ paddingLeft: `${12 + entry.depth * 14}px` }}
                                    onClick={() => onSelect(entry.href)}
                                >
                                    {entry.label || '(sin título)'}
                                </button>
                            ))
                        )
                    ) : searching ? (
                        <p className="drawer-empty">Buscando en todo el libro…</p>
                    ) : results.length === 0 ? (
                        <p className="drawer-empty">
                            {query.trim().length < 2
                                ? 'Escribe al menos dos letras y pulsa intro.'
                                : 'Sin resultados.'}
                        </p>
                    ) : (
                        <>
                            <p className="drawer-empty" style={{ padding: 'var(--sp-2) var(--sp-3)' }}>
                                {results.length} resultado{results.length === 1 ? '' : 's'}
                            </p>
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
