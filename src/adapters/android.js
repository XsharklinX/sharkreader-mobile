// Adaptadores de Android — implementaciones de `src/ports/`.
//
// En la Fase 0 solo existe el esqueleto: cada puerto se registra con stubs que
// fallan con un mensaje claro. Las fases siguientes los van rellenando sin tocar
// ni el core ni las pantallas:
//
//   Fase 1 (v0.2.0) → storage (SQLite + Filesystem) y filePicker (SAF)
//   Fase 5 (v0.5.0) → notifier (LocalNotifications)
//   Fase 6 (v0.6.0) → tts (motor del sistema Android)
//   Post-1.0        → sync (WebDAV vía fetch)

import { stubPort } from '../ports/index.js';

const memorySettings = new Map();

/**
 * Almacenamiento provisional en memoria: permite que la app arranque y navegue
 * antes de que exista SQLite. No persiste nada entre sesiones — a propósito, para
 * que sea evidente que falta implementarlo.
 */
const memoryStorage = {
    init: async () => {},
    listBooks: async () => [],
    getBook: async () => null,
    putBook: async () => {},
    deleteBook: async () => {},
    readBookFile: async () => null,
    writeBookFile: async () => {},
    getSetting: async (key) => memorySettings.get(key) ?? null,
    setSetting: async (key, value) => { memorySettings.set(key, value); },
};

export const createAndroidPorts = () => ({
    storage: memoryStorage,
    filePicker: stubPort('filePicker', ['pickBooks', 'pickFolder']),
    tts: stubPort('tts', ['listVoices', 'speak', 'pause', 'resume', 'stop']),
    notifier: stubPort('notifier', ['requestPermission', 'schedule', 'cancel']),
    sync: stubPort('sync', ['read', 'write', 'test']),
});
