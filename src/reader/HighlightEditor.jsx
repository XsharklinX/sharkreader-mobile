import React, { useState } from 'react';
import { HIGHLIGHT_SWATCHES, HIGHLIGHT_LABEL_DEFAULTS, highlightComment } from './annotations.js';
import { normalizeAnnotationText } from '../core/annotationExport.js';
import { IconTrash } from '../ui/icons.jsx';

/**
 * Editar un subrayado que ya existe.
 *
 * Hasta ahora un subrayado era inmutable: para cambiarle el color o añadirle una
 * nota había que borrarlo y volver a seleccionar exactamente el mismo texto, que
 * en un párrafo denso es un ejercicio de puntería. Y el caso normal es
 * precisamente ese —subrayas al vuelo mientras lees y anotas después, cuando has
 * entendido por qué te llamó la atención—.
 *
 * Se abre tocando el subrayado en el libro o desde el panel de anotaciones.
 */
export default function HighlightEditor({ annotation, onSave, onDelete, onClose }) {
    const [color, setColor] = useState(annotation?.color || 'yellow');
    const [comment, setComment] = useState(highlightComment(annotation));

    if (!annotation) return null;

    const text = normalizeAnnotationText(annotation);
    // Guardar sin cambios no debería contar como una edición: si nada ha
    // cambiado, el botón principal simplemente cierra.
    const changed = color !== (annotation.color || 'yellow')
        || comment !== highlightComment(annotation);

    return (
        <div className="scrim" onClick={onClose} role="presentation">
            <section
                className="sheet"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label="Editar subrayado"
            >
                <span className="grip" aria-hidden="true" />

                <div className="sheet-head">
                    <h2 className="section-title">Subrayado</h2>
                    <span className="mono annotation-date">{annotation.date}</span>
                </div>

                <blockquote className="selbar-quote" style={{ WebkitLineClamp: 6 }}>
                    {text || '(sin texto)'}
                </blockquote>

                <div className="setting">
                    <span className="setting-label">Color</span>
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
                </div>

                <div className="setting">
                    <span className="setting-label">Nota</span>
                    <textarea
                        className="note-input"
                        rows={4}
                        placeholder="Por qué te interesó este fragmento…"
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        aria-label="Nota del subrayado"
                    />
                </div>

                <div className="sheet-actions">
                    <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => onDelete(annotation.cfi)}
                    >
                        <IconTrash size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
                        Borrar
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => (changed ? onSave({ color, comment }) : onClose())}
                    >
                        {changed ? 'Guardar' : 'Listo'}
                    </button>
                </div>
            </section>
        </div>
    );
}
