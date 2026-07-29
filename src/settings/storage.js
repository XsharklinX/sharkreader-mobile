import { useCallback, useEffect, useState } from 'react';
import { registerPlugin } from '@capacitor/core';

const SharkPicker = registerPlugin('SharkPicker');

/**
 * Tamaño legible. Se usa base 1024 porque es lo que muestra Android en sus
 * propios ajustes de almacenamiento, y ver dos cifras distintas para lo mismo
 * confunde más que cualquier discusión sobre MB frente a MiB.
 */
export const formatBytes = (bytes = 0) => {
    if (!bytes || bytes < 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
};

const EMPTY = { books: 0, database: 0, cache: 0, total: 0 };

/** Espacio que ocupa la app, desglosado. */
export const useStorageUsage = () => {
    const [usage, setUsage] = useState(EMPTY);

    const refresh = useCallback(async () => {
        try {
            const result = await SharkPicker.getStorageUsage();
            setUsage({ ...EMPTY, ...result });
        } catch {
            // Fuera del contenedor nativo no hay nada que medir; la tarjeta
            // simplemente no se pinta.
            setUsage(EMPTY);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const clearCache = useCallback(async () => {
        try {
            const { freed } = await SharkPicker.clearCache();
            await refresh();
            return freed || 0;
        } catch {
            return 0;
        }
    }, [refresh]);

    return { ...usage, refresh, clearCache };
};
