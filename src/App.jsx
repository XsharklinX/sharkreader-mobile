import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import TabBar from './ui/TabBar.jsx';
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

// Tres pantallas. Logros vive dentro de Progreso y Workshop dentro de Ajustes.
const SCREENS = {
    library: LibraryScreen,
    progress: ProgressScreen,
    settings: SettingsScreen,
};

export default function App() {
    const [tab, setTab] = useState('library');
    const [readingId, setReadingId] = useState(null);

    const library = useLibrary();
    const stats = useStats(library.books);
    const sync = useSync(library);
    const reading = library.books.find((book) => book.id === readingId) || null;

    useReadingClock(reading, library.updateBook);

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

    // El botón atrás de Android: dentro del lector vuelve a la biblioteca; fuera
    // de la pestaña principal vuelve a ella; en la raíz, sale de la app.
    // Sin esto, atrás siempre cerraría la app, que es la queja número uno en las
    // reseñas de apps web empaquetadas.
    useEffect(() => {
        let listener;
        CapApp.addListener('backButton', () => {
            if (readingId) setReadingId(null);
            else if (tab !== 'library') setTab('library');
            else CapApp.exitApp();
        }).then((handle) => { listener = handle; });

        return () => { listener?.remove(); };
    }, [readingId, tab]);

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

    if (reading) {
        const Reader = reading.type === 'pdf' ? PdfReaderScreen
            : reading.type === 'comic' ? ComicReaderScreen
            : ReaderScreen;
        return (
            <Reader
                key={reading.id}
                book={reading}
                onClose={closeReader}
                onProgress={handleProgress}
                onAnnotationsChange={handleAnnotations}
                onExportAnnotations={handleExportAnnotations}
            />
        );
    }

    const Screen = SCREENS[tab];

    return (
        <div className="app">
            <main className="app-main">
                <Screen
                    library={library}
                    stats={stats}
                    sync={sync}
                    onOpenBook={(book) => setReadingId(book.id)}
                    onGoToSettings={() => setTab('settings')}
                />
            </main>
            <TabBar active={tab} onChange={setTab} />
            <AchievementToast
                achievements={stats.justUnlocked}
                onDismiss={stats.dismissUnlocked}
            />
        </div>
    );
}
