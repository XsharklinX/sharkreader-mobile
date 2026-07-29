import React, { useMemo, useState } from 'react';
import { ACHIEVEMENTS, RARITY, isAchievementVisible } from '../core/achievements.js';
import { buildAchievementContext } from './achievementContext.js';
import { IconTrophy } from '../ui/icons.jsx';

const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];

const formatDate = (timestamp) =>
    timestamp ? new Date(timestamp).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' }) : '';

/**
 * Los 59 logros con su estado real.
 *
 * Vive dentro de Progreso, no en su propia pestaña. El anillo de arriba resume
 * el avance de un vistazo, que es lo que se viene a ver; el listado completo
 * queda debajo para quien quiera buscar el siguiente.
 */
export default function AchievementsPanel({ books, stats, achievements }) {
    const [onlyUnlocked, setOnlyUnlocked] = useState(false);
    const context = useMemo(() => buildAchievementContext(books, stats), [books, stats]);

    const groups = useMemo(() => {
        const visible = ACHIEVEMENTS.filter((a) => isAchievementVisible(a, context, achievements));
        return RARITY_ORDER.map((rarity) => ({
            rarity,
            list: visible
                .filter((a) => a.rarity === rarity)
                .filter((a) => !onlyUnlocked || achievements[a.id])
                .sort((a, b) => Number(Boolean(achievements[b.id])) - Number(Boolean(achievements[a.id]))),
        })).filter((group) => group.list.length > 0);
    }, [context, achievements, onlyUnlocked]);

    const unlocked = ACHIEVEMENTS.filter((a) => achievements[a.id]).length;
    const percent = Math.round((unlocked / ACHIEVEMENTS.length) * 100);
    const circumference = 2 * Math.PI * 30;

    return (
        <>
            <section className="card">
                <div className="ach-summary">
                    <div className="ach-ring">
                        <svg viewBox="0 0 68 68" aria-hidden="true">
                            <circle cx="34" cy="34" r="30" fill="none" stroke="var(--sf-3)" strokeWidth="5" />
                            <circle
                                cx="34" cy="34" r="30" fill="none"
                                stroke="var(--accent)" strokeWidth="5" strokeLinecap="round"
                                strokeDasharray={circumference}
                                strokeDashoffset={circumference * (1 - percent / 100)}
                            />
                        </svg>
                        <b>{percent}%</b>
                    </div>
                    <div className="head-txt">
                        <span className="section-title">{unlocked} de {ACHIEVEMENTS.length}</span>
                        <div className="rarity-legend">
                            {RARITY_ORDER.map((rarity) => {
                                const total = ACHIEVEMENTS.filter((a) => a.rarity === rarity).length;
                                const done = ACHIEVEMENTS.filter((a) => a.rarity === rarity && achievements[a.id]).length;
                                return (
                                    <span className="rarity-chip" key={rarity}>
                                        <span className="rarity-dot" style={{ background: RARITY[rarity].color }} />
                                        <span className="mono">{done}/{total}</span>
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </section>

            <div className="pills">
                <button type="button" className={`pill${!onlyUnlocked ? ' on' : ''}`} onClick={() => setOnlyUnlocked(false)}>
                    Todos
                </button>
                <button type="button" className={`pill${onlyUnlocked ? ' on' : ''}`} onClick={() => setOnlyUnlocked(true)}>
                    Conseguidos
                </button>
            </div>

            {groups.length === 0 ? (
                <div className="empty">
                    <span className="empty-art"><IconTrophy size={36} /></span>
                    <h2 className="empty-title">Todavía ninguno</h2>
                    <p className="empty-body">Abre un libro y empieza a leer: el primero cae enseguida.</p>
                </div>
            ) : groups.map(({ rarity, list }) => (
                <section className="section" key={rarity}>
                    <div className="section-head">
                        <h3 className="section-title" style={{ color: RARITY[rarity].color, fontSize: 'var(--t-small)' }}>
                            {RARITY[rarity].label}
                        </h3>
                    </div>
                    <ul className="ach-list">
                        {list.map((achievement) => {
                            const got = achievements[achievement.id];
                            return (
                                <li className={`ach${got ? '' : ' locked'}`} key={achievement.id}>
                                    <span
                                        className="ach-medal"
                                        style={got ? { background: RARITY[rarity].bg, boxShadow: `inset 0 0 0 1.5px ${RARITY[rarity].border}` } : undefined}
                                        aria-hidden="true"
                                    >
                                        {got ? achievement.emoji : '🔒'}
                                    </span>
                                    <span className="ach-txt">
                                        <span className="ach-name">{achievement.name}</span>
                                        <span className="ach-desc">{achievement.desc}</span>
                                    </span>
                                    {got && <span className="ach-date">{formatDate(got.unlockedAt)}</span>}
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ))}
        </>
    );
}
