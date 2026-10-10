/**
 * @vitest-environment jsdom
 *
 * El modo lectura del PDF, montado.
 *
 * jsdom no maqueta —no hay columnas ni anchos—, así que lo que se comprueba aquí
 * es lo que no depende de medir: que pide el tramo correcto, que convierte las
 * páginas en párrafos y que un escaneado avisa en lugar de quedarse en blanco.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import PdfLectura from './PdfLectura.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const trozo = (str, y) => ({ str, transform: [10, 0, 0, 10, 40, y], width: str.length * 5 });

const fuenteDe = (conTexto = true) => {
    const pedidas = [];
    return {
        pedidas,
        total: 20,
        pagina: async (n) => ({ numero: n, trozos: [], ancho: 600, alto: 800 }),
        paginas: async (desde, hasta) => {
            pedidas.push([desde, hasta]);
            const lista = [];
            for (let n = desde; n <= hasta; n += 1) {
                lista.push({
                    numero: n,
                    ancho: 600,
                    alto: 800,
                    trozos: conTexto
                        ? [trozo(`Párrafo de la página ${n} con texto suficiente para no ser una lámina,`, 700),
                            trozo('y que sigue en la línea siguiente hasta acabar.', 688)]
                        : [],
                });
            }
            return lista;
        },
    };
};

let contenedor;
let raiz;

beforeEach(() => {
    contenedor = document.createElement('div');
    document.body.appendChild(contenedor);
    raiz = createRoot(contenedor);
});

afterEach(() => {
    act(() => raiz.unmount());
    contenedor.remove();
});

const montar = async (props) => {
    await act(async () => {
        raiz.render(
            <PdfLectura
                palette={{ bg: '#000', text: '#fff' }}
                letra={{ fontFamily: 'literata', fontSize: 18, lineHeight: 1.4 }}
                {...props}
            />
        );
    });
    await act(async () => { await Promise.resolve(); });
};

describe('PdfLectura', () => {
    it('abre en el tramo de la página guardada', async () => {
        const fuente = fuenteDe();
        await montar({ fuente, paginaInicial: 11 });
        expect(fuente.pedidas[0]).toEqual([9, 16]);
    });

    it('convierte cada página en un párrafo de texto', async () => {
        await montar({ fuente: fuenteDe(), paginaInicial: 1 });
        const parrafos = contenedor.querySelectorAll('.pdfl-p');
        expect(parrafos.length).toBe(8);
        expect(parrafos[0].textContent).toMatch(/^Párrafo de la página 1 .* hasta acabar\.$/);
        expect(parrafos[0].dataset.p).toBe('1');
    });

    it('un escaneado avisa en lugar de quedarse en blanco', async () => {
        const onSinTexto = vi.fn();
        await montar({ fuente: fuenteDe(false), paginaInicial: 1, onSinTexto });
        expect(onSinTexto).toHaveBeenCalledTimes(1);
    });

    it('la letra elegida se aplica al texto', async () => {
        await montar({ fuente: fuenteDe(), paginaInicial: 1 });
        const tira = contenedor.querySelector('.pdfl-tira');
        expect(tira.style.fontSize).toBe('18px');
        expect(tira.style.fontFamily).toMatch(/Literata/);
    });
});
