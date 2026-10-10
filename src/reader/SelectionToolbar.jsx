import React, { useEffect, useState } from 'react';
import BotonDictar, { puedeDictar } from '../ui/BotonDictar.jsx';
import { HIGHLIGHT_SWATCHES, HIGHLIGHT_LABEL_DEFAULTS, HIGHLIGHT_STYLES } from './annotations.js';
import { isLookupable } from './dictionary.js';

/**
 * Barra que aparece al seleccionar texto.
 *
 * Los cuatro colores van como círculos de 46 px en fila. En escritorio un menú
 * contextual con cuadraditos de 16 px funciona porque hay puntero; aquí cada
 * opción tiene que ser un objetivo cómodo para el pulgar.
 */
/**
 * ¿Parece un nombre propio? Una a cuatro palabras y todas, salvo conectores,
 * con mayúscula. Solo entonces se ofrece «¿Quién es?».
 */
const pareceNombre = (texto) => {
    const palabras = String(texto || '').trim().split(/\s+/);
    if (!palabras[0] || palabras.length > 4) return false;
    return palabras.every((p) => /^\p{Lu}/u.test(p) || /^(de|del|la|las|los|van|von|y)$/i.test(p));
};

export default function SelectionToolbar({ text, onHighlight, onCancel, onCopy, onLookup, onQuote, onCite, onWho, onTranslate, estilo = 'fill', onEstilo }) {
    const [writing, setWriting] = useState(false);
    const [comment, setComment] = useState('');
    const [dictado, setDictado] = useState(false);
    useEffect(() => { puedeDictar().then(setDictado); }, []);
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

                    {/* Dictar va primero: el teclado tapa media página, justo el
                        texto que se comenta. Con dictado, el teclado no se abre
                        solo; sin él, sí. */}
                    <BotonDictar valor={comment} onCambio={setComment} />
                    <textarea
                        className="note-input"
                        rows={4}
                        placeholder="Tu nota…"
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        autoFocus={!dictado}
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
                {/* Un nombre propio no se define: se pregunta quién es. */}
                {onWho && pareceNombre(text) && (
                    <button type="button" className="link-btn" onClick={() => onWho(text)}>¿Quién es?</button>
                )}
                {onLookup && isLookupable(text) && !(onWho && pareceNombre(text)) && (
                    <button type="button" className="link-btn" onClick={() => onLookup(text)}>Definir</button>
                )}
                {onTranslate && <button type="button" className="link-btn" onClick={() => onTranslate(text)}>Traducir</button>}
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
