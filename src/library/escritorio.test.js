import { describe, it, expect } from 'vitest';
import {
    normalizarDireccion, registroRemoto, fusionarConEscritorio, propuestaDePosicion, haceCuanto,
} from './escritorio.js';
import { buildPortableBackup } from '../core/backupMerge.js';

const backup = (books) => buildPortableBackup({
    books, deletedBooks: {}, categories: [], collections: [], stats: {}, user: {}, workshop: {}, achievements: {}, settingsUpdatedAt: 1,
});

describe('normalizarDireccion', () => {
    it.each([
        ['192.168.1.20:47321/k7f2qa', 'http://192.168.1.20:47321/k7f2qa'],
        ['http://192.168.1.20:47321/K7F2QA/', 'http://192.168.1.20:47321/k7f2qa'],
        [' 192.168.1.20 / k7f2qa ', 'http://192.168.1.20:47321/k7f2qa'],
    ])('«%s» → %s', (entrada, salida) => {
        expect(normalizarDireccion(entrada)).toBe(salida);
    });

    it('sin clave no es una dirección válida', () => {
        expect(normalizarDireccion('192.168.1.20:47321')).toBeNull();
        expect(normalizarDireccion('')).toBeNull();
    });
});

describe('registroRemoto', () => {
    it('empareja por id y, si no, por título y autor', () => {
        const remotos = [{ id: 'x', originalTitle: 'Dune', originalAuthor: 'Frank Herbert', type: 'epub' }];
        expect(registroRemoto({ id: 'x' }, remotos)).toBe(remotos[0]);
        expect(registroRemoto({ id: 'otro', originalTitle: 'Dune', originalAuthor: 'Frank Herbert', type: 'epub' }, remotos)).toBe(remotos[0]);
        expect(registroRemoto({ id: 'otro', originalTitle: 'Cosmos', originalAuthor: 'Carl Sagan', type: 'epub' }, remotos)).toBeNull();
    });
});

describe('fusionarConEscritorio', () => {
    it('trae la posición más reciente del ordenador y no crea libros sin fichero', () => {
        const local = backup([{ id: 'a', originalTitle: 'Dune', originalAuthor: 'F', type: 'epub', progress: 10, lastLocation: 'cfi-a', progressUpdatedAt: 1000, sourcePath: '/movil/a.epub' }]);
        const remoto = backup([
            { id: 'a', originalTitle: 'Dune', originalAuthor: 'F', type: 'epub', progress: 40, lastLocation: 'cfi-b', progressUpdatedAt: 5000, sourcePath: 'C:\\libros\\dune.epub' },
            { id: 'z', originalTitle: 'Solo en el PC', originalAuthor: 'X', type: 'epub', progress: 5, progressUpdatedAt: 5000 },
        ]);
        const fusion = fusionarConEscritorio(local, remoto);
        expect(fusion.books).toHaveLength(1);
        expect(fusion.books[0]).toMatchObject({ progress: 40, lastLocation: 'cfi-b', sourcePath: '/movil/a.epub' });
    });
});

describe('propuestaDePosicion', () => {
    const libro = { id: 'a', progress: 0.1, lastLocation: 'cfi-a', progressUpdatedAt: 1_000_000 };

    it('propone si en el ordenador se leyó después y en otro sitio', () => {
        const p = propuestaDePosicion(libro, { lastLocation: 'cfi-b', progress: 41, progressUpdatedAt: 2_000_000 });
        expect(p).toMatchObject({ cfi: 'cfi-b', progreso: 0.41 });
    });

    it('no molesta si lo último fue aquí', () => {
        expect(propuestaDePosicion(libro, { lastLocation: 'cfi-b', progress: 41, progressUpdatedAt: 900_000 })).toBeNull();
    });

    it('no molesta si es el mismo sitio', () => {
        expect(propuestaDePosicion(libro, { lastLocation: 'cfi-a', progress: 10, progressUpdatedAt: 2_000_000 })).toBeNull();
    });
});

describe('haceCuanto', () => {
    const ahora = 10 * 86_400_000;
    it('lo dice en palabras', () => {
        expect(haceCuanto(ahora - 20 * 60000, ahora)).toBe('hace 20 min');
        expect(haceCuanto(ahora - 3 * 3_600_000, ahora)).toBe('hace 3 h');
        expect(haceCuanto(ahora - 26 * 3_600_000, ahora)).toBe('ayer');
        expect(haceCuanto(ahora - 4 * 86_400_000, ahora)).toBe('hace 4 días');
    });
});
