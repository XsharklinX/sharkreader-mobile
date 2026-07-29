import React, { useMemo } from 'react';
import { WORKSHOP_ADDONS, getLocalizedText } from '../core/workshopModules.js';

// Addons del escritorio que no se portan a móvil.
// - watchedFolder: Android no permite vigilar una carpeta en segundo plano sin
//   un servicio persistente que no compensa para esto.
// - netflixView: es una vista alternativa de rejilla; en móvil la rejilla ya es
//   de portadas grandes, así que duplicaría la biblioteca sin aportar nada.
// - externalSources: los catálogos OPDS/Calibre se aplazan a la v1.3.
export const MOBILE_EXCLUDED_ADDONS = ['watchedFolder', 'netflixView', 'externalSources'];

export const getMobileAddons = (addons = WORKSHOP_ADDONS) =>
    addons.filter((addon) => !MOBILE_EXCLUDED_ADDONS.includes(addon.id));

export default function WorkshopScreen() {
    const addons = useMemo(() => getMobileAddons(), []);

    return (
        <div className="screen">
            <header>
                <h1 className="screen-title">Workshop</h1>
                <p className="screen-sub">
                    {addons.length} addons portables · se activan en v0.6.0
                </p>
            </header>

            <section className="card">
                <h2 className="card-title">Disponibles en móvil</h2>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
                    {addons.map((addon) => (
                        <li key={addon.id} style={{ opacity: 0.5 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>
                                {getLocalizedText(addon.name, 'es')}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45 }}>
                                {getLocalizedText(addon.desc, 'es')}
                            </div>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="card">
                <h2 className="card-title">Fuera de móvil</h2>
                <p className="card-body">
                    Carpeta vigilada, vista Netflix y fuentes externas OPDS no se portan
                    en la v1.0. Los catálogos externos vuelven en la v1.3.
                </p>
            </section>
        </div>
    );
}
