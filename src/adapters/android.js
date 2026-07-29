// Adaptadores de Android — implementaciones de `src/ports/`.
//
// Estado por fase:
//   v0.2.0 → storage (SQLite) y filePicker (SAF nativo)   ✔ implementados
//   v0.5.0 → notifier (LocalNotifications)                ✔ implementado
//   v0.6.0 → tts (motor del sistema Android)                 ✔ implementado
//   v1.1   → sync (WebDAV vía fetch)


import { createSqliteStorage } from './SqliteStorage.js';
import { createSafPicker } from './SafPicker.js';
import { createLocalNotifier } from './LocalNotifier.js';
import { createAndroidTts } from './AndroidTts.js';
import { stubPort } from '../ports/index.js';

export const createAndroidPorts = () => ({
    storage: createSqliteStorage(),
    filePicker: createSafPicker(),
    notifier: createLocalNotifier(),
    tts: createAndroidTts(),
    sync: stubPort('sync', ['read', 'write', 'test']),
});
