import React, { useMemo, useState } from 'react';
import { parseGoTo, goToHint } from './navigation.js';

/**
 * Saltar a un punto escribiéndolo.
 *
 * Arrastrar la barra sirve para moverse a ojo. No sirve para volver a la
 * posición 412 que alguien te ha dicho, ni para retomar por donde ibas en la
 * edición en papel: con el pulgar sobre una barra de 300 px, cada píxel son
 * varias páginas y acertar es imposible.
 *
 * El destino se confirma antes de saltar. Sin la confirmación, un dedo torpe te
 * saca del sitio en el que estabas leyendo y recuperarlo es un problema.
 */
export default function GoToSheet({ totalLocations, currentLocation, onGo, onClose }) {
    const [value, setValue] = useState('');
    const target = useMemo(() => parseGoTo(value, totalLocations), [value, totalLocations]);

    const submit = (event) => {
        event.preventDefault();
        if (target) onGo(target);
    };

    return (
        <div className="scrim" onClick={onClose} role="presentation">
            <section
                className="sheet"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label="Ir a una posición"
            >
                <span className="grip" aria-hidden="true" />
                <h2 className="section-title">Ir a</h2>

                <form onSubmit={submit}>
                    <input
                        className="text-input goto-input"
                        // 'text' y no 'number': hay que poder escribir «35 %» y
                        // «12/340», y un campo numérico no los admite.
                        type="text"
                        inputMode="numeric"
                        placeholder="pág. 134, 35 % o 120"
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                        aria-label="Posición de destino"
                        autoFocus
                    />

                    <p className="option-desc goto-feedback">
                        {value.trim() === ''
                            ? goToHint(totalLocations)
                            : target
                                ? `Ir a ${target.label}`
                                : 'No se entiende. Prueba con pág. 134, 35 % o 120.'}
                    </p>

                    {totalLocations > 0 && (
                        <p className="option-desc">
                            Vas por la posición {currentLocation + 1} de {totalLocations}.
                            {' '}El total cambia si cambias el tamaño de letra.
                        </p>
                    )}

                    <div className="sheet-actions">
                        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
                        <button type="submit" className="btn btn-primary" disabled={!target}>
                            Ir
                        </button>
                    </div>
                </form>
            </section>
        </div>
    );
}
