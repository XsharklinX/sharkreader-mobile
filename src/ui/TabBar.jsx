import React from 'react';

const TABS = [
    { id: 'library',      icon: '📚', label: 'Biblioteca' },
    { id: 'progress',     icon: '📊', label: 'Progreso' },
    { id: 'achievements', icon: '🏆', label: 'Logros' },
    { id: 'workshop',     icon: '🔧', label: 'Workshop' },
    { id: 'settings',     icon: '⚙️', label: 'Ajustes' },
];

export default function TabBar({ active, onChange }) {
    return (
        <nav className="tabbar" aria-label="Navegación principal">
            {TABS.map((tab) => (
                <button
                    key={tab.id}
                    type="button"
                    className="tabbar-btn"
                    aria-current={active === tab.id ? 'page' : undefined}
                    onClick={() => onChange(tab.id)}
                >
                    <span className="tabbar-icon" aria-hidden="true">{tab.icon}</span>
                    <span>{tab.label}</span>
                </button>
            ))}
        </nav>
    );
}
