import React, { useRef } from 'react';
import Cover from './Cover.jsx';
import { IconCheck } from '../ui/icons.jsx';
import { estimateRemaining, formatMinutes } from '../stats/derive.js';

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 12;

/**
 * Un libro en la vista de lista.
 *
 * ## Qué se enseña aquí y no en la rejilla
 *
 * La rejilla contesta «¿qué leo esta noche?» y para eso manda la cubierta. Esta
 * contesta «¿qué tengo y cómo voy?», así que enseña lo que no cabe en una celda de
 * cien píxeles: la serie con su número, el formato, el porcentaje y el tiempo que
 * queda.
 *
 * Los datos van en monoespaciada y alineados a la derecha para que se puedan
 * comparar de arriba abajo sin leerlos: en una columna de cifras, el ojo compara
 * longitudes antes que números.
 */
export default function BookRow({ book, onOpen, onLongPress, seleccionado = false }) {
    const done = Math.round((book.progress || 0) * 100);
    const restante = estimateRemaining(book);

    // El mismo gesto que la rejilla: tocar abre, mantener abre la ficha. Va por
    // refs porque un render entre pulsar y soltar perdería el toque.
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
        press.current.timer = setTimeout(() => {
            press.current.consumed = true;
            onLongPress?.(book);
        }, LONG_PRESS_MS);
    };

    const endPress = (event) => {
        clearTimer();
        const movido = Math.hypot(
            event.clientX - press.current.x,
            event.clientY - press.current.y
        ) > MOVE_TOLERANCE;
        if (!press.current.consumed && !movido) onOpen(book);
    };

    const serie = String(book.series || '').trim();
    const bajo = [
        book.author,
        serie ? `${serie}${book.seriesIndex ? ` ${book.seriesIndex}` : ''}` : '',
    ].filter(Boolean).join(' · ');

    return (
        <button
            type="button"
            className={`fila-libro${seleccionado ? ' elegido' : ''}`}
            onPointerDown={startPress}
            onPointerUp={endPress}
            onPointerCancel={clearTimer}
            onPointerLeave={clearTimer}
            aria-label={`${book.name}, de ${book.author}, ${done}% leído`}
        >
            <Cover book={book} className="fila-cover">
                {seleccionado && (
                    <span className="sel-marca" aria-hidden="true"><IconCheck size={11} /></span>
                )}
            </Cover>

            <span className="fila-txt">
                <span className="fila-nombre">{book.name}</span>
                <span className="fila-bajo">{bajo}</span>
            </span>

            <span className="fila-datos">
                {book.isFinished ? (
                    <>
                        <b className="ok">100 %</b>
                        <span>terminado</span>
                    </>
                ) : done > 0 ? (
                    <>
                        <b>{done} %</b>
                        {/* El tiempo restante solo cuando hay ritmo con el que
                            calcularlo: inventarlo con dos minutos de muestra daba
                            «quedan 40 horas» en un libro de trescientas páginas. */}
                        <span>{restante ? formatMinutes(restante) : (book.type || 'epub').toUpperCase()}</span>
                    </>
                ) : (
                    <>
                        <b className="apagado">—</b>
                        <span>{(book.type || 'epub').toUpperCase()}</span>
                    </>
                )}
            </span>
        </button>
    );
}
