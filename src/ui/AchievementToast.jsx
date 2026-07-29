import React, { useEffect } from 'react';
import { RARITY } from '../core/achievements.js';

/**
 * Aviso de logro desbloqueado.
 *
 * Aparece arriba y no abajo: la parte inferior es zona de pulgar, y un aviso que
 * se puede tocar sin querer mientras se navega estorba más de lo que celebra.
 * Si caen varios a la vez se muestran apilados, no en cola: el usuario acaba de
 * hacer algo que merece los tres.
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
            {achievements.slice(0, 3).map((achievement) => (
                <div
                    key={achievement.id}
                    className="toast"
                    style={{
                        background: RARITY[achievement.rarity].bg,
                        borderColor: RARITY[achievement.rarity].border,
                    }}
                >
                    <span className="toast-emoji" aria-hidden="true">{achievement.emoji}</span>
                    <span className="toast-text">
                        <strong>{achievement.name}</strong>
                        <span style={{ color: RARITY[achievement.rarity].color }}>
                            {RARITY[achievement.rarity].label}
                        </span>
                    </span>
                    <button
                        type="button"
                        className="icon-btn ghost"
                        onClick={onDismiss}
                        aria-label="Cerrar"
                    >
                        ×
                    </button>
                </div>
            ))}
            {achievements.length > 3 && (
                <p className="toast-more mono">y {achievements.length - 3} más</p>
            )}
        </div>
    );
}
