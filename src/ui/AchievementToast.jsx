import React, { useEffect } from 'react';
import { RARITY } from '../core/achievements.js';
import { IconClose } from './icons.jsx';

/**
 * Aviso de logro desbloqueado.
 *
 * Anclado abajo, sobre la barra de pestañas, y con **fondo sólido**. La versión
 * anterior usaba como fondo el color `bg` de la rareza, que en el escritorio es
 * una capa translúcida pensada para ir encima de una tarjeta ya opaca: sobre el
 * contenido de la app se leía fatal y parecía un error de dibujo. Aquí ese color
 * se usa solo en la medalla, que es donde aporta.
 */
export default function AchievementToast({ achievements, onDismiss }) {
    useEffect(() => {
        if (!achievements.length) return undefined;
        const timer = setTimeout(onDismiss, 6000);
        return () => clearTimeout(timer);
    }, [achievements, onDismiss]);

    if (!achievements.length) return null;

    return (
        <div className="toast-stack" role="status" aria-live="polite">
            {achievements.slice(0, 2).map((achievement) => {
                const rarity = RARITY[achievement.rarity];
                return (
                    <div className="toast" key={achievement.id}>
                        <span
                            className="toast-medal"
                            style={{ background: rarity.bg, boxShadow: `inset 0 0 0 1.5px ${rarity.border}` }}
                            aria-hidden="true"
                        >
                            {achievement.emoji}
                        </span>
                        <span className="toast-txt">
                            <span className="toast-kicker" style={{ color: rarity.color }}>
                                Logro {rarity.label.toLowerCase()}
                            </span>
                            <span className="toast-name">{achievement.name}</span>
                        </span>
                        <button type="button" className="icon-btn" style={{ minWidth: 36, minHeight: 36 }} onClick={onDismiss} aria-label="Cerrar">
                            <IconClose size={17} />
                        </button>
                    </div>
                );
            })}
            {achievements.length > 2 && (
                <p className="toast-more">y {achievements.length - 2} más</p>
            )}
        </div>
    );
}
