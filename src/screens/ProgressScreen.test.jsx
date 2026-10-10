/**
 * @vitest-environment jsdom
 *
 * Progreso, montado de verdad.
 *
 * **Por qué existe.** Esta pantalla no tiene lógica propia: lo suyo es pintar lo
 * que le dan. Por eso es la que más fácilmente revienta con datos que en la
 * práctica ocurren y en las pruebas de `derive.js` nunca aparecen — una
 * biblioteca recién instalada sin un solo minuto leído, o el registro por horas
 * que todavía no existe.
 *
 * Las dos cosas que tienen que ser ciertas siempre: **abre sin datos** y **las
 * dos pestañas se pintan**.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import ProgressScreen from './ProgressScreen.jsx';
import { installPorts, resetPorts } from '../ports/index.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const HOY = new Date().toISOString().slice(0, 10);

let host;
let root;
let statsApi;
let library;

const vacio = {
    timeRead: 0,
    minutesByDay: {},
    hourlyLog: {},
    streak: 0,
    booksFinished: 0,
};

beforeEach(() => {
    library = { books: [] };
    statsApi = {
        stats: { ...vacio },
        goals: { daily: 20, weekly: 140 },
        level: { level: 1, xp: 0, name: 'Grumete', next: 100 },
        achievements: [],
        preferences: {},
        savePreferences: vi.fn(),
    };

    installPorts({ storage: { getSetting: async () => null, setSetting: async () => {} } });

    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    resetPorts();
});

const mount = async (props = {}) => {
    await act(async () => {
        root.render(
            <ProgressScreen
                library={library}
                stats={statsApi}
                onGoToSettings={() => {}}
                onBack={() => {}}
                {...props}
            />
        );
    });
    await act(async () => { await Promise.resolve(); });
};

describe('progreso se abre siempre', () => {
    it('sin un solo minuto leído no se rompe', async () => {
        await mount();
        expect(host.querySelector('.head-title')?.textContent).toBe('Progreso');
        expect(host.textContent).toMatch(/Aún sin datos/);
    });

    it('con datos enseña el total en la cabecera', async () => {
        statsApi.stats = {
            ...vacio,
            timeRead: 90 * 60,
            minutesByDay: { [HOY]: 90 },
            hourlyLog: { 21: 90 },
        };
        await mount();

        expect(host.querySelector('.head-sub')?.textContent).toMatch(/lectura en total/);
    });

    it('se puede volver a la biblioteca', async () => {
        const onBack = vi.fn();
        await mount({ onBack });

        await act(async () => {
            host.querySelector('[aria-label="Volver a la biblioteca"]').click();
        });

        expect(onBack).toHaveBeenCalled();
    });
});

describe('las dos pestañas', () => {
    it('cambiar a logros pinta algo distinto', async () => {
        await mount();

        const [estadisticas, logros] = [...host.querySelectorAll('.segmented button')];
        expect(logros).toBeTruthy();

        const antes = host.textContent;
        await act(async () => { logros.click(); });

        expect(logros.className).toContain('on');
        expect(host.textContent).not.toBe(antes);

        await act(async () => { estadisticas.click(); });
        expect(estadisticas.className).toContain('on');
    });

    it('se puede entrar directo a logros desde el menú', async () => {
        // El menú lleva a logros sin pasar por estadísticas: aterrizar en la
        // pestaña equivocada y tener que cambiar es un paso de más cada vez.
        await mount({ initialTab: 'achievements' });

        const [, logros] = [...host.querySelectorAll('.segmented button')];
        expect(logros.className).toContain('on');
    });
});
