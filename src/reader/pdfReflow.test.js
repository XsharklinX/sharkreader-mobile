import { describe, it, expect } from 'vitest';
import {
    lineasDe, ordenDeLectura, cabecerasRepetidas, sinCabeceras, parrafosDe,
    coserPaginas, reflujo, tieneTexto,
} from './pdfReflow.js';

/** Un trozo de texto como lo devuelve pdf.js: cuerpo 10 por defecto. */
const t = (str, x, y, { cuerpo = 10, ancho } = {}) => ({
    str,
    transform: [cuerpo, 0, 0, cuerpo, x, y],
    width: ancho ?? str.length * cuerpo * 0.5,
});

const ANCHO = 600;
const ALTO = 800;

describe('lineasDe', () => {
    it('junta los trozos de la misma altura y los ordena por x', () => {
        const lineas = lineasDe([t('mundo', 100, 700), t('Hola', 50, 700.5)]);
        expect(lineas).toHaveLength(1);
        expect(lineas[0].texto).toBe('Hola mundo');
    });

    it('no separa una palabra partida en dos trozos pegados', () => {
        const lineas = lineasDe([t('inter', 50, 700, { ancho: 25 }), t('cambio', 75, 700)]);
        expect(lineas[0].texto).toBe('intercambio');
    });

    it('devuelve las líneas de arriba abajo', () => {
        const lineas = lineasDe([t('segunda', 50, 680), t('primera', 50, 700)]);
        expect(lineas.map((l) => l.texto)).toEqual(['primera', 'segunda']);
    });

    it('ignora trozos vacíos', () => {
        expect(lineasDe([t('  ', 50, 700), { str: 'x' }])).toEqual([]);
    });
});

describe('ordenDeLectura', () => {
    const columna = (x, desde, n, prefijo) => Array.from({ length: n }, (_, i) => ({
        x0: x, x1: x + 250, y: desde - i * 12, cuerpo: 10, texto: `${prefijo}${i}`,
    }));

    it('lee la columna izquierda entera antes que la derecha', () => {
        const izquierda = columna(40, 700, 5, 'i');
        const derecha = columna(320, 700, 5, 'd');
        // Mezcladas por altura, como salen de un PDF a dos columnas.
        const mezcladas = [...izquierda, ...derecha].sort((a, b) => b.y - a.y);
        const orden = ordenDeLectura(mezcladas, ANCHO).map((l) => l.texto);
        expect(orden).toEqual(['i0', 'i1', 'i2', 'i3', 'i4', 'd0', 'd1', 'd2', 'd3', 'd4']);
    });

    it('un título a todo el ancho va delante de las columnas', () => {
        const titulo = { x0: 40, x1: 560, y: 760, cuerpo: 16, texto: 'Título' };
        const orden = ordenDeLectura([titulo, ...columna(40, 700, 5, 'i'), ...columna(320, 700, 5, 'd')], ANCHO);
        expect(orden[0].texto).toBe('Título');
    });

    it('una página a una columna se queda como está', () => {
        const lineas = Array.from({ length: 6 }, (_, i) => ({ x0: 40, x1: 560, y: 700 - i * 12, cuerpo: 10, texto: `l${i}` }));
        expect(ordenDeLectura(lineas, ANCHO)).toEqual(lineas);
    });
});

describe('cabeceras y pies', () => {
    const pagina = (n) => ({
        alto: ALTO,
        lineas: [
            { x0: 40, x1: 300, y: 780, cuerpo: 8, texto: `Revista de Historia · ${n}` },
            { x0: 40, x1: 560, y: 600, cuerpo: 10, texto: `Contenido distinto ${n * 7}` },
            { x0: 290, x1: 310, y: 20, cuerpo: 8, texto: String(n) },
        ],
    });

    it('la cabecera que se repite con el número cambiado se detecta', () => {
        const repetidas = cabecerasRepetidas([pagina(1), pagina(2), pagina(3)]);
        expect(repetidas.has('revista de historia · #')).toBe(true);
        expect(repetidas.size).toBeGreaterThan(0);
    });

    it('se quitan cabecera y número de página y se queda el contenido', () => {
        const paginas = [pagina(1), pagina(2), pagina(3)];
        const repetidas = cabecerasRepetidas(paginas);
        const limpias = sinCabeceras(paginas[1].lineas, ALTO, repetidas);
        expect(limpias.map((l) => l.texto)).toEqual(['Contenido distinto 14']);
    });

    it('una línea de contenido en el margen que no se repite no se toca', () => {
        const linea = { x0: 40, x1: 560, y: 790, cuerpo: 10, texto: 'Una frase única arriba' };
        expect(sinCabeceras([linea], ALTO, new Set())).toHaveLength(1);
    });
});

describe('parrafosDe', () => {
    const linea = (texto, y, extra = {}) => ({ x0: 40, x1: 560, y, cuerpo: 10, texto, ...extra });

    it('líneas seguidas forman un párrafo y un hueco empieza otro', () => {
        const bloques = parrafosDe([
            linea('Primera línea del párrafo', 700),
            linea('que continúa aquí.', 688),
            linea('Otro párrafo después de un hueco.', 660),
        ], 3);
        expect(bloques).toEqual([
            { tipo: 'p', texto: 'Primera línea del párrafo que continúa aquí.', pagina: 3 },
            { tipo: 'p', texto: 'Otro párrafo después de un hueco.', pagina: 3 },
        ]);
    });

    it('cose las palabras partidas a final de línea', () => {
        const [bloque] = parrafosDe([linea('el inter-', 700), linea('cambio de bienes', 688)], 1);
        expect(bloque.texto).toBe('el intercambio de bienes');
    });

    it('no cose un guion delante de mayúscula', () => {
        const [bloque] = parrafosDe([linea('franco-', 700), linea('Prusiana fue', 688)], 1);
        expect(bloque.texto).toBe('franco- Prusiana fue');
    });

    it('una línea con letra grande es un título', () => {
        const bloques = parrafosDe([
            linea('La ruta de la seda', 740, { cuerpo: 16 }),
            linea('No fue un camino sino una red.', 700),
        ], 1, { cuerpoTexto: 10 });
        expect(bloques[0]).toMatchObject({ tipo: 'h', texto: 'La ruta de la seda' });
        expect(bloques[1].tipo).toBe('p');
    });

    it('la línea corta que cierra frase acaba el párrafo', () => {
        const bloques = parrafosDe([
            linea('Una frase completa que ocupa toda la línea de', 700),
            linea('punta a punta.', 688, { x1: 140 }),
            linea('Y aquí empieza otro párrafo sin hueco extra', 676),
        ], 1);
        expect(bloques).toHaveLength(2);
    });

    it('el salto de columna no parte una frase a medias', () => {
        const bloques = parrafosDe([
            linea('final de la columna izquierda y', 100),
            { ...linea('sigue en la derecha.', 700), x0: 320 },
        ], 1);
        expect(bloques).toHaveLength(1);
        expect(bloques[0].texto).toBe('final de la columna izquierda y sigue en la derecha.');
    });
});

describe('coserPaginas', () => {
    it('une un párrafo cortado por el salto de página', () => {
        const unidos = coserPaginas(
            [{ tipo: 'p', texto: 'las caravanas avanzaban de', pagina: 1 }],
            [{ tipo: 'p', texto: 'oasis en oasis.', pagina: 2 }]
        );
        expect(unidos).toEqual([{ tipo: 'p', texto: 'las caravanas avanzaban de oasis en oasis.', pagina: 1 }]);
    });

    it('no une si el párrafo ya había terminado', () => {
        const unidos = coserPaginas(
            [{ tipo: 'p', texto: 'Fin.', pagina: 1 }],
            [{ tipo: 'p', texto: 'nuevo', pagina: 2 }]
        );
        expect(unidos).toHaveLength(2);
    });
});

describe('reflujo', () => {
    const paginaDeTexto = (numero) => ({
        numero,
        ancho: ANCHO,
        alto: ALTO,
        trozos: [
            t(`Cabecera del documento ${numero}`, 40, 780, { cuerpo: 8 }),
            t('Un párrafo de verdad con bastante texto para contar como página', 40, 700),
            t('de lectura y que sigue en la línea siguiente sin cortarse.', 40, 688),
            t(String(numero), 295, 20, { cuerpo: 8 }),
        ],
    });

    it('produce párrafos sin cabeceras ni números de página', () => {
        const bloques = reflujo([paginaDeTexto(1), paginaDeTexto(2), paginaDeTexto(3)]);
        const textos = bloques.map((b) => b.texto).join(' | ');
        expect(textos).not.toMatch(/Cabecera/);
        expect(bloques.every((b) => b.tipo === 'p')).toBe(true);
        expect(bloques[0].pagina).toBe(1);
    });

    it('una página casi sin texto se enseña como imagen', () => {
        const portada = { numero: 1, ancho: ANCHO, alto: ALTO, trozos: [t('TÍTULO', 200, 400, { cuerpo: 30 })] };
        expect(reflujo([portada])[0]).toEqual({ tipo: 'imagen', pagina: 1 });
    });
});

describe('tieneTexto', () => {
    it('un escaneado no tiene texto', () => {
        expect(tieneTexto([{ trozos: [] }, { trozos: [] }])).toBe(false);
    });
    it('un PDF normal sí', () => {
        expect(tieneTexto([{ trozos: [t('x'.repeat(200), 0, 0)] }])).toBe(true);
    });
});
