import React, { useMemo, useState } from 'react';
import { getLines, pickRandom } from '../core/sharkyDialogues.js';

/**
 * Sharky, en versión contenida.
 *
 * El escritorio tiene mascota de pixel art con sprites emocionales, emotes
 * animados y cosméticos desbloqueables por nivel. Aquí es una tarjeta con una
 * frase, descartable y **desactivada por defecto**: se reutiliza el guion del
 * núcleo compartido (que es el trabajo de verdad, 76 KB escritos a mano) sin
 * portar toda la capa de animación.
 *
 * Está preparado para crecer: elegir el tono según el contexto ya funciona, así
 * que añadir sprites más adelante es cambiar cómo se pinta, no qué se dice.
 */

/** Qué tipo de frase toca, según lo que esté pasando en la biblioteca. */
export const pickMood = ({ streak = 0, reading = 0, minutesToday = 0, hour = 12 }) => {
    if (streak > 0 && minutesToday > 0) return 'celebrate';
    if (hour >= 23 || hour < 6) return 'sleepy';
    if (reading > 0) return 'focus';
    if (reading === 0) return 'curious';
    return 'idle';
};

export default function Sharky({ personality = 'friendly', context = {}, onDisable }) {
    const [dismissed, setDismissed] = useState(false);

    const line = useMemo(() => {
        const mood = pickMood({ ...context, hour: new Date().getHours() });
        const lines = getLines(personality, 'es');
        // Si un tono no tiene frases en esta personalidad, se cae a 'idle', que
        // siempre existe.
        return pickRandom(lines[mood]?.length ? lines[mood] : lines.idle);
    }, [personality, context]);

    if (dismissed || !line) return null;

    return (
        <aside className="sharky" role="note">
            <span className="sharky-face" aria-hidden="true">🦈</span>
            <p className="sharky-line">{line}</p>
            <div className="sharky-actions">
                <button
                    type="button"
                    className="icon-btn ghost"
                    onClick={() => setDismissed(true)}
                    aria-label="Ocultar por ahora"
                >
                    ×
                </button>
                {onDisable && (
                    <button type="button" className="link-btn sharky-off" onClick={onDisable}>
                        No mostrar
                    </button>
                )}
            </div>
        </aside>
    );
}
