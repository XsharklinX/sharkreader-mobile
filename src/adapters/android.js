// Adaptadores de Android — implementaciones de `src/ports/`.
//
// Estado por fase:
//   v0.2.0 → storage (SQLite) y filePicker (SAF nativo)  ✔ implementados
//   v0.5.0 → notifier (LocalNotifications)
//   v0.6.0 → tts (motor del sistema Android)
//   v1.1   → sync (WebDAV vía fetch)

import { stubPort } from '../ports/index.js';
import { createSqliteStorage } from './SqliteStorage.js';
import { createSafPicker } from './SafPicker.js';

export const createAndroidPorts = () => ({
    storage: createSqliteStorage(),
    filePicker: createSafPicker(),
    tts: stubPort('tts', ['listVoices', 'speak', 'pause', 'resume', 'stop']),
    notifier: stubPort('notifier', ['requestPermission', 'schedule', 'cancel']),
    sync: stubPort('sync', ['read', 'write', 'test']),
});
