// Adaptadores de Android — implementaciones de `src/ports/`.
//
// Estado por fase:
//   v0.2.0 → storage (SQLite) y filePicker (SAF nativo)   ✔ implementados
//   v0.5.0 → notifier (LocalNotifications)                ✔ implementado
//   v0.6.0 → tts (motor del sistema Android)                 ✔ implementado
//   v1.0   → sync (WebDAV vía fetch)                       ✔ implementado


import { createSqliteStorage } from './SqliteStorage.js';
import { createSafPicker } from './SafPicker.js';
import { createLocalNotifier } from './LocalNotifier.js';
import { createAndroidTts } from './AndroidTts.js';
import { createWebdavSync } from './WebdavSync.js';
import { createScreenOrientation } from './ScreenOrientation.js';

export const createAndroidPorts = () => {
    const storage = createSqliteStorage();
    return {
        storage,
        filePicker: createSafPicker(),
        notifier: createLocalNotifier(),
        tts: createAndroidTts(),
        screen: createScreenOrientation(),
        // El adaptador lee su configuración del almacenamiento cada vez, así
        // que cambiar de servidor en ajustes surte efecto sin reiniciar.
        sync: createWebdavSync(() => storage.getSetting('sync')),
    };
};
