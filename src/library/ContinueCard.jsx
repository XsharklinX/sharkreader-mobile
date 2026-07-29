import React from 'react';
import { formatMinutes } from '../stats/derive.js';

/**
 * Tarjeta de continuar leyendo.
 *
 * Es lo primero de la pantalla porque, si estás leyendo algo, eso es lo que
 * quieres tocar. Antes había que buscarlo en la rejilla como un libro más.
 *
 * El tiempo restante se estima con el ritmo real del usuario: los minutos ya
 * dedicados a este libro divididos por el porcentaje leído. Es mucho más útil
 * que un porcentaje suelto — «te quedan 18 min» es una decisión, «64%» es un
 * dato.
 */
export const estimateRemaining = (book) => {
    const minutes = book.readingMinutes || 0;
    const progress = book.progress || 0;
    // Por debajo de un 4% la muestra es demasiado pequeña para extrapolar.
    if (minutes < 5 || progress < 0.04) return null;
    const total = minutes / progress;
    const left = Math.round(total - minutes);
    return left > 0 ? left : null;
};

export default function ContinueCard({ book, onResume }) {
    const done = Math.round((book.progress || 0) * 100);
    const cover = book.coverUrl || book.coverBase64;
    const left = estimateRemaining(book);

    return (
        <button type="button" className="continue" onClick={() => onResume(book)}>
            <span className="continue-cover" style={cover ? undefined : { background: book.color }}>
                {cover
                    ? <img src={cover} alt="" style={{ width: '100%', display: 'block', aspectRatio: '2/3', objectFit: 'cover' }} />
                    : <span style={{ display: 'block', aspectRatio: '2/3' }} />}
            </span>

            <span className="continue-body">
                <span className="continue-eyebrow">Seguir leyendo</span>
                <span className="continue-title">{book.name}</span>
                <span className="continue-meta">
                    {done}%{left ? ` · te quedan ${formatMinutes(left)}` : ''}
                </span>
                <span className="bar continue-bar"><i style={{ width: `${done}%` }} /></span>
            </span>
        </button>
    );
}
