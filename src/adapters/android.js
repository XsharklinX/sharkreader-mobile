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
import { createNeuralTts, createTtsRouter } from './NeuralTts.js';

export const createAndroidPorts = () => {
    const storage = createSqliteStorage();
    return {
        storage,
        filePicker: createSafPicker(),
        notifier: createLocalNotifier(),
        // La voz del sistema es la de por defecto y funciona sin red. La
        // neuronal solo entra si el usuario ha configurado su propio servidor,
        // y si falla se vuelve a la del sistema: quedarse callado a mitad de
        // capítulo sería mucho peor que cambiar de voz.
        tts: createTtsRouter(
            createAndroidTts(),
            createNeuralTts(() => storage.getSetting('neuralTts'))
        ),
        screen: createScreenOrientation(),
        // El adaptador lee su configuración del almacenamiento cada vez, así
        // que cambiar de servidor en ajustes surte efecto sin reiniciar.
        sync: createWebdavSync(() => storage.getSetting('sync')),
    };
};
