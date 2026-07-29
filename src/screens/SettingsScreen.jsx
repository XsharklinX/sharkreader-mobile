import React, { useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { usePorts } from '../ports/index.js';
import { readBookBlob } from '../adapters/SafPicker.js';
import {
    parseBackupFile,
    mergeIntoLibrary,
    buildBackup,
    shareTextFile,
    exportAnnotations,
} from '../library/backup.js';

const THEMES = [
    { id: 'dark', label: 'Oscuro' },
    { id: 'light', label: 'Claro' },
    { id: 'sepia', label: 'Sepia' },
];

const applyTheme = (theme) => {
    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-light', 'theme-sepia');
    root.classList.add(`theme-${theme}`);
};

export default function SettingsScreen({ library }) {
    const ports = usePorts();
    const [theme, setTheme] = useState('dark');
    const [info, setInfo] = useState(null);
    const [busy, setBusy] = useState(null);
    const [notice, setNotice] = useState(null);

    const say = (message) => {
        setNotice(message);
        setTimeout(() => setNotice(null), 5000);
    };

    /**
     * Importa un backup del escritorio. Fusiona, no reemplaza: si ya hay libros
     * con progreso en el móvil, el merge del núcleo decide campo a campo cuál de
     * las dos copias es más reciente.
     */
    const importBackup = async () => {
        setBusy('Esperando a que elijas el fichero…');
        try {
            const picked = await ports.filePicker.pickBooks();
            const file = picked?.books?.[0];
            if (!file) {
                setBusy(null);
                return;
            }

            setBusy('Leyendo el backup…');
            const blob = await readBookBlob(file.path);
            const incoming = await parseBackupFile(blob, file.name);

            setBusy('Fusionando con tu biblioteca…');
            const stats = (await ports.storage.getSetting('stats')) || {};
            const result = mergeIntoLibrary(incoming, library.books, stats);

            await library.replaceAll(result.books);
            await ports.storage.setSetting('stats', result.stats);
            if (result.achievements) {
                await ports.storage.setSetting('achievements', result.achievements);
            }

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

            await shareTextFile(
                `sharkreader-backup-${date}.json`,
                JSON.stringify(backup, null, 2),
                'Exportar backup'
            );
            setBusy(null);
        } catch (error) {
            setBusy(null);
            library.setError?.(error?.message || 'No se pudo exportar el backup.');
        }
    };

    const exportAllAnnotations = async () => {
        try {
            const result = await exportAnnotations(library.books);
            say(`${result.count} anotaciones exportadas`);
        } catch (error) {
            library.setError?.(error?.message || 'No se pudieron exportar las anotaciones.');
        }
    };

    useEffect(() => {
        applyTheme(theme);
    }, [theme]);

    useEffect(() => {
        let alive = true;
        const load = async () => {
            const platform = Capacitor.getPlatform();
            let version = '—';
            let build = '—';
            if (Capacitor.isNativePlatform()) {
                try {
                    const appInfo = await CapApp.getInfo();
                    version = appInfo.version;
                    build = appInfo.build;
                } catch {
                    // getInfo no está disponible fuera del contenedor nativo
                }
            }
            if (alive) setInfo({ platform, version, build });
        };
        load();
        return () => { alive = false; };
    }, []);

    return (
        <div className="screen">
            <header>
                <h1 className="screen-title">Ajustes</h1>
                <p className="screen-sub">Local-first · sin cuenta · sin nube</p>
            </header>

            <section className="card">
                <h2 className="card-title">Tema</h2>
                <div style={{ display: 'flex', gap: 8 }}>
                    {THEMES.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            className={`btn${theme === option.id ? ' btn-primary' : ''}`}
                            style={{ flex: 1, padding: 0, fontSize: 14 }}
                            onClick={() => setTheme(option.id)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </section>

            {busy && <div className="banner" role="status">{busy}</div>}
            {notice && <div className="banner" role="status">{notice}</div>}

            <section className="card">
                <h2 className="card-title">Tus datos</h2>
                <p className="card-body">
                    El backup de SharkReader de escritorio se puede importar aquí: trae
                    libros, progreso, anotaciones y logros. Se fusiona con lo que ya
                    tengas, no lo reemplaza.
                </p>
                <button type="button" className="btn" onClick={importBackup} disabled={!!busy}>
                    Importar backup
                </button>
                <button type="button" className="btn" onClick={exportBackup} disabled={!!busy || !library?.books.length}>
                    Exportar backup
                </button>
                <button
                    type="button"
                    className="btn"
                    onClick={exportAllAnnotations}
                    disabled={!!busy || !library?.books.some((book) => book.bookmarks?.length)}
                >
                    Exportar anotaciones a Markdown
                </button>
                <p className="card-body">
                    Un backup en JSON trae la metadata pero no los ficheros. Los libros
                    que no tengas ya en el móvil aparecerán con su progreso y sus
                    anotaciones, pero habrá que importar el EPUB o el PDF para poder
                    abrirlos.
                </p>
            </section>

            <section className="card">
                <h2 className="card-title">Acerca de</h2>
                <dl className="kv">
                    <dt>Versión</dt>
                    <dd>{info?.version ?? '…'}</dd>
                    <dt>Build</dt>
                    <dd>{info?.build ?? '…'}</dd>
                    <dt>Plataforma</dt>
                    <dd>{info?.platform ?? '…'}</dd>
                    <dt>Paquete</dt>
                    <dd style={{ fontSize: 11 }}>com.sharkreader.mobile</dd>
                </dl>
            </section>

            <section className="card">
                <h2 className="card-title">Privacidad</h2>
                <p className="card-body">
                    SharkReader Mobile no recopila ni envía ningún dato. Tu biblioteca,
                    tu progreso y tus anotaciones no salen del dispositivo salvo que
                    exportes un backup tú mismo.
                </p>
            </section>
        </div>
    );
}
