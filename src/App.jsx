import React, { useCallback, useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import TabBar from './ui/TabBar.jsx';
import LibraryScreen from './screens/LibraryScreen.jsx';
import ProgressScreen from './screens/ProgressScreen.jsx';
import AchievementsScreen from './screens/AchievementsScreen.jsx';
import WorkshopScreen from './screens/WorkshopScreen.jsx';
import SettingsScreen from './screens/SettingsScreen.jsx';
import ReaderScreen from './reader/ReaderScreen.jsx';
import PdfReaderScreen from './reader/PdfReaderScreen.jsx';
import { useLibrary } from './library/useLibrary.js';
import { useReadingClock } from './library/useReadingClock.js';
import { exportAnnotations } from './library/backup.js';

const SCREENS = {
    library: LibraryScreen,
    progress: ProgressScreen,
    achievements: AchievementsScreen,
    workshop: WorkshopScreen,
    settings: SettingsScreen,
};

export default function App() {
    const [tab, setTab] = useState('library');
    const [readingId, setReadingId] = useState(null);

    const library = useLibrary();
    const reading = library.books.find((book) => book.id === readingId) || null;

    useReadingClock(reading, library.updateBook);

    const closeReader = useCallback(() => setReadingId(null), []);

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
        const Reader = reading.type === 'pdf' ? PdfReaderScreen : ReaderScreen;
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
                <Screen library={library} onOpenBook={(book) => setReadingId(book.id)} />
            </main>
            <TabBar active={tab} onChange={setTab} />
        </div>
    );
}
