import React, { useState } from 'react';
import { PAGE_TRANSITIONS } from './transitions.js';

/**
 * Selector de animación con vista previa.
 *
 * ## Por qué no una lista con descripciones
 *
 * Antes eran siete filas con nombre y frase explicativa: «Empujar — con más
 * recorrido, como pasar una hoja de verdad». Para elegir había que leer las
 * siete, imaginarse cada una y probarlas cerrando y abriendo la hoja. Nadie hace
 * eso: se toca la primera o se deja como está.
 *
 * Aquí cada opción es una **maqueta que se anima al tocarla**. Se ve lo que hace
 * antes de elegirlo, y elegir vuelve a animarla para confirmar. Sin leer nada.
 *
 * La maqueta lleva rayas en lugar de texto a propósito: a este tamaño el texto
 * sería ilegible y lo que se juzga es el movimiento, no la tipografía.
 */
export default function TransitionPicker({ value, onChange }) {
    // Cuál se está animando ahora. Se anima una a una: siete rectángulos
    // moviéndose al mismo tiempo no dejan mirar ninguno.
    const [playing, setPlaying] = useState(null);

    const play = (id) => {
        onChange(id);
        setPlaying(null);
        // Un fotograma con la clase quitada para poder volver a añadirla: sin
        // esto, tocar dos veces la misma opción no repite la animación.
        requestAnimationFrame(() => setPlaying(id));
    };

    return (
        <div className="turn-picker" role="radiogroup" aria-label="Animación al pasar página">
            {Object.entries(PAGE_TRANSITIONS).map(([id, spec]) => (
                <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={value === id}
                    className={`turn-option${value === id ? ' on' : ''}`}
                    onClick={() => play(id)}
                    onAnimationEnd={() => setPlaying(null)}
                >
                    <span className={`turn-demo demo-${id}${playing === id ? ' playing' : ''}`}>
                        {/* Hoja de debajo: la que se destapa. */}
                        <span className="demo-under" aria-hidden="true" />
                        {/* Hoja de encima: la que se mueve. */}
                        <span className="demo-sheet" aria-hidden="true">
                            <i /><i /><i /><i />
                        </span>
                    </span>
                    <span className="turn-name">{spec.label}</span>
                </button>
            ))}
        </div>
    );
}
