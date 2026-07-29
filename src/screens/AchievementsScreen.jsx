import React, { useMemo } from 'react';
import { ACHIEVEMENTS, RARITY } from '../core/achievements.js';

const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];
const RARITY_LABEL = {
    common: 'Comunes',
    rare: 'Raros',
    epic: 'Épicos',
    legendary: 'Legendarios',
};

// Los 59 logros ya viven en el core y no dependen de nada de plataforma, así que
// se pueden listar desde la Fase 0. Lo que falta hasta la v0.5.0 es el estado de
// desbloqueo, que necesita las estadísticas de lectura reales.
export default function AchievementsScreen() {
    const groups = useMemo(() => {
        const byRarity = new Map(RARITY_ORDER.map((rarity) => [rarity, []]));
        ACHIEVEMENTS.forEach((achievement) => {
            const bucket = byRarity.get(achievement.rarity);
            if (bucket) bucket.push(achievement);
        });
        return RARITY_ORDER.map((rarity) => ({ rarity, list: byRarity.get(rarity) }));
    }, []);

    return (
        <div className="screen">
            <header>
                <h1 className="screen-title">Logros</h1>
                <p className="screen-sub">
                    {ACHIEVEMENTS.length} logros · el seguimiento se activa en v0.5.0
                </p>
            </header>

            {groups.map(({ rarity, list }) => (
                <section className="card" key={rarity}>
                    <h2 className="card-title">
                        {RARITY_LABEL[rarity]}{' '}
                        <span className="pill" style={{ color: RARITY[rarity]?.color }}>
                            {list.length}
                        </span>
                    </h2>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
                        {list.map((achievement) => (
                            <li
                                key={achievement.id}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '22px 1fr',
                                    gap: 8,
                                    fontSize: 13,
                                    opacity: 0.45,
                                }}
                            >
                                <span aria-hidden="true">{achievement.emoji}</span>
                                <span>
                                    <strong style={{ fontWeight: 600 }}>{achievement.name}</strong>
                                    <span style={{ color: 'var(--text-3)' }}> — {achievement.desc}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    );
}
