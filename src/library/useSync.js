import { useCallback, useEffect, useState } from 'react';
import { mergeBackupData } from '../core/backupMerge.js';
import { validateBackupData } from '../core/backupValidation.js';
import { migrateBackupToLatest } from '../core/backupMigrations.js';
import { hydrateStoredBook } from '../core/bookModel.js';
import { buildBackup } from './backup.js';
import { backupEnPorcentaje, libroEnFraccion } from './escalaProgreso.js';
import { usePorts } from '../ports/index.js';

const CONFIG_KEY = 'sync';
const LAST_KEY = 'syncLastAt';

/**
 * ¿Estamos en wifi?
 *
 * Se usa la Network Information API en lugar de un plugin: el WebView de
 * Android la expone y evita añadir una dependencia nativa para leer un dato.
 * Si el navegador no la implementa se asume que sí hay wifi — es preferible
 * sincronizar de más que dejar la función muerta en un dispositivo que no
 * informa del tipo de red.
 */
const onWifi = () => {
    const connection = navigator.connection
        || navigator.mozConnection
        || navigator.webkitConnection;
    if (!connection?.type) return true;
    return connection.type === 'wifi' || connection.type === 'ethernet';
};

export const DEFAULT_SYNC = { url: '', user: '', password: '', auto: false, wifiOnly: true };

/**
 * Sincronización de la biblioteca.
 *
 * El ciclo es: leer lo remoto, fusionarlo con lo local, guardar el resultado en
 * los dos lados. La fusión la hace `mergeBackupData` del núcleo compartido, que
 * compara timestamps **por grupo de campos** —progreso, metadata, anotaciones—
 * en vez de por objeto entero. Por eso dos dispositivos que tocaron cosas
 * distintas del mismo libro no se pisan.
 *
 * Nunca se sube sin haber leído antes. Escribir directamente lo local
 * machacaría lo que hubiera hecho el otro dispositivo desde la última vez.
 */
export const useSync = (library) => {
    const ports = usePorts();
    const [config, setConfig] = useState(DEFAULT_SYNC);
    const [state, setState] = useState('idle'); // idle | syncing | error
    const [message, setMessage] = useState(null);
    const [lastAt, setLastAt] = useState(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            const [stored, last] = await Promise.all([
                ports.storage.getSetting(CONFIG_KEY),
                ports.storage.getSetting(LAST_KEY),
            ]);
            if (!alive) return;
            setConfig({ ...DEFAULT_SYNC, ...(stored || {}) });
            setLastAt(last || null);
        })().catch(() => {});
        return () => { alive = false; };
    }, [ports]);

    const saveConfig = useCallback(async (changes) => {
        const next = { ...config, ...changes };
        setConfig(next);
        await ports.storage.setSetting(CONFIG_KEY, next);
        return next;
    }, [config, ports]);

    const test = useCallback(async () => {
        const result = await ports.sync.test();
        setMessage(result.message);
        return result;
    }, [ports]);

    /**
     * Un ciclo completo de sincronización.
     * @returns {Promise<{ok: boolean, added?: number, updated?: number, message?: string}>}
     */
    const sync = useCallback(async () => {
        setState('syncing');
        setMessage(null);

        try {
            const stats = (await ports.storage.getSetting('stats')) || {};
            const achievements = (await ports.storage.getSetting('achievements')) || {};
            const local = buildBackup(library.books, stats, achievements);

            // 1. Leer lo remoto. Si no hay nada, esta es la primera vez.
            const raw = await ports.sync.read();

            let merged = local;
            let added = 0;
            let updated = 0;

            if (raw) {
                const { backup: validado } = validateBackupData(migrateBackupToLatest(JSON.parse(raw)));
                merged = mergeBackupData(local, backupEnPorcentaje(validado));

                const before = new Set(library.books.map((book) => book.id));
                added = merged.books.filter((book) => !before.has(book.id)).length;
                updated = merged.books.length - added;
            }

            // 2. Aplicar el resultado en local.
            await library.replaceAll(merged.books.map((record) => hydrateStoredBook(libroEnFraccion(record))));
            if (merged.stats) await ports.storage.setSetting('stats', merged.stats);
            if (merged.achievements) await ports.storage.setSetting('achievements', merged.achievements);

            // 3. Subir el resultado fusionado, no lo que había en local.
            await ports.sync.write(JSON.stringify(merged));

            const now = Date.now();
            await ports.storage.setSetting(LAST_KEY, now);
            setLastAt(now);
            setState('idle');
            setMessage(raw ? `${added} nuevos · ${updated} al día` : 'Biblioteca subida por primera vez.');

            return { ok: true, added, updated };
        } catch (error) {
            setState('error');
            const text = error?.message || 'La sincronización falló.';
            setMessage(text);
            return { ok: false, message: text };
        }
    }, [ports, library]);

    // Sincronización automática al abrir la app, si está configurada. No se
    // sincroniza al cerrar: el proceso puede morir a mitad y dejar el fichero
    // remoto a medio escribir.
    useEffect(() => {
        if (!config.auto || !config.url || library.status !== 'ready') return;

        // «Solo con wifi» se comprueba de verdad. Un interruptor que no hace
        // nada es peor que no ofrecerlo: el usuario cree que está ahorrando
        // datos y no lo está.
        if (config.wifiOnly && !onWifi()) {
            setMessage('Sin wifi: la sincronización automática se ha saltado.');
            return;
        }

        sync();
        // Solo al arrancar, no cada vez que cambie la biblioteca.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config.auto, config.url, config.wifiOnly, library.status]);

    return {
        config,
        state,
        message,
        lastAt,
        configured: Boolean(config.url && config.user),
        saveConfig,
        test,
        sync,
        clearMessage: () => setMessage(null),
    };
};
