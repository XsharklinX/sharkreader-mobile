import React, { useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { usePorts } from '../ports/index.js';
import { readBookBlob } from '../adapters/SafPicker.js';
import {
    parseBackupFile, mergeIntoLibrary, buildBackup, shareTextFile, exportAnnotations,
} from '../library/backup.js';
import {
    leerEstado, elegirCarpeta, olvidarCarpeta, copiarAhora, listarCopias, leerCopia,
} from '../library/autoBackupRunner.js';
import { resumenCopias } from '../core/autoBackup.js';
import { loadVocabulary, vocabularyToMarkdown } from '../reader/dictionary.js';
import { vocabularioParaAnki } from '../reader/anki.js';
import { getMobileAddons } from '../library/workshop.js';
import { formatBytes, useStorageUsage } from './storage.js';
import { relativeTime } from './SettingsHome.jsx';
import { IconBell, IconChevronRight, IconShare, IconFolder, IconTrash } from '../ui/icons.jsx';
import Switch from '../ui/Switch.jsx';
import { isLockAvailable, authenticate } from '../ui/AppLock.jsx';
import OrdenarSheet from '../library/OrdenarSheet.jsx';
import MigrarScreen from '../library/MigrarScreen.jsx';
import { resumirDiagnostico } from '../library/ordenar.js';
import { IDIOMAS_TRADUCCION } from '../adapters/Traduccion.js';
import { NIVELES_GLOSAS } from '../reader/glosas.js';
import { DESTINO_POR_DEFECTO } from '../reader/traducir.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Piezas compartidas
   ═══════════════════════════════════════════════════════════════════════════ */

export const Toggle = ({ label, sub, checked, onChange, id }) => (
    <div className="row" data-setting={id}>
        <span className="row-txt">
            <span>{label}</span>
            {sub && <span className="row-sub">{sub}</span>}
        </span>
        <button
            type="button"
            className={`switch${checked ? ' on' : ''}`}
            onClick={() => onChange(!checked)}
            role="switch"
            aria-checked={!!checked}
            aria-label={label}
        />
    </div>
);

const Stepper = ({ label, sub, value, unit, min, max, step, onChange, id }) => (
    <div className="row" data-setting={id}>
        <span className="row-txt">
            <span>{label}</span>
            {sub && <span className="row-sub">{sub}</span>}
        </span>
        <div className="stepper" style={{ flex: 'none' }}>
            <button type="button" onClick={() => onChange(Math.max(min, value - step))} aria-label={`Reducir ${label}`}>−</button>
            <span className="stepper-val" style={{ minWidth: 62 }}>{value}{unit}</span>
            <button type="button" onClick={() => onChange(Math.min(max, value + step))} aria-label={`Aumentar ${label}`}>+</button>
        </div>
    </div>
);

const Group = ({ title, children }) => (
    <section className="section">
        {title && <h2 className="bs-heading">{title}</h2>}
        <div className="rows">{children}</div>
    </section>
);

/* ═══════════════════════════════════════════════════════════════════════════
   Lectura
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Leer en otro idioma: traducir al tocar y ayudas de vocabulario.
 *
 * Las dos usan la traducción del teléfono, que necesita bajar cada idioma una
 * vez. Por eso el aviso de los 30 MB va aquí, antes de encender nada.
 */
const IdiomasGroup = ({ prefs, stats }) => {
    const traduccion = { activo: false, a: '', soloWifi: true, ...(prefs.traduccion || {}) };
    const glosas = { activo: false, nivel: 'b2', ...(prefs.glosas || {}) };
    const destino = traduccion.a || DESTINO_POR_DEFECTO();
    const guardarTraduccion = (cambio) => stats.savePreferences({ traduccion: { ...traduccion, ...cambio } });
    const guardarGlosas = (cambio) => stats.savePreferences({ glosas: { ...glosas, ...cambio } });

    return (
        <Group title="Leer en otro idioma">
            <Toggle
                id="translate-tap"
                label="Traducir al tocar un párrafo"
                sub="Toca el centro de la página y la traducción aparece debajo; otro toque la quita. Arriba y abajo siguen abriendo los controles"
                checked={traduccion.activo}
                onChange={(activo) => guardarTraduccion({ activo })}
            />
            <Toggle
                id="vocab-help"
                label="Ayudas de vocabulario"
                sub="Encima de las palabras difíciles para tu nivel, su traducción en pequeño"
                checked={glosas.activo}
                onChange={(activo) => guardarGlosas({ activo })}
            />
            {glosas.activo && (
                <div className="row" data-setting="vocab-level">
                    <span className="row-txt"><span>Tu nivel</span>
                        <span className="row-sub">{NIVELES_GLOSAS.find((n) => n.id === glosas.nivel)?.hint}</span>
                    </span>
                    <div className="pills" style={{ flex: 'none' }}>
                        {NIVELES_GLOSAS.map((n) => (
                            <button key={n.id} type="button" className={`pill${glosas.nivel === n.id ? ' on' : ''}`} onClick={() => guardarGlosas({ nivel: n.id })}>
                                {n.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <div className="row" data-setting="translate-target">
                <span className="row-txt"><span>Traducir al</span></span>
                <div className="pills">
                    {IDIOMAS_TRADUCCION.map((idioma) => (
                        <button key={idioma.id} type="button" className={`pill${destino === idioma.id ? ' on' : ''}`} onClick={() => guardarTraduccion({ a: idioma.id })}>
                            {idioma.label}
                        </button>
                    ))}
                </div>
            </div>
            <Toggle
                id="translate-wifi"
                label="Descargar idiomas solo con wifi"
                sub="La primera vez que traduces desde un idioma se descarga su modelo, unos 30 MB. Después se traduce sin conexión y el texto no sale del teléfono"
                checked={traduccion.soloWifi !== false}
                onChange={(soloWifi) => guardarTraduccion({ soloWifi })}
            />
        </Group>
    );
};

export const ReadingPage = ({ stats, notify }) => {
    const prefs = stats.preferences;
    const ports = usePorts();

    /**
     * Encender «No molestar» pide, si falta, el acceso de Android. Se guarda
     * encendido igualmente: al volver de esa pantalla con el acceso dado, el
     * lector ya lo usa sin tener que tocar nada más.
     */
    const cambiarNoMolestar = async (noMolestar) => {
        stats.savePreferences({ noMolestar });
        if (!noMolestar || !ports.noMolestar) return;
        const { permitido } = await ports.noMolestar.estado();
        if (permitido) return;
        notify('Activa SharkReader en la lista que se abre y vuelve');
        ports.noMolestar.pedirPermiso().catch(() => notify('No se ha podido abrir el ajuste de Android'));
    };

    return (
        <>
            <Group title="Metas">
                <Stepper
                    id="goal-daily"
                    label="Meta diaria"
                    value={stats.goals.daily}
                    unit=" min"
                    min={5}
                    max={240}
                    step={5}
                    onChange={(daily) => stats.saveGoals({ daily })}
                />
                <Stepper
                    id="goal-weekly"
                    label="Meta semanal"
                    value={stats.goals.weekly}
                    unit=" min"
                    min={30}
                    max={1400}
                    step={30}
                    onChange={(weekly) => stats.saveGoals({ weekly })}
                />
            </Group>

            <Group title="Avisos">
                <Toggle
                    id="reminder"
                    label="Recordatorio diario"
                    sub={prefs.reminders ? 'Un aviso si no has leído' : 'Desactivado'}
                    checked={prefs.reminders}
                    onChange={async (value) => {
                        const result = await stats.savePreferences({ reminders: value });
                        if (result?.permissionDenied) {
                            notify('Android no ha concedido el permiso de notificaciones.');
                        }
                    }}
                />
                {prefs.reminders && (
                    <div className="row">
                        <span className="row-icon"><IconBell size={19} /></span>
                        <span className="row-txt"><span>Hora del aviso</span></span>
                        <div className="stepper" style={{ flex: 'none' }}>
                            <button type="button" onClick={() => stats.savePreferences({ reminderHour: Math.max(6, prefs.reminderHour - 1) })} aria-label="Una hora antes">−</button>
                            <span className="stepper-val" style={{ minWidth: 52 }}>
                                {String(prefs.reminderHour).padStart(2, '0')}:00
                            </span>
                            <button type="button" onClick={() => stats.savePreferences({ reminderHour: Math.min(23, prefs.reminderHour + 1) })} aria-label="Una hora después">+</button>
                        </div>
                    </div>
                )}
                <Toggle
                    id="weekly-summary"
                    label="Resumen semanal"
                    sub="Los domingos por la tarde"
                    checked={prefs.reminders}
                    onChange={(value) => stats.savePreferences({ reminders: value })}
                />
            </Group>

            <Group title="En el lector">
                <Toggle
                    id="volume-keys"
                    label="Pasar página con el volumen"
                    sub="Viene apagado: por defecto esas teclas son el volumen, sobre todo con la voz activa"
                    checked={prefs.volumeKeys === true}
                    onChange={(volumeKeys) => stats.savePreferences({ volumeKeys })}
                />
                <Toggle
                    id="keep-awake"
                    label="Mantener la pantalla encendida"
                    sub="Mientras lees. El apagado del sistema son treinta segundos y leyendo no se toca nada"
                    checked={prefs.keepAwake !== false}
                    onChange={(keepAwake) => stats.savePreferences({ keepAwake })}
                />
                <Toggle
                    id="hold-to-flip"
                    label="Mantén el borde para hojear"
                    sub="Con el dedo quieto en una zona de pasar página, las páginas pasan solas y cada vez más deprisa. Junto al borde no se puede seleccionar texto mientras tanto"
                    checked={prefs.hojear !== false}
                    onChange={(hojear) => stats.savePreferences({ hojear })}
                />
                <Toggle
                    id="light-comfort"
                    label="Adaptar la página a la luz"
                    sub="Con el sensor de luz: noche cálida a oscuras, tema claro al sol. Lo que corrijas a mano se recuerda para esa luz"
                    checked={prefs.confortLuz === true}
                    onChange={(confortLuz) => stats.savePreferences({ confortLuz })}
                />
                {ports.noMolestar && (
                    <Toggle
                        id="do-not-disturb"
                        label="No molestar mientras lees"
                        sub="Con un libro abierto, solo entran alarmas y tus contactos favoritos. Al cerrarlo, todo vuelve a como estaba. Si ya tenías tu propio No molestar, no se toca"
                        checked={prefs.noMolestar === true}
                        onChange={cambiarNoMolestar}
                    />
                )}
                <Toggle
                    id="sharky"
                    label="Sharky"
                    sub="Comentarios ocasionales en la biblioteca"
                    checked={prefs.sharky}
                    onChange={(sharky) => stats.savePreferences({ sharky })}
                />
            </Group>

            <IdiomasGroup prefs={prefs} stats={stats} />
        </>
    );
};

/* ═══════════════════════════════════════════════════════════════════════════
   Apariencia
   ═══════════════════════════════════════════════════════════════════════════ */

const APP_THEMES = [
    { id: 'dark', label: 'Oscuro' },
    { id: 'light', label: 'Claro' },
];

export const AppearancePage = ({ stats }) => {
    const prefs = stats.preferences;
    const theme = prefs.appTheme || 'dark';

    useEffect(() => {
        document.documentElement.classList.toggle('theme-light', theme === 'light');
    }, [theme]);

    return (
        <>
            <section className="section" data-setting="theme">
                <h2 className="bs-heading">Tema de la aplicación</h2>
                <div className="segmented">
                    {APP_THEMES.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            className={theme === option.id ? 'on' : ''}
                            onClick={() => stats.savePreferences({ appTheme: option.id })}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                <p className="option-desc">
                    Es independiente del tema de lectura: puedes leer en sepia con la
                    interfaz oscura.
                </p>
            </section>

            {/* Aquí había un selector de vista con Rejilla y Estante. Se ha ido a
                la barra de la biblioteca, junto a los filtros: una vista se cambia
                mientras buscas, no se configura una vez en otra pantalla. Y desde
                allí se eligen las cuatro, no dos.

                La densidad compacta, que era otro interruptor aparte, era en
                realidad una tercera vista y ahora está con las demás. */}

            <section className="section" data-setting="material-you">
                <h2 className="bs-heading">Colores del sistema</h2>
                <Switch
                    label="Material You"
                    hint="La interfaz toma los colores de tu fondo de pantalla (Android 12 o superior)"
                    checked={Boolean(prefs.materialYou)}
                    onChange={(materialYou) => stats.savePreferences({ materialYou })}
                />
                <p className="option-desc">
                    No afecta a los temas de lectura: esos están elegidos por contraste
                    y fatiga visual, no por gusto, y teñir la página del libro con el
                    fondo de pantalla empeoraría la lectura.
                </p>
            </section>

            <section className="section" data-setting="density">
                <h2 className="bs-heading">Densidad de la biblioteca</h2>
                <div className="segmented">
                    {[
                        { id: 'comfortable', label: 'Cómoda' },
                        { id: 'compact', label: 'Compacta' },
                    ].map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            className={(prefs.density || 'comfortable') === option.id ? 'on' : ''}
                            onClick={() => stats.savePreferences({ density: option.id })}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </section>

            <section className="section" data-setting="font-scale">
                <h2 className="bs-heading">Tamaño de la interfaz</h2>
                <p className="option-desc">
                    SharkReader respeta el tamaño de letra que tengas configurado en
                    Android. Para cambiarlo, ve a los ajustes de accesibilidad del
                    sistema.
                </p>
            </section>
        </>
    );
};

/* ═══════════════════════════════════════════════════════════════════════════
   Sincronización
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * SharkReader de escritorio en la misma wifi.
 *
 * Va primero en Sincronización porque es la forma que no pide nada: ni servidor
 * ni cuenta, solo tener las dos apps abiertas en casa. El WebDAV queda debajo
 * para quien quiera sincronizar también fuera de casa.
 */
const EscritorioSection = ({ escritorio, notify }) => {
    const [texto, setTexto] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState(null);

    if (!escritorio) return null;
    const { config } = escritorio;

    const emparejar = async () => {
        setOcupado(true);
        setError(null);
        try {
            const { nombre } = await escritorio.emparejar(texto);
            setTexto('');
            notify?.(`Emparejado con ${nombre}.`);
            escritorio.sincronizar();
        } catch (fallo) {
            setError(fallo?.message || 'No se pudo emparejar.');
        }
        setOcupado(false);
    };

    return (
        <section className="section" data-setting="desktop-pair">
            <h2 className="bs-heading">SharkReader en el ordenador</h2>
            {config?.direccion ? (
                <>
                    <div className={`sync-status${escritorio.estado === 'sin-conexion' ? ' error' : ''}`}>
                        <span className="sync-dot" />
                        <div className="row-txt">
                            <span>{config.nombre}</span>
                            <span className="row-sub">
                                {escritorio.estado === 'sincronizando'
                                    ? 'Sincronizando…'
                                    : escritorio.mensaje
                                        || (config.ultima ? `Última vez ${relativeTime(config.ultima)}` : 'Sin sincronizar todavía')}
                            </span>
                        </div>
                    </div>
                    <p className="option-desc">
                        Se ponen al día solos al abrir la app, al volver a ella y al cerrar un libro, siempre que
                        el ordenador tenga SharkReader abierto en la misma wifi. Al abrir un libro que seguiste
                        leyendo allí, te propone ir a ese punto.
                    </p>
                    <div className="sheet-actions">
                        <button type="button" className="btn" onClick={escritorio.olvidar}>Olvidar</button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={escritorio.sincronizar}
                            disabled={escritorio.estado === 'sincronizando'}
                        >
                            Sincronizar ahora
                        </button>
                    </div>
                </>
            ) : (
                <div className="bs-form">
                    <p className="option-desc">
                        En el ordenador, abre SharkReader y ve a Ajustes → Móvil en la red de casa. Escribe aquí la
                        dirección que aparece. Sin cuenta y sin nube: los datos van de uno a otro por tu wifi.
                    </p>
                    <label className="bs-field">
                        <span className="option-desc">Dirección del ordenador</span>
                        <div className="search">
                            <input
                                type="text"
                                value={texto}
                                onChange={(event) => setTexto(event.target.value)}
                                placeholder="192.168.1.20:47321/clave"
                                aria-label="Dirección del ordenador"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                            />
                        </div>
                    </label>
                    {error && <p className="banner banner-error" role="alert">{error}</p>}
                    <button type="button" className="btn btn-primary btn-block" onClick={emparejar} disabled={ocupado || !texto.trim()}>
                        {ocupado ? 'Buscando el ordenador…' : 'Emparejar'}
                    </button>
                </div>
            )}
        </section>
    );
};

export const SyncPage = ({ sync, escritorio, notify }) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
        <>
            <EscritorioSection escritorio={escritorio} notify={notify} />
            {sync.configured && (
                <div className={`sync-status${sync.state === 'error' ? ' error' : ''}`}>
                    <span className="sync-dot" />
                    <div className="row-txt">
                        <span>{sync.state === 'error' ? 'Con problemas' : 'Configurado'}</span>
                        <span className="row-sub">
                            {sync.lastAt ? `Última vez ${relativeTime(sync.lastAt)}` : 'Sin sincronizar todavía'}
                        </span>
                    </div>
                </div>
            )}

            <section className="section">
                <h2 className="bs-heading">Servidor WebDAV</h2>
                <div className="bs-form" data-setting="sync-server">
                    <label className="bs-field">
                        <span className="option-desc">Dirección</span>
                        <div className="search">
                            <input
                                type="url"
                                value={sync.config.url}
                                onChange={(event) => sync.saveConfig({ url: event.target.value })}
                                placeholder="https://nube.ejemplo.com/remote.php/dav/…"
                                aria-label="Dirección del servidor"
                                autoCapitalize="none"
                            />
                        </div>
                    </label>
                    <label className="bs-field" data-setting="sync-user">
                        <span className="option-desc">Usuario</span>
                        <div className="search">
                            <input
                                type="text"
                                value={sync.config.user}
                                onChange={(event) => sync.saveConfig({ user: event.target.value })}
                                aria-label="Usuario"
                                autoCapitalize="none"
                            />
                        </div>
                    </label>
                    <label className="bs-field">
                        <span className="option-desc">Contraseña de aplicación</span>
                        <div className="search">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={sync.config.password}
                                onChange={(event) => sync.saveConfig({ password: event.target.value })}
                                aria-label="Contraseña"
                            />
                            <button
                                type="button"
                                className="link-btn"
                                style={{ minHeight: 30, padding: 0, fontSize: 'var(--t-micro)' }}
                                onClick={() => setShowPassword((v) => !v)}
                            >
                                {showPassword ? 'Ocultar' : 'Ver'}
                            </button>
                        </div>
                    </label>
                </div>
            </section>

            <Group title="Cuándo sincronizar">
                <Toggle
                    id="sync-auto"
                    label="Al abrir la app"
                    checked={sync.config.auto}
                    onChange={(auto) => sync.saveConfig({ auto })}
                />
                <Toggle
                    id="sync-wifi"
                    label="Solo con wifi"
                    sub="Evita gastar datos móviles"
                    checked={sync.config.wifiOnly ?? true}
                    onChange={(wifiOnly) => sync.saveConfig({ wifiOnly })}
                />
            </Group>

            {sync.message && <div className="banner" role="status">{sync.message}</div>}

            <div className="sheet-actions">
                <button
                    type="button"
                    className="btn"
                    onClick={sync.test}
                    disabled={!sync.configured || sync.state === 'syncing'}
                >
                    Probar conexión
                </button>
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={sync.sync}
                    disabled={!sync.configured || sync.state === 'syncing'}
                    data-setting="sync-now"
                >
                    {sync.state === 'syncing' ? 'Sincronizando…' : 'Sincronizar ahora'}
                </button>
            </div>

            <p className="option-desc">
                El servidor es tuyo. SharkReader no tiene cuenta propia ni guarda nada
                en ninguna infraestructura nuestra: los datos van de tu dispositivo a
                tu servidor y nada más.
            </p>
        </>
    );
};

/* ═══════════════════════════════════════════════════════════════════════════
   Biblioteca y datos
   ═══════════════════════════════════════════════════════════════════════════ */

export const DataPage = ({ library, stats, notify }) => {
    const ports = usePorts();
    const usage = useStorageUsage();
    const [busy, setBusy] = useState(null);
    const [vocabulary, setVocabulary] = useState([]);
    const [ordenando, setOrdenando] = useState(false);
    const [migrando, setMigrando] = useState(false);
    const pendientes = resumirDiagnostico(library.books);

    useEffect(() => {
        loadVocabulary(ports.storage).then(setVocabulary).catch(() => {});
    }, [ports]);

    // ── Copias automáticas ───────────────────────────────────────────────
    const [copias, setCopias] = useState({ carpeta: null, etiqueta: '', ultima: 0 });
    const [restaurables, setRestaurables] = useState([]);

    useEffect(() => {
        leerEstado(ports.storage).then(setCopias).catch(() => {});
    }, [ports]);

    const refrescarCopias = async () => {
        setCopias(await leerEstado(ports.storage));
        setRestaurables(await listarCopias(ports.storage));
    };

    const elegirCarpetaCopias = async () => {
        try {
            const elegida = await elegirCarpeta(ports.storage);
            if (!elegida.carpeta) return;
            await refrescarCopias();
            // La primera copia se hace en el momento: si no, el usuario elige la
            // carpeta, la ve vacía y no sabe si ha funcionado.
            setBusy('Guardando la primera copia…');
            const hecho = await copiarAhora({ storage: ports.storage, books: library.books });
            setBusy(null);
            await refrescarCopias();
            notify(hecho.ok ? `Copia guardada: ${hecho.nombre}` : (hecho.error || 'No se pudo copiar.'));
        } catch (error) {
            setBusy(null);
            notify(error?.message || 'No se pudo elegir la carpeta.');
        }
    };

    const copiarYa = async () => {
        setBusy('Guardando copia…');
        const hecho = await copiarAhora({ storage: ports.storage, books: library.books });
        setBusy(null);
        await refrescarCopias();
        notify(hecho.ok ? `Copia guardada: ${hecho.nombre}` : (hecho.error || 'No se pudo copiar.'));
    };

    /**
     * Restaura desde una copia de la carpeta.
     *
     * Fusiona, no sustituye: es el mismo camino que importar un backup a mano,
     * así que si el móvil ya tiene algo más reciente no se pierde.
     */
    const restaurarCopia = async (uri, nombre) => {
        setBusy(`Restaurando ${nombre}…`);
        try {
            const incoming = await leerCopia(uri);
            const stats = (await ports.storage.getSetting('stats')) || {};
            const result = mergeIntoLibrary(incoming, library.books, stats);

            await library.replaceAll(result.books);
            await ports.storage.setSetting('stats', result.stats);
            if (result.achievements) await ports.storage.setSetting('achievements', result.achievements);

            setBusy(null);
            notify(`${result.summary.added} libros recuperados · ${result.summary.updated} actualizados`);
        } catch (error) {
            setBusy(null);
            notify(error?.message || 'Esa copia no se pudo leer.');
        }
    };

    const estadoCopias = resumenCopias(copias);

    const hasNotes = library.books.some((book) => book.bookmarks?.length);

    const importBackup = async () => {
        setBusy('Esperando a que elijas el fichero…');
        try {
            const picked = await ports.filePicker.pickBackup();
            const file = picked?.books?.[0];
            if (!file) { setBusy(null); return; }

            setBusy('Leyendo el backup…');
            const blob = await readBookBlob(file.path);
            // El validador envuelve lo leído en `{ backup, warnings }`. Pasarlo
            // entero a la fusión era lo que hacía que importar un backup no
            // restaurara nada.
            const { backup: incoming, warnings } = await parseBackupFile(blob, file.name);

            setBusy('Fusionando con tu biblioteca…');
            const stats = (await ports.storage.getSetting('stats')) || {};
            const result = mergeIntoLibrary(incoming, library.books, stats);

            await library.replaceAll(result.books);
            await ports.storage.setSetting('stats', result.stats);
            if (result.achievements) await ports.storage.setSetting('achievements', result.achievements);

            setBusy(null);
            const aviso = warnings?.length ? ` · ${warnings.length} avisos` : '';
            notify(`${result.summary.added} libros nuevos · ${result.summary.updated} actualizados${aviso}`);
        } catch (error) {
            setBusy(null);
            notify(error?.message || 'El backup no se pudo leer.');
        }
    };

    const exportBackup = async () => {
        setBusy('Preparando el backup…');
        try {
            const stats = (await ports.storage.getSetting('stats')) || {};
            const achievements = (await ports.storage.getSetting('achievements')) || {};
            const backup = buildBackup(library.books, stats, achievements);
            const date = new Date().toISOString().slice(0, 10);
            await shareTextFile(`sharkreader-backup-${date}.json`, JSON.stringify(backup, null, 2), 'Exportar backup');
            setBusy(null);
        } catch (error) {
            setBusy(null);
            notify(error?.message || 'No se pudo exportar el backup.');
        }
    };

    return (
        <>
            {busy && <div className="banner" role="status">{busy}</div>}

            <Group title="Orden">
                <button
                    type="button"
                    className="row"
                    onClick={() => setOrdenando(true)}
                    disabled={!library.books.length}
                    data-setting="library-tidy"
                >
                    <span className="row-icon"><IconFolder size={19} /></span>
                    <span className="row-txt">
                        <span>Ordenar la biblioteca</span>
                        <span className="row-sub">
                            {pendientes.libros || pendientes.series
                                ? `${pendientes.libros} libros con título, autor o portada mejorables`
                                : 'Títulos, autores, portadas y series en orden'}
                        </span>
                    </span>
                    <IconChevronRight size={18} />
                </button>
                <button
                    type="button"
                    className="row"
                    onClick={() => setMigrando(true)}
                    disabled={!library.books.length}
                    data-setting="import-other-app"
                >
                    <span className="row-icon"><IconShare size={19} /></span>
                    <span className="row-txt">
                        <span>Traer de otra app</span>
                        <span className="row-sub">Subrayados, notas y progreso de Kindle o KOReader</span>
                    </span>
                    <IconChevronRight size={18} />
                </button>
            </Group>

            {migrando && (
                <div className="overlay-screen">
                    <MigrarScreen library={library} onClose={() => setMigrando(false)} />
                </div>
            )}

            {ordenando && (
                <OrdenarSheet
                    books={library.books}
                    onUpdate={library.updateBook}
                    onClose={() => setOrdenando(false)}
                />
            )}

            <Group title="Copias automáticas">
                <button
                    type="button"
                    className="row"
                    onClick={elegirCarpetaCopias}
                    disabled={!!busy}
                    data-setting="backup-folder"
                >
                    <span className="row-icon"><IconFolder size={19} /></span>
                    <span className="row-txt">
                        <span>{estadoCopias.activo ? 'Carpeta de copias' : 'Activar copias automáticas'}</span>
                        <span className="row-sub">
                            {estadoCopias.activo ? `${estadoCopias.titulo} · ${estadoCopias.detalle}` : estadoCopias.detalle}
                        </span>
                    </span>
                    <IconChevronRight size={18} />
                </button>

                {estadoCopias.activo && (
                    <button type="button" className="row" onClick={copiarYa} disabled={!!busy || !library.books.length} data-setting="backup-now">
                        <span className="row-icon"><IconShare size={19} /></span>
                        <span className="row-txt"><span>Copiar ahora</span></span>
                        <IconChevronRight size={18} />
                    </button>
                )}

                {estadoCopias.activo && (
                    <button type="button" className="row" onClick={refrescarCopias} disabled={!!busy} data-setting="backup-list">
                        <span className="row-icon"><IconFolder size={19} /></span>
                        <span className="row-txt">
                            <span>Restaurar desde una copia</span>
                            <span className="row-sub">
                                {restaurables.length
                                    ? `${restaurables.length} copias guardadas`
                                    : 'Toca para ver las copias guardadas'}
                            </span>
                        </span>
                        <IconChevronRight size={18} />
                    </button>
                )}

                {restaurables.map((copia) => (
                    <button
                        key={copia.uri}
                        type="button"
                        className="row"
                        onClick={() => restaurarCopia(copia.uri, copia.name)}
                        disabled={!!busy}
                    >
                        <span className="row-icon"><IconChevronRight size={19} /></span>
                        <span className="row-txt">
                            <span>{copia.name}</span>
                            <span className="row-sub">{Math.round((copia.size || 0) / 1024)} KB</span>
                        </span>
                    </button>
                ))}

                {estadoCopias.activo && (
                    <button type="button" className="row" onClick={async () => { await olvidarCarpeta(ports.storage); await refrescarCopias(); }} disabled={!!busy}>
                        <span className="row-icon"><IconFolder size={19} /></span>
                        <span className="row-txt">
                            <span>Dejar de copiar</span>
                            <span className="row-sub">Las copias ya hechas se quedan donde están</span>
                        </span>
                    </button>
                )}
            </Group>

            <Group title="Copia de seguridad">
                <button type="button" className="row" onClick={importBackup} disabled={!!busy} data-setting="backup-import">
                    <span className="row-icon"><IconFolder size={19} /></span>
                    <span className="row-txt">
                        <span>Importar backup</span>
                        <span className="row-sub">Trae libros, progreso y anotaciones del escritorio</span>
                    </span>
                    <IconChevronRight size={18} />
                </button>
                <button type="button" className="row" onClick={exportBackup} disabled={!!busy || !library.books.length} data-setting="backup-export">
                    <span className="row-icon"><IconShare size={19} /></span>
                    <span className="row-txt"><span>Exportar backup</span></span>
                    <IconChevronRight size={18} />
                </button>
            </Group>

            <Group title="Exportar">
                <button
                    type="button"
                    className="row"
                    data-setting="export-notes"
                    disabled={!hasNotes}
                    onClick={async () => {
                        try {
                            const result = await exportAnnotations(library.books);
                            notify(`${result.count} anotaciones exportadas`);
                        } catch (error) {
                            notify(error?.message || 'No se pudieron exportar.');
                        }
                    }}
                >
                    <span className="row-icon"><IconShare size={19} /></span>
                    <span className="row-txt">
                        <span>Anotaciones a Markdown</span>
                        <span className="row-sub">{hasNotes ? 'Con frontmatter, listo para Obsidian' : 'Todavía no hay ninguna'}</span>
                    </span>
                    <IconChevronRight size={18} />
                </button>
                <button
                    type="button"
                    className="row"
                    data-setting="export-vocab"
                    disabled={vocabulary.length === 0}
                    onClick={async () => {
                        const date = new Date().toISOString().slice(0, 10);
                        await shareTextFile(`vocabulario-${date}.md`, vocabularyToMarkdown(vocabulary), 'Exportar vocabulario');
                        notify(`${vocabulary.length} palabras exportadas`);
                    }}
                >
                    <span className="row-icon"><IconShare size={19} /></span>
                    <span className="row-txt">
                        <span>Vocabulario</span>
                        <span className="row-sub">
                            {vocabulary.length === 0 ? 'Sin palabras guardadas' : `${vocabulary.length} palabras`}
                        </span>
                    </span>
                    <IconChevronRight size={18} />
                </button>
                <button
                    type="button"
                    className="row"
                    data-setting="export-anki"
                    disabled={vocabulary.length === 0 || busy === 'anki'}
                    onClick={async () => {
                        setBusy('anki');
                        try {
                            const tarjetas = await traducirVocabulario(ports, vocabulary, stats?.preferences?.traduccion?.a || DESTINO_POR_DEFECTO());
                            const date = new Date().toISOString().slice(0, 10);
                            await shareTextFile(`sharkreader-anki-${date}.tsv`, vocabularioParaAnki(tarjetas), 'Tarjetas para Anki');
                            notify(`${tarjetas.length} tarjetas listas para Anki`);
                        } catch (fallo) {
                            notify(fallo?.message || 'No se han podido crear las tarjetas.');
                        }
                        setBusy(null);
                    }}
                >
                    <span className="row-icon"><IconShare size={19} /></span>
                    <span className="row-txt">
                        <span>Tarjetas para Anki</span>
                        <span className="row-sub">
                            {busy === 'anki' ? 'Preparando…' : 'Cada palabra con su frase del libro. Ábrelo con AnkiDroid o Anki.'}
                        </span>
                    </span>
                    <IconChevronRight size={18} />
                </button>
            </Group>

            <section className="section" data-setting="storage">
                <h2 className="bs-heading">Almacenamiento</h2>
                <div className="rows">
                    <div className="row">
                        <span className="row-txt"><span>Libros</span></span>
                        <span className="row-val">{formatBytes(usage.books)}</span>
                    </div>
                    <div className="row">
                        <span className="row-txt">
                            <span>Metadata y portadas</span>
                            <span className="row-sub">Base de datos de la biblioteca</span>
                        </span>
                        <span className="row-val">{formatBytes(usage.database)}</span>
                    </div>
                    <div className="row">
                        <span className="row-txt">
                            <span>Caché</span>
                            <span className="row-sub">Ficheros temporales, se puede borrar</span>
                        </span>
                        <span className="row-val">{formatBytes(usage.cache)}</span>
                    </div>
                    <button
                        type="button"
                        className="row"
                        onClick={async () => {
                            const freed = await usage.clearCache();
                            notify(freed ? `${formatBytes(freed)} liberados` : 'No había nada que borrar.');
                        }}
                    >
                        <span className="row-icon"><IconTrash size={19} /></span>
                        <span className="row-txt">
                            <span>Borrar la caché</span>
                            <span className="row-sub">No toca tus libros ni tus anotaciones</span>
                        </span>
                    </button>
                </div>
            </section>

            <p className="option-desc">
                Un backup en JSON trae la metadata pero no los ficheros: los libros que
                no tengas ya en el móvil aparecerán con su progreso, pero habrá que
                importar el EPUB o el PDF para abrirlos.
            </p>
        </>
    );
};

/* ═══════════════════════════════════════════════════════════════════════════
   Privacidad
   ═══════════════════════════════════════════════════════════════════════════ */

const PERMISSIONS = [
    {
        name: 'Internet',
        why: 'Portadas de OpenLibrary, diccionario y sincronización. La app funciona entera sin conexión.',
    },
    {
        name: 'Notificaciones',
        why: 'Recordatorio diario y resumen semanal. Solo se pide al activar esa función.',
    },
    {
        name: 'Servicio en primer plano',
        why: 'Que la lectura en voz alta siga sonando con la pantalla apagada.',
    },
];

const CONNECTIONS = [
    {
        host: 'openlibrary.org',
        what: 'Se envía el título y el autor de un libro, solo al pulsar «Buscar información online» o «Ordenar la biblioteca». En ese segundo caso, uno por cada libro con datos que arreglar.',
    },
    {
        host: 'dictionaryapi.dev',
        what: 'Se envía únicamente la palabra consultada. Ni el libro, ni el contexto, ni identificadores.',
    },
    {
        host: 'Google (modelos de idioma)',
        what: 'Solo al usar por primera vez la traducción, las ayudas de vocabulario o el reconocimiento de un escaneado con un idioma: se descarga su modelo, una vez. Lo que se traduce o reconoce no sale del teléfono.',
    },
    {
        host: 'Google (diagnóstico de ML Kit)',
        what: 'Al traducir, reconocer texto o resumir, las bibliotecas de Google envían datos técnicos: modelo del teléfono, versión de la app, rendimiento y errores. Nunca el texto de tus libros ni tus notas.',
    },
    {
        host: 'Google (IA del teléfono)',
        what: 'Solo si activas los resúmenes con la IA del teléfono: Android descarga su modelo. Lo que se resume no sale del teléfono.',
    },
    {
        host: 'Reconocimiento de voz de Android',
        what: 'Al dictar una nota. Se pide sin conexión; si el idioma no está descargado en el teléfono, el servicio de voz del sistema puede procesarla en sus servidores.',
    },
    {
        host: 'github.com (voces)',
        what: 'Solo al descargar una voz natural sin conexión. No se envía nada tuyo.',
    },
    {
        host: 'Tu ordenador, en tu wifi',
        what: 'Solo si emparejas SharkReader de escritorio: posición, subrayados y notas van de uno a otro por tu red, sin pasar por internet.',
    },
    {
        host: 'Tu servidor WebDAV',
        what: 'Solo si configuras la sincronización. Es tu servidor, no nuestro.',
    },
];

/**
 * Ajustes de la voz neuronal.
 *
 * El coste va arriba y en euros, no escondido en un enlace. Leerse una novela
 * entera con voz neuronal cuesta unos 15 €, y eso decide si la función interesa
 * o no antes de configurar nada.
 */
const NeuralVoiceSettings = ({ notify }) => {
    const ports = usePorts();
    const [config, setConfig] = useState({ enabled: false, endpoint: '', token: '' });
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        ports.storage.getSetting('neuralTts')
            .then((stored) => stored && setConfig((current) => ({ ...current, ...stored })))
            .catch(() => {});
    }, [ports]);

    const save = async (changes) => {
        const next = { ...config, ...changes };
        setConfig(next);
        await ports.storage.setSetting('neuralTts', next);
    };

    const check = async () => {
        setTesting(true);
        try {
            const { createNeuralTts } = await import('../adapters/NeuralTts.js');
            await createNeuralTts(() => config).test(config.endpoint, config.token);
            notify?.('El servidor responde correctamente.');
        } catch (error) {
            notify?.(error?.message || 'No se pudo conectar con el servidor.');
        } finally {
            setTesting(false);
        }
    };

    return (
        <>
            <p className="option-desc">
                Voces mucho mejores que la del sistema, servidas por tu propio
                servidor. Necesita configurarlo tú: no hay uno de SharkReader porque
                la síntesis se paga por carácter, y uno compartido sería pagar la
                lectura de todo el mundo hasta que se agotara.
            </p>

            <p className="warn-note">
                Leerse una novela entera ronda los 15 € de síntesis. El texto de lo
                que se lee sale del dispositivo hacia tu servidor. La voz del sistema
                sigue siendo gratis y funciona sin red.
            </p>

            <Switch
                label="Usar voz neuronal"
                checked={Boolean(config.enabled)}
                onChange={(enabled) => save({ enabled })}
            />

            {config.enabled && (
                <>
                    <label className="field">
                        <span className="field-label">Dirección del servidor</span>
                        <input
                            className="text-input"
                            type="url"
                            inputMode="url"
                            autoCapitalize="none"
                            placeholder="https://mi-servidor.example/speak"
                            value={config.endpoint}
                            onChange={(event) => save({ endpoint: event.target.value })}
                        />
                    </label>

                    <label className="field">
                        <span className="field-label">Token</span>
                        <input
                            className="text-input"
                            type="password"
                            autoCapitalize="none"
                            value={config.token}
                            onChange={(event) => save({ token: event.target.value })}
                        />
                        <span className="option-desc">
                            Sin token, quien dé con la dirección sintetiza a tu costa.
                        </span>
                    </label>

                    <button
                        type="button"
                        className="btn btn-block"
                        onClick={check}
                        disabled={testing || !config.endpoint}
                    >
                        {testing ? 'Probando…' : 'Probar la conexión'}
                    </button>

                    <p className="option-desc">
                        El servidor mínimo está en docs/tts-proxy.md del repositorio:
                        unas cuarenta líneas de Node.
                    </p>
                </>
            )}
        </>
    );
};

export const PrivacyPage = ({ notify, stats }) => {
    const ports = usePorts();
    const [lockStatus, setLockStatus] = useState(null);

    useEffect(() => {
        isLockAvailable().then(setLockStatus).catch(() => {});
    }, []);

    /**
     * Activar el bloqueo exige autenticarse en el momento.
     *
     * Sin esa comprobación se podría activar en un móvil donde la huella no
     * funcione, y el bloqueo dejaría fuera al propio dueño en el siguiente
     * arranque sin forma de desactivarlo.
     */
    const toggleLock = async (enabled) => {
        if (!enabled) { stats.savePreferences({ appLock: false }); return; }
        const result = await authenticate();
        if (result.ok) stats.savePreferences({ appLock: true });
        else if (result.reason === 'error') {
            notify?.('No se pudo verificar tu identidad. El bloqueo sigue desactivado.');
        }
    };

    return (
        <>
            <section className="privacy-hero">
                <b>0</b>
                <span>datos recopilados</span>
                <p className="option-desc">
                    Sin cuentas, sin telemetría, sin publicidad. SharkReader no tiene
                    servidores propios.
                </p>
            </section>

            <section className="section" data-setting="neural-voice">
                <h2 className="bs-heading">Voz neuronal</h2>
                <NeuralVoiceSettings notify={notify} />
            </section>

            <section className="section" data-setting="app-lock">
                <h2 className="bs-heading">Bloquear la aplicación</h2>
                {lockStatus?.available ? (
                    <>
                        <Switch
                            label="Pedir huella, cara o PIN al abrir"
                            checked={Boolean(stats?.preferences?.appLock)}
                            onChange={toggleLock}
                        />
                        <p className="option-desc">
                            Oculta la biblioteca hasta que te identifiques. Se vuelve a
                            pedir si dejas la app en segundo plano más de medio minuto.
                            No cifra los ficheros: impide que alguien con tu móvil en la
                            mano vea qué lees y qué has subrayado.
                        </p>
                    </>
                ) : (
                    <p className="option-desc">
                        {lockStatus?.reason === 'not-enrolled'
                            ? 'Este móvil admite bloqueo, pero no tienes huella ni PIN configurados. Añádelos en los ajustes de Android para poder usarlo.'
                            : 'Este dispositivo no admite bloqueo biométrico.'}
                    </p>
                )}
            </section>

            <section className="section" data-setting="permissions">
                <h2 className="bs-heading">Permisos que pide la app</h2>
                <div className="rows">
                    {PERMISSIONS.map((permission) => (
                        <div className="row" key={permission.name}>
                            <span className="row-txt">
                                <span>{permission.name}</span>
                                <span className="row-sub">{permission.why}</span>
                            </span>
                        </div>
                    ))}
                </div>
                <p className="option-desc">
                    No se piden permisos de almacenamiento: los libros entran por el
                    selector de Android, que solo da acceso a lo que tú elijas.
                </p>
            </section>

            <section className="section" data-setting="connections">
                <h2 className="bs-heading">Las tres únicas conexiones</h2>
                <div className="rows">
                    {CONNECTIONS.map((connection) => (
                        <div className="row" key={connection.host}>
                            <span className="row-txt">
                                <span className="mono">{connection.host}</span>
                                <span className="row-sub">{connection.what}</span>
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            <Group>
                <button
                    type="button"
                    className="row"
                    data-setting="clear-dict"
                    onClick={async () => {
                        await ports.storage.setSetting('dictionary-cache', {});
                        notify('Caché del diccionario borrada.');
                    }}
                >
                    <span className="row-icon"><IconTrash size={19} /></span>
                    <span className="row-txt">
                        <span>Borrar la caché del diccionario</span>
                        <span className="row-sub">Las palabras dejarán de estar disponibles sin conexión</span>
                    </span>
                </button>
            </Group>
        </>
    );
};

/* ═══════════════════════════════════════════════════════════════════════════
   Acerca de
   ═══════════════════════════════════════════════════════════════════════════ */

export const AboutPage = () => {
    const [info, setInfo] = useState(null);
    const [showWorkshop, setShowWorkshop] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            let version = '—';
            let build = '—';
            if (Capacitor.isNativePlatform()) {
                try {
                    const appInfo = await CapApp.getInfo();
                    version = appInfo.version;
                    build = appInfo.build;
                } catch { /* fuera del contenedor nativo */ }
            }
            if (alive) setInfo({ platform: Capacitor.getPlatform(), version, build });
        })();
        return () => { alive = false; };
    }, []);

    return (
        <>
            <Group>
                <div className="row" data-setting="version">
                    <span className="row-txt"><span>Versión</span></span>
                    <span className="row-val">{info?.version ?? '…'} ({info?.build ?? '…'})</span>
                </div>
                <div className="row">
                    <span className="row-txt"><span>Paquete</span></span>
                    <span className="row-val" style={{ fontSize: 'var(--t-micro)' }}>com.sharkreader.mobile</span>
                </div>
                <button type="button" className="row" onClick={() => setShowWorkshop(true)} data-setting="workshop">
                    <span className="row-txt">
                        <span>Workshop</span>
                        <span className="row-sub">{getMobileAddons().length} addons portables</span>
                    </span>
                    <IconChevronRight size={18} />
                </button>
            </Group>

            <Group title="Soporte">
                <div className="row" data-setting="contact">
                    <span className="row-txt">
                        <span>Incidencias</span>
                        <span className="row-sub mono">github.com/XsharklinX/SharkReader</span>
                    </span>
                </div>
                <div className="row">
                    <span className="row-txt">
                        <span>Contacto</span>
                        <span className="row-sub mono">contactosharklin@gmail.com</span>
                    </span>
                </div>
            </Group>

            <p className="option-desc">
                SharkReader Mobile es software libre. El mismo núcleo que la versión de
                escritorio para Windows.
            </p>

            {showWorkshop && (
                <div className="scrim" onClick={() => setShowWorkshop(false)} role="presentation">
                    <section className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Workshop">
                        <span className="grip" aria-hidden="true" />
                        <h2 className="section-title">Workshop</h2>
                        <p className="option-desc">
                            {getMobileAddons().length} addons portables a móvil. Se activan en una
                            versión futura, junto con el resto del Workshop del escritorio.
                        </p>
                        <div className="rows">
                            {getMobileAddons().map((addon) => (
                                <div className="row" key={addon.id} style={{ opacity: 0.55 }}>
                                    <span className="row-txt">
                                        <span>{addon.label}</span>
                                        <span className="row-sub">{addon.desc}</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            )}
        </>
    );
};

/**
 * Añade la traducción a las palabras que no la tienen, **solo con los idiomas
 * ya descargados**: exportar no debe ponerse a bajar modelos por la red sin
 * avisar. Sin modelo, la tarjeta lleva la definición, que ya es útil.
 */
const traducirVocabulario = async (ports, palabras, destino) => {
    const descargados = new Set(await ports.traduccion?.descargados?.().catch(() => []) || []);
    if (!ports.traduccion || !descargados.has(destino)) return palabras;
    const salida = palabras.map((p) => ({ ...p }));
    const porIdioma = {};
    salida.forEach((p) => {
        if (p.traduccion || !p.lang || p.lang === destino || !descargados.has(p.lang)) return;
        (porIdioma[p.lang] = porIdioma[p.lang] || []).push(p);
    });
    for (const [idioma, lista] of Object.entries(porIdioma)) {
        try {
            const traducidas = await ports.traduccion.traducir(idioma, destino, lista.map((p) => p.word));
            lista.forEach((p, i) => { if (traducidas[i] && traducidas[i].toLowerCase() !== p.word) p.traduccion = traducidas[i]; });
        } catch {
            // Sin traducción, la tarjeta sigue valiendo con la definición.
        }
    }
    return salida;
};

export const PAGES = {
    reading: ReadingPage,
    appearance: AppearancePage,
    sync: SyncPage,
    data: DataPage,
    privacy: PrivacyPage,
    about: AboutPage,
};
