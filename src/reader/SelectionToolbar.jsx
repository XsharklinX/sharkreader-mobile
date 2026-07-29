import React, { useState } from 'react';
import { HIGHLIGHT_SWATCHES, HIGHLIGHT_LABEL_DEFAULTS } from './annotations.js';
import { isLookupable } from './dictionary.js';

/**
 * Barra que aparece al seleccionar texto.
 *
 * Los cuatro colores van como círculos de 46 px en fila. En escritorio un menú
 * contextual con cuadraditos de 16 px funciona porque hay puntero; aquí cada
 * opción tiene que ser un objetivo cómodo para el pulgar.
 */
export default function SelectionToolbar({ text, onHighlight, onCancel, onCopy, onLookup, onQuote }) {
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

            <div className="swatches">
                {Object.entries(HIGHLIGHT_SWATCHES).map(([id, swatch]) => (
                    <button
                        key={id}
                        type="button"
                        className="swatch"
                        style={{ background: swatch }}
                        onClick={() => onHighlight(id, '')}
                        aria-label={`Subrayar en ${HIGHLIGHT_LABEL_DEFAULTS[id].toLowerCase()}`}
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
                <button type="button" className="link-btn" onClick={onCancel}>Cerrar</button>
            </div>
        </div>
    );
}
