import React, { useMemo, useState } from 'react';
import {
    buildHeatmap,
    buildSeries,
    buildSummary,
    topBooks,
    peakHour,
    formatMinutes,
} from '../stats/derive.js';

const PERIODS = [
    { id: 'week', label: 'Semana' },
    { id: 'month', label: 'Mes' },
    { id: 'year', label: 'Año' },
];

/** Barra de meta: minutos hechos frente a minutos objetivo. */
const GoalBar = ({ label, done, target }) => {
    const percent = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
    const met = done >= target;
    return (
        <div className="goal">
            <div className="goal-head">
                <span>{label}</span>
                <span className="mono">
                    {met && <span className="goal-check" aria-label="Meta cumplida">✓ </span>}
                    {formatMinutes(done)} / {formatMinutes(target)}
                </span>
            </div>
            <span className="goal-bar">
                <i className={met ? 'met' : ''} style={{ width: `${percent}%` }} />
            </span>
        </div>
    );
};

export default function ProgressScreen({ library, stats: statsApi }) {
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

    if (!hasData) {
        return (
            <div className="screen">
                <header>
                    <h1 className="screen-title">Progreso</h1>
                </header>
                <div className="empty">
                    <span className="empty-emoji" aria-hidden="true">📊</span>
                    <h2 className="empty-title">Aún no hay nada que contar</h2>
                    <p className="empty-body">
                        Lee unos minutos y aquí aparecerán tu racha, tus horas y el
                        mapa de los días que has leído.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="screen">
            <header>
                <h1 className="screen-title">Progreso</h1>
                <p className="screen-sub">{formatMinutes(summary.totalMinutes)} en total</p>
            </header>

            <section className="streak-card">
                <div className="streak-number">
                    <b className="mono">{summary.streak}</b>
                    <span>{summary.streak === 1 ? 'día seguido' : 'días seguidos'}</span>
                </div>
                <dl className="kv">
                    <dt>Racha máxima</dt><dd>{summary.maxStreak}</dd>
                    <dt>Hoy</dt><dd>{formatMinutes(summary.today)}</dd>
                    <dt>Esta semana</dt><dd>{formatMinutes(summary.week)}</dd>
                </dl>
            </section>

            <section className="card">
                <h2 className="card-title">
                    Nivel {level.level} — {level.name}
                </h2>
                <span className="goal-bar">
                    <i style={{ width: `${level.progress}%` }} />
                </span>
                <p className="card-body mono">
                    {level.current} / {level.xpPerLevel} XP para el siguiente nivel
                </p>
            </section>

            <section className="card">
                <h2 className="card-title">Minutos por día</h2>
                <div className="pills">
                    {PERIODS.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            className={`pill-btn${period === option.id ? ' on' : ''}`}
                            onClick={() => setPeriod(option.id)}
                            aria-pressed={period === option.id}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>

                <div className="chart" role="img" aria-label={`Minutos leídos por ${period}`}>
                    {series.map((point, index) => (
                        <div className="chart-col" key={`${point.label}-${index}`} title={`${point.fullLabel}: ${formatMinutes(point.minutes)}`}>
                            <span
                                className="chart-bar"
                                style={{ height: `${Math.round((point.minutes / maxInSeries) * 100)}%` }}
                            />
                            <span className="chart-label">{point.label}</span>
                        </div>
                    ))}
                </div>
            </section>

            <section className="card">
                <h2 className="card-title">Metas</h2>
                <GoalBar label="Hoy" done={summary.today} target={goals.daily} />
                <GoalBar label="Esta semana" done={summary.week} target={goals.weekly} />
            </section>

            <section className="card">
                <h2 className="card-title">Últimos seis meses</h2>
                <div className="heatmap" role="img" aria-label="Días con lectura en los últimos seis meses">
                    {heatmap.map((week, weekIndex) => (
                        <div className="heat-week" key={weekIndex}>
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
                        Sueles leer sobre las <strong>{String(peak.hour).padStart(2, '0')}:00</strong>.
                    </p>
                )}
            </section>

            {top.length > 0 && (
                <section className="card">
                    <h2 className="card-title">Donde más tiempo has puesto</h2>
                    <ol className="top-list">
                        {top.map((book, index) => (
                            <li key={book.id}>
                                <span className="mono top-rank">{index + 1}</span>
                                <span className="top-name">{book.name}</span>
                                <span className="mono top-minutes">{formatMinutes(book.readingMinutes)}</span>
                            </li>
                        ))}
                    </ol>
                </section>
            )}

            <section className="card">
                <h2 className="card-title">Biblioteca</h2>
                <dl className="kv">
                    <dt>Libros</dt><dd>{summary.libraryCount}</dd>
                    <dt>Leyendo ahora</dt><dd>{summary.reading}</dd>
                    <dt>Terminados</dt><dd>{summary.finished}</dd>
                    <dt>Anotaciones</dt><dd>{summary.annotations}</dd>
                </dl>
            </section>
        </div>
    );
}
