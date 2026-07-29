// Capa de puertos — SharkReader Mobile
//
// El núcleo (`src/core/`) es código puro: no sabe si corre en Electron, en un
// WebView de Android o en Node durante los tests. Todo lo que dependa de la
// plataforma entra por aquí.
//
// Regla del proyecto: ningún fichero de `src/core/` puede importar de `src/ports/`.
// La dependencia va siempre en el otro sentido — pantallas y adaptadores importan
// el core, nunca al revés. Eso es lo que mantiene los tests corriendo en Node sin
// mocks de `window`.

/**
 * Almacenamiento de la biblioteca. En Android lo implementa SQLite (metadata,
 * progreso, anotaciones) más el sistema de ficheros privado de la app (los
 * EPUB/PDF y las portadas), porque IndexedDB no aguanta bibliotecas grandes
 * dentro de un WebView.
 *
 * @typedef {Object} StoragePort
 * @property {() => Promise<void>}                         init            Abre la base de datos y aplica migraciones pendientes.
 * @property {() => Promise<Object[]>}                     listBooks       Todos los registros de libro, sin el binario.
 * @property {(id: string) => Promise<Object|null>}        getBook         Un registro de libro por id.
 * @property {(record: Object) => Promise<void>}           putBook         Inserta o actualiza un registro (sin el binario).
 * @property {(id: string) => Promise<void>}               deleteBook      Borra el registro, su binario y deja tombstone.
 * @property {(id: string) => Promise<Blob|null>}          readBookFile    Lee el EPUB/PDF guardado.
 * @property {(id: string, data: Blob) => Promise<void>}   writeBookFile   Guarda el binario en almacenamiento privado.
 * @property {(key: string) => Promise<any>}               getSetting      Lee un ajuste (stats, workshop, usuario…).
 * @property {(key: string, value: any) => Promise<void>}  setSetting      Escribe un ajuste.
 */

/**
 * Selección de ficheros. Android no expone rutas absolutas: el usuario elige a
 * través del Storage Access Framework y lo que se recibe es una URI con permiso.
 * Por eso `PickedFile` trae el contenido, no una ruta — el modelo de datos no
 * puede seguir apoyándose en `sourcePath` como hace el escritorio.
 *
 * @typedef {Object} PickedFile
 * @property {string} name  Nombre del fichero, con extensión.
 * @property {Blob}   data  Contenido.
 * @property {string} [uri] URI de SAF, solo informativa.
 *
 * @typedef {Object} FilePickerPort
 * @property {() => Promise<PickedFile[]>}  pickBooks   Abre el selector filtrando EPUB y PDF.
 * @property {() => Promise<PickedFile[]>}  pickFolder  Pide una carpeta y devuelve los libros que contiene.
 */

/**
 * Lectura en voz alta. En v0.6 lo implementa el motor TTS del sistema Android;
 * el troceado de texto en frases lo sigue haciendo `core/ttsChunks.js`, que es
 * puro y se comparte con el escritorio.
 *
 * @typedef {Object} TtsPort
 * @property {() => Promise<Array<{id: string, name: string, lang: string}>>} listVoices
 * @property {(text: string, options?: Object) => Promise<void>} speak
 * @property {() => Promise<void>} pause
 * @property {() => Promise<void>} resume
 * @property {() => Promise<void>} stop
 */

/**
 * Notificaciones locales: recordatorio diario, resumen semanal, aviso de racha
 * en peligro. Sin servidor y sin push — todo se programa en el dispositivo.
 *
 * @typedef {Object} NotifierPort
 * @property {() => Promise<boolean>} requestPermission  Pide POST_NOTIFICATIONS (obligatorio desde Android 13).
 * @property {(opts: {id: number, title: string, body: string, at?: Date}) => Promise<void>} schedule
 * @property {(id: number) => Promise<void>} cancel
 */

/**
 * Sincronización del backup portable. El formato y la fusión ya los resuelve
 * `core/backupMerge.js`; este puerto solo mueve bytes.
 *
 * @typedef {Object} SyncPort
 * @property {() => Promise<string|null>}       read   Devuelve el JSON remoto, o null si no existe.
 * @property {(content: string) => Promise<void>} write Sobrescribe el JSON remoto.
 * @property {() => Promise<boolean>}           test   Comprueba que el destino es alcanzable.
 */

/**
 * @typedef {Object} Ports
 * @property {StoragePort}    storage
 * @property {FilePickerPort} filePicker
 * @property {TtsPort}        tts
 * @property {NotifierPort}   notifier
 * @property {SyncPort}       sync
 */

/** @type {Ports|null} */
let registry = null;

const missing = (portName, method) => () => {
    throw new Error(
        `[ports] ${portName}.${method}() no está implementado todavía. ` +
        `Regístralo con installPorts() antes de usarlo.`
    );
};

/**
 * Puerto de relleno: cualquier método lanza un error claro en vez de fallar de
 * forma silenciosa. Sirve para arrancar la app con adaptadores a medio hacer.
 * @param {string} name
 * @param {string[]} methods
 */
export const stubPort = (name, methods) =>
    Object.fromEntries(methods.map((method) => [method, missing(name, method)]));

/**
 * Instala la implementación de plataforma. Se llama una vez en el arranque
 * (`main.jsx`), antes de montar React.
 * @param {Ports} ports
 */
export const installPorts = (ports) => {
    registry = ports;
};

/**
 * Acceso a los puertos instalados.
 * @returns {Ports}
 */
export const usePorts = () => {
    if (!registry) {
        throw new Error('[ports] installPorts() no se ha llamado todavía.');
    }
    return registry;
};

/** Solo para tests: deja el registro vacío. */
export const resetPorts = () => {
    registry = null;
};
