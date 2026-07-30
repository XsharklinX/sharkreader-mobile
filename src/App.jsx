import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { runBack } from './ui/backStack.js';
import { useBackHandler } from './ui/useBackHandler.js';
import LibraryScreen from './screens/LibraryScreen.jsx';
import ProgressScreen from './screens/ProgressScreen.jsx';
import SettingsScreen from './screens/SettingsScreen.jsx';
import ReaderScreen from './reader/ReaderScreen.jsx';
import PdfReaderScreen from './reader/PdfReaderScreen.jsx';
import ComicReaderScreen from './reader/ComicReaderScreen.jsx';
import AchievementToast from './ui/AchievementToast.jsx';
import { useLibrary } from './library/useLibrary.js';
import { useReadingClock } from './library/useReadingClock.js';
import { useStats } from './stats/useStats.js';
import { useSync } from './library/useSync.js';
import { exportAnnotations } from './library/backup.js';
import { publishShortcuts, publishWidget, bookIdFromUrl, isImportUrl } from './adapters/Shortcuts.js';
import { readDynamicColors, applyDynamicColors, clearDynamicColors } from './adapters/SystemTheme.js';
import AppLock from './ui/AppLock.jsx';
import { useLayout } from './ui/useLayout.js';
import { SIDE_PANEL_WIDTH } from './ui/layout.js';

// Tres pantallas. Logros vive dentro de Progreso y Workshop dentro de Ajustes.
const SCREENS = {
    library: LibraryScreen,
    progress: ProgressScreen,
    settings: SettingsScreen,
};

export default function App() {
    const [tab, setTab] = useState('library');
    // Qué pestaña abrir dentro de Progreso. El menú lleva directo a estadísticas
    // o a logros, en lugar de entrar y volver a elegir dentro.
    const [subTab, setSubTab] = useState(null);
    const [readingId, setReadingId] = useState(null);

    const layout = useLayout();
    const library = useLibrary();
    const stats = useStats(library.books);
    const sync = useSync(library);
    const reading = library.books.find((book) => book.id === readingId) || null;

    useReadingClock(reading, library.updateBook);

    // El tema de la interfaz se aplica al cargar las preferencias, no solo al
    // entrar en Ajustes: si no, la app arrancaba siempre en oscuro aunque el
    // usuario hubiera elegido claro.
    useEffect(() => {
        const light = stats.preferences.appTheme === 'light';
        document.documentElement.classList.toggle('theme-light', light);

        /**
         * La barra de estado del sistema también cambia.
         *
         * Se quedaba fija en el estilo oscuro que declara `capacitor.config.json`,
         * así que en tema claro la hora y los iconos del sistema salían en blanco
         * sobre fondo casi blanco: ilegibles en todas las pantallas de la app.
         *
         * `Style.Light` significa «contenido claro», o sea iconos oscuros para un
         * fondo claro — la nomenclatura del plugin va al revés de lo que parece.
         */
        StatusBar.setStyle({ style: light ? Style.Light : Style.Dark }).catch(() => {});
    }, [stats.preferences.appTheme]);

    // Material You: la interfaz sigue el fondo de pantalla. Viene apagado — el
    // azul es la identidad de la app y cambiarlo sin permiso no procede.
    //
    // Nunca toca el lector: los temas de lectura están elegidos por contraste y
    // fatiga visual, y teñir la página del libro con el fondo de pantalla sería
    // empeorar la lectura para decorar.
    useEffect(() => {
        const dark = stats.preferences.appTheme !== 'light';
        if (!stats.preferences.materialYou) { clearDynamicColors(); return undefined; }

        let alive = true;
        readDynamicColors().then(({ available, colors }) => {
            if (alive) applyDynamicColors(available ? colors : null, dark);
        });
        return () => { alive = false; };
    }, [stats.preferences.materialYou, stats.preferences.appTheme]);

    const closeReader = useCallback(() => {
        setReadingId(null);
        // El reloj de lectura escribe las estadísticas directamente en la base de
        // datos, así que al salir del lector hay que releerlas para que el
        // progreso y los logros reflejen la sesión que acaba de terminar.
        stats.refresh();
    }, [stats]);

    // «Abrir con SharkReader» desde otra app. Se comprueba al arrancar y cada
    // vez que la app vuelve al primer plano, porque un segundo intent llega a
    // una actividad que ya existe y no reinicia nada.
    const openExternalRef = useRef(library.openExternal);
    openExternalRef.current = library.openExternal;

    useEffect(() => {
        if (library.status !== 'ready') return undefined;

        let listener;
        const claim = async () => {
            const id = await openExternalRef.current().catch(() => null);
            if (id) setReadingId(id);
        };

        claim();
        CapApp.addListener('appStateChange', ({ isActive }) => {
            if (isActive) claim();
        }).then((handle) => { listener = handle; });

        return () => { listener?.remove(); };
    }, [library.status]);

    // Accesos directos del icono y widget de continuar leyendo.
    //
    // Se recalculan al cambiar el orden de lectura reciente, no en cada página:
    // reescribir SharedPreferences y redibujar el widget en cada cambio de
    // página sería trabajo constante para mover una barra un píxel.
    const recentKey = library.books
        .map((book) => `${book.id}:${book.lastReadDate || 0}`)
        .sort()
        .join('|');

    useEffect(() => {
        if (library.status !== 'ready') return;
        publishShortcuts(library.books);
        publishWidget(library.books);
        // `recentKey` es la dependencia real: cambia solo cuando cambia el orden
        // de lectura, no en cada render de la biblioteca.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [library.status, recentKey]);

    // Abrir el libro que pide un acceso directo o el widget.
    useEffect(() => {
        if (library.status !== 'ready') return undefined;

        let listener;
        const openFromUrl = (url) => {
            if (isImportUrl(url)) { setTab('library'); return; }
            const id = bookIdFromUrl(url);
            // El libro puede haberse borrado desde que se creó el acceso
            // directo: abrir uno inexistente sería peor que no hacer nada.
            if (id && library.books.some((book) => book.id === id)) setReadingId(id);
        };

        CapApp.getLaunchUrl().then((result) => {
            if (result?.url) openFromUrl(result.url);
        }).catch(() => {});

        CapApp.addListener('appUrlOpen', ({ url }) => openFromUrl(url))
            .then((handle) => { listener = handle; });

        return () => { listener?.remove(); };
    }, [library.status, library.books]);

    // El botón atrás de Android. Este es el **único** oyente de la app: lo que
    // decide qué se cierra es la pila de `backStack`, empezando por la capa más
    // reciente. Antes cada pantalla registraba el suyo y Capacitor los llamaba
    // todos, así que atrás con el índice abierto cerraba el índice y además
    // salía del libro — parecía que se saltaba un nivel.
    useEffect(() => {
        let listener;
        CapApp.addListener('backButton', () => {
            // Alguna capa abierta lo ha atendido: no se toca la navegación.
            if (runBack()) return;
            if (tab !== 'library') setTab('library');
            else CapApp.exitApp();
        }).then((handle) => { listener = handle; });

        return () => { listener?.remove(); };
    }, [tab]);

    // Salir del libro es el último recurso dentro del lector: solo se ejecuta
    // si ninguna hoja, panel o selección tenía nada que cerrar.
    useBackHandler(() => {
        if (!readingId) return false;
        setReadingId(null);
        return true;
    }, Boolean(readingId));

    /** Navegación desde el menú de la cabecera. */
    const navigate = useCallback((target) => {
        if (target === 'achievements') {
            setSubTab('achievements');
            setTab('progress');
            return;
        }
        setSubTab(null);
        setTab(target === 'progress' ? 'progress' : target);
    }, []);

    /** Guarda posición, progreso y preferencias del libro que se está leyendo. */
    const handleProgress = useCallback((update) => {
        if (!reading) return;
        const changes = {};
        if (update.cfi !== undefined) changes.lastLocation = update.cfi;
        if (update.progress !== undefined) {
            changes.progress = update.progress;
            changes.progressUpdatedAt = Date.now();
            if (!reading.dateStarted) changes.dateStarted = Date.now();
            if (update.progress >= 0.995 && !reading.isFinished) {
                changes.isFinished = true;
                changes.dateFinished = Date.now();
            }
        }
        if (update.pdfScale !== undefined) changes.pdfScale = update.pdfScale;
        if (update.readerPreferences !== undefined) changes.readerPreferences = update.readerPreferences;
        changes.lastReadDate = Date.now();

        library.updateBook(reading.id, changes);
    }, [reading, library]);

    const handleAnnotations = useCallback((bookmarks) => {
        if (!reading) return;
        // `annotationsUpdatedAt` es lo que mira el merge de backups para decidir
        // qué copia de las anotaciones gana al sincronizar entre dispositivos.
        library.updateBook(reading.id, { bookmarks, annotationsUpdatedAt: Date.now() });
    }, [reading, library]);

    const handleExportAnnotations = useCallback(async (target) => {
        try {
            await exportAnnotations(library.books, target?.id);
        } catch (exportError) {
            library.setError?.(exportError?.message || 'No se pudieron exportar las anotaciones.');
        }
    }, [library]);

    // El bloqueo envuelve todo, también el lector: si no, un acceso directo
    // abriría el libro directamente y saltaría la pantalla de bloqueo entera.
    const lock = (content) => (
        <AppLock enabled={Boolean(stats.preferences.appLock)}>{content}</AppLock>
    );

    const Reader = !reading ? null
        : reading.type === 'pdf' ? PdfReaderScreen
        : reading.type === 'comic' ? ComicReaderScreen
        : ReaderScreen;

    const readerPane = reading ? (
        <Reader
            key={reading.id}
            book={reading}
            onClose={closeReader}
            onProgress={handleProgress}
            onAnnotationsChange={handleAnnotations}
            onExportAnnotations={handleExportAnnotations}
            preferences={stats.preferences}
            onPreferencesChange={stats.savePreferences}
        />
    ) : null;

    const Screen = SCREENS[tab];

    /**
     * Sin barra de pestañas.
     *
     * Tenía Biblioteca, Progreso y Ajustes, y ocupaba una franja permanente en la
     * pantalla más importante. Pero las tres no son hermanas: **la biblioteca es
     * la aplicación** y las otras dos son sitios a los que se va de vez en cuando.
     * Una barra de pestañas dice «estos tres destinos valen lo mismo», y no lo
     * valen. Ahora la rejilla de portadas gana esa franja y el resto vive en el
     * menú de la cabecera.
     */
    const appPane = (
        <div className="app no-tabbar">
            <main className="app-main">
                <Screen
                    library={library}
                    stats={stats}
                    sync={sync}
                    layout={layout}
                    initialTab={subTab}
                    onOpenBook={(book) => setReadingId(book.id)}
                    onGoToSettings={() => setTab('settings')}
                    onNavigate={navigate}
                    onBack={() => setTab('library')}
                />
            </main>
            <AchievementToast
                achievements={stats.justUnlocked}
                onDismiss={stats.dismissUnlocked}
            />
        </div>
    );

    // ── Dos paneles en tablet y plegable abierto ─────────────────────────────
    //
    // El libro no sustituye a la biblioteca, se pone al lado. En una pantalla
    // ancha, ocultar una lista de 360 px para enseñar un texto que ya sobra de
    // ancho es desperdiciar la pantalla y además perder el sitio donde estabas.
    //
    // El lector conserva su `key`, así que al cambiar de libro se remonta igual
    // que en móvil: no hereda la posición ni los ajustes del anterior.
    if (layout.twoPanes && reading) {
        return lock(
            <div className="two-pane">
                <aside className="pane-side" style={{ width: SIDE_PANEL_WIDTH }}>
                    {appPane}
                </aside>
                <section className="pane-main">{readerPane}</section>
            </div>
        );
    }

    if (reading) return lock(readerPane);

    return lock(appPane);
}
