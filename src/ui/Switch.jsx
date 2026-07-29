import React from 'react';

/**
 * Interruptor de ajuste, con etiqueta y explicación opcional.
 *
 * Usa la misma maqueta que `Row` de `Sheet.jsx` —`.sheet-row`— y no una propia.
 * Antes tenía la suya (`.setting.setting-row`) y dentro de las hojas quedaba con
 * otro alto y otra alineación que las filas de al lado: dos controles que hacen
 * lo mismo, sentados de forma distinta.
 *
 * Es un `button` con `role="switch"` y no un `<input type="checkbox">` porque así
 * el área tocable es el control dibujado, sin la casilla nativa debajo que
 * Android pinta a su manera.
 */
export default function Switch({ label, hint, checked, onChange }) {
    return (
        <div className="sheet-row">
            <span className="sheet-row-txt">
                <span className="sheet-row-label">{label}</span>
                {hint && <span className="sheet-row-hint">{hint}</span>}
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
