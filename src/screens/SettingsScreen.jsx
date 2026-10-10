import React, { useCallback, useEffect, useState } from 'react';
import { useBackHandler } from '../ui/useBackHandler.js';
import SettingsHome from '../settings/SettingsHome.jsx';
import ProfileSheet from '../settings/ProfileSheet.jsx';
import { PAGES } from '../settings/pages.jsx';
import { CATEGORIES } from '../settings/catalog.js';
import { IconArrowLeft } from '../ui/icons.jsx';

/**
 * Ajustes.
 *
 * Una raíz con seis categorías y una subpantalla por cada una, en lugar de la
 * columna plana de veinte filas que había antes. La navegación es una pila de
 * un solo nivel: no hace falta un router para dos estados, y el botón atrás de
 * Android sale de la subpantalla antes que de la pestaña.
 */
export default function SettingsScreen({ library, stats, sync, escritorio, onBack }) {
    const [page, setPage] = useState(null);
    const [editingProfile, setEditingProfile] = useState(false);
    const [highlight, setHighlight] = useState(null);
    const [notice, setNotice] = useState(null);

    const notify = useCallback((message) => {
        setNotice(message);
        setTimeout(() => setNotice(null), 5000);
    }, []);

    // El botón atrás cierra la subpantalla en vez de salir a la biblioteca.
    // Va por la pila de `backStack`: registrar un oyente de Capacitor propio no
    // daba ninguna prioridad —los llama todos— y hacía las dos cosas a la vez.
    useBackHandler(() => {
        if (!page) return false;
        setPage(null);
        return true;
    }, Boolean(page));

    /**
     * Un resultado de búsqueda abre su categoría y resalta la opción.
     *
     * El resaltado es lo que evita que abrir «Solo con wifi» te deje mirando
     * una pantalla entera sin saber cuál de las diez filas era.
     */
    const openItem = (entry) => {
        setPage(entry.categoryId);
        setHighlight(entry.id);
    };

    useEffect(() => {
        if (!highlight) return undefined;
        const timer = setTimeout(() => {
            const target = document.querySelector(`[data-setting="${highlight}"]`);
            target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            target?.classList.add('setting-flash');
            setTimeout(() => target?.classList.remove('setting-flash'), 2200);
            setHighlight(null);
        }, 120);
        return () => clearTimeout(timer);
    }, [highlight, page]);

    if (!page) {
        return (
            <>
                <SettingsHome
                    onBack={onBack}
                    profile={stats.preferences.profile}
                    onEditProfile={() => setEditingProfile(true)}
                    library={library}
                    stats={stats}
                    sync={sync}
                    onOpenCategory={setPage}
                    onOpenItem={openItem}
                />
                {editingProfile && (
                    <ProfileSheet
                        profile={stats.preferences.profile}
                        onChange={(profile) => stats.savePreferences({ profile })}
                        onClose={() => setEditingProfile(false)}
                    />
                )}
                {notice && <div className="toast-stack"><div className="toast">{notice}</div></div>}
            </>
        );
    }

    const Page = PAGES[page];
    const category = CATEGORIES.find((item) => item.id === page);

    return (
        <div className="screen">
            <header className="head">
                <button type="button" className="icon-btn" onClick={() => setPage(null)} aria-label="Volver a ajustes">
                    <IconArrowLeft size={22} />
                </button>
                <div className="head-txt" style={{ flex: 1 }}>
                    <h1 className="head-title" style={{ fontSize: 'var(--t-title)' }}>{category?.label}</h1>
                </div>
            </header>

            {notice && <div className="banner" role="status">{notice}</div>}

            <Page library={library} stats={stats} sync={sync} escritorio={escritorio} notify={notify} />
        </div>
    );
}
