import React, { useState } from 'react';
import { HIGHLIGHT_SWATCHES, HIGHLIGHT_LABEL_DEFAULTS, HIGHLIGHT_STYLES } from './annotations.js';
import { isLookupable } from './dictionary.js';

/**
 * Barra que aparece al seleccionar texto.
 *
 * Los cuatro colores van como círculos de 46 px en fila. En escritorio un menú
 * contextual con cuadraditos de 16 px funciona porque hay puntero; aquí cada
 * opción tiene que ser un objetivo cómodo para el pulgar.
 */
export default function SelectionToolbar({ text, onHighlight, onCancel, onCopy, onLookup, onQuote, onCite, estilo = 'fill', onEstilo }) {
    const [writing, setWriting] = useState(false);
    const [comment, setComment] = useState('');
    const [color, setColor] = useState('yellow');

    if (writing) {
        return (
            <div className="scrim" onClick={onCancel} role="presentation">
                <section
                    className="sheet"
                    onClick={(event) => event.stopPropagation()}
                    role="dialog"
                    aria-label="Añadir nota al subrayado"
                >
                    <span className="grip" aria-hidden="true" />
                    <blockquote className="selbar-quote" style={{ WebkitLineClamp: 5 }}>{text}</blockquote>

                    <div className="swatches">
                        {Object.entries(HIGHLIGHT_SWATCHES).map(([id, swatch]) => (
                            <button
                                key={id}
                                type="button"
                                className={`swatch${color === id ? ' on' : ''}`}
                                style={{ background: swatch }}
                                onClick={() => setColor(id)}
                                aria-label={HIGHLIGHT_LABEL_DEFAULTS[id]}
                                aria-pressed={color === id}
                            />
                        ))}
                    </div>

                    <textarea
                        className="note-input"
                        rows={4}
                        placeholder="Tu nota…"
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        autoFocus
                        aria-label="Nota"
                    />

                    <div className="sheet-actions">
                        <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
                        <button type="button" className="btn btn-primary" onClick={() => onHighlight(color, comment)}>
                            Guardar
                        </button>
                    </div>
                </section>
            </div>
        );
    }

    return (
        <div className="selbar" role="dialog" aria-label="Acciones de selección">
            <blockquote className="selbar-quote">{text}</blockquote>

            {/* La forma de marcar, antes que el color.

                Con cinco colores y tres formas hay quince marcas distinguibles;
                solo con colores hay cinco y hay que acordarse de qué significaba
                cada uno. La forma va primero porque es lo que se decide antes: se
                elige subrayar o tachar, y luego de qué color. */}
            {onEstilo && (
                <div className="formas" role="group" aria-label="Forma de la marca">
                    {Object.entries(HIGHLIGHT_STYLES).map(([id, forma]) => (
                        <button
                            key={id}
                            type="button"
                            className={`forma forma-${id}${estilo === id ? ' on' : ''}`}
                            onClick={() => onEstilo(id)}
                            aria-pressed={estilo === id}
                            aria-label={forma.label}
                            title={forma.label}
                        >
                            Aa
                        </button>
                    ))}
                </div>
            )}

            <div className="swatches">
                {Object.entries(HIGHLIGHT_SWATCHES).map(([id, swatch]) => (
                    <button
                        key={id}
                        type="button"
                        className="swatch"
                        style={{ background: swatch }}
                        onClick={() => onHighlight(id, '')}
                        aria-label={`Marcar en ${HIGHLIGHT_LABEL_DEFAULTS[id].toLowerCase()}`}
                    />
                ))}
            </div>

            <div className="selbar-actions">
                <button type="button" className="link-btn" onClick={() => setWriting(true)}>Nota</button>
                {/* El diccionario solo aparece si la selección es una palabra:
                    ofrecerlo sobre un párrafo entero sería una promesa falsa. */}
                {onLookup && isLookupable(text) && (
                    <button type="button" className="link-btn" onClick={() => onLookup(text)}>Definir</button>
                )}
                {onQuote && <button type="button" className="link-btn" onClick={() => onQuote(text)}>Compartir</button>}
                <button type="button" className="link-btn" onClick={onCopy}>Copiar</button>
                {/* «Citar» y «Copiar» son cosas distintas: copiar es para
                    pegarlo en un chat, citar es para que el fragmento conserve
                    de dónde salió cuando ya esté fuera del libro. */}
                {onCite && <button type="button" className="link-btn" onClick={() => onCite(text)}>Citar</button>}
                <button type="button" className="link-btn" onClick={onCancel}>Cerrar</button>
            </div>
        </div>
    );
}
