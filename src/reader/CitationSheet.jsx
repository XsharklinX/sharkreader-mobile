import React, { useState } from 'react';
import { CITATION_FORMATS, formatCitation, citationPreview } from './citation.js';

/**
 * Copiar un fragmento con su procedencia.
 *
 * El formato elegido se recuerda: quien cita para un trabajo lo hace veinte
 * veces seguidas y siempre igual, y volver a elegir cada vez sería un peaje.
 */
export default function CitationSheet({ source, initialFormat = 'plain', onCopy, onClose }) {
    const [format, setFormat] = useState(initialFormat);

    return (
        <div className="scrim" onClick={onClose} role="presentation">
            <section
                className="sheet"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label="Copiar con cita"
            >
                <span className="grip" aria-hidden="true" />
                <h2 className="section-title">Copiar con cita</h2>

                <div className="option-list">
                    {Object.entries(CITATION_FORMATS).map(([id, option]) => (
                        <button
                            key={id}
                            type="button"
                            className={`option${format === id ? ' on' : ''}`}
                            onClick={() => setFormat(id)}
                            aria-pressed={format === id}
                        >
                            <span className="option-txt">
                                <span className="option-name">{option.label}</span>
                                <span className="option-desc">{option.description}</span>
                            </span>
                            <span className="option-mark" aria-hidden="true" />
                        </button>
                    ))}
                </div>

                {/* La vista previa es lo que decide: los nombres de los formatos
                    no significan nada hasta que ves la forma que tienen. */}
                <pre className="citation-preview">{citationPreview(source, format)}</pre>

                <div className="sheet-actions">
                    <button type="button" className="btn" onClick={onClose}>Cancelar</button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => onCopy(formatCitation(source, format), format)}
                    >
                        Copiar
                    </button>
                </div>
            </section>
        </div>
    );
}
