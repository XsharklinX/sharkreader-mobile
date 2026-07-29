import React, { useEffect, useMemo, useState } from 'react';
import { CATEGORIES, searchSettings } from './catalog.js';
import { formatBytes, useStorageUsage } from './storage.js';
import {
    IconLibrary, IconSettings, IconFolder, IconBook, IconSearch, IconClose, IconChevronRight,
} from '../ui/icons.jsx';

const CATEGORY_ICONS = {
    reading: IconBook,
    appearance: IconSettings,
    sync: IconLibrary,
    data: IconFolder,
    privacy: IconLibrary,
    about: IconBook,
};

/**
 * Raíz de Ajustes.
 *
 * Seis puertas en lugar de veinte filas: la lista cabe en una pantalla sin
 * desplazar, y cada categoría lleva su estado en el subtítulo. La mayoría de
 * las visitas a ajustes son para **comprobar** algo, no para cambiarlo, así que
 * si la respuesta cabe en la lista no hace falta entrar.
 */
export default function SettingsHome({ library, stats, sync, onOpenCategory, onOpenItem }) {
    const [query, setQuery] = useState('');
    const usage = useStorageUsage();

    const results = useMemo(() => searchSettings(query), [query]);

    // Estados que se muestran en el subtítulo de cada categoría. Los datos ya
    // existen: solo hay que traerlos aquí.
    const summaries = {
        reading: stats.preferences.reminders
            ? `Recordatorio a las ${String(stats.preferences.reminderHour).padStart(2, '0')}:00 · meta ${stats.goals.daily} min`
            : `Meta diaria de ${stats.goals.daily} min`,
        appearance: 'Tema, densidad y tamaño de la interfaz',
        sync: sync.configured
            ? sync.lastAt
                ? `Conectado · ${relativeTime(sync.lastAt)}`
                : 'Configurado · sin sincronizar todavía'
            : 'Sin configurar',
        data: `${library.books.length} libro${library.books.length === 1 ? '' : 's'}${usage.total ? ` · ${formatBytes(usage.total)}` : ''}`,
        privacy: '2 permisos · 0 datos recogidos',
        about: 'Versión, Workshop y contacto',
    };

    return (
        <div className="screen">
            <header className="head">
                <div className="head-txt">
                    <h1 className="head-title">Ajustes</h1>
                </div>
            </header>

            {/* Quién eres. Reaprovecha lo que useStats ya calcula y le da a la
                pantalla más fría de la app un motivo para visitarla. */}
            <section className="profile-card">
                <span className="profile-avatar" aria-hidden="true">🦈</span>
                <div className="profile-info">
                    <b>Nivel {stats.level.level} · {stats.level.name}</b>
                    <span>
                        {stats.stats.streak > 0
                            ? `${stats.stats.streak} ${stats.stats.streak === 1 ? 'día' : 'días'} de racha`
                            : 'Sin racha activa'}
                        {' · '}
                        {library.books.length} libro{library.books.length === 1 ? '' : 's'}
                    </span>
                    <div className="profile-stats">
                        <span className="mono">{stats.level.xp} XP</span>
                        <span className="mono">
                            {Object.keys(stats.achievements).length}/59 logros
                        </span>
                    </div>
                </div>
            </section>

            <div className="search">
                <IconSearch size={19} />
                <input
                    type="search"
                    placeholder="Buscar en ajustes…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="Buscar en ajustes"
                />
                {query && (
                    <button
                        type="button"
                        className="icon-btn"
                        style={{ minWidth: 32, minHeight: 32 }}
                        onClick={() => setQuery('')}
                        aria-label="Limpiar búsqueda"
                    >
                        <IconClose size={17} />
                    </button>
                )}
            </div>

            {query.trim().length >= 2 ? (
                results.length === 0 ? (
                    <p className="option-desc" style={{ padding: 'var(--sp-4) 0' }}>
                        Nada coincide con «{query.trim()}».
                    </p>
                ) : (
                    <div className="rows">
                        {results.map((entry) => (
                            <button
                                type="button"
                                className="row"
                                key={entry.id}
                                onClick={() => onOpenItem(entry)}
                            >
                                <span className="row-txt">
                                    <span>{entry.label}</span>
                                    <span className="row-sub">{entry.categoryLabel}</span>
                                </span>
                                <IconChevronRight size={18} />
                            </button>
                        ))}
                    </div>
                )
            ) : (
                <>
                    <div className="rows">
                        {CATEGORIES.map((category) => {
                            const Icon = CATEGORY_ICONS[category.id] || IconSettings;
                            return (
                                <button
                                    type="button"
                                    className="row"
                                    key={category.id}
                                    onClick={() => onOpenCategory(category.id)}
                                >
                                    <span className="row-icon"><Icon size={20} /></span>
                                    <span className="row-txt">
                                        <span>{category.label}</span>
                                        <span className="row-sub">{summaries[category.id] || category.summary}</span>
                                    </span>
                                    <IconChevronRight size={18} />
                                </button>
                            );
                        })}
                    </div>

                    <StorageCard usage={usage} />
                </>
            )}
        </div>
    );
}

/**
 * Reparto del espacio en una sola barra segmentada. Ver que los libros ocupan
 * el 80% es lo que hace entender que borrar la caché no va a liberar gran cosa.
 */
const StorageCard = ({ usage }) => {
    if (!usage.total) return null;

    const parts = [
        { key: 'books', label: 'Libros', color: 'var(--accent)' },
        { key: 'database', label: 'Metadata y portadas', color: 'var(--warn)' },
        { key: 'cache', label: 'Caché', color: 'var(--ok)' },
    ];

    return (
        <section className="card">
            <div className="section-head">
                <h2 className="card-title">Almacenamiento</h2>
                <span className="section-meta">{formatBytes(usage.total)}</span>
            </div>

            <div className="storage-bar" role="img" aria-label="Reparto del espacio ocupado">
                {parts.map((part) => (
                    <i
                        key={part.key}
                        style={{
                            width: `${(usage[part.key] / usage.total) * 100}%`,
                            background: part.color,
                        }}
                    />
                ))}
            </div>

            <div className="storage-legend">
                {parts.map((part) => (
                    <span key={part.key}>
                        <i className="storage-dot" style={{ background: part.color }} />
                        {part.label} <span className="mono">{formatBytes(usage[part.key])}</span>
                    </span>
                ))}
            </div>
        </section>
    );
};

/** «hace 5 min», «hace 2 h», «ayer»… */
const relativeTime = (timestamp) => {
    const minutes = Math.round((Date.now() - timestamp) / 60_000);
    if (minutes < 1) return 'ahora mismo';
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.round(hours / 24);
    return days === 1 ? 'ayer' : `hace ${days} días`;
};

export { relativeTime };
