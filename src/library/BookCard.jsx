import React, { useRef } from 'react';

const percent = (progress) => Math.round((progress || 0) * 100);

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 12;

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

    // El estado del gesto va en refs, no en variables del cuerpo del componente:
    // cualquier render entre pulsar y soltar (por ejemplo el tic del reloj de
    // lectura) reiniciaría una variable local y el toque se perdería.
    const press = useRef({ timer: null, consumed: false, x: 0, y: 0 });

    const clearTimer = () => {
        if (press.current.timer) {
            clearTimeout(press.current.timer);
            press.current.timer = null;
        }
    };

    const startPress = (event) => {
        press.current.consumed = false;
        press.current.x = event.clientX;
        press.current.y = event.clientY;
        // El temporizador solo se arma si hay algo que hacer con él. Armarlo
        // siempre hacía que un toque de más de 450 ms no abriera el libro.
        if (!onLongPress) return;
        clearTimer();
        press.current.timer = setTimeout(() => {
            press.current.timer = null;
            press.current.consumed = true;
            onLongPress(book);
        }, LONG_PRESS_MS);
    };

    const endPress = (event) => {
        clearTimer();
        if (press.current.consumed) return;

        // Un arrastre es scroll de la rejilla, no un toque sobre el libro.
        const moved = Math.hypot(
            event.clientX - press.current.x,
            event.clientY - press.current.y
        );
        if (moved > MOVE_TOLERANCE) return;

        onOpen?.(book);
    };

    return (
        <button
            type="button"
            className="book"
            onPointerDown={startPress}
            onPointerUp={endPress}
            onPointerCancel={clearTimer}
            onPointerLeave={clearTimer}
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
