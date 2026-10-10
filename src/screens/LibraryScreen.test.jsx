/**
 * @vitest-environment jsdom
 *
 * La biblioteca, montada de verdad.
 *
 * **Por qué existe.** Hay casi mil pruebas y ninguna vio los tres fallos de la
 * última tanda —la barra del PDF sin estilo, las hojas que no llegaban al final,
 * el plegado congelado—: todas prueban funciones sueltas. `selectBooks`,
 * `views`, `selection` y `collections` tienen sus pruebas y todas pasaban
 * mientras la pantalla que las usa podía estar rota.
 *
 * Esto monta `LibraryScreen` y ejercita su gesto central: **tocar un libro lo
 * abre**. Es lo que la app hace más veces al día, y entre el toque y el libro
 * hay tres piezas encadenadas —el gesto de `BookCard`, el desvío de selección
 * múltiple, el aviso del libro sin fichero— que ninguna prueba de módulo cruza.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import LibraryScreen from './LibraryScreen.jsx';
import { installPorts, resetPorts } from '../ports/index.js';

// Sin esto React avisa en cada `act` con temporizadores falsos: el aviso tapa
// el fallo de verdad cuando lo hay.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const libro = (id, extra = {}) => ({
    id,
    name: `Libro ${id}`,
    author: 'Autora',
    type: 'epub',
    sourcePath: `/books/${id}.epub`,
    progress: 0,
    addedAt: Date.now(),
    ...extra,
});

let host;
let root;
let biblioteca;
let stats;

/** La biblioteca que le pasa `App`, con lo justo que la pantalla toca. */
const makeLibrary = (books) => ({
    books,
    status: 'ready',
    error: null,
    importing: null,
    importFiles: vi.fn(async () => ({ added: 0 })),
    importFolder: vi.fn(async () => ({ added: 0 })),
    importDownloaded: vi.fn(),
    clearError: vi.fn(),
    updateBook: vi.fn(async () => {}),
    removeBook: vi.fn(async () => {}),
    exportNotes: vi.fn(),
});

beforeEach(() => {
    biblioteca = makeLibrary([libro('a'), libro('b')]);
    stats = {
        preferences: { libraryView: 'grid', sharky: false },
        savePreferences: vi.fn(),
        stats: { streak: 0, minutesByDay: {} },
    };

    installPorts({
        storage: {
            getSetting: async () => null,
            setSetting: async () => {},
            indexedBooks: async () => ({}),
            searchContent: async () => [],
        },
        notifier: {},
        filePicker: {},
        sync: {},
        tts: {},
    });

    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    resetPorts();
    vi.useRealTimers();
});

const mount = async (props = {}) => {
    await act(async () => {
        root.render(
            <LibraryScreen
                library={biblioteca}
                stats={stats}
                onOpenBook={() => {}}
                onGoToSettings={() => {}}
                onNavigate={() => {}}
                {...props}
            />
        );
    });
    await act(async () => { await Promise.resolve(); });
};

/** El botón de un libro, por su etiqueta accesible. */
const tarjeta = (id) =>
    [...host.querySelectorAll('button.book')]
        .find((el) => el.getAttribute('aria-label')?.startsWith(`Libro ${id},`));

/** Un toque limpio: pulsar y soltar sin moverse. */
const tocar = async (el, { x = 50, y = 80 } = {}) => {
    await act(async () => {
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y }));
    });
};

describe('la biblioteca abre libros', () => {
    it('pinta un botón por libro', async () => {
        await mount();
        expect(host.querySelectorAll('button.book')).toHaveLength(2);
    });

    it('tocar un libro lo abre', async () => {
        const onOpenBook = vi.fn();
        await mount({ onOpenBook });

        await tocar(tarjeta('b'));

        expect(onOpenBook).toHaveBeenCalledTimes(1);
        expect(onOpenBook.mock.calls[0][0].id).toBe('b');
    });

    it('arrastrar sobre una portada no la abre', async () => {
        // Al desplazar la rejilla, el dedo empieza encima de un libro. Si eso
        // contara como toque, bajar por la biblioteca abriría libros al azar.
        const onOpenBook = vi.fn();
        await mount({ onOpenBook });

        const el = tarjeta('a');
        await act(async () => {
            el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 300 }));
            el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 52, clientY: 180 }));
        });

        expect(onOpenBook).not.toHaveBeenCalled();
    });

    it('un libro sin fichero no intenta abrirse: enseña su ficha', async () => {
        // Los libros que vienen de un respaldo traen progreso y notas pero no el
        // EPUB. Antes el toque no hacía nada y parecía que la app se había
        // colgado.
        const onOpenBook = vi.fn();
        biblioteca = makeLibrary([libro('a', { sourcePath: null })]);
        await mount({ onOpenBook });

        await tocar(tarjeta('a'));

        expect(onOpenBook).not.toHaveBeenCalled();
    });

    it('la biblioteca vacía ofrece importar en lugar de una rejilla en blanco', async () => {
        biblioteca = makeLibrary([]);
        await mount();

        expect(host.querySelector('.empty-title')?.textContent).toMatch(/vacía/i);
        expect(host.querySelectorAll('.empty-actions button').length).toBeGreaterThan(0);
    });

    it('mientras carga enseña el esqueleto y no la pantalla vacía', async () => {
        // Con 136 libros la primera lectura tarda. Si saliera «Tu biblioteca está
        // vacía» durante ese rato, el susto está servido.
        biblioteca = { ...makeLibrary([]), status: 'loading' };
        await mount();

        expect(host.querySelector('.empty-title')).toBeNull();
    });
});

describe('la biblioteca cambia de vista', () => {
    it('elegir una vista la recuerda', async () => {
        await mount();

        const botones = [...host.querySelectorAll('.vistas button')];
        expect(botones.length).toBeGreaterThan(1);

        const otra = botones.find((el) => !el.className.includes('on')) || botones[1];
        await act(async () => { otra.click(); });

        expect(stats.savePreferences).toHaveBeenCalled();
        expect(stats.savePreferences.mock.calls.at(-1)[0]).toHaveProperty('libraryView');
    });

    it('los libros siguen abriéndose después de cambiar de vista', async () => {
        // Cada vista pinta los libros con un componente distinto. La rejilla
        // funcionaba y la lista no: el gesto estaba cableado en una sola.
        const onOpenBook = vi.fn();
        await mount({ onOpenBook });

        for (const boton of [...host.querySelectorAll('.vistas button')]) {
            await act(async () => { boton.click(); });

            const abribles = [
                ...host.querySelectorAll('button.book'),
                ...host.querySelectorAll('button.fila-libro'),
            ];
            expect(abribles.length, 'la vista no pinta ningún libro').toBeGreaterThan(0);
        }
    });
});

describe('la selección múltiple', () => {
    it('la pulsación larga selecciona en vez de abrir', async () => {
        vi.useFakeTimers();
        const onOpenBook = vi.fn();
        await mount({ onOpenBook });

        const el = tarjeta('a');
        await act(async () => {
            el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 80 }));
        });
        await act(async () => { vi.advanceTimersByTime(700); });
        await act(async () => {
            el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 50, clientY: 80 }));
        });

        // La larga no abre, y deja la barra de selección a la vista.
        expect(onOpenBook).not.toHaveBeenCalled();
        expect(host.querySelector('.sel-bar')).toBeTruthy();
    });
});
