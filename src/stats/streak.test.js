import { describe, it, expect } from 'vitest';
import {
    estadoDeHoy, diasRecientes, estadoSalvadores, enPeligro, resumenRacha,
    MINUTOS_PARA_ENCENDER, MAX_SALVADORES,
} from './streak.js';

const AHORA = new Date('2026-07-30T21:00:00');
const hoy = AHORA.toDateString();
const diaAntes = (n) => {
    const d = new Date(AHORA);
    d.setDate(d.getDate() - n);
    return d.toDateString();
};

describe('estadoDeHoy', () => {
    it('sin leer nada, faltan los cinco minutos', () => {
        const estado = estadoDeHoy({}, AHORA);
        expect(estado.encendida).toBe(false);
        expect(estado.faltan).toBe(MINUTOS_PARA_ENCENDER);
        expect(estado.progreso).toBe(0);
    });

    it('a mitad de camino dice cuántos faltan', () => {
        const estado = estadoDeHoy({ lastActiveDate: hoy, currentDailyMins: 2 }, AHORA);
        expect(estado.faltan).toBe(3);
        expect(estado.progreso).toBeCloseTo(0.4);
    });

    it('los minutos de otro día no cuentan como de hoy', () => {
        // Aquí está el fallo que esto evita: `currentDailyMins` guarda lo del
        // último día activo, así que sin comprobar la fecha la pantalla diría
        // «llevas 4 de 5» una semana después de la última lectura.
        const estado = estadoDeHoy(
            { lastActiveDate: diaAntes(7), currentDailyMins: 4 },
            AHORA
        );
        expect(estado.minutos).toBe(0);
        expect(estado.faltan).toBe(MINUTOS_PARA_ENCENDER);
    });

    it('encendida se queda llena aunque se siga leyendo', () => {
        const estado = estadoDeHoy(
            { lastActiveDate: hoy, currentDailyMins: 90, history: { [hoy]: 'read' } },
            AHORA
        );
        expect(estado.encendida).toBe(true);
        expect(estado.faltan).toBe(0);
        expect(estado.progreso).toBe(1);
    });
});

describe('diasRecientes', () => {
    const stats = {
        history: { [hoy]: 'read', [diaAntes(1)]: 'saved', [diaAntes(2)]: 'read' },
        minutesByDay: { [hoy]: 42 },
    };

    it('devuelve los días en orden, acabando en hoy', () => {
        const dias = diasRecientes(stats, 5, AHORA);
        expect(dias).toHaveLength(5);
        expect(dias[4].hoy).toBe(true);
        expect(dias[0].hoy).toBe(false);
    });

    it('distingue leído, salvado y vacío', () => {
        const dias = diasRecientes(stats, 5, AHORA);
        expect(dias[4].estado).toBe('leido');
        expect(dias[3].estado).toBe('salvado');
        expect(dias[2].estado).toBe('leido');
        expect(dias[1].estado).toBe('vacio');
    });

    it('la semana empieza en lunes', () => {
        // 30 de julio de 2026 es jueves: cuarto día de la semana, índice 3.
        const dias = diasRecientes(stats, 1, AHORA);
        expect(dias[0].diaSemana).toBe(3);
    });

    it('lleva los minutos de cada día', () => {
        const dias = diasRecientes(stats, 2, AHORA);
        expect(dias[1].minutos).toBe(42);
        expect(dias[0].minutos).toBe(0);
    });
});

describe('estadoSalvadores', () => {
    it('con racha de 3 faltan dos días para el siguiente', () => {
        expect(estadoSalvadores({ streak: 3, streakSavers: 0 }).diasParaElSiguiente).toBe(2);
    });

    it('con el máximo no promete otro', () => {
        // Prometer un premio que no se va a entregar es peor que no prometer nada.
        const estado = estadoSalvadores({ streak: 12, streakSavers: MAX_SALVADORES });
        expect(estado.lleno).toBe(true);
        expect(estado.diasParaElSiguiente).toBeNull();
    });

    it('nunca enseña más de los que caben', () => {
        expect(estadoSalvadores({ streakSavers: 9 }).tiene).toBe(MAX_SALVADORES);
    });

    it('justo al ganar uno, el siguiente está a cinco días', () => {
        expect(estadoSalvadores({ streak: 5, streakSavers: 1 }).diasParaElSiguiente).toBe(5);
    });
});

describe('enPeligro', () => {
    it('con racha, sin leer hoy y sin salvadores', () => {
        expect(enPeligro({ streak: 6, streakSavers: 0 }, AHORA)).toBe(true);
    });

    it('con salvadores no hay peligro: para eso están', () => {
        expect(enPeligro({ streak: 6, streakSavers: 1 }, AHORA)).toBe(false);
    });

    it('si hoy ya cuenta, no hay peligro', () => {
        expect(enPeligro({ streak: 6, history: { [hoy]: 'read' } }, AHORA)).toBe(false);
    });

    it('sin racha no hay nada que perder', () => {
        expect(enPeligro({ streak: 0, streakSavers: 0 }, AHORA)).toBe(false);
    });
});

describe('resumenRacha', () => {
    it('la mejor racha nunca es menor que la actual', () => {
        // Pasa en una biblioteca restaurada de un respaldo antiguo, donde
        // `maxStreak` puede venir sin actualizar.
        const resumen = resumenRacha({ streak: 9, maxStreak: 3 }, AHORA);
        expect(resumen.mejor).toBe(9);
    });
});
