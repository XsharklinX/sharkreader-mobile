import React, { useState } from 'react';
import { HIGHLIGHT_SWATCHES, HIGHLIGHT_LABEL_DEFAULTS } from './annotations.js';

/**
 * Barra que aparece al seleccionar texto.
 *
 * Los cuatro colores van como botones grandes en fila, no en un menú
 * contextual: en escritorio un menú está a un clic de precisión, aquí cada
 * opción tiene que ser un objetivo cómodo para el pulgar.
 */
export default function SelectionToolbar({ text, onHighlight, onCancel, onCopy }) {
    const [writing, setWriting] = useState(false);
    const [comment, setComment] = useState('');
    const [color, setColor] = useState('yellow');

    const preview = text.length > 140 ? `${text.slice(0, 140)}…` : text;

    if (writing) {
        return (
            <div className="sheet-backdrop" onClick={onCancel} role="presentation">
                <section
                    className="sheet"
                    onClick={(event) => event.stopPropagation()}
                    role="dialog"
                    aria-label="Añadir nota al subrayado"
                >
                    <div className="sheet-grip" aria-hidden="true" />
                    <blockquote className="selection-quote">{preview}</blockquote>

                    <div className="pills">
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
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => onHighlight(color, comment)}
                        >
                            Guardar
                        </button>
                    </div>
                </section>
            </div>
        );
    }

    return (
        <div className="selection-bar" role="dialog" aria-label="Acciones de selección">
            <div className="selection-colors">
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
            <div className="selection-actions">
                <button type="button" className="link-btn" onClick={() => setWriting(true)}>Nota</button>
                <button type="button" className="link-btn" onClick={onCopy}>Copiar</button>
                <button type="button" className="link-btn" onClick={onCancel}>Cerrar</button>
            </div>
        </div>
    );
}
