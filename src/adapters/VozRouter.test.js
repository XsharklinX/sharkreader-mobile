import { describe, it, expect, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({}), Capacitor: {} }));
const { createTtsRouter } = await import('./NeuralTts.js');

const motor = (nombre, voces = []) => ({
    isSupported: vi.fn(async () => true),
    listVoices: vi.fn(async () => voces),
    speak: vi.fn(async () => {}),
    prepare: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    pause: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    nombre,
});

describe('enrutador de voces con la voz natural', () => {
    it('las voces naturales van primero y llevan su motor', async () => {
        const router = createTtsRouter(motor('s', [{ id: 'es-es' }]), motor('n', []), motor('l', [{ id: 'es_ES-davefx-medium' }]));
        const voces = await router.listVoices();
        expect(voces[0]).toMatchObject({ id: 'es_ES-davefx-medium', engine: 'local' });
    });

    it('con una voz natural elegida, habla ella y prepara la siguiente frase', async () => {
        const sistema = motor('s');
        const local = motor('l');
        const router = createTtsRouter(sistema, motor('n'), local);
        await router.speak('Hola.', { engine: 'local', voiceId: 'x' });
        await router.prepare('Adiós.', { engine: 'local', voiceId: 'x' });
        expect(local.speak).toHaveBeenCalled();
        expect(local.prepare).toHaveBeenCalledWith('Adiós.', expect.objectContaining({ voiceId: 'x' }));
        expect(sistema.speak).not.toHaveBeenCalled();
    });

    it('si la natural falla, sigue la del sistema en vez de callarse', async () => {
        const sistema = motor('s');
        const local = { ...motor('l'), speak: vi.fn(async () => { throw new Error('borrada'); }) };
        const router = createTtsRouter(sistema, motor('n'), local);
        await router.speak('Hola.', { engine: 'local' });
        expect(sistema.speak).toHaveBeenCalled();
    });

    it('sin motor local sigue funcionando como antes', async () => {
        const router = createTtsRouter(motor('s', [{ id: 'a' }]), motor('n'));
        expect(await router.listVoices()).toHaveLength(1);
        await expect(router.prepare('x', { engine: 'local' })).resolves.toBeUndefined();
    });
});
