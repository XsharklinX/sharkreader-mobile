/**
 * @vitest-environment jsdom
 *
 * La navegación de dos niveles de las hojas es lógica de interfaz y solo se
 * puede comprobar montándola. Es el segundo módulo del proyecto que necesita
 * DOM, después del parser de OPDS.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import Sheet, { Row } from './Sheet.jsx';
import { resetBackStack, runBack } from './backStack.js';

let host;
let root;

beforeEach(() => {
    resetBackStack();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const render = (element) => act(() => root.render(element));

const click = (node) => act(() => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});

const byText = (text) =>
    [...host.querySelectorAll('button')].find((node) => node.textContent.includes(text));

describe('Sheet', () => {
    const build = (onClose = vi.fn()) => (
        <Sheet
            title="Pantalla"
            onClose={onClose}
            pages={{
                aids: { title: 'Ayudas de lectura', render: () => <p>Contenido de ayudas</p> },
            }}
        >
            {({ openPage }) => (
                <Row label="Ayudas de lectura" onClick={() => openPage('aids')} />
            )}
        </Sheet>
    );

    it('muestra el título y el contenido de primer nivel', () => {
        render(build());
        expect(host.querySelector('.sheet-title').textContent).toBe('Pantalla');
        expect(host.textContent).not.toContain('Contenido de ayudas');
    });

    it('la subpágina sustituye el contenido, no se apila encima', () => {
        // Apilar hojas en un móvil deja la de abajo asomando y en dos niveles ya
        // no se sabe qué cierra cada cosa.
        render(build());
        click(byText('Ayudas de lectura'));

        expect(host.querySelectorAll('.sheet')).toHaveLength(1);
        expect(host.querySelector('.sheet-title').textContent).toBe('Ayudas de lectura');
        expect(host.textContent).toContain('Contenido de ayudas');
    });

    it('el botón de volver sube un nivel', () => {
        render(build());
        click(byText('Ayudas de lectura'));
        click(host.querySelector('[aria-label="Volver a Pantalla"]'));
        expect(host.querySelector('.sheet-title').textContent).toBe('Pantalla');
    });

    it('atrás sube un nivel antes de cerrar la hoja', () => {
        // Cerrar de golpe desde una subpágina obliga a volver a entrar para
        // cambiar lo de al lado.
        const onClose = vi.fn();
        render(build(onClose));
        click(byText('Ayudas de lectura'));

        let consumed;
        act(() => { consumed = runBack(); });

        expect(consumed).toBe(true);
        expect(host.querySelector('.sheet-title').textContent).toBe('Pantalla');
        expect(onClose).not.toHaveBeenCalled();
    });

    it('atrás en el primer nivel no lo consume: lo cierra quien esté debajo', () => {
        render(build());
        let consumed;
        act(() => { consumed = runBack(); });
        expect(consumed).toBe(false);
    });

    it('tocar fuera cierra la hoja', () => {
        const onClose = vi.fn();
        render(build(onClose));
        click(host.querySelector('.scrim'));
        expect(onClose).toHaveBeenCalled();
    });

    it('tocar dentro no la cierra', () => {
        const onClose = vi.fn();
        render(build(onClose));
        click(host.querySelector('.sheet'));
        expect(onClose).not.toHaveBeenCalled();
    });
});

describe('Row', () => {
    it('sin onClick no es un botón: no promete que lleve a ningún sitio', () => {
        render(<Row label="Solo lectura" />);
        expect(host.querySelector('button')).toBeNull();
        expect(host.querySelector('.sheet-row-chev')).toBeNull();
    });

    it('con onClick lleva galón, para que se vea que hay otro nivel', () => {
        render(<Row label="Ir" onClick={() => {}} />);
        expect(host.querySelector('.sheet-row-chev')).not.toBeNull();
    });

    it('un control propio sustituye el galón', () => {
        // Una fila con interruptor no lleva a ninguna parte: el galón sería una
        // promesa falsa.
        render(<Row label="Con control" onClick={() => {}} control={<span className="switch" />} />);
        expect(host.querySelector('.sheet-row-chev')).toBeNull();
        expect(host.querySelector('.switch')).not.toBeNull();
    });

    it('muestra el valor actual para no tener que entrar a comprobarlo', () => {
        render(<Row label="Columnas" value="2 columnas" onClick={() => {}} />);
        expect(host.querySelector('.sheet-row-value').textContent).toBe('2 columnas');
    });
});
