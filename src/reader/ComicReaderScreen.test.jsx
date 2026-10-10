/**
 * @vitest-environment jsdom
 *
 * El lector de cómic, montado de verdad.
 *
 * **Por qué existe.** Comparte barra de herramientas con el de PDF —la que
 * llevaba semanas rota sin una sola regla CSS— y nadie la había montado nunca en
 * una prueba. Un CBZ además tiene dos cosas que solo tiene él: el sentido de
 * lectura del manga, que invierte qué lado avanza, y el ajuste al ancho o a la
 * pantalla.
 *
 * El ZIP se simula. Lo que se prueba es que **la pantalla** pide las páginas en
 * el orden correcto y que sus controles mueven el número de página.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PAGINAS = ['01.jpg', '02.jpg', '03.jpg', '04.jpg', '05.jpg'];
let pedidas = [];

vi.mock('../library/formats.js', () => ({
    listComicPages: async () => [...PAGINAS],
    readComicPage: async (_blob, nombre) => {
        pedidas.push(nombre);
        return 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    },
}));

vi.mock('../adapters/SafPicker.js', () => ({
    readBookBlob: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }),
    saveDownloadedBook: vi.fn(),
    writeConvertedBook: vi.fn(),
    createSafPicker: () => ({}),
}));

import ComicReaderScreen from './ComicReaderScreen.jsx';
import { installPorts, resetPorts } from '../ports/index.js';
import { resetBackStack } from '../ui/backStack.js';

const BOOK = {
    id: 'c1',
    name: 'Tomo 1',
    type: 'cbz',
    sourcePath: '/books/c1.cbz',
    lastLocation: 1,
    readerPreferences: {},
    annotations: [],
};

let host;
let root;

beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
        configurable: true, get() { return 400; },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
        configurable: true, get() { return 800; },
    });

    pedidas = [];
    resetBackStack();

    installPorts({
        storage: { getSetting: async () => null, setSetting: async () => {} },
        notifier: {}, filePicker: {}, sync: {}, tts: {},
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
            <ComicReaderScreen
                book={BOOK}
                onClose={() => {}}
                onProgress={() => {}}
                onAnnotationsChange={() => {}}
                {...props}
            />
        );
    });
    for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); });
};

const slider = () => host.querySelector('input.pdf-slider');

const irA = async (n) => {
    await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        ).set;
        setter.call(slider(), String(n));
        slider().dispatchEvent(new Event('change', { bubbles: true }));
    });
    for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
};

describe('el lector de cómic se abre', () => {
    it('cuenta las páginas del CBZ', async () => {
        await mount();
        expect(host.textContent).toMatch(/de 5/);
    });

    it('pide la primera página y la pinta', async () => {
        await mount();
        expect(pedidas).toContain('01.jpg');
        expect(host.querySelector('img')).toBeTruthy();
    });

    it('tiene barra de herramientas con sus botones', async () => {
        await mount();
        const barra = host.querySelector('.reader-tools');
        expect(barra, 'no hay barra de herramientas').toBeTruthy();
        expect(barra.querySelectorAll('button').length).toBeGreaterThan(1);
    });
});

describe('el lector de cómic pasa página', () => {
    it('el deslizador mueve la página y pide su imagen', async () => {
        await mount();
        await irA(4);

        expect(host.textContent).toMatch(/Página 4/);
        expect(pedidas).toContain('04.jpg');
    });

    it('el sentido manga invierte qué lado avanza', async () => {
        await mount();

        const boton = host.querySelector('[aria-label^="Leer de"]');
        expect(boton, 'no se puede cambiar el sentido de lectura').toBeTruthy();

        const antes = boton.getAttribute('aria-label');
        await act(async () => { boton.click(); });

        const ahora = host.querySelector('[aria-label^="Leer de"]').getAttribute('aria-label');
        expect(ahora).not.toBe(antes);
    });

    it('se puede alternar entre ajustar al ancho y a la pantalla', async () => {
        await mount();

        const boton = host.querySelector('[aria-label^="Ajustar"]');
        expect(boton).toBeTruthy();

        const antes = boton.getAttribute('aria-label');
        await act(async () => { boton.click(); });

        expect(host.querySelector('[aria-label^="Ajustar"]').getAttribute('aria-label')).not.toBe(antes);
    });

    it('cerrar avisa al que lo abrió', async () => {
        const onClose = vi.fn();
        await mount({ onClose });

        await act(async () => {
            host.querySelector('[aria-label="Volver a la biblioteca"]').click();
        });

        expect(onClose).toHaveBeenCalled();
    });
});
