/**
 * @vitest-environment jsdom
 *
 * Ajustes, montado de verdad.
 *
 * **Por qué existe.** Ajustes son seis subpantallas con más de cuarenta
 * controles, y cada una lee su trozo de `preferences`, `stats` y `sync`. Basta
 * con que una lea algo que ya no existe —un campo renombrado, una lista que
 * ahora llega vacía— para que esa categoría reviente al abrirla. Ninguna prueba
 * de módulo se entera: `catalog.js` tiene las suyas y describen la lista de
 * opciones, no las pantallas que la pintan.
 *
 * Lo que se comprueba es lo mínimo que tiene que ser cierto siempre: **las seis
 * categorías abren y se puede volver**. Es un humo bien puesto, no un examen de
 * cada control.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import SettingsScreen from './SettingsScreen.jsx';
import { CATEGORIES } from '../settings/catalog.js';
import { DEFAULT_PREFERENCES } from '../stats/useStats.js';
import { DEFAULT_SYNC } from '../library/useSync.js';
import { installPorts, resetPorts } from '../ports/index.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host;
let root;
let library;
let stats;
let sync;

beforeEach(() => {
    library = {
        books: [],
        status: 'ready',
        error: null,
        importFiles: vi.fn(),
        importFolder: vi.fn(),
        updateBook: vi.fn(async () => {}),
        removeBook: vi.fn(async () => {}),
        exportNotes: vi.fn(),
        clearError: vi.fn(),
        reload: vi.fn(async () => {}),
    };

    stats = {
        stats: { timeRead: 0, minutesByDay: {}, streak: 0 },
        achievements: [],
        goals: { daily: 20, weekly: 140 },
        preferences: { ...DEFAULT_PREFERENCES },
        level: { level: 1, xp: 0, name: 'Grumete', next: 100 },
        loaded: true,
        justUnlocked: [],
        dismissUnlocked: vi.fn(),
        saveGoals: vi.fn(async () => {}),
        savePreferences: vi.fn(async () => ({})),
        refresh: vi.fn(async () => {}),
    };

    // La forma real de `useSync`, no una inventada: si el doble no lleva
    // `config`, la pantalla de Sincronización revienta al leer `config.url` y la
    // prueba estaría comprobando su propio error.
    sync = {
        config: { ...DEFAULT_SYNC },
        state: 'idle',
        message: null,
        lastAt: null,
        configured: false,
        saveConfig: vi.fn(async () => {}),
        test: vi.fn(async () => ({ ok: true })),
        sync: vi.fn(async () => {}),
        clearMessage: vi.fn(),
    };

    installPorts({
        storage: {
            init: async () => {},
            getSetting: async () => null,
            setSetting: async () => {},
            indexedBooks: async () => ({}),
            usage: async () => ({ books: 0, bytes: 0 }),
            countHighlights: async () => 0,
        },
        notifier: {
            requestPermission: async () => true,
            cancelAll: async () => {},
            scheduleDailyReminder: async () => {},
            scheduleWeeklySummary: async () => {},
        },
        filePicker: {},
        sync: {},
        tts: { listVoices: async () => [], isSupported: async () => false },
        awake: { set: async () => {}, isOn: async () => false },
    });

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
            <SettingsScreen library={library} stats={stats} sync={sync} onBack={() => {}} {...props} />
        );
    });
    await act(async () => { await Promise.resolve(); });
};

/** La fila de una categoría, por el texto de su etiqueta. */
const fila = (label) =>
    [...host.querySelectorAll('button.row')]
        .find((el) => el.textContent.includes(label));

describe('ajustes abre sus categorías', () => {
    it('la raíz lista las seis', async () => {
        await mount();
        for (const categoria of CATEGORIES) {
            expect(fila(categoria.label), `falta la fila «${categoria.label}»`).toBeTruthy();
        }
    });

    it.each(CATEGORIES.map((c) => [c.label, c.id]))(
        '«%s» abre sin romperse y se puede volver',
        async (label) => {
            await mount();

            await act(async () => { fila(label).click(); });

            // El título de la subpantalla es el de la categoría: si la página
            // hubiera reventado, React no habría pintado nada de esto.
            expect(host.querySelector('.head-title')?.textContent).toBe(label);
            // Y tiene contenido propio, no una pantalla con solo la cabecera.
            expect(host.querySelectorAll('.head ~ *').length).toBeGreaterThan(0);

            const volver = host.querySelector('[aria-label="Volver a ajustes"]');
            expect(volver).toBeTruthy();
            await act(async () => { volver.click(); });

            expect(host.querySelector('.head-title')?.textContent).toBe('Ajustes');
        }
    );
});

describe('la búsqueda de ajustes', () => {
    it('lleva a la opción, no solo a la categoría', async () => {
        // Buscar «wifi» y aterrizar en una pantalla de diez filas sin saber cuál
        // era es lo mismo que no buscar. El resultado abre su categoría y marca
        // la fila con `data-setting`.
        await mount();

        const campo = host.querySelector('.search input');
        expect(campo).toBeTruthy();

        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            ).set;
            setter.call(campo, 'tema');
            campo.dispatchEvent(new Event('input', { bubbles: true }));
        });

        const resultado = [...host.querySelectorAll('button.row')]
            .find((el) => /tema/i.test(el.textContent));
        expect(resultado, 'la búsqueda no encuentra «tema»').toBeTruthy();

        await act(async () => { resultado.click(); });

        expect(host.querySelector('.head-title')?.textContent).toBeTruthy();
        expect(host.querySelector('[data-setting]')).toBeTruthy();
    });
});

describe('el perfil', () => {
    it('la tarjeta abre la hoja de perfil', async () => {
        await mount();

        const tarjeta = host.querySelector('.profile-card');
        expect(tarjeta).toBeTruthy();

        await act(async () => { tarjeta.click(); });

        expect(document.querySelector('.sheet')).toBeTruthy();
    });
});
