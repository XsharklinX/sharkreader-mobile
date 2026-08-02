import React, { useRef } from 'react';
import { IconStar, IconCheck } from '../ui/icons.jsx';
import Cover from './Cover.jsx';

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 12;

/**
 * Portada de la rejilla.
 *
 * El progreso va dibujado sobre la propia portada en lugar de en una fila
 * aparte: se lee de un vistazo al recorrer la biblioteca y deja la altura de
 * todas las tarjetas igual, que es lo que hace que una rejilla se vea ordenada.
 */
export default function BookCard({ book, onOpen, onLongPress, soloPortada = false, seleccionado = false }) {
    const done = Math.round((book.progress || 0) * 100);
    const cover = book.coverUrl || book.coverBase64;

    // El estado del gesto va en refs: un render entre pulsar y soltar (el tic
    // del reloj de lectura, por ejemplo) reiniciaría una variable local y el
    // toque se perdería.
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
        const moved = Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y);
        if (moved > MOVE_TOLERANCE) return;
        onOpen?.(book);
    };

    return (
        <button
            type="button"
            className={`book${seleccionado ? ' elegido' : ''}`}
            onPointerDown={startPress}
            onPointerUp={endPress}
            onPointerCancel={clearTimer}
            onPointerLeave={clearTimer}
            aria-label={`${book.name}, de ${book.author}, ${done}% leído`}
        >
            <Cover book={book} className="book-cover">
                {/* La marca de selección va sobre la portada y no al lado: en una
                    rejilla de tres columnas no hay sitio para una casilla aparte, y
                    encima la esquina es donde ya se mira. */}
                {seleccionado && (
                    <span className="sel-marca" aria-hidden="true"><IconCheck size={13} /></span>
                )}

                {/* Solo el favorito. Lo de «terminado» lo dice la cinta de abajo, y
                    marcar la portada por arriba y por abajo para decir lo mismo deja
                    la ilustración con dos parches. */}
                {book.isFav && (
                    <span className="book-badge"><IconStar size={13} filled /></span>
                )}

                {/* Cinta de progreso.
                    
                    Hubo un porcentaje suelto sobre la portada, y luego un filo de
                    2 px bajo la tapa. El primero ensuciaba la ilustración y el
                    segundo no se veía: un libro terminado y uno sin empezar se
                    distinguían por una línea de dos píxeles de otro color.
                    
                    Esto es lo que hace la versión de escritorio y funciona: una
                    cinta en el pie de la portada, con la barra y el número dentro.
                    Ocupa el borde inferior —la zona muerta de casi cualquier
                    cubierta— y se lee de un vistazo recorriendo la rejilla. */}
                {(done > 0 || book.isFinished) && (
                    <span className={`book-ribbon${book.isFinished ? ' done' : ''}`}>
                        <i style={{ width: `${book.isFinished ? 100 : done}%` }} />
                        <b>{book.isFinished ? 'Terminado' : `${done} %`}</b>
                    </span>
                )}
            </Cover>

            {/* En la vista compacta la cubierta va sola. El título y el autor a
                cuatro por fila salen a siete píxeles, y eso no es texto: es
                textura que estorba a la única cosa que ahí sí se reconoce, que es
                la propia portada. */}
            {!soloPortada && (
                <>
                    <span className="book-title">{book.name}</span>
                    <span className="book-author">{book.author}</span>
                </>
            )}
        </button>
    );
}
