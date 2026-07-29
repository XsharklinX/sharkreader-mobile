/**
 * Diccionario y vocabulario.
 *
 * Se consulta un servicio público gratuito y sin clave de API, y **todo lo
 * consultado se guarda en caché local**. Esa caché no es solo velocidad: es lo
 * que hace que las palabras que ya has mirado sigan disponibles sin conexión,
 * que es como se lee en el metro o en un avión.
 *
 * Es la única función de la app que sale a internet aparte de las portadas.
 * Está pensada para que se note: sin conexión el diccionario degrada a lo que
 * hay en caché en lugar de fallar.
 */

const API = 'https://api.dictionaryapi.dev/api/v2/entries';

const CACHE_KEY = 'dictionary-cache';
const VOCAB_KEY = 'vocabulary';

/** Idiomas que el servicio soporta y que tienen sentido para nuestros lectores. */
export const DICTIONARY_LANGS = [
    { id: 'es', label: 'Español' },
    { id: 'en', label: 'Inglés' },
    { id: 'fr', label: 'Francés' },
    { id: 'de', label: 'Alemán' },
    { id: 'it', label: 'Italiano' },
    { id: 'pt', label: 'Portugués' },
];

/**
 * Limpia lo que llega de una selección: puntuación alrededor, comillas y
 * mayúscula inicial de principio de frase.
 */
export const normalizeWord = (raw = '') => String(raw)
    .trim()
    .replace(/^[¿¡"'«»(\[{—–-]+/, '')
    .replace(/[.,;:!?"'«»)\]}—–-]+$/, '')
    .trim()
    .toLowerCase();

/** ¿Merece la pena consultar esto? Una frase entera no es una palabra. */
export const isLookupable = (raw = '') => {
    const word = normalizeWord(raw);
    return word.length >= 2 && word.length <= 40 && !/\s/.test(word);
};

/** Aplana la respuesta del servicio a algo que la interfaz pueda pintar. */
export const parseEntry = (payload) => {
    if (!Array.isArray(payload) || payload.length === 0) return null;
    const entry = payload[0];

    const meanings = (entry.meanings || []).slice(0, 4).map((meaning) => ({
        partOfSpeech: meaning.partOfSpeech || '',
        definitions: (meaning.definitions || []).slice(0, 3).map((definition) => ({
            text: definition.definition || '',
            example: definition.example || '',
        })),
        synonyms: (meaning.synonyms || []).slice(0, 6),
    })).filter((meaning) => meaning.definitions.length > 0);

    if (meanings.length === 0) return null;

    return {
        word: entry.word || '',
        phonetic: entry.phonetic
            || (entry.phonetics || []).find((item) => item.text)?.text
            || '',
        meanings,
    };
};

/**
 * Busca una palabra. Mira primero la caché; si no está y hay red, consulta y
 * guarda el resultado.
 *
 * @param {Object} storage Puerto de almacenamiento.
 * @param {string} raw
 * @param {string} lang
 * @returns {Promise<{entry: Object|null, offline: boolean, cached: boolean}>}
 */
export const lookupWord = async (storage, raw, lang = 'es') => {
    const word = normalizeWord(raw);
    if (!isLookupable(word)) return { entry: null, offline: false, cached: false };

    const cache = (await storage.getSetting(CACHE_KEY)) || {};
    const key = `${lang}:${word}`;

    if (cache[key]) return { entry: cache[key], offline: false, cached: true };

    try {
        const response = await fetch(`${API}/${lang}/${encodeURIComponent(word)}`);
        if (!response.ok) return { entry: null, offline: false, cached: false };

        const entry = parseEntry(await response.json());
        if (!entry) return { entry: null, offline: false, cached: false };

        // La caché se poda para que no crezca sin límite en la base de datos.
        const entries = Object.entries(cache);
        const trimmed = entries.length >= 400
            ? Object.fromEntries(entries.slice(-300))
            : cache;

        await storage.setSetting(CACHE_KEY, { ...trimmed, [key]: entry });
        return { entry, offline: false, cached: false };
    } catch {
        // Sin conexión: no es un error de la app, es una limitación que hay que
        // contar al usuario tal cual.
        return { entry: null, offline: true, cached: false };
    }
};

// ── Vocabulario ──────────────────────────────────────────────────────────────

/**
 * @typedef {Object} VocabularyItem
 * @property {string} word
 * @property {string} lang
 * @property {string} definition  Primera acepción, para poder repasar sin red.
 * @property {string} bookId
 * @property {string} bookName
 * @property {number} addedAt
 */

export const loadVocabulary = async (storage) =>
    (await storage.getSetting(VOCAB_KEY)) || [];

/** Añade una palabra si no estaba ya. Devuelve la lista resultante. */
export const addToVocabulary = async (storage, item) => {
    const list = await loadVocabulary(storage);
    const word = normalizeWord(item.word);
    if (!word) return list;

    if (list.some((existing) => existing.word === word && existing.lang === item.lang)) {
        return list;
    }

    const next = [...list, { ...item, word, addedAt: Date.now() }];
    await storage.setSetting(VOCAB_KEY, next);
    return next;
};

export const removeFromVocabulary = async (storage, word, lang) => {
    const list = await loadVocabulary(storage);
    const next = list.filter((item) => !(item.word === word && item.lang === lang));
    await storage.setSetting(VOCAB_KEY, next);
    return next;
};

/** Exporta el vocabulario a Markdown, agrupado por libro. */
export const vocabularyToMarkdown = (items = []) => {
    if (items.length === 0) return '';

    const byBook = items.reduce((groups, item) => {
        const key = item.bookName || 'Sin libro';
        (groups[key] = groups[key] || []).push(item);
        return groups;
    }, {});

    let output = '# Mi vocabulario — SharkReader\n\n';
    Object.entries(byBook).forEach(([bookName, words]) => {
        output += `## ${bookName}\n\n`;
        words
            .slice()
            .sort((a, b) => a.word.localeCompare(b.word, 'es'))
            .forEach((item) => {
                output += `- **${item.word}**`;
                if (item.definition) output += ` — ${item.definition}`;
                output += '\n';
            });
        output += '\n';
    });
    return output;
};
