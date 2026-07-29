import React, { useMemo, useState } from 'react';
import { ACHIEVEMENTS, RARITY, isAchievementVisible } from '../core/achievements.js';
import { buildAchievementContext } from '../stats/achievementContext.js';

const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];

const formatUnlockDate = (timestamp) =>
    timestamp ? new Date(timestamp).toLocaleDateString('es-ES', {
        day: 'numeric', month: 'short', year: 'numeric',
    }) : '';

/**
 * Los 59 logros con su estado real.
 *
 * Las condiciones vienen del núcleo compartido sin tocar: un logro se desbloquea
 * en el móvil exactamente con el mismo criterio que en escritorio, y por eso al
 * importar un backup los logros ya ganados se conservan con su fecha original.
 */
export default function AchievementsScreen({ library, stats: statsApi }) {
    const [onlyUnlocked, setOnlyUnlocked] = useState(false);
    const books = library?.books || [];
    const { achievements, stats } = statsApi;

    const context = useMemo(() => buildAchievementContext(books, stats), [books, stats]);

    const groups = useMemo(() => {
        const visible = ACHIEVEMENTS.filter(
            (achievement) => isAchievementVisible(achievement, context, achievements)
        );
        return RARITY_ORDER.map((rarity) => ({
            rarity,
            list: visible
                .filter((achievement) => achievement.rarity === rarity)
                .filter((achievement) => !onlyUnlocked || achievements[achievement.id])
                // Los desbloqueados primero: es lo que el usuario quiere ver.
                .sort((a, b) => Number(Boolean(achievements[b.id])) - Number(Boolean(achievements[a.id]))),
        })).filter((group) => group.list.length > 0);
    }, [context, achievements, onlyUnlocked]);

    const unlockedCount = ACHIEVEMENTS.filter((achievement) => achievements[achievement.id]).length;
    const percent = Math.round((unlockedCount / ACHIEVEMENTS.length) * 100);

    return (
        <div className="screen">
            <header>
                <h1 className="screen-title">Logros</h1>
                <p className="screen-sub">
                    {unlockedCount} de {ACHIEVEMENTS.length} desbloqueados
                </p>
            </header>

            <section className="card">
                <span className="goal-bar">
                    <i style={{ width: `${percent}%` }} />
                </span>
                <div className="rarity-legend">
                    {RARITY_ORDER.map((rarity) => {
                        const total = ACHIEVEMENTS.filter((a) => a.rarity === rarity).length;
                        const done = ACHIEVEMENTS.filter((a) => a.rarity === rarity && achievements[a.id]).length;
                        return (
                            <span key={rarity} className="rarity-chip" style={{ color: RARITY[rarity].color }}>
                                {RARITY[rarity].label}
                                <span className="mono"> {done}/{total}</span>
                            </span>
                        );
                    })}
                </div>
            </section>

            <div className="pills">
                <button
                    type="button"
                    className={`pill-btn${!onlyUnlocked ? ' on' : ''}`}
                    onClick={() => setOnlyUnlocked(false)}
                    aria-pressed={!onlyUnlocked}
                >
                    Todos
                </button>
                <button
                    type="button"
                    className={`pill-btn${onlyUnlocked ? ' on' : ''}`}
                    onClick={() => setOnlyUnlocked(true)}
                    aria-pressed={onlyUnlocked}
                >
                    Conseguidos
                </button>
            </div>

            {groups.length === 0 ? (
                <div className="empty">
                    <span className="empty-emoji" aria-hidden="true">🏆</span>
                    <h2 className="empty-title">Todavía ninguno</h2>
                    <p className="empty-body">Abre un libro y empieza a leer: el primero cae enseguida.</p>
                </div>
            ) : groups.map(({ rarity, list }) => (
                <section className="card" key={rarity}>
                    <h2 className="card-title" style={{ color: RARITY[rarity].color }}>
                        {RARITY[rarity].label}
                    </h2>
                    <ul className="achievement-list">
                        {list.map((achievement) => {
                            const unlocked = achievements[achievement.id];
                            return (
                                <li
                                    key={achievement.id}
                                    className={`achievement${unlocked ? ' unlocked' : ''}`}
                                    style={unlocked ? {
                                        background: RARITY[rarity].bg,
                                        borderColor: RARITY[rarity].border,
                                    } : undefined}
                                >
                                    <span className="achievement-emoji" aria-hidden="true">
                                        {unlocked ? achievement.emoji : '🔒'}
                                    </span>
                                    <span className="achievement-text">
                                        <strong>{achievement.name}</strong>
                                        <span>{achievement.desc}</span>
                                        {unlocked && (
                                            <span className="mono achievement-date">
                                                {formatUnlockDate(unlocked.unlockedAt)}
                                            </span>
                                        )}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ))}
        </div>
    );
}
