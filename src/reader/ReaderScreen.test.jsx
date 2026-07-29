/**
 * @vitest-environment jsdom
 *
 * Test de integración del lector.
 *
 * **Por qué existe.** Los gestos se han roto tres veces sin que ningún test se
 * enterara: había 726 pruebas de módulos puros —`useGestures`, `pageDrag`,
 * `transitions`— todas verdes mientras la app no pasaba página. Cada pieza
 * funcionaba y el cableado entre ellas no.
 *
 * Esto monta `ReaderScreen` de verdad con un motor de EPUB simulado y ejercita
 * la secuencia completa: se registra el gesto, llega un toque, se llama a la
 * página siguiente. Es el único tipo de prueba que puede cazar un fallo de
 * cableado, y es la que faltaba.
 *
 * El motor se simula porque epub.js necesita un iframe con un EPUB dentro; lo
 * que se prueba aquí no es epub.js sino que **nuestro** código le pide las cosas.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

// ── Simulaciones ────────────────────────────────────────────────────────────

/** Manejadores que el lector registra «dentro del iframe». Se guardan aquí. */
let registered = null;
let engine = null;

const makeEngine = () => ({
    open: vi.fn(async (data, element, options) => {
        // Es lo que hace epub.js: guardar los manejadores para el iframe.
        registered = options.gestureHandlers;
        return { toc: [], hasLocations: true, totalLocations: 100 };
    }),
    buildLocations: vi.fn(async () => null),
    next: vi.fn(async () => {}),
    prev: vi.fn(async () => {}),
    display: vi.fn(),
    destroy: vi.fn(),
    resize: vi.fn(),
    setSpread: vi.fn(),
    applyStyles: vi.fn(),
    onRelocated: vi.fn(() => () => {}),
    onSelected: vi.fn(() => () => {}),
    registerFootnotes: vi.fn(),
    registerImages: vi.fn(),
    registerHangingPunctuation: vi.fn(),
    addHighlight: vi.fn(),
    removeHighlight: vi.fn(),
    selectionText: vi.fn(() => ''),
    clearSelection: vi.fn(),
    visibleText: vi.fn(() => 'texto'),
    paragraphAt: vi.fn(() => ''),
    prefetchNext: vi.fn(),
    chapterLabel: vi.fn(() => 'Capítulo I'),
    progressFromCfi: vi.fn(() => 0.3),
    cfiAtPercent: vi.fn(() => 'epubcfi(/6/4)'),
    cfiAtLocation: vi.fn(() => 'epubcfi(/6/4)'),
    chapterAtPercent: vi.fn(() => 'Capítulo I'),
    currentLocation: vi.fn(() => 30),
    totalLocations: vi.fn(() => 100),
    // 360 px de ancho útil: es lo que devuelve el documento del libro, más
    // estrecho que el contenedor por los márgenes de lectura.
    contentWidth: vi.fn(() => 360),
    contentHeight: vi.fn(() => 640),
    bookAuthor: vi.fn(() => ''),
    search: vi.fn(async () => []),
    highlightSpoken: vi.fn(),
});

vi.mock('./EpubEngine.js', () => ({
    createEpubEngine: () => engine,
}));

vi.mock('../adapters/SafPicker.js', () => ({
    readBookBlob: vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })),
    saveDownloadedBook: vi.fn(),
    writeConvertedBook: vi.fn(),
    createSafPicker: () => ({}),
}));

vi.mock('./fontLoader.js', () => ({ buildFontFaceCss: async () => '' }));

import ReaderScreen from './ReaderScreen.jsx';
import { installPorts, resetPorts } from '../ports/index.js';
import { resetBackStack, runBack } from '../ui/backStack.js';

const BOOK = {
    id: 'b1',
    name: 'Ficciones',
    type: 'epub',
    sourcePath: '/books/b1.epub',
    progress: 0.3,
    bookmarks: [],
    readerPreferences: {},
};

let host;
let root;

beforeEach(() => {
    registered = null;
    engine = makeEngine();
    resetBackStack();

    installPorts({
        storage: { getSetting: async () => null, setSetting: async () => {} },
        tts: {
            listVoices: async () => [],
            isSupported: async () => true,
            speak: async () => {},
            stop: async () => {},
            pause: async () => {},
            resume: async () => {},
        },
        notifier: {},
        filePicker: {},
        sync: {},
        screen: { lock: async () => {}, unlock: async () => {}, onChange: async () => () => {} },
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

/** Monta el lector y espera a que termine la carga simulada. */
const mount = async (props = {}) => {
    await act(async () => {
        root.render(<ReaderScreen book={BOOK} onClose={() => {}} {...props} />);
    });
    // Un tic más: la carga es asíncrona y registra los hooks al final.
    await act(async () => { await Promise.resolve(); });
};

/** Simula un toque en el documento del libro, como lo haría el iframe. */
const tap = async (x, y = 320) => {
    await act(async () => {
        registered.onPointerDown({ clientX: x, clientY: y });
        registered.onPointerUp({ clientX: x, clientY: y });
    });
};

const drag = async (from, to) => {
    await act(async () => {
        registered.onPointerDown({ clientX: from, clientY: 320 });
        registered.onPointerMove({ clientX: (from + to) / 2, clientY: 322 });
        registered.onPointerMove({ clientX: to, clientY: 322 });
        registered.onPointerUp({ clientX: to, clientY: 322 });
    });
};

describe('el lector registra los gestos', () => {
    it('pasa los manejadores al motor al abrir', async () => {
        await mount();
        expect(engine.open).toHaveBeenCalled();
        expect(registered).toBeTruthy();
        expect(typeof registered.onPointerDown).toBe('function');
        expect(typeof registered.onPointerUp).toBe('function');
        expect(typeof registered.onTouchMove).toBe('function');
    });

    it('enchufa el despachador de acciones y la rejilla', async () => {
        // Sin esto, todo toque cae en el caso por defecto y no hace nada. Es
        // exactamente el fallo que no detectaba ningún test de módulo.
        await mount();
        expect(typeof registered.onAction).toBe('function');
        expect(Array.isArray(registered.grid)).toBe(true);
    });
});

describe('pasar página con el dedo', () => {
    it('un toque en el borde derecho avanza', async () => {
        await mount();
        await tap(350);
        expect(engine.next).toHaveBeenCalled();
    });

    it('un toque en el borde izquierdo retrocede', async () => {
        await mount();
        await tap(10);
        expect(engine.prev).toHaveBeenCalled();
    });

    it('un toque en el centro no pasa página', async () => {
        await mount();
        await tap(180);
        expect(engine.next).not.toHaveBeenCalled();
        expect(engine.prev).not.toHaveBeenCalled();
    });

    it('deslizar hacia la izquierda avanza', async () => {
        await mount();
        await drag(340, 60);
        expect(engine.next).toHaveBeenCalled();
    });

    it('deslizar hacia la derecha retrocede', async () => {
        await mount();
        await drag(60, 340);
        expect(engine.prev).toHaveBeenCalled();
    });

    it('no pasa dos páginas de un solo gesto', async () => {
        // El arrastre y el toque comparten el `pointerup`: si el arrastre no
        // consumiera el gesto, el toque lo interpretaría además como toque.
        await mount();
        await drag(340, 60);
        expect(engine.next).toHaveBeenCalledTimes(1);
    });
});

describe('el botón atrás', () => {
    it('cierra la capa abierta antes de salir del libro', async () => {
        await mount();
        // Se abre el índice con un toque en el centro y luego la barra.
        await act(async () => { registered.onAction('toc'); });

        let consumed;
        await act(async () => { consumed = runBack(); });
        expect(consumed).toBe(true);
    });

    it('con nada abierto deja pasar el atrás', async () => {
        await mount();
        let consumed;
        await act(async () => { consumed = runBack(); });
        expect(consumed).toBe(false);
    });
});

describe('acciones de la rejilla', () => {
    it('cada acción hace algo distinguible', async () => {
        await mount();

        await act(async () => { registered.onAction('next'); });
        expect(engine.next).toHaveBeenCalled();

        await act(async () => { registered.onAction('prev'); });
        expect(engine.prev).toHaveBeenCalled();

        // 'none' existe y no debe hacer nada: es cómo se apaga una zona.
        engine.next.mockClear();
        await act(async () => { registered.onAction('none'); });
        expect(engine.next).not.toHaveBeenCalled();
    });
});
