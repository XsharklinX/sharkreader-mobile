import { describe, it, expect, beforeEach } from 'vitest';
import { installPorts, usePorts, resetPorts, stubPort } from './index.js';

/**
 * El contrato de puertos es lo que sostiene la arquitectura: el núcleo
 * compartido no sabe si corre en Electron o en un WebView, y todo lo que
 * depende de la plataforma entra por aquí. Estos tests fijan ese contrato.
 */

const PORT_METHODS = {
    storage: ['init', 'listBooks', 'getBook', 'putBook', 'deleteBook', 'getSetting', 'setSetting'],
    filePicker: ['pickBooks', 'pickFolder', 'pickBackup'],
    tts: ['listVoices', 'speak', 'pause', 'resume', 'stop'],
    notifier: ['requestPermission', 'schedule', 'cancel'],
    sync: ['read', 'write', 'test'],
};

beforeEach(resetPorts);

describe('registro de puertos', () => {
    it('usar los puertos sin instalarlos falla con un mensaje claro', () => {
        expect(() => usePorts()).toThrow(/installPorts/);
    });

    it('devuelve lo instalado', () => {
        const ports = { storage: {}, filePicker: {}, tts: {}, notifier: {}, sync: {} };
        installPorts(ports);
        expect(usePorts()).toBe(ports);
    });

    it('reinstalar reemplaza el registro', () => {
        installPorts({ storage: 'a' });
        installPorts({ storage: 'b' });
        expect(usePorts().storage).toBe('b');
    });
});

describe('puertos de relleno', () => {
    it('un método sin implementar falla en voz alta, no en silencio', () => {
        const port = stubPort('tts', ['speak']);
        expect(() => port.speak('hola')).toThrow(/tts\.speak/);
        expect(() => port.speak('hola')).toThrow(/no está implementado/);
    });

    it('declara todos los métodos que se le piden', () => {
        const port = stubPort('sync', PORT_METHODS.sync);
        PORT_METHODS.sync.forEach((method) => {
            expect(typeof port[method]).toBe('function');
        });
    });
});

describe('adaptadores de Android', () => {
    // El import es dinámico porque arrastra los plugins de Capacitor, que solo
    // se resuelven de verdad dentro del contenedor nativo. Aquí basta con
    // comprobar la forma del objeto que se registra.
    it('implementa los cinco puertos con todos sus métodos', async () => {
        const { createAndroidPorts } = await import('../adapters/android.js');
        const ports = createAndroidPorts();

        Object.entries(PORT_METHODS).forEach(([name, methods]) => {
            expect(ports[name], `falta el puerto ${name}`).toBeTruthy();
            methods.forEach((method) => {
                expect(
                    typeof ports[name][method],
                    `${name}.${method} no es una función`
                ).toBe('function');
            });
        });
    });

    it('solo sync sigue sin implementar, y lo dice al usarlo', async () => {
        const { createAndroidPorts } = await import('../adapters/android.js');
        const ports = createAndroidPorts();

        expect(() => ports.sync.read()).toThrow(/no está implementado/);

        // Los otros cuatro son implementaciones reales: llamarlos no debe
        // lanzar el error de "sin implementar" aunque fallen por falta de
        // contenedor nativo.
        ['storage', 'filePicker', 'tts', 'notifier'].forEach((name) => {
            const source = String(ports[name].init || ports[name].pickBooks || ports[name].speak || ports[name].requestPermission);
            expect(source).not.toContain('no está implementado');
        });
    });
});
