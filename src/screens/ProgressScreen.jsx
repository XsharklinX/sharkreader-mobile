import React, { useMemo, useState } from 'react';
import AchievementsPanel from '../stats/AchievementsPanel.jsx';
import {
    buildHeatmap, buildSeries, buildSummary, topBooks, peakHour, formatMinutes,
} from '../stats/derive.js';
import { IconChart, IconFlame, IconClock, IconTrophy, IconSettings } from '../ui/icons.jsx';

const PERIODS = [
    { id: 'week', label: 'Semana' },
    { id: 'month', label: 'Mes' },
    { id: 'year', label: 'Año' },
];

const Goal = ({ label, done, target }) => {
    const percent = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
    const met = done >= target;
    return (
        <div className="goal">
            <div className="goal-head">
                <span>{label}</span>
                <span className="mono">{formatMinutes(done)} / {formatMinutes(target)}</span>
            </div>
            <span className="bar"><i className={met ? 'ok' : ''} style={{ width: `${percent}%` }} /></span>
        </div>
    );
};

/**
 * Progreso, con los logros dentro en lugar de en su propia pestaña.
 *
 * Son la misma pregunta —«¿cómo voy?»— y separarlos gastaba una de las cinco
 * ranuras de la barra inferior en algo que se consulta de vez en cuando.
 */
export default function ProgressScreen({ library, stats: statsApi, onGoToSettings }) {
    const [tab, setTab] = useState('stats');
    const [period, setPeriod] = useState('week');
    const books = library?.books || [];
    const { stats, goals, level } = statsApi;

    const summary = useMemo(() => buildSummary(stats, books), [stats, books]);
    const heatmap = useMemo(() => buildHeatmap(stats.minutesByDay, 26), [stats.minutesByDay]);
    const series = useMemo(() => buildSeries(stats.minutesByDay, period), [stats.minutesByDay, period]);
    const top = useMemo(() => topBooks(books), [books]);
    const peak = useMemo(() => peakHour(stats.hourlyLog), [stats.hourlyLog]);

    const maxInSeries = Math.max(1, ...series.map((point) => point.minutes));
    const hasData = summary.totalMinutes > 0;

    return (
        <div className="screen">
            <header className="head">
                <div className="head-txt">
                    <h1 className="head-title">Progreso</h1>
                    <p className="head-sub">
                        {hasData ? `${formatMinutes(summary.totalMinutes)} de lectura en total` : 'Aún sin datos'}
                    </p>
                </div>
                {/* Ajustes ha salido de la barra inferior —estaba duplicado con
                    el de la biblioteca— así que tiene que estar alcanzable
                    también desde aquí. */}
                <button
                    type="button"
                    className="icon-btn"
                    onClick={() => onGoToSettings?.()}
                    aria-label="Ajustes"
                >
                    <IconSettings size={21} />
                </button>
            </header>

            <div className="segmented">
                <button type="button" className={tab === 'stats' ? 'on' : ''} onClick={() => setTab('stats')}>
                    Estadísticas
                </button>
                <button type="button" className={tab === 'achievements' ? 'on' : ''} onClick={() => setTab('achievements')}>
                    Logros
                </button>
            </div>

            {tab === 'achievements' ? (
                <AchievementsPanel books={books} stats={stats} achievements={statsApi.achievements} />
            ) : !hasData ? (
                <div className="empty">
                    <span className="empty-art"><IconChart size={38} /></span>
                    <h2 className="empty-title">Aún no hay nada que contar</h2>
                    <p className="empty-body">
                        Lee unos minutos y aquí aparecerán tu racha, tus horas y el mapa de
                        los días que has leído.
                    </p>
                </div>
            ) : (
                <>
                    <section className="streak">
                        <span className="streak-flame"><IconFlame size={32} /></span>
                        <div className="streak-txt">
                            <span className="streak-n">{summary.streak}</span>
                            <span className="streak-lbl">
                                {summary.streak === 1 ? 'día seguido' : 'días seguidos'}
                            </span>
                            <span className="streak-sub">récord: {summary.maxStreak}</span>
                        </div>
                    </section>

                    <div className="stat-grid">
                        <div className="stat-box">
                            <span className="stat-n">{formatMinutes(summary.today)}</span>
                            <span className="stat-l">hoy</span>
                        </div>
                        <div className="stat-box">
                            <span className="stat-n">{formatMinutes(summary.week)}</span>
                            <span className="stat-l">esta semana</span>
                        </div>
                        <div className="stat-box">
                            <span className="stat-n">{summary.finished}</span>
                            <span className="stat-l">libros terminados</span>
                        </div>
                        <div className="stat-box">
                            <span className="stat-n">{summary.annotations}</span>
                            <span className="stat-l">anotaciones</span>
                        </div>
                    </div>

                    <section className="card">
                        <div className="section-head">
                            <h2 className="card-title">Nivel {level.level}</h2>
                            <span className="section-meta">{level.name}</span>
                        </div>
                        <span className="bar"><i style={{ width: `${level.progress}%` }} /></span>
                        <p className="card-body mono">{level.current} / {level.xpPerLevel} XP para el siguiente</p>
                    </section>

                    <section className="card">
                        <h2 className="card-title">Minutos leídos</h2>
                        <div className="segmented">
                            {PERIODS.map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    className={period === option.id ? 'on' : ''}
                                    onClick={() => setPeriod(option.id)}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                        <div className="chart" role="img" aria-label={`Minutos leídos por ${period}`}>
                            {series.map((point, index) => (
                                <div className="chart-col" key={`${point.label}-${index}`} title={`${point.fullLabel}: ${formatMinutes(point.minutes)}`}>
                                    <span
                                        className={`chart-bar${point.minutes > 0 ? ' on' : ''}`}
                                        style={{ height: `${Math.max(3, Math.round((point.minutes / maxInSeries) * 100))}%` }}
                                    />
                                    <span className="chart-label">{point.label}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="card">
                        <h2 className="card-title">Metas</h2>
                        <Goal label="Hoy" done={summary.today} target={goals.daily} />
                        <Goal label="Esta semana" done={summary.week} target={goals.weekly} />
                    </section>

                    <section className="card">
                        <h2 className="card-title">Últimos seis meses</h2>
                        <div className="heatmap" role="img" aria-label="Días con lectura">
                            {heatmap.map((week, index) => (
                                <div className="heat-week" key={index}>
                                    {week.map((day) => (
                                        <span
                                            key={day.key}
                                            className={`heat-day l${day.level}${day.future ? ' future' : ''}`}
                                            title={`${day.date.toLocaleDateString('es-ES')}: ${formatMinutes(day.minutes)}`}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                        {peak && (
                            <p className="card-body">
                                <IconClock size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
                                Sueles leer sobre las <strong>{String(peak.hour).padStart(2, '0')}:00</strong>.
                            </p>
                        )}
                    </section>

                    {top.length > 0 && (
                        <section className="card">
                            <h2 className="card-title">Donde más tiempo has puesto</h2>
                            <ol className="top-list">
                                {top.map((book, index) => (
                                    <li className="top-item" key={book.id}>
                                        <span className="top-rank">{index + 1}</span>
                                        <span className="top-name">{book.name}</span>
                                        <span className="top-min">{formatMinutes(book.readingMinutes)}</span>
                                    </li>
                                ))}
                            </ol>
                        </section>
                    )}
                </>
            )}
        </div>
    );
}
