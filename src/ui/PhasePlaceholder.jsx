import React from 'react';

/**
 * Pantalla aún no implementada. Declara en voz alta qué versión la rellena, para
 * que un APK de fase intermedia no se confunda con una pantalla rota.
 */
export default function PhasePlaceholder({ title, emoji, version, phase, items = [] }) {
    return (
        <div className="screen">
            <header>
                <h1 className="screen-title">{title}</h1>
                <p className="screen-sub">Llega en {version}</p>
            </header>

            <div className="empty">
                <span className="empty-emoji" aria-hidden="true">{emoji}</span>
                <h2 className="empty-title">{phase}</h2>
                <p className="empty-body">Esta pantalla todavía no está construida.</p>
            </div>

            {items.length > 0 && (
                <section className="card">
                    <h2 className="card-title">Qué incluirá</h2>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--text-2)', fontSize: 13, lineHeight: 1.7 }}>
                        {items.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                </section>
            )}
        </div>
    );
}
