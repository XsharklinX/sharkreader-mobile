import React from 'react';
import { haceCuanto } from '../library/escritorio.js';
import { useBackHandler } from '../ui/useBackHandler.js';
import { IconLink } from '../ui/icons.jsx';

/**
 * «En el ordenador ibas más adelante.»
 *
 * Sale al abrir un libro que se siguió leyendo en SharkReader de escritorio. No
 * salta solo: puede que hayas vuelto atrás a propósito en el móvil, y mover a
 * alguien de página sin preguntar es peor que no hacer nada.
 *
 * @param {Object} props
 * @param {{progreso: number, cuando: number, dispositivo: string}} props.posicion
 * @param {string} [props.donde] cómo se llama ese punto: capítulo, página…
 */
export default function PosicionRemotaSheet({ posicion, donde, onIr, onQuedarse }) {
    useBackHandler(() => { onQuedarse(); return true; });

    const porcentaje = Math.round((posicion.progreso || 0) * 100);

    return (
        <div className="scrim" onClick={onQuedarse} role="presentation">
            <section
                className="sheet posicion-remota"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label="Posición en el ordenador"
            >
                <span className="grip" aria-hidden="true" />
                <span className="posicion-eyebrow">
                    <IconLink size={14} /> {posicion.dispositivo} · {haceCuanto(posicion.cuando)}
                </span>
                <h2 className="posicion-titulo">
                    {donde ? `Ibas por ${donde}` : `Ibas por el ${porcentaje} %`}
                </h2>
                <p className="card-body">
                    {donde ? `${porcentaje} % del libro. ` : ''}Aquí lo dejaste antes de eso.
                </p>
                <div className="sheet-actions">
                    <button type="button" className="btn" onClick={onQuedarse}>Quedarme aquí</button>
                    <button type="button" className="btn btn-primary" onClick={onIr}>Ir allí</button>
                </div>
            </section>
        </div>
    );
}
