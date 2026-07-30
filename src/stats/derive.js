/**
 * Cálculos derivados de estadísticas de lectura.
 *
 * Todo aquí es puro y determinista: `now` se inyecta siempre para poder probar
 * rachas y calendarios sin depender del día en que se ejecuten los tests.
 *
 * El formato de `stats` es el del escritorio, tal como lo produce
 * `applyReadingMinute` del núcleo compartido:
 *
 *   { timeRead, streak, maxStreak, minutesByDay: { [toDateString]: minutos },
 *     hourlyLog: { [hora]: minutos }, history: { [toDateString]: 'read'|'saved' } }
 */

export const LEVEL_NAMES = [
    'Aprendiz', 'Curioso', 'Lector', 'Devorador', 'Bibliófilo', 'Sabio', 'Leyenda',
];

/** Nombre del nivel, con el último como techo para niveles altos. */
export const levelName = (level) =>
    LEVEL_NAMES[Math.min(Math.max(1, level) - 1, LEVEL_NAMES.length - 1)];

const dayKey = (date) => date.toDateString();

const addDays = (date, amount) => {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
};

const startOfDay = (date) => {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
};

/**
 * Rejilla del heatmap: semanas completas de lunes a domingo, terminando en la
 * semana actual. Devuelve columnas (semanas) de 7 días para que la rejilla se
 * pinte en el mismo orden en que se lee.
 *
 * @param {Object} minutesByDay
 * @param {number} weeks
 * @param {Date} now
 */
export const buildHeatmap = (minutesByDay = {}, weeks = 26, now = new Date()) => {
    const today = startOfDay(now);
    // getDay(): 0 es domingo. Se convierte a semana que empieza en lunes.
    const weekdayFromMonday = (today.getDay() + 6) % 7;
    const endOfWeek = addDays(today, 6 - weekdayFromMonday);
    const start = addDays(endOfWeek, -(weeks * 7 - 1));

    const columns = [];
    for (let week = 0; week < weeks; week++) {
        const days = [];
        for (let day = 0; day < 7; day++) {
            const date = addDays(start, week * 7 + day);
            const minutes = minutesByDay[dayKey(date)] || 0;
            days.push({
                date,
                key: dayKey(date),
                minutes,
                level: heatLevel(minutes),
                future: date > today,
            });
        }
        columns.push(days);
    }
    return columns;
};

/** Cuatro intensidades. Los cortes son minutos de lectura en un día. */
export const heatLevel = (minutes) => {
    if (!minutes) return 0;
    if (minutes < 15) return 1;
    if (minutes < 40) return 2;
    return 3;
};

/**
 * Serie para la gráfica de barras.
 * @param {'week'|'month'|'year'} period
 */
export const buildSeries = (minutesByDay = {}, period = 'week', now = new Date()) => {
    const today = startOfDay(now);

    if (period === 'week') {
        return Array.from({ length: 7 }, (_, index) => {
            const date = addDays(today, index - 6);
            return {
                label: date.toLocaleDateString('es-ES', { weekday: 'narrow' }),
                fullLabel: date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' }),
                minutes: minutesByDay[dayKey(date)] || 0,
            };
        });
    }

    if (period === 'month') {
        // Cuatro semanas, agrupando de siete en siete hacia atrás.
        return Array.from({ length: 4 }, (_, index) => {
            const weekStart = addDays(today, (index - 3) * 7 - 6);
            let minutes = 0;
            for (let day = 0; day < 7; day++) {
                minutes += minutesByDay[dayKey(addDays(weekStart, day))] || 0;
            }
            return {
                label: index === 3 ? 'Esta' : `-${3 - index}`,
                fullLabel: `Semana del ${weekStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`,
                minutes,
            };
        });
    }

    // Año: doce meses hacia atrás, contando desde el mes actual.
    const totals = new Map();
    Object.entries(minutesByDay).forEach(([key, minutes]) => {
        const date = new Date(key);
        if (Number.isNaN(date.getTime())) return;
        const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
        totals.set(monthKey, (totals.get(monthKey) || 0) + minutes);
    });

    return Array.from({ length: 12 }, (_, index) => {
        const date = new Date(today.getFullYear(), today.getMonth() - (11 - index), 1);
        const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
        return {
            label: date.toLocaleDateString('es-ES', { month: 'narrow' }),
            fullLabel: date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
            minutes: totals.get(monthKey) || 0,
        };
    });
};

/** Minutos leídos hoy. */
export const minutesToday = (minutesByDay = {}, now = new Date()) =>
    minutesByDay[dayKey(startOfDay(now))] || 0;

/** Minutos leídos en los últimos siete días, incluido hoy. */
export const minutesThisWeek = (minutesByDay = {}, now = new Date()) => {
    const today = startOfDay(now);
    let total = 0;
    for (let index = 0; index < 7; index++) {
        total += minutesByDay[dayKey(addDays(today, -index))] || 0;
    }
    return total;
};

/** Los libros con más minutos acumulados. */
export const topBooks = (books = [], limit = 5) =>
    books
        .filter((book) => (book.readingMinutes || 0) > 0)
        .sort((a, b) => (b.readingMinutes || 0) - (a.readingMinutes || 0))
        .slice(0, limit);

/** Hora del día en la que más se lee. */
export const peakHour = (hourlyLog = {}) => {
    const entries = Object.entries(hourlyLog);
    if (!entries.length) return null;
    const [hour, minutes] = entries.reduce(
        (best, entry) => (Number(entry[1]) > Number(best[1]) ? entry : best)
    );
    return { hour: Number(hour), minutes: Number(minutes) };
};

/**
 * Ritmo necesario para terminar un libro en la fecha objetivo.
 * @returns {{ pagesPerDay: number, daysLeft: number, feasible: boolean } | null}
 */
export const readingPace = (book, targetDate, now = new Date()) => {
    if (!book || !targetDate) return null;
    const daysLeft = Math.ceil((startOfDay(targetDate) - startOfDay(now)) / 86_400_000);
    if (daysLeft <= 0) return null;

    const remaining = Math.max(0, 1 - (book.progress || 0));
    return {
        daysLeft,
        percentPerDay: remaining / daysLeft,
        feasible: remaining / daysLeft <= 0.25, // más de un 25% al día no es realista
    };
};

/** Resumen de cabecera para la pantalla de progreso. */
export const buildSummary = (stats = {}, books = [], now = new Date()) => {
    const finished = books.filter((book) => book.isFinished).length;
    const reading = books.filter((book) => (book.progress || 0) > 0 && !book.isFinished).length;
    const annotations = books.reduce((sum, book) => sum + (book.bookmarks?.length || 0), 0);

    return {
        streak: stats.streak || 0,
        maxStreak: stats.maxStreak || 0,
        totalMinutes: stats.timeRead || 0,
        today: minutesToday(stats.minutesByDay, now),
        week: minutesThisWeek(stats.minutesByDay, now),
        finished,
        reading,
        annotations,
        libraryCount: books.length,
    };
};

/** Minutos en formato legible: 95 → "1 h 35 min". */
export const formatMinutes = (minutes = 0) => {
    const value = Math.max(0, Math.round(minutes));
    if (value < 60) return `${value} min`;
    const hours = Math.floor(value / 60);
    const rest = value % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
};


/**
 * Minutos que quedarían de un libro al ritmo del propio usuario.
 *
 * Vivía en `ContinueCard`, que ya no lo usa: el medidor de progreso de toda la
 * app es el porcentaje, para que el lector y la biblioteca no den dos respuestas
 * distintas a la misma pregunta.
 *
 * Se conserva para la **ficha del libro**, donde no es un medidor sino un dato
 * más entre el número de páginas y la fecha en que se empezó. Ahí una estimación
 * es lo que se espera; en la barra de lectura, no.
 *
 * Por debajo del 4 % no devuelve nada: la muestra son unos minutos y el
 * resultado saldría de multiplicarla por veinticinco.
 */
export const estimateRemaining = (book) => {
    const minutes = book?.readingMinutes || 0;
    const progress = book?.progress || 0;
    if (minutes < 5 || progress < 0.04) return null;
    const left = Math.round(minutes / progress - minutes);
    return left > 0 ? left : null;
};
