import { describe, it, expect, vi } from 'vitest';
import {
    tituloSospechoso, autorDesconocido, isbnDe, limpiarTitulo, parecido,
    elegirCandidato, diagnosticar, resumirDiagnostico, propuestasLocales,
    revisarEnLinea, cambiosAplicables,
} from './ordenar.js';

const libro = (id, name, extra = {}) => ({
    id, name, originalTitle: name, author: 'Autor desconocido', ...extra,
});

describe('tituloSospechoso', () => {
    it.each([
        'libro(1).epub',
        'dune_frank_herbert',
        '9788497592208',
        'Fundacion - copia',
        'el-nombre-del-viento',
        'Sapiens (1)',
        'Libro sin titulo',
        '',
    ])('«%s» tiene pinta de nombre de fichero', (titulo) => {
        expect(tituloSospechoso(titulo)).toBe(true);
    });

    it.each([
        'Cien años de soledad',
        'La isla del tesoro',
        'Harry Potter y la piedra filosofal',
        'El último deseo',
        'Ready Player One',
    ])('«%s» es un título normal', (titulo) => {
        expect(tituloSospechoso(titulo)).toBe(false);
    });
});

describe('autorDesconocido', () => {
    it('reconoce el relleno y los vacíos', () => {
        expect(autorDesconocido('Autor desconocido')).toBe(true);
        expect(autorDesconocido('')).toBe(true);
        expect(autorDesconocido('Unknown')).toBe(true);
        expect(autorDesconocido('Ursula K. Le Guin')).toBe(false);
    });
});

describe('isbnDe', () => {
    it('saca un ISBN-13 aunque lleve guiones', () => {
        expect(isbnDe('978-84-9759-220-8.pdf')).toBe('9788497592208');
    });
    it('saca un ISBN-10', () => {
        expect(isbnDe('libro 843760494X')).toBe('843760494X');
    });
    it('no confunde un número cualquiera con un ISBN', () => {
        expect(isbnDe('1984')).toBeNull();
        expect(isbnDe('Fahrenheit 451')).toBeNull();
    });
});

describe('limpiarTitulo', () => {
    it('quita extensión, guiones bajos y ruido', () => {
        expect(limpiarTitulo('dune_v2_FINAL.epub')).toBe('Dune');
        expect(limpiarTitulo('el-nombre-del-viento')).toBe('El nombre del viento');
        expect(limpiarTitulo('Fundacion - copia')).toBe('Fundacion');
    });
    it('un ISBN pelado no se convierte en título', () => {
        expect(limpiarTitulo('9788497592208.pdf')).toBeNull();
    });
});

describe('parecido', () => {
    it('un subtítulo de más no hace distinto el libro', () => {
        expect(parecido('Dune', 'Dune (Las crónicas de Dune, 1)')).toBe(1);
    });
    it('ignora acentos y mayúsculas', () => {
        expect(parecido('fundacion', 'Fundación')).toBe(1);
    });
    it('dos títulos distintos se parecen poco', () => {
        expect(parecido('El nombre del viento', 'El temor de un hombre sabio')).toBeLessThan(0.5);
    });
});

describe('elegirCandidato', () => {
    const resultados = [
        { title: 'El temor de un hombre sabio', author: 'Patrick Rothfuss' },
        { title: 'El nombre del viento', author: 'Patrick Rothfuss', coverUrl: 'x' },
    ];

    it('se queda con el que de verdad coincide', () => {
        const elegido = elegirCandidato({ buscado: 'El nombre del viento', autor: '' }, resultados);
        expect(elegido.title).toBe('El nombre del viento');
    });

    it('en la duda, ninguno: un dato equivocado es peor que ninguno', () => {
        expect(elegirCandidato({ buscado: 'Las puertas de piedra', autor: '' }, resultados)).toBeNull();
    });

    it('con autor conocido, un homónimo de otro autor no vale', () => {
        const homonimos = [{ title: 'Fundación', author: 'Otra Persona' }];
        expect(elegirCandidato({ buscado: 'Fundación', autor: 'Isaac Asimov' }, homonimos)).toBeNull();
    });

    it('buscando por ISBN vale el primero', () => {
        expect(elegirCandidato({ buscado: null, porIsbn: true }, resultados)).toBe(resultados[0]);
    });
});

describe('diagnosticar y resumir', () => {
    const libros = [
        libro('a', 'dune_v2.epub'),
        libro('b', 'Cien años de soledad', { author: 'Gabriel García Márquez', coverBase64: 'data:x' }),
        libro('c', 'Cosmos', { author: 'Carl Sagan' }),
    ];

    it('solo aparecen los libros con algo que arreglar', () => {
        const ids = diagnosticar(libros).map((d) => d.id);
        expect(ids).toEqual(['a', 'c']);
    });

    it('cuenta cada clase de problema', () => {
        const r = resumirDiagnostico(libros);
        expect(r).toMatchObject({ libros: 2, titulos: 1, autores: 1, portadas: 2 });
    });
});

describe('propuestasLocales', () => {
    it('propone títulos limpios y agrupa series sin internet', () => {
        const libros = [
            libro('a', 'dune_v2.epub'),
            libro('s1', 'Mistborn 1', { author: 'Brandon Sanderson' }),
            libro('s2', 'Mistborn 2', { author: 'Brandon Sanderson' }),
        ];
        const propuestas = propuestasLocales(libros);
        expect(propuestas.find((p) => p.id === 'a').cambios.name).toBe('Dune');
        expect(propuestas.find((p) => p.id === 's2').cambios).toMatchObject({ series: 'Mistborn', seriesIndex: 2 });
    });
});

describe('revisarEnLinea', () => {
    it('busca por ISBN cuando lo hay y propone título, autor y portada', async () => {
        const buscar = vi.fn(async () => ({
            offline: false,
            results: [{ title: 'El nombre del viento', author: 'Patrick Rothfuss', coverUrl: 'https://c/1.jpg' }],
        }));
        const { propuestas } = await revisarEnLinea({
            libros: [libro('a', '9788401337208.epub')],
            buscar,
            pausa: 0,
        });
        expect(buscar).toHaveBeenCalledWith({ isbn: '9788401337208' });
        expect(propuestas[0].cambios).toMatchObject({ name: 'El nombre del viento', author: 'Patrick Rothfuss' });
        expect(propuestas[0].portadaUrl).toBe('https://c/1.jpg');
    });

    it('sin conexión se para y lo dice', async () => {
        const buscar = vi.fn(async () => ({ offline: true, results: [] }));
        const r = await revisarEnLinea({ libros: [libro('a', 'x_y.epub'), libro('b', 'z_w.epub')], buscar, pausa: 0 });
        expect(r.sinConexion).toBe(true);
        expect(buscar).toHaveBeenCalledTimes(1);
    });

    it('un resultado que no es el libro no cambia nada del libro', async () => {
        const buscar = vi.fn(async () => ({ offline: false, results: [{ title: 'Otra cosa', author: 'X' }] }));
        const { propuestas } = await revisarEnLinea({ libros: [libro('a', 'Cosmos')], buscar, pausa: 0 });
        expect(propuestas).toEqual([]);
    });
});

describe('cambiosAplicables', () => {
    it('añade la portada descargada y la marca de fecha', () => {
        const cambios = cambiosAplicables({ cambios: { name: 'Dune' } }, 'data:image/jpeg;base64,x');
        expect(cambios.name).toBe('Dune');
        expect(cambios.customCover).toMatch(/^data:/);
        expect(cambios.metadataUpdatedAt).toBeGreaterThan(0);
    });
});
