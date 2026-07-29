import React, { useState } from 'react';
import {
    GESTURE_ACTIONS, ZONE_LABELS, DEFAULT_GESTURE_GRID,
    normalizeGrid, withZone, mirrorGrid, canTurnPages,
} from './gestureGrid.js';

/**
 * Editor de la rejilla de gestos.
 *
 * Se edita **sobre una maqueta de la pantalla**, no sobre una lista de nueve
 * filas. «Arriba izquierda: página anterior» obliga a traducir mentalmente cada
 * vez; el rectángulo con la acción escrita dentro se entiende sin traducir
 * nada, que es justo lo que hace falta cuando estás decidiendo dónde va a
 * quedarte el pulgar.
 */
export default function GestureGridSheet({ grid, onChange, onClose }) {
    const zones = normalizeGrid(grid);
    const [editing, setEditing] = useState(null);

    const assign = (action) => {
        onChange(withZone(zones, editing, action));
        setEditing(null);
    };

    if (editing !== null) {
        return (
            <div className="scrim" onClick={() => setEditing(null)} role="presentation">
                <section
                    className="sheet"
                    onClick={(event) => event.stopPropagation()}
                    role="dialog"
                    aria-label={`Acción para ${ZONE_LABELS[editing]}`}
                >
                    <span className="grip" aria-hidden="true" />
                    <h2 className="section-title">{ZONE_LABELS[editing]}</h2>

                    <div className="option-list">
                        {Object.entries(GESTURE_ACTIONS).map(([id, action]) => (
                            <button
                                key={id}
                                type="button"
                                className={`option${zones[editing] === id ? ' on' : ''}`}
                                onClick={() => assign(id)}
                                aria-pressed={zones[editing] === id}
                            >
                                <span className="option-txt">
                                    <span className="option-name">{action.label}</span>
                                    <span className="option-desc">{action.description}</span>
                                </span>
                                <span className="option-mark" aria-hidden="true" />
                            </button>
                        ))}
                    </div>
                </section>
            </div>
        );
    }

    return (
        <div className="scrim" onClick={onClose} role="presentation">
            <section
                className="sheet"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label="Gestos de la pantalla"
            >
                <span className="grip" aria-hidden="true" />
                <h2 className="section-title">Gestos</h2>
                <p className="option-desc">
                    Toca una zona para elegir qué hace. Las columnas laterales son
                    más estrechas a propósito: es el ancho que abarca el pulgar sin
                    mover la mano.
                </p>

                {/* La maqueta guarda la proporción de la pantalla real, con las
                    columnas laterales estrechas, para que lo que se ve aquí sea
                    lo que luego se toca. */}
                <div className="gesture-grid" role="group" aria-label="Zonas de la pantalla">
                    {zones.map((action, index) => (
                        <button
                            key={index}
                            type="button"
                            className={`gesture-zone${action === 'none' ? ' off' : ''}`}
                            onClick={() => setEditing(index)}
                            aria-label={`${ZONE_LABELS[index]}: ${GESTURE_ACTIONS[action].label}`}
                        >
                            <span className="gesture-zone-name">
                                {GESTURE_ACTIONS[action].label}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Sin forma de pasar página con el dedo se puede seguir
                    deslizando, pero es un estado al que se llega trasteando y
                    del que cuesta salir si no sabes qué tocaste. */}
                {!canTurnPages(zones) && (
                    <p className="warn-note">
                        Ninguna zona pasa página. Podrás seguir deslizando, pero no
                        tocando.
                    </p>
                )}

                <div className="sheet-actions">
                    <button
                        type="button"
                        className="btn"
                        onClick={() => onChange(mirrorGrid(zones))}
                    >
                        Invertir lados
                    </button>
                    <button
                        type="button"
                        className="btn"
                        onClick={() => onChange([...DEFAULT_GESTURE_GRID])}
                    >
                        Restablecer
                    </button>
                </div>

                <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
                    Listo
                </button>
            </section>
        </div>
    );
}
