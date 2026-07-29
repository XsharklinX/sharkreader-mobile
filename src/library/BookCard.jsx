import React from 'react';

const percent = (progress) => Math.round((progress || 0) * 100);

/**
 * Tarjeta de libro de la rejilla.
 *
 * Sin portada se usa el color derivado del id (`buildBookColor`), igual que en
 * escritorio: dos libros distintos nunca comparten color y el resultado es
 * estable entre sesiones.
 */
export default function BookCard({ book, onOpen, onLongPress }) {
    const done = percent(book.progress);
    const cover = book.coverUrl || book.coverBase64;

    let pressTimer = null;
    const startPress = () => {
        pressTimer = setTimeout(() => {
            pressTimer = null;
            onLongPress?.(book);
        }, 450);
    };
    const endPress = (fired) => {
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
            if (fired) onOpen?.(book);
        }
    };

    return (
        <button
            type="button"
            className="book"
            onPointerDown={startPress}
            onPointerUp={() => endPress(true)}
            onPointerLeave={() => endPress(false)}
            onPointerCancel={() => endPress(false)}
            aria-label={`${book.name}, de ${book.author}, ${done}% leído`}
        >
            <span className="book-cover" style={cover ? undefined : { background: book.color }}>
                {cover
                    ? <img src={cover} alt="" loading="lazy" decoding="async" />
                    : <span className="book-cover-text">{book.name}</span>}
                {book.isFav && <span className="book-fav" aria-hidden="true">★</span>}
                {book.isFinished && <span className="book-done" aria-hidden="true">✓</span>}
                <span className="book-type" aria-hidden="true">{book.type.toUpperCase()}</span>
            </span>

            <span className="book-bar" aria-hidden="true">
                <i style={{ width: `${done}%` }} />
            </span>

            <span className="book-title">{book.name}</span>
            <span className="book-meta">
                {done > 0 ? `${done}% · ` : ''}{book.author}
            </span>
        </button>
    );
}
