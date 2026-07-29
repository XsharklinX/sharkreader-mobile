import React from 'react';
import { IconSearch } from '../ui/icons.jsx';

/**
 * Resultados de buscar **dentro** de los libros.
 *
 * Van debajo de los libros que coinciden por título, no mezclados con ellos: si
 * escribes «Borges» quieres el libro, no las trescientas veces que aparece el
 * nombre en un ensayo sobre él. Los dos tipos de resultado responden a
 * preguntas distintas y mezclarlos hace que ninguna se responda bien.
 */
export default function ContentResults({ results, query, indexing, onOpen }) {
    if (indexing) {
        return (
            <p className="drawer-empty">
                Preparando el índice de contenido… {indexing.done} de {indexing.total}.
                Podrás buscar dentro de los libros en cuanto termine.
            </p>
        );
    }

    if (!query) return null;

    if (results.length === 0) {
        return (
            <p className="drawer-empty">
                Ninguna coincidencia dentro de los libros.
            </p>
        );
    }

    return (
        <section className="content-results">
            <h3 className="section-title">
                <IconSearch size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
                Dentro de los libros
                <span className="pill-count">{results.length}</span>
            </h3>

            {results.map((result, index) => (
                <button
                    key={`${result.bookId}-${result.href}-${index}`}
                    type="button"
                    className="content-hit"
                    onClick={() => onOpen(result)}
                >
                    <span className="content-hit-book">{result.title || 'Sin título'}</span>
                    {result.chapter && (
                        <span className="content-hit-chapter">{result.chapter}</span>
                    )}
                    {/* Las coincidencias vienen marcadas por FTS5 con « ». Se
                        parten aquí para poder resaltarlas sin inyectar HTML de
                        la base de datos en la página. */}
                    <span className="content-hit-text">
                        {String(result.excerpt || '').split(/([«»])/).reduce((parts, piece) => {
                            if (piece === '«') { parts.open = true; return parts; }
                            if (piece === '»') { parts.open = false; return parts; }
                            parts.nodes.push(
                                parts.open
                                    ? <mark key={parts.nodes.length}>{piece}</mark>
                                    : <span key={parts.nodes.length}>{piece}</span>
                            );
                            return parts;
                        }, { nodes: [], open: false }).nodes}
                    </span>
                </button>
            ))}
        </section>
    );
}
