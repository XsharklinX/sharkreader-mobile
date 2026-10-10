import React, { useEffect, useState } from 'react';
import { useBackHandler } from '../ui/useBackHandler.js';
import { IconClose, IconTranslate } from '../ui/icons.jsx';

/**
 * La traducción de lo seleccionado, en una hoja.
 *
 * Para una frase suelta. Para leer a dos idiomas está el modo de tocar el
 * párrafo, que pone la traducción en la propia página.
 */
export default function TraduccionSheet({ texto, traducir, onClose }) {
    const [resultado, setResultado] = useState(null);
    const [error, setError] = useState(null);

    useBackHandler(() => { onClose(); return true; });

    useEffect(() => {
        let vivo = true;
        traducir(texto)
            .then((t) => { if (vivo) setResultado(t); })
            .catch((e) => { if (vivo) setError(e?.message || 'No se ha podido traducir.'); });
        return () => { vivo = false; };
    }, [texto, traducir]);

    return (
        <div className="scrim" onClick={onClose} role="presentation">
            <section className="sheet traduccion" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Traducción">
                <span className="grip" aria-hidden="true" />
                <div className="drawer-head">
                    <h2 className="section-title"><IconTranslate size={18} /> Traducción</h2>
                    <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><IconClose size={20} /></button>
                </div>
                <p className="traduccion-original">{texto}</p>
                {!resultado && !error && <p className="card-body">Traduciendo en el teléfono…</p>}
                {resultado && <p className="traduccion-texto">{resultado}</p>}
                {error && <p className="card-body">{error}</p>}
                <p className="traduccion-nota">La traducción se hace en el teléfono: el texto no sale de él.</p>
            </section>
        </div>
    );
}
