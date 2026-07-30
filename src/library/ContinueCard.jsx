import React from 'react';

/**
 * Tarjeta de continuar leyendo.
 *
 * Es lo primero de la pantalla porque, si estás leyendo algo, eso es lo que
 * quieres tocar.
 *
 * ## Por qué ya no dice «te quedan 2 h 38 min»
 *
 * El tiempo restante se estimaba con el ritmo medio del usuario: los minutos
 * dedicados al libro divididos por el porcentaje leído. Tres problemas:
 *
 *  1. **Es una estimación sobre una estimación.** Con un 4 % leído, la muestra
 *     es de unos minutos y el resultado sale de multiplicar por veinticinco: un
 *     rato de lectura lenta convertía dos horas en cinco.
 *  2. **No responde a la pregunta.** Al mirar aquí se busca por dónde vas, y un
 *     tiempo obliga a hacer la cuenta al revés.
 *  3. **No coincidía con el lector.** Allí el medidor pasó a ser el porcentaje,
 *     así que la misma app daba dos respuestas distintas para lo mismo.
 *
 * Se queda el porcentaje, que es el mismo dato que enseña el lector y sale del
 * mismo sitio.
 */
export default function ContinueCard({ book, onResume }) {
    const done = Math.round((book.progress || 0) * 100);
    const cover = book.coverUrl || book.coverBase64;

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
                    {done} % del libro
                </span>
                <span className="bar continue-bar"><i style={{ width: `${done}%` }} /></span>
            </span>
        </button>
    );
}
