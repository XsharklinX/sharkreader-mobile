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
import { createScreenAwake } from './ScreenAwake.js';
import { createPageCapture } from './PageCapture.js';
import { createNeuralTts, createTtsRouter } from './NeuralTts.js';
import { createLuz } from './Luz.js';
import { createNoMolestar } from './NoMolestar.js';
import { createServidor } from './Servidor.js';
import { createEscritorio } from './Escritorio.js';
import { createTraduccion } from './Traduccion.js';
import { createLocalTts } from './VozLocal.js';
import { createResumen } from './Resumen.js';

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
            createNeuralTts(() => storage.getSetting('neuralTts')),
            // La natural sin conexión, si el usuario ha descargado alguna.
            createLocalTts()
        ),
        screen: createScreenOrientation(),
        // Que la pantalla no se apague leyendo. El interruptor de Ajustes llevaba
        // tiempo sin nada detrás; este es el puente que faltaba.
        awake: createScreenAwake(),
        // La foto de la página, para doblar la hoja sin perder las
        // ilustraciones. Ver `PageCapture.js`.
        capture: createPageCapture(),
        // La luz que hay alrededor, para adaptar la página. Ver `confortLuz.js`.
        luz: createLuz(),
        // Servidor en la red de casa: recibir libros del ordenador y hablar con
        // SharkReader de escritorio. Ver `SharkServidorPlugin.java`.
        servidor: createServidor(),
        // SharkReader de escritorio en la misma wifi. Ver `useEscritorio.js`.
        escritorio: createEscritorio(),
        // Traducción en el teléfono: leer a dos idiomas y glosas.
        traduccion: createTraduccion(),
        // Resumen con la IA del teléfono, donde la haya. Ver `resumen.js`.
        resumen: createResumen(),
        // Silenciar las notificaciones con un libro abierto, si se pide.
        noMolestar: createNoMolestar(),
        // El adaptador lee su configuración del almacenamiento cada vez, así
        // que cambiar de servidor en ajustes surte efecto sin reiniciar.
        sync: createWebdavSync(() => storage.getSetting('sync')),
    };
};
