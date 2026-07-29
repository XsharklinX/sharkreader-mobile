import { useCallback, useEffect, useMemo, useState } from 'react';
import { readerXp, readerLevelFromXp } from '../core/readingProgress.js';
import { checkNewAchievements } from '../core/achievements.js';
import { usePorts } from '../ports/index.js';
import { levelName } from './derive.js';

const STATS_KEY = 'stats';
const ACHIEVEMENTS_KEY = 'achievements';
const GOALS_KEY = 'goals';
const PREFS_KEY = 'preferences';

export const DEFAULT_GOALS = { daily: 20, weekly: 120, monthly: 600 };

// Sharky y los recordatorios llegan apagados: una app de lectura no debería
// empezar hablando ni pidiendo permiso de notificaciones.
export const DEFAULT_PREFERENCES = { sharky: false, reminders: false, reminderHour: 21 };

/**
 * Estadísticas, nivel y logros.
 *
 * Casi todo el trabajo lo hace el núcleo compartido: `readerXp` y
 * `readerLevelFromXp` calculan el nivel con la misma fórmula que el escritorio,
 * y `checkNewAchievements` evalúa las 59 condiciones sin cambios. Aquí solo se
 * carga, se guarda y se detecta qué es nuevo para poder celebrarlo.
 */
export const useStats = (books) => {
    const ports = usePorts();
    const [stats, setStats] = useState({});
    const [achievements, setAchievements] = useState({});
    const [goals, setGoals] = useState(DEFAULT_GOALS);
    const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
    const [loaded, setLoaded] = useState(false);
    const [justUnlocked, setJustUnlocked] = useState([]);

    useEffect(() => {
        let alive = true;
        const load = async () => {
            try {
                const [storedStats, storedAchievements, storedGoals, storedPrefs] = await Promise.all([
                    ports.storage.getSetting(STATS_KEY),
                    ports.storage.getSetting(ACHIEVEMENTS_KEY),
                    ports.storage.getSetting(GOALS_KEY),
                    ports.storage.getSetting(PREFS_KEY),
                ]);
                if (!alive) return;
                setStats(storedStats || {});
                setAchievements(storedAchievements || {});
                setGoals({ ...DEFAULT_GOALS, ...(storedGoals || {}) });
                setPreferences({ ...DEFAULT_PREFERENCES, ...(storedPrefs || {}) });
            } finally {
                if (alive) setLoaded(true);
            }
        };
        load();
        return () => { alive = false; };
    }, [ports]);

    const level = useMemo(() => {
        const xp = readerXp({
            minutesRead: stats.timeRead || 0,
            booksFinished: books.filter((book) => book.isFinished).length,
            bookmarks: books.reduce((sum, book) => sum + (book.bookmarks?.length || 0), 0),
            notedBooks: books.reduce((sum, book) => sum + (book.notes ? 1 : 0), 0),
        });
        const computed = readerLevelFromXp(xp);
        return { ...computed, name: levelName(computed.level) };
    }, [stats.timeRead, books]);

    /**
     * Reevalúa los logros cuando cambian la biblioteca o las estadísticas.
     *
     * Se hace aquí y no en el momento de leer porque las condiciones dependen de
     * cosas muy distintas (número de libros, rachas, subrayados) y evaluarlas
     * todas en un solo sitio evita que un logro se quede sin desbloquear porque
     * nadie miró después del evento que lo cumplía.
     */
    useEffect(() => {
        if (!loaded) return;
        const unlocked = checkNewAchievements({ books, stats }, achievements);
        if (!unlocked.length) return;

        const now = Date.now();
        const next = { ...achievements };
        unlocked.forEach((achievement) => { next[achievement.id] = { unlockedAt: now }; });

        setAchievements(next);
        setJustUnlocked(unlocked);
        ports.storage.setSetting(ACHIEVEMENTS_KEY, next).catch(() => {});
    }, [loaded, books, stats, achievements, ports]);

    const saveGoals = useCallback(async (next) => {
        const merged = { ...goals, ...next };
        setGoals(merged);
        await ports.storage.setSetting(GOALS_KEY, merged);
    }, [goals, ports]);

    /** Relee las estadísticas: el reloj de lectura las escribe por su cuenta. */
    const refresh = useCallback(async () => {
        const stored = await ports.storage.getSetting(STATS_KEY);
        setStats(stored || {});
    }, [ports]);

    /**
     * Guarda preferencias y aplica el efecto que tenga cada una. Los
     * recordatorios se programan o se cancelan aquí mismo: si el usuario apaga
     * el interruptor y la notificación sigue llegando mañana, la app queda como
     * poco fiable.
     */
    const savePreferences = useCallback(async (next) => {
        const merged = { ...preferences, ...next };
        setPreferences(merged);
        await ports.storage.setSetting(PREFS_KEY, merged);

        if (next.reminders !== undefined || next.reminderHour !== undefined) {
            if (merged.reminders) {
                const granted = await ports.notifier.requestPermission();
                if (!granted) {
                    const denied = { ...merged, reminders: false };
                    setPreferences(denied);
                    await ports.storage.setSetting(PREFS_KEY, denied);
                    return { permissionDenied: true };
                }
                await ports.notifier.scheduleDailyReminder(merged.reminderHour);
                await ports.notifier.scheduleWeeklySummary();
            } else {
                await ports.notifier.cancelAll();
            }
        }
        return {};
    }, [preferences, ports]);

    return {
        stats,
        achievements,
        goals,
        preferences,
        level,
        loaded,
        justUnlocked,
        dismissUnlocked: () => setJustUnlocked([]),
        saveGoals,
        savePreferences,
        refresh,
    };
};
