import React from 'react';
import { IconLibrary, IconChart, IconSettings } from './icons.jsx';

/**
 * Barra de navegación inferior.
 *
 * El elemento activo se marca **encendiendo la pastilla que hay detrás del
 * icono**, no con una barrita flotante. La barrita anterior estaba posicionada
 * de forma absoluta sin contenedor de referencia, así que aparecía suelta en
 * mitad de la pantalla al tocar: además de fea, era un error de maquetación.
 */
const TABS = [
    { id: 'library', icon: IconLibrary, label: 'Biblioteca' },
    { id: 'progress', icon: IconChart, label: 'Progreso' },
    { id: 'settings', icon: IconSettings, label: 'Ajustes' },
];

export default function TabBar({ active, onChange }) {
    return (
        <nav className="tabbar" aria-label="Navegación principal">
            {TABS.map(({ id, icon: Icon, label }) => {
                const on = active === id;
                return (
                    <button
                        key={id}
                        type="button"
                        className="tab"
                        aria-current={on ? 'page' : undefined}
                        onClick={() => onChange(id)}
                    >
                        <span className="tab-pill">
                            <Icon size={22} />
                        </span>
                        <span className="tab-label">{label}</span>
                    </button>
                );
            })}
        </nav>
    );
}
