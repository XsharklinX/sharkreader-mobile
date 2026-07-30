import React, { useEffect, useMemo, useRef, useState } from 'react';
import { IconSearch, IconClose, IconBookmark } from '../ui/icons.jsx';
import { normalizeAnnotationKind, normalizeAnnotationText } from '../core/annotationExport.js';

/**
 * Índice, búsqueda y marcadores.
 *
 * Los tres responden a la misma intención —«llévame a otro sitio del libro»— y
 * en móvil no hay hueco para tres paneles distintos. Los marcadores estaban
 * enterrados en el panel de anotaciones junto a subrayados y notas, que es donde
 * uno *revisa* lo que ha marcado; para *navegar* hacen falta aquí, al lado del
 * índice.
 */
export default function TocDrawer({
    toc, initialTab = 'toc', currentChapter, bookmarks = [],
    onSelect, onClose, onSearch, onOpenAnnotations, annotationCount = 0,
}) {
    const [tab, setTab] = useState(initialTab);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [found, setFound] = useState(0);
    const inputRef = useRef(null);

    useEffect(() => {
        if (tab === 'search') inputRef.current?.focus();
    }, [tab]);

    const runSearch = async (event) => {
        event.preventDefault();
        const needle = query.trim();
        if (needle.length < 2) return;
        setSearching(true);
        setFound(0);
        setResults(await onSearch(needle, { onProgress: setFound }));
        setSearching(false);
    };

    const filteredToc = query.trim() && tab === 'toc'
        ? toc.filter((entry) => entry.label.toLowerCase().includes(query.trim().toLowerCase()))
        : toc;

    // Solo marcadores: los subrayados y las notas viven en su propio panel.
    // Del más reciente al más antiguo, que es el orden en que se buscan.
    const marks = useMemo(
        () => bookmarks
            .filter((bookmark) => normalizeAnnotationKind(bookmark) === 'bookmark')
            .slice()
            .reverse(),
        [bookmarks]
    );

    return (
        <div className="scrim" onClick={onClose} role="presentation">
            <aside
                className="drawer"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label="Índice, búsqueda y marcadores"
            >
                <div className="drawer-head">
                    <div className="segmented" style={{ flex: 1 }}>
                        <button type="button" className={tab === 'toc' ? 'on' : ''} onClick={() => setTab('toc')}>
                            Índice
                        </button>
                        <button type="button" className={tab === 'search' ? 'on' : ''} onClick={() => setTab('search')}>
                            Buscar
                        </button>
                        <button type="button" className={tab === 'marks' ? 'on' : ''} onClick={() => setTab('marks')}>
                            Marcadores
                            {marks.length > 0 && <span className="pill-count">{marks.length}</span>}
                        </button>
                    </div>
                    <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
                        <IconClose size={20} />
                    </button>
                </div>

                {tab !== 'marks' && (
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
                )}

                <div className="drawer-list">
                    {tab === 'toc' && (
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
                    )}

                    {tab === 'search' && (
                        searching ? (
                            <p className="drawer-empty">
                                Buscando en todo el libro…
                                {found > 0 && ` ${found} hasta ahora.`}
                            </p>
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
                                        {/* Sin el capítulo, cuarenta resultados
                                            se parecen todos: todos contienen la
                                            palabra buscada. Lo que los
                                            distingue es dónde están. */}
                                        {result.chapter && (
                                            <span className="result-chapter">{result.chapter}</span>
                                        )}
                                        <span className="result-excerpt">…{result.excerpt.trim()}…</span>
                                    </button>
                                ))}
                            </>
                        )
                    )}

                    {tab === 'marks' && (
                        <>
                        {/* Notas y subrayados están una capa más adentro, no en la
                            barra de arriba: allí eran uno de seis iconos del mismo
                            peso, y aquí quedan junto a las marcas, que es la otra
                            mitad de lo mismo —lo que has dejado señalado en el
                            libro—. */}
                        {onOpenAnnotations && (
                            <button
                                type="button"
                                className="drawer-item drawer-more"
                                onClick={onOpenAnnotations}
                            >
                                <span>Notas y subrayados</span>
                                {annotationCount > 0 && <b>{annotationCount}</b>}
                            </button>
                        )}
                        {marks.length === 0 ? (
                            <p className="drawer-empty">
                                Todavía no has puesto ningún marcador. Toca el centro
                                de la pantalla y usa el icono de marcador para dejar
                                uno donde vayas.
                            </p>
                        ) : (
                            marks.map((bookmark, index) => (
                                <button
                                    key={`${bookmark.cfi}-${index}`}
                                    type="button"
                                    className="drawer-item drawer-result"
                                    onClick={() => onSelect(bookmark.cfi)}
                                >
                                    <span className="result-chapter">
                                        <IconBookmark size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
                                        {bookmark.date}
                                    </span>
                                    <span className="result-excerpt">
                                        {normalizeAnnotationText(bookmark) || 'Marcador'}
                                    </span>
                                </button>
                            ))
                        )}
                        </>
                    )}
                </div>
            </aside>
        </div>
    );
}
