import React, { useCallback, useEffect, useState } from 'react';
import { registerPlugin, Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { IconLock } from './icons.jsx';

const SharkLock = registerPlugin('SharkLock');

/**
 * Pantalla de bloqueo de la app.
 *
 * Tapa la biblioteca hasta que el usuario se autentica con huella, cara o el
 * PIN del dispositivo. Lo que protege no son los ficheros —siguen igual de
 * accesibles para quien tenga acceso al sistema— sino lo que se ve: qué lees,
 * cuánto, a qué hora y qué has subrayado.
 *
 * ## Cuándo se vuelve a pedir
 *
 * Al volver del segundo plano pasado un margen. Pedir huella cada vez que
 * cambias de app un segundo para copiar algo haría el bloqueo insufrible y
 * acabaría desactivado, que es la peor protección posible. Treinta segundos
 * cubren el caso real —dejar el móvil en la mesa— sin castigar el uso normal.
 */

const GRACE_MS = 30_000;

export const isLockAvailable = async () => {
    if (Capacitor.getPlatform() !== 'android') return { available: false, reason: 'no-platform' };
    try {
        return await SharkLock.isAvailable();
    } catch {
        return { available: false, reason: 'unavailable' };
    }
};

export const authenticate = async () => {
    try {
        return await SharkLock.authenticate({
            title: 'SharkReader',
            subtitle: 'Desbloquea tu biblioteca',
        });
    } catch {
        return { ok: false, reason: 'error' };
    }
};

export default function AppLock({ enabled, children }) {
    const [locked, setLocked] = useState(enabled);
    const [failed, setFailed] = useState(false);

    const unlock = useCallback(async () => {
        setFailed(false);
        const result = await authenticate();
        if (result.ok) setLocked(false);
        // Cancelar deja la app bloqueada sin mensaje: el usuario sabe lo que ha
        // hecho. Solo se avisa si falló de verdad.
        else if (result.reason === 'error') setFailed(true);
    }, []);

    // Al activar el bloqueo desde ajustes no se echa al usuario en ese momento:
    // acaba de autenticarse implícitamente al estar usando la app.
    useEffect(() => {
        if (!enabled) setLocked(false);
    }, [enabled]);

    useEffect(() => {
        if (locked) unlock();
    }, [locked, unlock]);

    // Volver a bloquear al salir a segundo plano más de la cuenta.
    useEffect(() => {
        if (!enabled) return undefined;

        let listener;
        let leftAt = 0;

        CapApp.addListener('appStateChange', ({ isActive }) => {
            if (!isActive) { leftAt = Date.now(); return; }
            if (leftAt && Date.now() - leftAt > GRACE_MS) setLocked(true);
        }).then((handle) => { listener = handle; });

        return () => { listener?.remove(); };
    }, [enabled]);

    if (!enabled || !locked) return children;

    return (
        <div className="app-lock">
            <span className="app-lock-art"><IconLock size={40} /></span>
            <h1 className="app-lock-title">SharkReader</h1>
            <p className="app-lock-body">
                {failed
                    ? 'No se pudo verificar. Vuelve a intentarlo.'
                    : 'Tu biblioteca está bloqueada.'}
            </p>
            <button type="button" className="btn btn-primary" onClick={unlock}>
                Desbloquear
            </button>
        </div>
    );
}
