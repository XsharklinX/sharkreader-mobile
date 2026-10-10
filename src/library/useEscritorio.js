import { useCallback, useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { validateBackupData } from '../core/backupValidation.js';
import { migrateBackupToLatest } from '../core/backupMigrations.js';
import { hydrateStoredBook } from '../core/bookModel.js';
import { usePorts } from '../ports/index.js';
import { buildBackup } from './backup.js';
import { backupEnPorcentaje, libroEnFraccion } from './escalaProgreso.js';
import {
    normalizarDireccion, fusionarConEscritorio, registroRemoto, propuestaDePosicion,
} from './escritorio.js';

const CLAVE = 'escritorio';

/**
 * El ordenador emparejado: estado, emparejar y sincronizar.
 *
 * Se sincroniza solo, sin botón, en tres momentos: al abrir la app, al volver a
 * ella desde otra y al cerrar un libro. Son los momentos en que se cambia de
 * dispositivo. Si el ordenador no está, no pasa nada y no se avisa: es lo normal
 * fuera de casa.
 */
export const useEscritorio = (library) => {
    const ports = usePorts();
    const [config, setConfig] = useState(null);
    const [estado, setEstado] = useState('inactivo'); // inactivo | sincronizando | ok | sin-conexion
    const [mensaje, setMensaje] = useState(null);
    const enCurso = useRef(null);
    const libraryRef = useRef(library);
    libraryRef.current = library;

    useEffect(() => {
        ports.storage.getSetting(CLAVE).then((guardado) => setConfig(guardado || null)).catch(() => {});
    }, [ports]);

    const guardar = useCallback(async (siguiente) => {
        setConfig(siguiente);
        await ports.storage.setSetting(CLAVE, siguiente);
    }, [ports]);

    const emparejar = useCallback(async (texto) => {
        const direccion = normalizarDireccion(texto);
        if (!direccion) throw new Error('Escribe la dirección tal como sale en el ordenador: 192.168.1.20:47321/clave');
        const { nombre, id } = await ports.escritorio.hola(direccion);
        await guardar({ direccion, nombre, id, ultima: null });
        return { nombre };
    }, [ports, guardar]);

    const olvidar = useCallback(async () => {
        await guardar(null);
        setEstado('inactivo');
        setMensaje(null);
    }, [guardar]);

    /** Lo que tiene el ordenador ahora mismo, ya validado y en porcentaje. */
    const leerRemoto = useCallback(async (direccion, limite) => {
        const crudo = await ports.escritorio.leer(direccion, limite);
        const { backup } = validateBackupData(migrateBackupToLatest(JSON.parse(crudo)));
        return backupEnPorcentaje(backup);
    }, [ports]);

    /**
     * Un ciclo completo: leer, fusionar, aplicar aquí y devolver el resultado al
     * ordenador para que lo aplique allí. Nunca dos a la vez.
     */
    const sincronizar = useCallback(async () => {
        const actual = config;
        if (!actual?.direccion) return { ok: false };
        if (enCurso.current) return enCurso.current;

        enCurso.current = (async () => {
            setEstado('sincronizando');
            try {
                const lib = libraryRef.current;
                const stats = (await ports.storage.getSetting('stats')) || {};
                const achievements = (await ports.storage.getSetting('achievements')) || {};
                const local = buildBackup(lib.books, stats, achievements);
                const remoto = await leerRemoto(actual.direccion);
                const fusion = fusionarConEscritorio(local, remoto);

                // Solo se reescriben los libros que de verdad cambian: reescribir
                // la biblioteca entera en cada vuelta a la app no tiene sentido.
                const porId = new Map(lib.books.map((libro) => [libro.id, libro]));
                const cambiados = fusion.books.filter((registro) => {
                    const antes = porId.get(registro.id);
                    if (!antes) return false;
                    return String(antes.lastLocation || '') !== String(registro.lastLocation || '')
                        || (antes.bookmarks?.length || 0) !== (registro.bookmarks?.length || 0)
                        || Boolean(antes.isFinished) !== Boolean(registro.isFinished);
                });
                for (const registro of cambiados) {
                    const hidratado = hydrateStoredBook(libroEnFraccion(registro));
                    await lib.updateBook(registro.id, {
                        progress: hidratado.progress,
                        lastLocation: hidratado.lastLocation,
                        lastReadDate: hidratado.lastReadDate,
                        progressUpdatedAt: hidratado.progressUpdatedAt,
                        readingMinutes: hidratado.readingMinutes,
                        isFinished: hidratado.isFinished,
                        dateStarted: hidratado.dateStarted,
                        dateFinished: hidratado.dateFinished,
                        bookmarks: hidratado.bookmarks,
                        annotationsUpdatedAt: hidratado.annotationsUpdatedAt,
                    });
                }

                await ports.escritorio.escribir(actual.direccion, JSON.stringify(fusion));
                const ultima = Date.now();
                await guardar({ ...actual, ultima });
                setEstado('ok');
                setMensaje(cambiados.length
                    ? `${cambiados.length} ${cambiados.length === 1 ? 'libro puesto al día' : 'libros puestos al día'}`
                    : 'Todo al día');
                return { ok: true, cambiados: cambiados.length };
            } catch {
                setEstado('sin-conexion');
                setMensaje(`${actual.nombre || 'El ordenador'} no está disponible ahora.`);
                return { ok: false };
            } finally {
                enCurso.current = null;
            }
        })();
        return enCurso.current;
    }, [config, ports, leerRemoto, guardar]);

    /**
     * Al abrir un libro: ¿se leyó después en el ordenador?
     *
     * Con tiempo límite muy corto. El libro se abre igual sin esperar a esto;
     * si la respuesta llega, sale la propuesta encima.
     */
    const consultarLibro = useCallback(async (libro) => {
        if (!config?.direccion || !libro) return null;
        try {
            const remoto = await leerRemoto(config.direccion, 2500);
            const registro = registroRemoto(libro, remoto.books || []);
            const propuesta = propuestaDePosicion(libro, registro);
            return propuesta ? { ...propuesta, dispositivo: config.nombre || 'el ordenador' } : null;
        } catch {
            return null;
        }
    }, [config, leerRemoto]);

    // Al abrir la app y al volver a ella.
    const sincronizarRef = useRef(sincronizar);
    sincronizarRef.current = sincronizar;

    useEffect(() => {
        if (!config?.direccion || library.status !== 'ready') return undefined;
        sincronizarRef.current();
        let oyente;
        CapApp.addListener('appStateChange', ({ isActive }) => {
            if (isActive) sincronizarRef.current();
        }).then((handle) => { oyente = handle; }).catch(() => {});
        return () => { oyente?.remove?.(); };
    }, [config?.direccion, library.status]);

    return { config, estado, mensaje, emparejar, olvidar, sincronizar, consultarLibro };
};
