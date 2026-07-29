import React, { useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { usePorts } from '../ports/index.js';
import { readBookBlob } from '../adapters/SafPicker.js';
import { parseBackupFile, mergeIntoLibrary, buildBackup, shareTextFile, exportAnnotations } from '../library/backup.js';
import { getMobileAddons } from '../library/workshop.js';
import { loadVocabulary, vocabularyToMarkdown } from '../reader/dictionary.js';
import {
    IconShare, IconFolder, IconBell, IconClose, IconChevronRight, IconBook,
} from '../ui/icons.jsx';

const THEMES = [
    { id: 'dark', label: 'Oscuro' },
    { id: 'light', label: 'Claro' },
];

const applyTheme = (theme) => {
    document.documentElement.classList.toggle('theme-light', theme === 'light');
};

const Toggle = ({ label, sub, checked, onChange }) => (
    <div className="row">
        <span className="row-txt">
            <span>{label}</span>
            {sub && <span className="row-sub">{sub}</span>}
        </span>
        <button
            type="button"
            className={`switch${checked ? ' on' : ''}`}
            onClick={() => onChange(!checked)}
            role="switch"
            aria-checked={checked}
            aria-label={label}
        />
    </div>
);

export default function SettingsScreen({ library, stats: statsApi, sync }) {
    const ports = usePorts();
    const [theme, setTheme] = useState('dark');
    const [info, setInfo] = useState(null);
    const [busy, setBusy] = useState(null);
    const [notice, setNotice] = useState(null);
    const [showWorkshop, setShowWorkshop] = useState(false);

    const prefs = statsApi.preferences;

    const say = (message) => {
        setNotice(message);
        setTimeout(() => setNotice(null), 5000);
    };

    useEffect(() => { applyTheme(theme); }, [theme]);

    useEffect(() => {
        let alive = true;
        (async () => {
            let version = '—';
            let build = '—';
            if (Capacitor.isNativePlatform()) {
                try {
                    const appInfo = await CapApp.getInfo();
                    version = appInfo.version;
                    build = appInfo.build;
                } catch { /* fuera del contenedor nativo */ }
            }
            if (alive) setInfo({ platform: Capacitor.getPlatform(), version, build });
        })();
        return () => { alive = false; };
    }, []);

    const importBackup = async () => {
        setBusy('Esperando a que elijas el fichero…');
        try {
            const picked = await ports.filePicker.pickBackup();
            const file = picked?.books?.[0];
            if (!file) { setBusy(null); return; }

            setBusy('Leyendo el backup…');
            const blob = await readBookBlob(file.path);
            const incoming = await parseBackupFile(blob, file.name);

            setBusy('Fusionando con tu biblioteca…');
            const stats = (await ports.storage.getSetting('stats')) || {};
            const result = mergeIntoLibrary(incoming, library.books, stats);

            await library.replaceAll(result.books);
            await ports.storage.setSetting('stats', result.stats);
            if (result.achievements) await ports.storage.setSetting('achievements', result.achievements);

            setBusy(null);
            say(`${result.summary.added} libros nuevos · ${result.summary.updated} actualizados`);
        } catch (error) {
            setBusy(null);
            library.setError?.(error?.message || 'El backup no se pudo leer.');
        }
    };

    const exportBackup = async () => {
        setBusy('Preparando el backup…');
        try {
            const stats = (await ports.storage.getSetting('stats')) || {};
            const achievements = (await ports.storage.getSetting('achievements')) || {};
            const backup = buildBackup(library.books, stats, achievements);
            const date = new Date().toISOString().slice(0, 10);
            await shareTextFile(`sharkreader-backup-${date}.json`, JSON.stringify(backup, null, 2), 'Exportar backup');
            setBusy(null);
        } catch (error) {
            setBusy(null);
            library.setError?.(error?.message || 'No se pudo exportar el backup.');
        }
    };

    const exportAllNotes = async () => {
        try {
            const result = await exportAnnotations(library.books);
            say(`${result.count} anotaciones exportadas`);
        } catch (error) {
            library.setError?.(error?.message || 'No se pudieron exportar las anotaciones.');
        }
    };

    const hasNotes = library.books.some((book) => book.bookmarks?.length);

    // ── Vocabulario ──────────────────────────────────────────────────────────
    const [vocabulary, setVocabulary] = useState([]);

    useEffect(() => {
        loadVocabulary(ports.storage).then(setVocabulary).catch(() => {});
    }, [ports]);

    const exportVocabulary = async () => {
        try {
            const markdown = vocabularyToMarkdown(vocabulary);
            const date = new Date().toISOString().slice(0, 10);
            await shareTextFile(`vocabulario-${date}.md`, markdown, 'Exportar vocabulario');
            say(`${vocabulary.length} palabras exportadas`);
        } catch (error) {
            library.setError?.(error?.message || 'No se pudo exportar el vocabulario.');
        }
    };

    return (
        <div className="screen">
            <header className="head">
                <div className="head-txt">
                    <h1 className="head-title">Ajustes</h1>
                    <p className="head-sub">Local-first · sin cuenta · sin nube</p>
                </div>
            </header>

            {busy && <div className="banner" role="status">{busy}</div>}
            {notice && <div className="banner" role="status">{notice}</div>}

            <section className="section">
                <h2 className="section-title">Lectura</h2>
                <div className="rows">
                    <Toggle
                        label="Recordatorio diario"
                        sub={prefs.reminders ? `Todos los días a las ${String(prefs.reminderHour).padStart(2, '0')}:00` : 'Desactivado'}
                        checked={prefs.reminders}
                        onChange={async (value) => {
                            const result = await statsApi.savePreferences({ reminders: value });
                            if (result?.permissionDenied) say('Android no ha concedido el permiso de notificaciones.');
                        }}
                    />
                    {prefs.reminders && (
                        <div className="row">
                            <span className="row-icon"><IconBell size={19} /></span>
                            <span className="row-txt"><span>Hora del aviso</span></span>
                            <div className="stepper" style={{ flex: 'none' }}>
                                <button
                                    type="button"
                                    onClick={() => statsApi.savePreferences({ reminderHour: Math.max(6, prefs.reminderHour - 1) })}
                                    aria-label="Una hora antes"
                                >−</button>
                                <span className="stepper-val" style={{ minWidth: 52 }}>
                                    {String(prefs.reminderHour).padStart(2, '0')}:00
                                </span>
                                <button
                                    type="button"
                                    onClick={() => statsApi.savePreferences({ reminderHour: Math.min(23, prefs.reminderHour + 1) })}
                                    aria-label="Una hora después"
                                >+</button>
                            </div>
                        </div>
                    )}
                    <Toggle
                        label="Sharky"
                        sub="Comentarios ocasionales en la biblioteca"
                        checked={prefs.sharky}
                        onChange={(value) => statsApi.savePreferences({ sharky: value })}
                    />
                </div>
            </section>

            <section className="section">
                <h2 className="section-title">Metas</h2>
                <div className="rows">
                    <div className="row">
                        <span className="row-txt"><span>Meta diaria</span></span>
                        <div className="stepper" style={{ flex: 'none' }}>
                            <button type="button" onClick={() => statsApi.saveGoals({ daily: Math.max(5, statsApi.goals.daily - 5) })} aria-label="Reducir">−</button>
                            <span className="stepper-val" style={{ minWidth: 62 }}>{statsApi.goals.daily} min</span>
                            <button type="button" onClick={() => statsApi.saveGoals({ daily: Math.min(240, statsApi.goals.daily + 5) })} aria-label="Aumentar">+</button>
                        </div>
                    </div>
                    <div className="row">
                        <span className="row-txt"><span>Meta semanal</span></span>
                        <div className="stepper" style={{ flex: 'none' }}>
                            <button type="button" onClick={() => statsApi.saveGoals({ weekly: Math.max(30, statsApi.goals.weekly - 30) })} aria-label="Reducir">−</button>
                            <span className="stepper-val" style={{ minWidth: 62 }}>{statsApi.goals.weekly} min</span>
                            <button type="button" onClick={() => statsApi.saveGoals({ weekly: Math.min(1400, statsApi.goals.weekly + 30) })} aria-label="Aumentar">+</button>
                        </div>
                    </div>
                </div>
            </section>

            <section className="section">
                <h2 className="section-title">Apariencia</h2>
                <div className="segmented">
                    {THEMES.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            className={theme === option.id ? 'on' : ''}
                            onClick={() => setTheme(option.id)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </section>

            <section className="section">
                <h2 className="section-title">Tus datos</h2>
                <div className="rows">
                    <button type="button" className="row" onClick={importBackup} disabled={!!busy}>
                        <span className="row-icon"><IconFolder size={19} /></span>
                        <span className="row-txt">
                            <span>Importar backup</span>
                            <span className="row-sub">Trae libros, progreso y anotaciones del escritorio</span>
                        </span>
                        <IconChevronRight size={18} />
                    </button>
                    <button type="button" className="row" onClick={exportBackup} disabled={!!busy || !library.books.length}>
                        <span className="row-icon"><IconShare size={19} /></span>
                        <span className="row-txt"><span>Exportar backup</span></span>
                        <IconChevronRight size={18} />
                    </button>
                    <button type="button" className="row" onClick={exportAllNotes} disabled={!!busy || !hasNotes}>
                        <span className="row-icon"><IconShare size={19} /></span>
                        <span className="row-txt"><span>Exportar anotaciones a Markdown</span></span>
                        <IconChevronRight size={18} />
                    </button>
                    <button type="button" className="row" onClick={exportVocabulary} disabled={!!busy || vocabulary.length === 0}>
                        <span className="row-icon"><IconShare size={19} /></span>
                        <span className="row-txt">
                            <span>Exportar vocabulario</span>
                            <span className="row-sub">
                                {vocabulary.length === 0
                                    ? 'Sin palabras guardadas todavía'
                                    : `${vocabulary.length} palabra${vocabulary.length === 1 ? '' : 's'}`}
                            </span>
                        </span>
                        <IconChevronRight size={18} />
                    </button>
                </div>
                <p className="card-body">
                    Un backup en JSON trae la metadata pero no los ficheros: los libros que
                    no tengas ya en el móvil aparecerán con su progreso, pero habrá que
                    importar el EPUB o el PDF para abrirlos.
                </p>
            </section>

            <section className="section">
                <h2 className="section-title">Sincronización</h2>
                <p className="card-body">
                    Con un servidor WebDAV —Nextcloud, ownCloud o el tuyo propio— la
                    biblioteca, el progreso y las anotaciones viajan entre el móvil y el
                    escritorio. No hay cuenta de SharkReader: el servidor es tuyo.
                </p>

                <div className="rows">
                    <div className="row">
                        <span className="row-txt"><span>Servidor</span></span>
                    </div>
                    <div style={{ padding: '0 var(--sp-4) var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                        <div className="search">
                            <input
                                type="url"
                                value={sync.config.url}
                                onChange={(event) => sync.saveConfig({ url: event.target.value })}
                                placeholder="https://nube.ejemplo.com/remote.php/dav/…"
                                aria-label="Dirección del servidor WebDAV"
                            />
                        </div>
                        <div className="search">
                            <input
                                type="text"
                                value={sync.config.user}
                                onChange={(event) => sync.saveConfig({ user: event.target.value })}
                                placeholder="Usuario"
                                aria-label="Usuario"
                                autoCapitalize="none"
                            />
                        </div>
                        <div className="search">
                            <input
                                type="password"
                                value={sync.config.password}
                                onChange={(event) => sync.saveConfig({ password: event.target.value })}
                                placeholder="Contraseña de aplicación"
                                aria-label="Contraseña"
                            />
                        </div>
                    </div>

                    <Toggle
                        label="Sincronizar al abrir"
                        sub="No se sincroniza al cerrar: el proceso puede morir a mitad"
                        checked={sync.config.auto}
                        onChange={(auto) => sync.saveConfig({ auto })}
                    />

                    <div className="row">
                        <span className="row-txt">
                            <span>Última sincronización</span>
                            <span className="row-sub">
                                {sync.lastAt
                                    ? new Date(sync.lastAt).toLocaleString('es-ES')
                                    : 'Nunca'}
                            </span>
                        </span>
                    </div>
                </div>

                {sync.message && <div className="banner" role="status">{sync.message}</div>}

                <div className="sheet-actions">
                    <button
                        type="button"
                        className="btn"
                        onClick={sync.test}
                        disabled={!sync.configured || sync.state === 'syncing'}
                    >
                        Probar conexión
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={sync.sync}
                        disabled={!sync.configured || sync.state === 'syncing'}
                    >
                        {sync.state === 'syncing' ? 'Sincronizando…' : 'Sincronizar ahora'}
                    </button>
                </div>
            </section>

            <section className="section">
                <h2 className="section-title">Más</h2>
                <div className="rows">
                    <button type="button" className="row" onClick={() => setShowWorkshop(true)}>
                        <span className="row-icon"><IconBook size={19} /></span>
                        <span className="row-txt">
                            <span>Workshop</span>
                            <span className="row-sub">Addons opcionales · llegan en la v0.6.0</span>
                        </span>
                        <IconChevronRight size={18} />
                    </button>
                    <div className="row">
                        <span className="row-txt"><span>Versión</span></span>
                        <span className="row-val">{info?.version ?? '…'} ({info?.build ?? '…'})</span>
                    </div>
                </div>
            </section>

            <section className="section">
                <h2 className="section-title">Privacidad</h2>
                <p className="card-body">
                    SharkReader no recopila ni envía ningún dato. Tu biblioteca, tu progreso
                    y tus anotaciones no salen del dispositivo salvo que exportes un backup
                    tú mismo.
                </p>
            </section>

            {showWorkshop && (
                <div className="scrim" onClick={() => setShowWorkshop(false)} role="presentation">
                    <section className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Workshop">
                        <span className="grip" aria-hidden="true" />
                        <div className="drawer-head">
                            <h2 className="section-title">Workshop</h2>
                            <button type="button" className="icon-btn" onClick={() => setShowWorkshop(false)} aria-label="Cerrar">
                                <IconClose size={20} />
                            </button>
                        </div>
                        <p className="card-body">
                            {getMobileAddons().length} addons portables a móvil. Se activan en la
                            v0.6.0, junto con la lectura en voz alta.
                        </p>
                        <div className="rows">
                            {getMobileAddons().map((addon) => (
                                <div className="row" key={addon.id} style={{ opacity: 0.55 }}>
                                    <span className="row-txt">
                                        <span>{addon.label}</span>
                                        <span className="row-sub">{addon.desc}</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}
