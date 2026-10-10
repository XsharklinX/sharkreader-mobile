/**
 * @vitest-environment jsdom
 *
 * El lector de PDF, montado de verdad.
 *
 * **Por qué existe.** Un PDF se abrió en el teléfono y estaba roto de arriba
 * abajo: la barra de herramientas salía como una columna de iconos que llenaba
 * media pantalla —`.reader-tools` no tenía ni una regla CSS—, y no pasaba
 * página ni respondía al arrastre. Llevaba así semanas con todas las pruebas en
 * verde, porque ninguna montaba esta pantalla.
 *
 * `pdfjs` se simula: necesita un worker y un PDF real, y lo que se prueba aquí
 * no es pdfjs sino que **nuestra** pantalla le pide las páginas correctas y
 * mueve el número de página con los gestos.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** Los manejadores que la pantalla registra sobre el visor. */
let paginasPedidas = [];

const makePage = () => ({
    getViewport: ({ scale = 1 } = {}) => ({ width: 600 * scale, height: 800 * scale, scale }),
    render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
    getTextContent: async () => ({ items: [] }),
    cleanup: () => {},
});

vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: () => ({
        promise: Promise.resolve({
            numPages: 12,
            getPage: async (n) => { paginasPedidas.push(n); return makePage(); },
            getOutline: async () => null,
            destroy: () => {},
        }),
    }),
}));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }));

vi.mock('../adapters/SafPicker.js', () => ({
    readBookBlob: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }),
    saveDownloadedBook: vi.fn(),
    writeConvertedBook: vi.fn(),
    createSafPicker: () => ({}),
}));

import PdfReaderScreen from './PdfReaderScreen.jsx';
import { installPorts, resetPorts } from '../ports/index.js';
import { resetBackStack } from '../ui/backStack.js';

const BOOK = {
    id: 'p1',
    name: 'Manual',
    type: 'pdf',
    sourcePath: '/books/p1.pdf',
    lastLocation: 3,
    readerPreferences: {},
    annotations: [],
};

const PHONE = { width: 400, height: 800 };

let host;
let root;

beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
        configurable: true, get() { return PHONE.width; },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
        configurable: true, get() { return PHONE.height; },
    });
    // jsdom no tiene contexto 2D; la pantalla pinta en canvas al cargar.
    HTMLCanvasElement.prototype.getContext = () => ({
        clearRect: () => {}, drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }),
        putImageData: () => {}, fillRect: () => {}, setTransform: () => {}, scale: () => {},
    });

    paginasPedidas = [];
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
            <PdfReaderScreen
                book={BOOK}
                onClose={() => {}}
                onProgress={() => {}}
                onAnnotationsChange={() => {}}
                onExportAnnotations={() => {}}
                {...props}
            />
        );
    });
    // La carga es asíncrona y encadena varias promesas.
    for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); });
};

describe('el lector de PDF se abre', () => {
    it('vuelve por donde se quedó, no por el principio', async () => {
        await mount();
        expect(host.textContent).toMatch(/Página 3/);
        expect(host.textContent).toMatch(/de 12/);
    });

    it('la barra de herramientas es una fila, no una columna de iconos', async () => {
        // El fallo real: `.reader-tools` existía en el JSX y en ninguna hoja de
        // estilos. Aquí no se puede medir la maqueta —jsdom no maqueta— pero sí
        // que la clase está y que sus botones existen; que tenga reglas lo
        // comprueba `clasesUsadas.test.js`.
        await mount();

        const barra = host.querySelector('.reader-tools');
        expect(barra, 'no hay barra de herramientas').toBeTruthy();
        expect(barra.querySelectorAll('button').length).toBeGreaterThan(2);
    });

    it('el deslizador va de 1 al total', async () => {
        await mount();
        const slider = host.querySelector('input.pdf-slider');
        expect(slider).toBeTruthy();
        expect(slider.min).toBe('1');
        expect(slider.max).toBe('12');
        expect(slider.value).toBe('3');
    });
});

describe('el lector de PDF pasa página', () => {
    it('el deslizador mueve la página y pide la nueva', async () => {
        await mount();
        const slider = host.querySelector('input.pdf-slider');

        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            ).set;
            setter.call(slider, '7');
            slider.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await act(async () => { await Promise.resolve(); });

        expect(host.textContent).toMatch(/Página 7/);
        expect(paginasPedidas).toContain(7);
    });

    it('el zoom cambia y no se sale de sus topes', async () => {
        await mount();

        const alejar = host.querySelector('[aria-label="Alejar"]');
        const acercar = host.querySelector('[aria-label="Acercar"]');
        expect(alejar && acercar).toBeTruthy();

        const porcentaje = () => Number(host.querySelector('.reader-tools .mono').textContent.replace('%', ''));
        const inicial = porcentaje();

        await act(async () => { acercar.click(); });
        expect(porcentaje()).toBeGreaterThan(inicial);

        // Muchos toques seguidos no deben llevarlo a un número absurdo.
        await act(async () => { for (let i = 0; i < 20; i += 1) acercar.click(); });
        expect(porcentaje()).toBeLessThanOrEqual(400);

        await act(async () => { for (let i = 0; i < 40; i += 1) alejar.click(); });
        expect(porcentaje()).toBeGreaterThan(0);
    });

    it('cerrar avisa al que lo abrió', async () => {
        const onClose = vi.fn();
        await mount({ onClose });

        const volver = host.querySelector('[aria-label="Volver"], [aria-label="Cerrar"], [aria-label="Volver a la biblioteca"]');
        expect(volver, 'no hay forma de salir del PDF').toBeTruthy();
        await act(async () => { volver.click(); });

        expect(onClose).toHaveBeenCalled();
    });
});
