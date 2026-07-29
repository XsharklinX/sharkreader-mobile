import React, { useMemo, useState } from 'react';
import BookCard from '../library/BookCard.jsx';
import ContinueCard from '../library/ContinueCard.jsx';
import BookSheet from '../library/BookSheet.jsx';
import Sharky from '../ui/Sharky.jsx';
import { selectBooks, FILTERS, SORTS } from '../library/useLibrary.js';
import { minutesToday } from '../stats/derive.js';
import { buildSeries } from '../library/collections.js';
import {
    IconSearch, IconSort, IconPlus, IconClose, IconBook, IconFolder, IconGrid, IconSettings,
} from '../ui/icons.jsx';

const greeting = (hour = new Date().getHours()) => {
    if (hour < 6) return 'Buenas noches';
    if (hour < 13) return 'Buenos días';
    if (hour < 21) return 'Buenas tardes';
    return 'Buenas noches';
};

export default function LibraryScreen({ library, stats: statsApi, onOpenBook, onGoToSettings }) {
    const { books, status, error, importing, importFiles, importFolder, clearError } = library;

    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [filter, setFilter] = useState('all');
    const [sort, setSort] = useState('recent');
    const [showSort, setShowSort] = useState(false);
    const [compact, setCompact] = useState(false);
    const [detail, setDetail] = useState(null);
    const [notice, setNotice] = useState(null);

    const browsing = Boolean(query.trim()) || filter !== 'all';

    const visible = useMemo(
        () => selectBooks(books, { query, filter, sort }),
        [books, query, filter, sort]
    );

    // El libro activo es el último tocado que no esté terminado.
    const current = useMemo(
        () => books
            .filter((book) => (book.progress || 0) > 0 && !book.isFinished && book.sourcePath)
            .sort((a, b) => (b.lastReadDate || 0) - (a.lastReadDate || 0))[0] || null,
        [books]
    );

    const series = useMemo(() => buildSeries(books), [books]);

    const started = useMemo(
        () => books
            .filter((book) => (book.progress || 0) > 0 && !book.isFinished && book.id !== current?.id)
            .sort((a, b) => (b.lastReadDate || 0) - (a.lastReadDate || 0)),
        [books, current]
    );

    const runImport = async (mode) => {
        const result = mode === 'folder' ? await importFolder() : await importFiles();
        if (result.cancelled || result.error) return;
        const parts = [];
        if (result.imported) parts.push(`${result.imported} importado${result.imported === 1 ? '' : 's'}`);
        if (result.duplicates) parts.push(`${result.duplicates} ya estaban`);
        if (result.failed) parts.push(`${result.failed} con error`);
        setNotice(parts.length ? parts.join(' · ') : 'No se encontraron libros.');
        setTimeout(() => setNotice(null), 4500);
    };

    const sharkyOn = statsApi?.preferences?.sharky ?? false;

    /**
     * Tocar una portada abre el libro directamente. La ficha pasa a la pulsación
     * larga: obligar a pasar por ella para leer añadía un paso a la acción más
     * frecuente de la app, y cualquier fallo en ese intermediario dejaba la
     * biblioteca sin forma de abrir nada.
     */
    const openBook = (book) => {
        if (!book.sourcePath) {
            // Un libro que vino de un backup no trae el fichero. Decirlo es
            // mejor que no reaccionar al toque.
            setDetail(book);
            return;
        }
        onOpenBook(book);
    };

    if (status === 'loading') {
        return (
            <div className="screen">
                <div className="empty">
                    <span className="empty-art"><IconBook size={38} /></span>
                    <p className="empty-body">Abriendo la biblioteca…</p>
                </div>
            </div>
        );
    }

    if (books.length === 0) {
        return (
            <div className="screen">
                <div className="empty">
                    <span className="empty-art"><IconBook size={38} /></span>
                    <h2 className="empty-title">Tu biblioteca está vacía</h2>
                    <p className="empty-body">
                        Importa los EPUB y PDF que ya tengas en el móvil. Se copian dentro de
                        la app, así que siguen funcionando aunque muevas los originales.
                    </p>
                    <div className="empty-actions">
                        <button type="button" className="btn btn-primary" onClick={() => runImport('files')} disabled={!!importing}>
                            <IconBook size={18} /> Elegir libros
                        </button>
                        <button type="button" className="btn" onClick={() => runImport('folder')} disabled={!!importing}>
                            <IconFolder size={18} /> Importar una carpeta
                        </button>
                    </div>
                    {importing && (
                        <div className="banner" style={{ marginTop: 'var(--sp-4)' }} role="status">
                            {importing.phase === 'picking'
                                ? 'Esperando a que elijas…'
                                : `Importando ${importing.done} de ${importing.total}`}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="screen">
            <header className="head">
                {searching ? (
                    <div className="search" style={{ flex: 1 }}>
                        <IconSearch size={19} />
                        <input
                            type="search"
                            placeholder="Título, autor o etiqueta…"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            aria-label="Buscar en la biblioteca"
                            autoFocus
                        />
                        <button
                            type="button"
                            className="icon-btn"
                            style={{ minWidth: 32, minHeight: 32 }}
                            onClick={() => { setQuery(''); setSearching(false); }}
                            aria-label="Cerrar búsqueda"
                        >
                            <IconClose size={18} />
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="head-txt">
                            <h1 className="brand">
                                Shark<span>Reader</span>
                            </h1>
                            <p className="brand-tagline">Tu biblioteca, en tu bolsillo</p>
                        </div>
                        <div className="head-actions">
                            <button type="button" className="icon-btn" onClick={() => setSearching(true)} aria-label="Buscar">
                                <IconSearch size={21} />
                            </button>
                            <button
                                type="button"
                                className="icon-btn"
                                onClick={() => runImport('files')}
                                disabled={!!importing}
                                aria-label="Importar libros"
                            >
                                <IconPlus size={22} />
                            </button>
                            <button
                                type="button"
                                className={`icon-btn${showSort ? ' on' : ''}`}
                                onClick={() => setShowSort((open) => !open)}
                                aria-expanded={showSort}
                                aria-label="Ordenar y ver"
                            >
                                <IconSort size={21} />
                            </button>
                            <button
                                type="button"
                                className="icon-btn"
                                onClick={() => onGoToSettings?.()}
                                aria-label="Ajustes"
                            >
                                <IconSettings size={21} />
                            </button>
                        </div>
                    </>
                )}
            </header>

            {showSort && (
                <div className="section">
                    <div className="pills" role="group" aria-label="Ordenar por">
                        {Object.entries(SORTS).map(([id, option]) => (
                            <button
                                key={id}
                                type="button"
                                className={`pill${sort === id ? ' on' : ''}`}
                                onClick={() => setSort(id)}
                                aria-pressed={sort === id}
                            >
                                {option.label}
                            </button>
                        ))}
                        <button
                            type="button"
                            className={`pill${compact ? ' on' : ''}`}
                            onClick={() => setCompact((value) => !value)}
                            aria-pressed={compact}
                        >
                            <IconGrid size={14} /> Compacta
                        </button>
                    </div>
                </div>
            )}

            {error && (
                <div className="banner banner-error" role="alert">
                    <span style={{ flex: 1 }}>{error}</span>
                    <button type="button" className="icon-btn" style={{ minWidth: 32, minHeight: 32 }} onClick={clearError} aria-label="Cerrar">
                        <IconClose size={17} />
                    </button>
                </div>
            )}

            {notice && <div className="banner" role="status">{notice}</div>}

            {importing && (
                <div className="banner" role="status">
                    <span style={{ flex: 1 }}>
                        {importing.phase === 'picking'
                            ? 'Esperando a que elijas…'
                            : `Importando ${importing.done} de ${importing.total}${importing.name ? ` — ${importing.name}` : ''}`}
                    </span>
                    {importing.total > 0 && (
                        <span className="bar thin banner-bar">
                            <i style={{ width: `${Math.round((importing.done / importing.total) * 100)}%` }} />
                        </span>
                    )}
                </div>
            )}

            {/* Mientras se busca o se filtra, la pantalla se convierte en una
                rejilla de resultados: los estantes solo estorbarían. */}
            {browsing ? (
                <>
                    <div className="pills" role="group" aria-label="Filtrar biblioteca">
                        {Object.entries(FILTERS).map(([id, option]) => (
                            <button
                                key={id}
                                type="button"
                                className={`pill${filter === id ? ' on' : ''}`}
                                onClick={() => setFilter(id)}
                                aria-pressed={filter === id}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>

                    {visible.length === 0 ? (
                        <div className="empty">
                            <span className="empty-art"><IconSearch size={34} /></span>
                            <h2 className="empty-title">Nada coincide</h2>
                            <p className="empty-body">Prueba con otra búsqueda o quita el filtro.</p>
                            <button type="button" className="btn" onClick={() => { setQuery(''); setFilter('all'); setSearching(false); }}>
                                Limpiar
                            </button>
                        </div>
                    ) : (
                        <div className="section">
                            <div className="section-head">
                                <h2 className="section-title">Resultados</h2>
                                <span className="section-meta">{visible.length}</span>
                            </div>
                            <div className={`grid-books${compact ? ' compact' : ''}`}>
                                {visible.map((book) => (
                                    <BookCard key={book.id} book={book} onOpen={openBook} onLongPress={setDetail} />
                                ))}
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <>
                    {current && <ContinueCard book={current} onResume={onOpenBook} />}

                    {sharkyOn && (
                        <Sharky
                            context={{
                                streak: statsApi?.stats?.streak || 0,
                                reading: started.length + (current ? 1 : 0),
                                minutesToday: minutesToday(statsApi?.stats?.minutesByDay),
                            }}
                            onDisable={() => statsApi?.savePreferences?.({ sharky: false })}
                        />
                    )}

                    {series.length > 0 && (
                        <div className="section">
                            <div className="section-head">
                                <h2 className="section-title">Series</h2>
                                <span className="section-meta">{series.length}</span>
                            </div>
                            <div className="rail">
                                {series.map((serie) => (
                                    <button
                                        type="button"
                                        className="serie"
                                        key={serie.name}
                                        onClick={() => setDetail(serie.next || serie.books[0])}
                                    >
                                        <span className="serie-covers">
                                            {serie.books.slice(0, 3).map((item, index) => (
                                                <span
                                                    className="serie-cover"
                                                    key={item.id}
                                                    style={{
                                                        background: item.coverUrl ? undefined : item.color,
                                                        zIndex: 3 - index,
                                                        marginLeft: index ? -18 : 0,
                                                    }}
                                                >
                                                    {item.coverUrl && <img src={item.coverUrl} alt="" loading="lazy" />}
                                                </span>
                                            ))}
                                        </span>
                                        <span className="serie-name">{serie.name}</span>
                                        <span className="serie-meta">
                                            {serie.complete
                                                ? `✓ completa · ${serie.count}`
                                                : serie.gaps.length
                                                    ? `falta el ${serie.gaps[0]}`
                                                    : `${serie.finished}/${serie.count}`}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {started.length > 0 && (
                        <div className="section">
                            <div className="section-head">
                                <h2 className="section-title">Empezados</h2>
                                <span className="section-meta">{started.length}</span>
                            </div>
                            <div className="rail">
                                {started.map((book) => (
                                    <BookCard key={book.id} book={book} onOpen={openBook} onLongPress={setDetail} />
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="section">
                        <div className="section-head">
                            <h2 className="section-title">Toda la biblioteca</h2>
                            <span className="section-meta">{books.length}</span>
                        </div>
                        <div className={`grid-books${compact ? ' compact' : ''}`}>
                            {selectBooks(books, { sort }).map((book) => (
                                <BookCard key={book.id} book={book} onOpen={openBook} onLongPress={setDetail} />
                            ))}
                        </div>
                    </div>
                </>
            )}

            {/* El botón flotante reanuda la última lectura: es la acción que
                más se repite y la que mejor encaja en la zona del pulgar.
                Importar se ha ido arriba, junto a la lupa. */}
            {current && (
                <button
                    type="button"
                    className="fab"
                    onClick={() => onOpenBook(current)}
                    aria-label={`Seguir leyendo ${current.name}`}
                >
                    <IconBook size={24} />
                </button>
            )}

            {detail && (
                <BookSheet
                    book={books.find((book) => book.id === detail.id) || detail}
                    onClose={() => setDetail(null)}
                    onOpen={(book) => { setDetail(null); onOpenBook(book); }}
                    onUpdate={library.updateBook}
                    onDelete={library.removeBook}
                    onExportNotes={library.exportNotes}
                />
            )}
        </div>
    );
}
