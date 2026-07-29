import React from 'react';

/**
 * Interruptor de ajuste, con etiqueta y explicación opcional.
 *
 * Vivía dentro de `ReaderSettingsSheet` y ahora lo usan también el panel de
 * pantalla y los ajustes generales. Es un `button` con `role="switch"` y no un
 * `<input type="checkbox">` porque así el área tocable es el propio control
 * dibujado, sin la casilla nativa debajo que Android pinta a su manera.
 */
export default function Switch({ label, hint, checked, onChange }) {
    return (
        <div className="setting setting-row">
            <span className="setting-label">
                <span>
                    {label}
                    {hint && <span className="option-desc" style={{ display: 'block' }}>{hint}</span>}
                </span>
            </span>
            <button
                type="button"
                className={`switch${checked ? ' on' : ''}`}
                onClick={() => onChange(!checked)}
                role="switch"
                aria-checked={Boolean(checked)}
                aria-label={label}
            />
        </div>
    );
}
