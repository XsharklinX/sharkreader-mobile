import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    normalizeWord, isLookupable, parseEntry, lookupWord,
    addToVocabulary, removeFromVocabulary, loadVocabulary, vocabularyToMarkdown,
} from './dictionary.js';

/** Almacenamiento de mentira, con la misma forma que el puerto real. */
const fakeStorage = () => {
    const data = new Map();
    return {
        getSetting: async (key) => data.get(key) ?? null,
        setSetting: async (key, value) => { data.set(key, value); },
        _data: data,
    };
};

const apiPayload = [{
    word: 'libro',
    phonetic: '/ˈli.bɾo/',
    meanings: [{
        partOfSpeech: 'sustantivo',
        definitions: [
            { definition: 'Conjunto de hojas encuadernadas.', example: 'Leí un libro.' },
            { definition: 'Obra literaria.' },
        ],
        synonyms: ['tomo', 'volumen'],
    }],
}];

beforeEach(() => { vi.unstubAllGlobals(); });

describe('limpieza de la palabra', () => {
    it('quita la puntuación que arrastra una selección', () => {
        expect(normalizeWord('«palabra».')).toBe('palabra');
        expect(normalizeWord('¿Cómo?')).toBe('cómo');
        expect(normalizeWord('  texto,  ')).toBe('texto');
    });

    it('pasa a minúsculas para que la caché no duplique entradas', () => {
        expect(normalizeWord('Palabra')).toBe('palabra');
    });

    it('conserva los acentos y la eñe', () => {
        expect(normalizeWord('Mañana')).toBe('mañana');
    });
});

describe('qué se puede consultar', () => {
    it('acepta una palabra suelta', () => {
        expect(isLookupable('casa')).toBe(true);
    });

    it('rechaza frases: el diccionario es de palabras', () => {
        expect(isLookupable('una frase entera')).toBe(false);
    });

    it('rechaza lo demasiado corto o demasiado largo', () => {
        expect(isLookupable('a')).toBe(false);
        expect(isLookupable('x'.repeat(60))).toBe(false);
    });

    it('rechaza una selección vacía', () => {
        expect(isLookupable('   ')).toBe(false);
    });
});

describe('lectura de la respuesta', () => {
    it('aplana la respuesta a algo pintable', () => {
        const entry = parseEntry(apiPayload);
        expect(entry.word).toBe('libro');
        expect(entry.phonetic).toBe('/ˈli.bɾo/');
        expect(entry.meanings[0].definitions).toHaveLength(2);
        expect(entry.meanings[0].synonyms).toContain('tomo');
    });

    it('una respuesta vacía o inesperada devuelve null en vez de romper', () => {
        expect(parseEntry([])).toBeNull();
        expect(parseEntry(null)).toBeNull();
        expect(parseEntry([{ word: 'x', meanings: [] }])).toBeNull();
    });

    it('recorta para que la ficha quepa en pantalla', () => {
        const many = [{
            word: 'x',
            meanings: Array.from({ length: 9 }, () => ({
                partOfSpeech: 'n',
                definitions: Array.from({ length: 9 }, (_, i) => ({ definition: `d${i}` })),
            })),
        }];
        const entry = parseEntry(many);
        expect(entry.meanings.length).toBeLessThanOrEqual(4);
        expect(entry.meanings[0].definitions.length).toBeLessThanOrEqual(3);
    });
});

describe('búsqueda con caché', () => {
    it('consulta el servicio la primera vez y guarda el resultado', async () => {
        const storage = fakeStorage();
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => apiPayload })));

        const result = await lookupWord(storage, 'libro', 'es');

        expect(result.entry.word).toBe('libro');
        expect(result.cached).toBe(false);
        expect(fetch).toHaveBeenCalledOnce();
    });

    it('la segunda vez sale de la caché y no toca la red', async () => {
        const storage = fakeStorage();
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => apiPayload })));

        await lookupWord(storage, 'libro', 'es');
        const second = await lookupWord(storage, 'Libro.', 'es');

        expect(second.cached).toBe(true);
        expect(second.entry.word).toBe('libro');
        expect(fetch).toHaveBeenCalledOnce();
    });

    it('sin conexión lo dice, en lugar de fallar en silencio', async () => {
        const storage = fakeStorage();
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin red'); }));

        const result = await lookupWord(storage, 'libro', 'es');
        expect(result.offline).toBe(true);
        expect(result.entry).toBeNull();
    });

    it('sin conexión, lo ya consultado sigue disponible', async () => {
        const storage = fakeStorage();
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => apiPayload })));
        await lookupWord(storage, 'libro', 'es');

        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin red'); }));
        const offline = await lookupWord(storage, 'libro', 'es');

        expect(offline.entry.word).toBe('libro');
        expect(offline.cached).toBe(true);
    });

    it('una palabra que no existe no se cachea como resultado válido', async () => {
        const storage = fakeStorage();
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));

        const result = await lookupWord(storage, 'asdfghjk', 'es');
        expect(result.entry).toBeNull();
        expect(await storage.getSetting('dictionary-cache')).toBeNull();
    });

    it('no consulta lo que no es una palabra', async () => {
        const storage = fakeStorage();
        vi.stubGlobal('fetch', vi.fn());

        await lookupWord(storage, 'esto es una frase larga', 'es');
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe('vocabulario', () => {
    const item = { word: 'Libro.', lang: 'es', definition: 'Obra.', bookId: '1', bookName: 'Dune' };

    it('guarda una palabra ya normalizada', async () => {
        const storage = fakeStorage();
        const list = await addToVocabulary(storage, item);
        expect(list[0].word).toBe('libro');
        expect(list[0].addedAt).toBeGreaterThan(0);
    });

    it('no duplica la misma palabra en el mismo idioma', async () => {
        const storage = fakeStorage();
        await addToVocabulary(storage, item);
        const list = await addToVocabulary(storage, { ...item, word: 'libro' });
        expect(list).toHaveLength(1);
    });

    it('la misma palabra en otro idioma sí se guarda aparte', async () => {
        const storage = fakeStorage();
        await addToVocabulary(storage, item);
        const list = await addToVocabulary(storage, { ...item, lang: 'en' });
        expect(list).toHaveLength(2);
    });

    it('quita una palabra', async () => {
        const storage = fakeStorage();
        await addToVocabulary(storage, item);
        const list = await removeFromVocabulary(storage, 'libro', 'es');
        expect(list).toHaveLength(0);
    });

    it('persiste entre lecturas', async () => {
        const storage = fakeStorage();
        await addToVocabulary(storage, item);
        expect(await loadVocabulary(storage)).toHaveLength(1);
    });

    it('exporta a Markdown agrupando por libro', async () => {
        const markdown = vocabularyToMarkdown([
            { word: 'zeta', lang: 'es', definition: 'última letra', bookName: 'Dune' },
            { word: 'alfa', lang: 'es', definition: 'primera letra', bookName: 'Dune' },
            { word: 'otra', lang: 'es', definition: '', bookName: 'Sapiens' },
        ]);

        expect(markdown).toContain('## Dune');
        expect(markdown).toContain('## Sapiens');
        expect(markdown).toContain('- **alfa** — primera letra');
        // Alfabético dentro de cada libro
        expect(markdown.indexOf('alfa')).toBeLessThan(markdown.indexOf('zeta'));
    });

    it('un vocabulario vacío exporta cadena vacía, no una cabecera huérfana', () => {
        expect(vocabularyToMarkdown([])).toBe('');
    });
});
