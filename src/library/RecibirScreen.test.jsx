/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import RecibirScreen from './RecibirScreen.jsx';
import { installPorts, resetPorts } from '../ports/index.js';
import { resetBackStack } from '../ui/backStack.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let contenedor;
let raiz;
let oyentes;
let servidor;

beforeEach(() => {
    oyentes = {};
    servidor = {
        iniciar: vi.fn(async () => ({ direccion: 'http://192.168.1.34:8080/k7f2qa', ip: '192.168.1.34', puerto: 8080, clave: 'k7f2qa' })),
        parar: vi.fn(async () => {}),
        alRecibir: vi.fn(async (manejadores) => { oyentes = manejadores; return () => {}; }),
    };
    installPorts({ servidor, awake: { set: vi.fn(async () => {}) } });
    contenedor = document.createElement('div');
    document.body.appendChild(contenedor);
    raiz = createRoot(contenedor);
});

afterEach(() => {
    act(() => raiz.unmount());
    contenedor.remove();
    resetPorts();
    resetBackStack();
});

const esperar = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

describe('RecibirScreen', () => {
    it('enseña la dirección que hay que abrir en el ordenador', async () => {
        await act(async () => { raiz.render(<RecibirScreen library={{ importarRecibido: vi.fn() }} onClose={() => {}} />); });
        await esperar();
        expect(contenedor.querySelector('.recibir-direccion').textContent).toBe('192.168.1.34:8080/k7f2qa');
        expect(contenedor.querySelector('.codigo-qr')).not.toBeNull();
    });

    it('lo que llega entra en la biblioteca y se dice', async () => {
        const importarRecibido = vi.fn(async () => ({ estado: 'añadido', titulo: 'Dune' }));
        await act(async () => { raiz.render(<RecibirScreen library={{ importarRecibido }} onClose={() => {}} />); });
        await esperar();

        await act(async () => { oyentes.alEmpezar({ nombre: 'dune.epub', tamano: 2048 }); });
        await act(async () => { oyentes.alTerminar({ id: 'x', name: 'dune.epub', size: 2048, path: '/b/x.epub', type: 'epub' }); });
        await esperar();

        expect(importarRecibido).toHaveBeenCalledWith(expect.objectContaining({ path: '/b/x.epub' }));
        expect(contenedor.textContent).toMatch(/1 libro nuevo/);
        expect(contenedor.querySelector('.recibir-libro').dataset.estado).toBe('añadido');
    });

    it('al cerrar se para el servidor', async () => {
        await act(async () => { raiz.render(<RecibirScreen library={{ importarRecibido: vi.fn() }} onClose={() => {}} />); });
        await esperar();
        act(() => raiz.unmount());
        raiz = createRoot(contenedor);
        expect(servidor.parar).toHaveBeenCalled();
    });

    it('sin wifi lo explica', async () => {
        servidor.iniciar.mockRejectedValueOnce(new Error('Conecta el móvil a una wifi para recibir libros.'));
        await act(async () => { raiz.render(<RecibirScreen library={{ importarRecibido: vi.fn() }} onClose={() => {}} />); });
        await esperar();
        expect(contenedor.textContent).toMatch(/Conecta el móvil a una wifi/);
    });
});
