import React from 'react';
import { IconLibrary, IconChart, IconSettings } from './icons.jsx';

/**
 * Tres pestañas, no cinco.
 *
 * Logros vive dentro de Progreso y Workshop dentro de Ajustes. La barra
 * inferior es el espacio más valioso de la pantalla y no puede repartirse a
 * partes iguales entre lo que se usa cada día y lo que se mira una vez al mes.
 */
const TABS = [
    { id: 'library', icon: IconLibrary, label: 'Biblioteca' },
    { id: 'progress', icon: IconChart, label: 'Progreso' },
    { id: 'settings', icon: IconSettings, label: 'Ajustes' },
];

export default function TabBar({ active, onChange }) {
    return (
        <nav className="tabbar" aria-label="Navegación principal">
            {TABS.map(({ id, icon: Icon, label }) => (
                <button
                    key={id}
                    type="button"
                    className="tab"
                    aria-current={active === id ? 'page' : undefined}
                    onClick={() => onChange(id)}
                >
                    <Icon size={22} />
                    <span>{label}</span>
                </button>
            ))}
        </nav>
    );
}
