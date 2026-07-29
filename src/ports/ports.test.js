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

    it('los cinco puertos son implementaciones reales, ninguno es un stub', async () => {
        const { createAndroidPorts } = await import('../adapters/android.js');
        const ports = createAndroidPorts();

        // Un stub delata su origen en el cuerpo de la función. Comprobarlo así
        // es lo que hace que este test avise cuando un puerto se implementa de
        // verdad —o cuando alguien lo sustituye por un stub sin querer.
        const probes = {
            storage: ports.storage.init,
            filePicker: ports.filePicker.pickBooks,
            tts: ports.tts.speak,
            notifier: ports.notifier.requestPermission,
            sync: ports.sync.read,
        };

        Object.entries(probes).forEach(([name, method]) => {
            expect(String(method), `${name} sigue siendo un stub`)
                .not.toContain('no está implementado');
        });
    });
});
