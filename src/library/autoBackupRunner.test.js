/**
 * @vitest-environment jsdom
 *
 * El viaje completo de una copia: escribirla, encontrarla, leerla y volver.
 *
 * **Por qué este test y no solo los de política.** Una copia de seguridad no
 * vale por haberse escrito, vale por poder restaurarse, y esas son dos cosas
 * distintas que solo se tocan el día que hace falta. Aquí se hace el viaje
 * entero contra una carpeta simulada: se copia una biblioteca, se borra todo, y
 * se comprueba que lo que vuelve es lo que había — con su progreso y sus
 * subrayados, no solo con los títulos.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// La carpeta del usuario, simulada: un mapa de nombre a contenido.
const carpeta = new Map();

vi.mock('../adapters/SafPicker.js', () => ({
    SharkPicker: {
        pickBackupFolder: vi.fn(async () => ({ uri: 'content://tree/copias', label: 'Copias' })),
        writeBackup: vi.fn(async ({ name, data }) => {
            carpeta.set(name, data);
            return { uri: `content://doc/${name}`, size: data.length };
        }),
        listBackups: vi.fn(async () => ({
            files: [...carpeta.keys()].map((name) => ({
                name, uri: `content://doc/${name}`, size: carpeta.get(name).length, modified: 0,
            })),
        })),
        readBackup: vi.fn(async ({ uri }) => {
            const name = uri.replace('content://doc/', '');
            if (!carpeta.has(name)) throw new Error('no existe');
            return { data: carpeta.get(name) };
        }),
        deleteBackup: vi.fn(async ({ uri }) => {
            carpeta.delete(uri.replace('content://doc/', ''));
            return { ok: true };
        }),
    },
}));

const {
    copiarAhora, copiarSiToca, elegirCarpeta, leerCopia, listarCopias, leerEstado,
} = await import('./autoBackupRunner.js');
const { mergeIntoLibrary } = await import('./backup.js');

/** Almacenamiento de ajustes, simulado. */
const makeStorage = () => {
    const datos = new Map();
    return {
        getSetting: vi.fn(async (k) => datos.get(k)),
        setSetting: vi.fn(async (k, v) => { datos.set(k, v); }),
        _datos: datos,
    };
};

const libro = (id, extras = {}) => ({
    id,
    // El modelo guarda el titulo en `name`; `title` no es un campo real y el
    // registro saldria como «Libro sin titulo».
    name: `Libro ${id}`,
    author: 'Autora',
    sourcePath: `/data/books/${id}.epub`,
    progress: 0.42,
    lastLocation: 'epubcfi(/6/14!/4/2/2)',
    lastReadDate: 1_700_000_000_000,
    bookmarks: [{ cfi: 'epubcfi(/6/14!/4/2/4)', note: 'esto me importa', date: 1, color: 'amarillo' }],
    ...extras,
});

describe('la copia y su vuelta', () => {
    let storage;

    beforeEach(async () => {
        carpeta.clear();
        storage = makeStorage();
        await elegirCarpeta(storage);
    });

    it('elegir carpeta la recuerda', async () => {
        const estado = await leerEstado(storage);
        expect(estado.carpeta).toBe('content://tree/copias');
        expect(estado.etiqueta).toBe('Copias');
    });

    it('lo que se copia es lo que vuelve, con progreso y subrayados', async () => {
        // Esto es lo que se perdió: no los ficheros, sino por dónde ibas y lo
        // que habías marcado.
        const books = [libro('a'), libro('b')];
        const hecho = await copiarAhora({ storage, books, ahora: new Date(2026, 8, 21).getTime() });
        expect(hecho.ok).toBe(true);

        const copias = await listarCopias(storage);
        expect(copias).toHaveLength(1);

        const devuelto = await leerCopia(copias[0].uri);
        const resultado = mergeIntoLibrary(devuelto, [], {});

        expect(resultado.books).toHaveLength(2);
        const recuperado = resultado.books.find((b) => b.id === 'a');
        expect(recuperado.progress).toBeCloseTo(0.42);
        expect(recuperado.lastLocation).toBe('epubcfi(/6/14!/4/2/2)');
        expect(recuperado.bookmarks[0].note).toBe('esto me importa');
    });

    it('los títulos con tildes y comillas sobreviven al viaje', async () => {
        // La copia pasa por base64, y `btoa` no admite nada fuera de Latin-1: sin
        // codificar a UTF-8 antes, un título con una tilde rompía la copia entera.
        const books = [libro('c', { name: 'La canción de Aquiles «edición»', author: 'Madeline Miller — 日本' })];
        await copiarAhora({ storage, books });

        const copias = await listarCopias(storage);
        const devuelto = await leerCopia(copias[0].uri);
        const resultado = mergeIntoLibrary(devuelto, [], {});

        expect(resultado.books[0].name).toBe('La canción de Aquiles «edición»');
        expect(resultado.books[0].author).toContain('日本');
    });

    it('la fecha se apunta solo si la copia se escribió', async () => {
        // Apuntarla antes haría que un fallo de escritura pareciera una copia
        // hecha, y nadie volvería a intentarlo hasta el día siguiente.
        const { SharkPicker } = await import('../adapters/SafPicker.js');
        SharkPicker.writeBackup.mockRejectedValueOnce(new Error('sin espacio'));

        const hecho = await copiarAhora({ storage, books: [libro('a')] });
        expect(hecho.ok).toBe(false);

        const estado = await leerEstado(storage);
        expect(estado.ultima).toBe(0);
    });

    it('una copia rota se descubre al leerla, no al machacar la biblioteca', async () => {
        carpeta.set('sharkreader-2026-09-21.json', btoa('{"esto": no es json'));
        const copias = await listarCopias(storage);
        await expect(leerCopia(copias[0].uri)).rejects.toThrow();
    });

    it('la rotación deja solo las últimas y no toca lo ajeno', async () => {
        carpeta.set('tesis-final.json', btoa('{}'));
        // Fechas locales, no UTC: el nombre se forma con el día local, así que en
        // husos al oeste `Date.UTC(…, 1)` daría el nombre del día anterior.
        for (let d = 1; d <= 8; d += 1) {
            await copiarAhora({ storage, books: [libro('a')], ahora: new Date(2026, 8, d).getTime() });
        }

        const nombres = [...carpeta.keys()];
        expect(nombres).toContain('tesis-final.json');
        expect(nombres.filter((n) => n.startsWith('sharkreader-'))).toHaveLength(5);
        // Se van las más antiguas.
        expect(nombres).not.toContain('sharkreader-2026-09-01.json');
        expect(nombres).toContain('sharkreader-2026-09-08.json');
    });
});

describe('copiarSiToca', () => {
    it('sin carpeta no hace nada', async () => {
        carpeta.clear();
        const storage = makeStorage();
        const hecho = await copiarSiToca({ storage, books: [libro('a')] });
        expect(hecho.omitida).toBe(true);
        expect(carpeta.size).toBe(0);
    });

    it('con la biblioteca vacía no escribe encima de las copias buenas', async () => {
        // Es exactamente cómo se pierde todo mientras parece que hay respaldo.
        carpeta.clear();
        const storage = makeStorage();
        await elegirCarpeta(storage);
        await copiarAhora({ storage, books: [libro('a')], ahora: 1_000 });
        const antes = new Map(carpeta);

        const hecho = await copiarSiToca({ storage, books: [], ahora: 1_000 + 40 * 60 * 60 * 1000 });
        expect(hecho.omitida).toBe(true);
        expect([...carpeta.keys()]).toEqual([...antes.keys()]);
    });

    it('pasado el día, copia', async () => {
        carpeta.clear();
        const storage = makeStorage();
        await elegirCarpeta(storage);
        await copiarAhora({ storage, books: [libro('a')], ahora: new Date(2026, 8, 20).getTime() });

        const hecho = await copiarSiToca({ storage, books: [libro('a')], ahora: new Date(2026, 8, 22).getTime() });
        expect(hecho.ok).toBe(true);
        expect(carpeta.size).toBe(2);
    });
});
