import React, { useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

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

export default function SettingsScreen() {
    const [theme, setTheme] = useState('dark');
    const [info, setInfo] = useState(null);

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
