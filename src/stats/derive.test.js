import { describe, it, expect } from 'vitest';
import {
    levelName,
    LEVEL_NAMES,
    buildHeatmap,
    heatLevel,
    buildSeries,
    minutesToday,
    minutesThisWeek,
    topBooks,
    peakHour,
    readingPace,
    buildSummary,
    formatMinutes,
} from './derive.js';

// Miércoles 15 de julio de 2026, mediodía. Fijo para que rachas y calendarios
// no dependan del día en que se ejecuten los tests.
const NOW = new Date(2026, 6, 15, 12, 0, 0);
const key = (offsetDays) => {
    const date = new Date(NOW);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offsetDays);
    return date.toDateString();
};

describe('nombres de nivel', () => {
    it('el nivel 1 es Aprendiz', () => {
        expect(levelName(1)).toBe('Aprendiz');
    });

    it('el nivel 7 es Leyenda', () => {
        expect(levelName(7)).toBe('Leyenda');
    });

    it('por encima del último nivel se mantiene Leyenda', () => {
        expect(levelName(23)).toBe(LEVEL_NAMES.at(-1));
    });

    it('un nivel inválido no rompe', () => {
        expect(levelName(0)).toBe('Aprendiz');
        expect(levelName(-5)).toBe('Aprendiz');
    });
});

describe('heatmap', () => {
    it('devuelve el número de semanas pedido, de siete días cada una', () => {
        const grid = buildHeatmap({}, 26, NOW);
        expect(grid).toHaveLength(26);
        grid.forEach((week) => expect(week).toHaveLength(7));
    });

    it('coloca los minutos en el día correcto', () => {
        const grid = buildHeatmap({ [key(0)]: 45 }, 4, NOW);
        const today = grid.flat().find((day) => day.key === key(0));
        expect(today.minutes).toBe(45);
        expect(today.level).toBe(3);
    });

    it('marca como futuros los días posteriores a hoy', () => {
        const grid = buildHeatmap({}, 4, NOW);
        const days = grid.flat();
        expect(days.find((day) => day.key === key(1)).future).toBe(true);
        expect(days.find((day) => day.key === key(0)).future).toBe(false);
    });

    it('la semana empieza en lunes', () => {
        const grid = buildHeatmap({}, 4, NOW);
        // getDay(): 1 es lunes.
        expect(grid[0][0].date.getDay()).toBe(1);
        expect(grid[0][6].date.getDay()).toBe(0);
    });

    it('las intensidades cubren los cuatro tramos', () => {
        expect(heatLevel(0)).toBe(0);
        expect(heatLevel(5)).toBe(1);
        expect(heatLevel(25)).toBe(2);
        expect(heatLevel(90)).toBe(3);
    });
});

describe('series de la gráfica', () => {
    it('la semana son siete días terminando hoy', () => {
        const series = buildSeries({ [key(0)]: 30, [key(-6)]: 10 }, 'week', NOW);
        expect(series).toHaveLength(7);
        expect(series.at(-1).minutes).toBe(30);
        expect(series[0].minutes).toBe(10);
    });

    it('el mes agrupa en cuatro semanas', () => {
        const series = buildSeries({ [key(0)]: 20, [key(-3)]: 10 }, 'month', NOW);
        expect(series).toHaveLength(4);
        expect(series.at(-1).minutes).toBe(30);
    });

    it('el año son doce meses', () => {
        const series = buildSeries({ [key(0)]: 20 }, 'year', NOW);
        expect(series).toHaveLength(12);
        expect(series.at(-1).minutes).toBe(20);
    });

    it('una biblioteca sin lectura devuelve la serie a cero, no vacía', () => {
        expect(buildSeries({}, 'week', NOW).every((point) => point.minutes === 0)).toBe(true);
    });

    it('ignora claves de fecha corruptas en la serie anual', () => {
        expect(() => buildSeries({ 'no es una fecha': 30 }, 'year', NOW)).not.toThrow();
    });
});

describe('totales', () => {
    it('los minutos de hoy salen del día actual', () => {
        expect(minutesToday({ [key(0)]: 42 }, NOW)).toBe(42);
    });

    it('la semana suma siete días incluyendo hoy', () => {
        const minutes = { [key(0)]: 10, [key(-3)]: 20, [key(-6)]: 5, [key(-7)]: 100 };
        // El día -7 queda fuera de la ventana.
        expect(minutesThisWeek(minutes, NOW)).toBe(35);
    });

    it('sin datos devuelve cero', () => {
        expect(minutesToday({}, NOW)).toBe(0);
        expect(minutesThisWeek({}, NOW)).toBe(0);
    });
});

describe('top de libros', () => {
    const books = [
        { id: '1', readingMinutes: 300 },
        { id: '2', readingMinutes: 50 },
        { id: '3', readingMinutes: 0 },
        { id: '4', readingMinutes: 120 },
    ];

    it('ordena por minutos y excluye los que no se han leído', () => {
        expect(topBooks(books).map((book) => book.id)).toEqual(['1', '4', '2']);
    });

    it('respeta el límite', () => {
        expect(topBooks(books, 2)).toHaveLength(2);
    });
});

describe('hora punta', () => {
    it('devuelve la hora con más minutos', () => {
        expect(peakHour({ 8: 10, 23: 90, 14: 30 })).toEqual({ hour: 23, minutes: 90 });
    });

    it('sin registro devuelve null', () => {
        expect(peakHour({})).toBeNull();
    });
});

describe('ritmo de lectura', () => {
    it('calcula el porcentaje diario necesario', () => {
        const target = new Date(2026, 6, 25);
        const pace = readingPace({ progress: 0.5 }, target, NOW);
        expect(pace.daysLeft).toBe(10);
        expect(pace.percentPerDay).toBeCloseTo(0.05);
        expect(pace.feasible).toBe(true);
    });

    it('marca como poco realista un ritmo excesivo', () => {
        const target = new Date(2026, 6, 17);
        expect(readingPace({ progress: 0 }, target, NOW).feasible).toBe(false);
    });

    it('una fecha ya pasada no devuelve ritmo', () => {
        expect(readingPace({ progress: 0.5 }, new Date(2026, 6, 10), NOW)).toBeNull();
    });
});

describe('resumen', () => {
    it('cuenta leyendo, terminados y anotaciones', () => {
        const books = [
            { progress: 0.5, isFinished: false, bookmarks: [{}, {}] },
            { progress: 1, isFinished: true, bookmarks: [{}] },
            { progress: 0, isFinished: false },
        ];
        const summary = buildSummary({ streak: 7, timeRead: 300 }, books, NOW);

        expect(summary).toMatchObject({
            streak: 7, totalMinutes: 300, finished: 1, reading: 1,
            annotations: 3, libraryCount: 3,
        });
    });

    it('funciona con estadísticas vacías', () => {
        expect(buildSummary({}, [], NOW)).toMatchObject({ streak: 0, totalMinutes: 0 });
    });
});

describe('formato de minutos', () => {
    it('por debajo de una hora usa minutos', () => {
        expect(formatMinutes(45)).toBe('45 min');
    });

    it('a partir de una hora combina horas y minutos', () => {
        expect(formatMinutes(95)).toBe('1 h 35 min');
    });

    it('las horas exactas no muestran minutos', () => {
        expect(formatMinutes(120)).toBe('2 h');
    });

    it('cero y valores negativos no rompen', () => {
        expect(formatMinutes(0)).toBe('0 min');
        expect(formatMinutes(-5)).toBe('0 min');
    });
});
