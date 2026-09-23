import React, { useEffect, useMemo, useRef, useState } from 'react';
import BookCard from '../library/BookCard.jsx';
import ContinueCard from '../library/ContinueCard.jsx';
import BookSheet from '../library/BookSheet.jsx';
import Sharky from '../ui/Sharky.jsx';
import { selectBooks, FILTERS, SORTS } from '../library/useLibrary.js';
import { minutesToday } from '../stats/derive.js';
import ContentResults from '../library/ContentResults.jsx';
import Bookshelf from '../library/Bookshelf.jsx';
import Spines from '../library/Spines.jsx';
import { useCoverColors } from '../library/useCoverColors.js';
import { usePorts } from '../ports/index.js';
import BookRow from '../library/BookRow.jsx';
import { LIBRARY_VIEWS, normalizeView, agrupar } from '../library/views.js';
import { alternar, alternarTodo, podar, accionesPara, cambiosDe } from '../library/selection.js';
import SelectionBar from '../library/SelectionBar.jsx';
import Loading from '../ui/Loading.jsx';
import CatalogScreen from '../catalog/CatalogScreen.jsx';
import { useContentIndex } from '../library/useContentIndex.js';
import {
    IconSearch, IconSort, IconClose, IconBook, IconFolder, IconView, IconSettings,
    IconCloud, IconMenu,
} from '../ui/icons.jsx';
import SideMenu from '../ui/SideMenu.jsx';
import { useBackHandler } from '../ui/useBackHandler.js';

export default function LibraryScreen({ library, stats: statsApi, onOpenBook, onGoToSettings, onNavigate }) {
    const { books, status, error, importing, importFiles, importFolder, clearError } = library;

    const ports = usePorts();

    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [filter, setFilter] = useState('all');
    const [sort, setSort] = useState('recent');
    const [showSort, setShowSort] = useState(false);
    /**
     * La vista, en un solo valor.
     *
     * Antes eran dos cosas sueltas: `libraryView` en Ajustes decidía entre rejilla
     * y estante, y `density` —también en Ajustes— tenía una casilla de «compacta»
     * que en realidad era una tercera vista. Con dos interruptores para elegir
     * entre tres cosas había combinaciones que no significaban nada, como estante
     * compacto.
     */
    const [view, setView] = useState(
        () => normalizeView(statsApi?.preferences?.libraryView, statsApi?.preferences?.density)
    );

    /**
     * Los colores de las portadas, solo cuando la estantería está a la vista.
     *
     * Sacar el color obliga a pintar cada portada en un lienzo y leer sus
     * píxeles; hacerlo con la rejilla puesta sería gastar batería por un dato que
     * nadie está mirando. Ver `useCoverColors`.
     */
    const coloresDePortada = useCoverColors(books, ports.storage, view === 'lomos');

    const cambiarVista = (id) => {
        setView(id);
        // Se recuerda, pero se elige aquí: una vista se cambia mientras buscas, no
        // se configura una vez en otra pantalla.
        statsApi?.savePreferences?.({ libraryView: id });
    };
    const [detail, setDetail] = useState(null);
    const [notice, setNotice] = useState(null);
    const [importChoice, setImportChoice] = useState(false);
    const [catalogOpen, setCatalogOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    // ── Selección múltiple ───────────────────────────────────────────────────
    //
    // Se entra con una pulsación larga y se sale con atrás. Mientras dura, tocar
    // una portada marca en vez de abrir: en modo selección, abrir un libro sin
    // querer y perder lo marcado es más molesto que tener que salir del modo.
    const [seleccion, setSeleccion] = useState(() => new Set());
    const seleccionando = seleccion.size > 0;

    // Atrás sale de la selección antes que de la app. Es la salida que busca
    // cualquiera que entre sin querer con una pulsación larga.
    useBackHandler(() => {
        if (!seleccionando) return false;
        setSeleccion(new Set());
        return true;
    }, seleccionando);

    const browsing = Boolean(query.trim()) || filter !== 'all';

    /**
     * Pinta una lista con la vista elegida.
     *
     * Se agrupa fuera de cada vista y no dentro: si cada una agrupara por su cuenta
     * acabarían con encabezados distintos, y el encabezado depende del **orden**,
     * que es de la pantalla y no de la vista.
     */
    const renderBooks = (list) => {
        const grupos = agrupar(list, sort);

        return grupos.map((grupo) => (
            <div className="grupo-libros" key={grupo.titulo || 'todo'}>
                {grupo.titulo && <h3 className="grupo-titulo">{grupo.titulo}</h3>}
                {pintarVista(grupo.libros)}
            </div>
        ));
    };

    /**
     * La pulsación larga abre la ficha, salvo que ya se esté seleccionando.
     *
     * Con el modo activo tiene que marcar: entrar en la ficha de un libro cuando
     * llevas ocho elegidos rompe la tarea a la mitad.
     */
    const pulsacionLarga = (book) => {
        if (seleccionando) setSeleccion((actual) => alternar(actual, book.id));
        else setSeleccion(new Set([book.id]));
    };

    const pintarVista = (list) => {
        if (view === 'lomos') {
            return (
                <Spines
                    books={list}
                    width={typeof window === 'undefined' ? 0 : window.innerWidth}
                    colores={coloresDePortada}
                    onOpen={openBook}
                    onLongPress={pulsacionLarga}
                    leyendoId={books.find((b) => b.progress > 0 && !b.isFinished)?.id || null}
                />
            );
        }

        if (view === 'shelf') {
            return (
                <Bookshelf
                    books={list}
                    width={typeof window === 'undefined' ? 0 : window.innerWidth}
                    onOpen={openBook}
                    onLongPress={pulsacionLarga}
                />
            );
        }

        if (view === 'list') {
            return (
                <div className="lista-libros">
                    {list.map((book) => (
                        <BookRow
                            key={book.id}
                            book={book}
                            onOpen={openBook}
                            onLongPress={pulsacionLarga}
                            seleccionado={seleccion.has(book.id)}
                        />
                    ))}
                </div>
            );
        }

        return (
            <div className={`grid-books${view === 'compact' ? ' compact' : ''}`}>
                {list.map((book) => (
                    <BookCard
                        key={book.id}
                        book={book}
                        onOpen={openBook}
                        onLongPress={pulsacionLarga}
                        seleccionado={seleccion.has(book.id)}
                        // En compacta la cubierta va sola: el título y el autor a
                        // cuatro por fila salen a siete píxeles, que no es texto,
                        // es textura.
                        soloPortada={view === 'compact'}
                    />
                ))}
            </div>
        );
    };

    // ── Búsqueda dentro de los libros ────────────────────────────────────────
    //
    // El índice se construye al entrar en la biblioteca, no al importar: añadir
    // veinte libros ya es lento, y leerlos enteros encima haría esperar un
    // minuto antes de ver nada.
    const contentIndex = useContentIndex(books);
    const [hits, setHits] = useState([]);
    const [hitQuery, setHitQuery] = useState('');

    // `build` y `search` van por ref y no en las dependencias del efecto.
    //
    // Aquí estaba un bucle infinito: `useContentIndex` devolvía un objeto nuevo
    // en cada render y estaba en las dependencias, así que el efecto se disparaba
    // siempre, `build()` llamaba a `setProgress`, eso provocaba otro render, y
    // vuelta a empezar. En el dispositivo se veían cientos de consultas por
    // segundo a `content_index` y la interfaz se quedaba congelada en negro.
    const buildIndexRef = useRef(contentIndex.build);
    buildIndexRef.current = contentIndex.build;
    const searchIndexRef = useRef(contentIndex.search);
    searchIndexRef.current = contentIndex.search;

    useEffect(() => {
        if (status === 'ready') buildIndexRef.current();
    }, [status, books.length]);

    // Se busca con retraso: lanzar una consulta por pulsación devolvería
    // resultados de una palabra a medio escribir y encima competiría con la
    // indexación por el mismo hilo.
    useEffect(() => {
        const text = query.trim();
        if (text.length < 2) { setHits([]); setHitQuery(''); return undefined; }

        let alive = true;
        const timer = setTimeout(() => {
            searchIndexRef.current(text, 40).then(({ query: used, results }) => {
                if (!alive) return;
                setHits(results);
                setHitQuery(used);
            }).catch(() => {});
        }, 260);

        return () => { alive = false; clearTimeout(timer); };
    }, [query]);

    const visible = useMemo(
        () => selectBooks(books, { query, filter, sort }),
        [books, query, filter, sort]
    );

    // Lo seleccionado que deja de verse se descarta. Ver `podar`: si no, al
    // cambiar de filtro seguiría contando en «12 seleccionados» y se borraría con
    // el resto sin que nadie lo haya visto.
    useEffect(() => {
        setSeleccion((actual) => (actual.size ? podar(actual, visible) : actual));
    }, [visible]);

    const librosSeleccionados = useMemo(
        () => books.filter((book) => seleccion.has(book.id)),
        [books, seleccion]
    );

    const aplicarAccion = async (accion) => {
        for (const { id, cambios } of cambiosDe(librosSeleccionados, accion)) {
            await library.updateBook(id, cambios);
        }
        setSeleccion(new Set());
    };

    const borrarSeleccion = async () => {
        for (const book of librosSeleccionados) {
            await library.removeBook(book.id);
        }
        setNotice(`${librosSeleccionados.length} libros borrados.`);
        setTimeout(() => setNotice(null), 4500);
        setSeleccion(new Set());
    };

    // El libro activo es el último tocado que no esté terminado.
    const current = useMemo(
        () => books
            .filter((book) => (book.progress || 0) > 0 && !book.isFinished && book.sourcePath)
            .sort((a, b) => (b.lastReadDate || 0) - (a.lastReadDate || 0))[0] || null,
        [books]
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
        if (seleccionando) {
            setSeleccion((actual) => alternar(actual, book.id));
            return;
        }

        if (!book.sourcePath) {
            // Un libro que vino de un backup no trae el fichero. Decirlo es
            // mejor que no reaccionar al toque.
            setDetail(book);
            return;
        }
        onOpenBook(book);
    };

    if (status === 'loading') {
        // Esqueleto en vez de un icono centrado: ver `Loading.jsx`. Ocupa el
        // sitio de las portadas, así que al llegar no hay salto de maquetación.
        return (
            <div className="screen">
                <Loading kind="library" label="Abriendo la biblioteca" />
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
            {seleccionando ? (
                <header className="head topbar">
                    <SelectionBar
                        libros={librosSeleccionados}
                        onAccion={aplicarAccion}
                        onBorrar={borrarSeleccion}
                        onTodo={() => setSeleccion((actual) => alternarTodo(actual, visible))}
                        onFicha={(book) => { setDetail(book); setSeleccion(new Set()); }}
                        onCerrar={() => setSeleccion(new Set())}
                    />
                </header>
            ) : (
            <header className="head topbar">
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
                        {/* El menú va junto al nombre, donde antes no había nada.
                            Sustituye a la barra de pestañas de abajo: la
                            biblioteca es la aplicación y el resto son sitios a los
                            que se va de vez en cuando, no destinos hermanos. */}
                        <button
                            type="button"
                            className="icon-btn brand-menu"
                            onClick={() => setMenuOpen(true)}
                            aria-label="Menú"
                        >
                            <IconMenu size={21} />
                        </button>

                        {/* La marca apilada, como en la versión de escritorio:
                            «Shark» arriba en azul, «Reader» debajo en blanco. En
                            una línea ocupaba 160 px de los 390 que hay y dejaba
                            los iconos sin sitio; apilada ocupa 70 y se lee como
                            un logotipo en vez de como un título. */}
                        <div className="head-txt">
                            <h1 className="brand">
                                <span className="brand-1">Shark</span>
                                <span className="brand-2">Reader</span>
                            </h1>
                        </div>
                        <div className="head-actions">
                            <button type="button" className="icon-btn" onClick={() => setSearching(true)} aria-label="Buscar">
                                <IconSearch size={20} />
                            </button>
                            {/* Añadir libros vive en el menú, con sus dos formas
                                explicadas. Un «+» aquí era el mismo destino con
                                menos información, y le quitaba el sitio al nombre. */}
                            <button
                                type="button"
                                className={`icon-btn${showSort ? ' on' : ''}`}
                                onClick={() => setShowSort((open) => !open)}
                                aria-expanded={showSort}
                                aria-label="Ordenar y ver"
                            >
                                <IconSort size={20} />
                            </button>
                            <button
                                type="button"
                                className="icon-btn"
                                onClick={() => onGoToSettings?.()}
                                aria-label="Ajustes"
                            >
                                <IconSettings size={20} />
                            </button>
                        </div>
                    </>
                )}
            </header>
            )}

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
            {/* ── Una sola biblioteca ──────────────────────────────────────────
                Había dos pantallas distintas según si estabas buscando o no: sin
                búsqueda salían «Series», «Empezados» y «Toda la biblioteca» en
                secciones, y los filtros **no existían**; al tocar uno cambiaba el
                diseño entero. Por eso parecía que los filtros no funcionaban: no
                filtraban una lista, la sustituían por otra pantalla.

                Ahora hay una lista y siempre es la misma. Los filtros y el orden
                están siempre a la vista y solo cambian qué sale y en qué orden,
                que es lo único que debe hacer un filtro. */}
            {current && !browsing && <ContinueCard book={current} onResume={onOpenBook} />}

            {sharkyOn && !browsing && (
                <Sharky
                    context={{
                        streak: statsApi?.stats?.streak || 0,
                        reading: books.filter((book) => (book.progress || 0) > 0 && !book.isFinished).length,
                        minutesToday: minutesToday(statsApi?.stats?.minutesByDay),
                    }}
                    onDisable={() => statsApi?.savePreferences?.({ sharky: false })}
                />
            )}

            <div className="fila-control">
            <div className="pills" role="group" aria-label="Filtrar biblioteca">
                {Object.entries(FILTERS).map(([id, option]) => {
                    const cuantos = books.filter((book) => option.match(book)).length;
                    return (
                        <button
                            key={id}
                            type="button"
                            className={`pill${filter === id ? ' on' : ''}`}
                            onClick={() => setFilter(id)}
                            aria-pressed={filter === id}
                            disabled={cuantos === 0 && id !== 'all'}
                        >
                            {option.label}
                            {/* El número dentro del filtro: sin él hay que tocarlo
                                para descubrir que no tienes ningún favorito. */}
                            <span className="pill-count">{cuantos}</span>
                        </button>
                    );
                })}

            </div>

                {/* El selector de vista, fuera de los filtros.
                    
                    Estaba en Ajustes → Apariencia, a cuatro toques de aquí. Una
                    vista no es una preferencia que se configura una vez: se cambia
                    mientras buscas, igual que el orden.
                    
                    Va fuera de la fila de filtros porque esa fila se desplaza en
                    horizontal: dentro, el selector se iría de la pantalla en cuanto
                    hubiera cuatro filtros. */}
                <div className="vistas" role="group" aria-label="Cómo se ven los libros">
                    {Object.entries(LIBRARY_VIEWS).map(([id, opcion]) => (
                        <button
                            key={id}
                            type="button"
                            className={`vista-btn${view === id ? ' on' : ''}`}
                            onClick={() => cambiarVista(id)}
                            aria-pressed={view === id}
                            aria-label={`${opcion.label}. ${opcion.hint}`}
                            title={opcion.hint}
                        >
                            <IconView id={id} />
                        </button>
                    ))}
                </div>
            </div>

            {visible.length === 0 && hits.length === 0 ? (
                <div className="empty">
                    <span className="empty-art"><IconSearch size={34} /></span>
                    <h2 className="empty-title">
                        {query.trim() ? 'Nada coincide' : 'Ningún libro aquí'}
                    </h2>
                    <p className="empty-body">
                        {query.trim()
                            ? 'Ni en los títulos ni dentro de los libros.'
                            : 'Prueba con otro filtro.'}
                    </p>
                    <button type="button" className="btn" onClick={() => { setQuery(''); setFilter('all'); setSearching(false); }}>
                        Ver toda la biblioteca
                    </button>
                </div>
            ) : (
                <>
                    <div className="section">
                        <div className="section-head">
                            <h2 className="section-title">
                                {query.trim() ? 'Resultados' : FILTERS[filter]?.label || 'Toda la biblioteca'}
                            </h2>
                            <span className="section-meta">{visible.length}</span>
                        </div>
                        {renderBooks(visible)}
                    </div>

                    {/* Debajo, nunca mezclado: si escribes «Borges» quieres el
                        libro, no las trescientas veces que sale el nombre dentro
                        de un ensayo sobre él. */}
                    <ContentResults
                        results={hits}
                        query={hitQuery}
                        indexing={contentIndex.progress}
                        onOpen={(hit) => {
                            const target = books.find((book) => book.id === hit.bookId);
                            if (target) openBook(target);
                        }}
                    />
                </>
            )}

            {menuOpen && (
                <SideMenu
                    stats={statsApi}
                    books={books}
                    onNavigate={(target) => {
                        if (target === 'catalog') setCatalogOpen(true);
                        else if (target === 'import-folder') runImport('folder');
                        else if (target === 'import-files') runImport('files');
                        else onNavigate?.(target);
                    }}
                    onClose={() => setMenuOpen(false)}
                />
            )}

            {catalogOpen && (
                <div className="overlay-screen">
                    <CatalogScreen
                        onImport={library.importDownloaded}
                        onClose={() => setCatalogOpen(false)}
                    />
                </div>
            )}

            {importChoice && (
                <div className="scrim" onClick={() => setImportChoice(false)} role="presentation">
                    <section
                        className="sheet"
                        onClick={(event) => event.stopPropagation()}
                        role="dialog"
                        aria-label="Añadir libros"
                    >
                        <span className="grip" aria-hidden="true" />
                        <h2 className="section-title">Añadir a la biblioteca</h2>
                        <div className="rows">
                            <button
                                type="button"
                                className="row"
                                onClick={() => { setImportChoice(false); runImport('files'); }}
                            >
                                <span className="row-icon"><IconBook size={20} /></span>
                                <span className="row-txt">
                                    <span>Elegir libros</span>
                                    <span className="row-sub">Uno o varios ficheros sueltos</span>
                                </span>
                            </button>
                            <button
                                type="button"
                                className="row"
                                onClick={() => { setImportChoice(false); setCatalogOpen(true); }}
                            >
                                <span className="row-icon"><IconCloud size={20} /></span>
                                <span className="row-txt">
                                    <span>Desde un catálogo</span>
                                    <span className="row-sub">Tu servidor de Calibre u otro catálogo OPDS</span>
                                </span>
                            </button>
                            <button
                                type="button"
                                className="row"
                                onClick={() => { setImportChoice(false); runImport('folder'); }}
                            >
                                <span className="row-icon"><IconFolder size={20} /></span>
                                <span className="row-txt">
                                    <span>Importar una carpeta</span>
                                    <span className="row-sub">Todos los libros que contenga, subcarpetas incluidas</span>
                                </span>
                            </button>
                        </div>
                        <p className="option-desc">
                            EPUB, PDF, CBZ, TXT y Markdown. Los ficheros se copian dentro de la
                            app, así que siguen funcionando aunque muevas los originales.
                        </p>
                    </section>
                </div>
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
