import React from 'react';
import { IconClose } from '../ui/icons.jsx';

/**
 * Nota al pie, sin salir de la página.
 *
 * Sube desde abajo, se lee y se cierra. La página no se ha movido, que es todo
 * el objetivo: hasta ahora tocar un número volado te llevaba al final del
 * capítulo y tenías que encontrar el camino de vuelta a mano.
 *
 * Se hereda la paleta del tema de lectura para que no sea un rectángulo del
 * sistema aterrizando encima de una página en sepia.
 */
export default function FootnoteSheet({ note, palette, onGoToNotes, onClose }) {
    const light = palette?.ui === 'light';

    return (
        <div className="scrim" onClick={onClose} role="presentation">
            <section
                className="sheet footnote"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label={`Nota ${note.label}`}
                style={{
                    background: light ? '#FFFFFF' : '#1B222C',
                    color: palette?.text || 'inherit',
                }}
            >
                <span className="grip" aria-hidden="true" />

                <div className="footnote-head">
                    <span className="footnote-label">
                        {note.label ? `Nota ${note.label}` : 'Nota'}
                    </span>
                    <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
                        <IconClose size={20} />
                    </button>
                </div>

                <p className="footnote-text">{note.text || 'Esta nota está vacía.'}</p>

                <div className="sheet-actions">
                    <button type="button" className="btn" onClick={() => onGoToNotes(note.href)}>
                        Ir a las notas
                    </button>
                    <button type="button" className="btn btn-primary" onClick={onClose}>
                        Seguir leyendo
                    </button>
                </div>
            </section>
        </div>
    );
}
