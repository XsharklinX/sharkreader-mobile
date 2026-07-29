import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

/**
 * Almacenamiento sobre SQLite.
 *
 * El binario de cada libro NO vive aquí: el plugin nativo lo copia al
 * almacenamiento privado de la app y en la base de datos solo queda la ruta.
 * Eso evita el problema clásico de meter blobs de varios MB en la capa de
 * persistencia del WebView.
 *
 * Forma de los registros: se guarda el `BookRecord` completo del escritorio en
 * la columna `data`, en JSON, y aparte se extraen las columnas por las que
 * realmente se consulta (título, autor, progreso, favorito…). Así el núcleo
 * compartido sigue viendo exactamente la misma estructura que en Electron
 * —`toStoredBookRecord` y `hydrateStoredBook` funcionan sin cambios— y a la vez
 * hay índices de verdad para ordenar y filtrar una biblioteca grande.
 */

const DB_NAME = 'sharkreader';
const DB_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS books (
    id             TEXT PRIMARY KEY NOT NULL,
    title          TEXT    NOT NULL DEFAULT '',
    author         TEXT    NOT NULL DEFAULT '',
    type           TEXT    NOT NULL DEFAULT 'epub',
    tags           TEXT    NOT NULL DEFAULT '',
    series         TEXT    NOT NULL DEFAULT '',
    series_index   REAL    NOT NULL DEFAULT 0,
    progress       REAL    NOT NULL DEFAULT 0,
    is_fav         INTEGER NOT NULL DEFAULT 0,
    is_finished    INTEGER NOT NULL DEFAULT 0,
    rating         INTEGER NOT NULL DEFAULT 0,
    date_added     INTEGER NOT NULL DEFAULT 0,
    last_read_date INTEGER NOT NULL DEFAULT 0,
    updated_at     INTEGER NOT NULL DEFAULT 0,
    file_path      TEXT,
    file_size      INTEGER NOT NULL DEFAULT 0,
    data           TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_books_last_read  ON books (last_read_date DESC);
CREATE INDEX IF NOT EXISTS idx_books_date_added ON books (date_added DESC);
CREATE INDEX IF NOT EXISTS idx_books_title      ON books (title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_books_author     ON books (author COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_books_series     ON books (series COLLATE NOCASE, series_index);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

-- Tombstones de borrado: el merge de backups los necesita para que un libro
-- eliminado en un dispositivo no reaparezca al sincronizar con otro.
CREATE TABLE IF NOT EXISTS deleted_books (
    id         TEXT PRIMARY KEY NOT NULL,
    deleted_at INTEGER NOT NULL
);

-- Índice de contenido para buscar dentro de todos los libros a la vez.
--
-- Es una tabla FTS5 «externa»: no guarda el texto para devolverlo, solo lo
-- indexa. Sin content='' SQLite guardaría además una copia íntegra de todos
-- los libros, y una biblioteca de doscientos títulos pasaría de unos pocos MB
-- de índice a varios cientos duplicando lo que ya está en disco.
--
-- Se indexa por capítulo y no por libro entero para poder decir en qué parte
-- está lo que buscas: un resultado que solo dijera «está en este libro» dejaría
-- el trabajo a medias.
--
-- El tokenizador unicode61 con remove_diacritics 2 hace que «cancion» encuentre
-- «canción». Sin ello habría que escribir los acentos exactos, que en una barra
-- de búsqueda de móvil no va a pasar.
CREATE VIRTUAL TABLE IF NOT EXISTS book_content USING fts5(
    book_id UNINDEXED,
    href    UNINDEXED,
    chapter,
    body,
    content='',
    tokenize="unicode61 remove_diacritics 2"
);

-- Qué libros están indexados y con qué versión del indexador. Sin esto habría
-- que releer cada libro en cada arranque para saberlo.
CREATE TABLE IF NOT EXISTS content_index (
    book_id    TEXT PRIMARY KEY NOT NULL,
    indexed_at INTEGER NOT NULL,
    version    INTEGER NOT NULL DEFAULT 1,
    chapters   INTEGER NOT NULL DEFAULT 0
);
`;

const toRow = (record) => ({
    id: record.id,
    title: record.customTitle || record.originalTitle || '',
    author: record.customAuthor || record.originalAuthor || '',
    type: record.type || 'epub',
    tags: record.tags || '',
    series: record.series || '',
    series_index: record.seriesIndex || 0,
    progress: record.progress || 0,
    is_fav: record.isFav ? 1 : 0,
    is_finished: record.isFinished ? 1 : 0,
    rating: record.rating || 0,
    date_added: record.dateAdded || Date.now(),
    last_read_date: record.lastReadDate || 0,
    updated_at: record.updatedAt || Date.now(),
    file_path: record.sourcePath || null,
    file_size: record.fileSize || 0,
    data: JSON.stringify(record),
});

const UPSERT = `
INSERT INTO books (
    id, title, author, type, tags, series, series_index, progress,
    is_fav, is_finished, rating, date_added, last_read_date, updated_at,
    file_path, file_size, data
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
    title=excluded.title, author=excluded.author, type=excluded.type,
    tags=excluded.tags, series=excluded.series, series_index=excluded.series_index,
    progress=excluded.progress, is_fav=excluded.is_fav,
    is_finished=excluded.is_finished, rating=excluded.rating,
    date_added=excluded.date_added, last_read_date=excluded.last_read_date,
    updated_at=excluded.updated_at, file_path=excluded.file_path,
    file_size=excluded.file_size, data=excluded.data
`;

const rowValues = (row) => [
    row.id, row.title, row.author, row.type, row.tags, row.series, row.series_index,
    row.progress, row.is_fav, row.is_finished, row.rating, row.date_added,
    row.last_read_date, row.updated_at, row.file_path, row.file_size, row.data,
];

export const createSqliteStorage = () => {
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    let db = null;
    let initPromise = null;

    const requireDb = () => {
        if (!db) throw new Error('[storage] init() no se ha llamado todavía.');
        return db;
    };

    const parseRow = (row) => {
        try {
            return JSON.parse(row.data);
        } catch {
            // Un registro corrupto no debe tumbar la biblioteca entera:
            // se devuelve lo que sí se puede reconstruir de las columnas.
            return {
                id: row.id,
                originalTitle: row.title,
                originalAuthor: row.author,
                type: row.type,
                progress: row.progress,
                dateAdded: row.date_added,
                sourcePath: row.file_path,
                corrupt: true,
            };
        }
    };

    return {
        /**
         * Abre la base de datos. Idempotente y seguro de llamar en paralelo:
         * varios hooks arrancan a la vez (biblioteca, estadísticas) y el primero
         * que llega crea la conexión mientras los demás esperan al mismo
         * promise. Sin esto, el segundo en llegar encontraba `db` todavía a null
         * y sus lecturas fallaban — que es como se perdían las metas y las
         * preferencias en cada arranque en frío.
         */
        init() {
            if (initPromise) return initPromise;

            initPromise = (async () => {
                // Una conexión que quedó abierta de una sesión anterior impide
                // volver a crearla; el plugin expone justo esta comprobación.
                const check = await sqlite.checkConnectionsConsistency().catch(() => ({ result: false }));
                const isOpen = await sqlite.isConnection(DB_NAME, false).catch(() => ({ result: false }));

                if (check.result && isOpen.result) {
                    db = await sqlite.retrieveConnection(DB_NAME, false);
                } else {
                    db = await sqlite.createConnection(DB_NAME, false, 'no-encryption', DB_VERSION, false);
                }

                await db.open();
                await db.execute(SCHEMA);
            })();

            // Si la apertura falla, no se cachea el fallo: un reintento posterior
            // debe poder volver a intentarlo.
            initPromise.catch(() => { initPromise = null; });

            return initPromise;
        },

        async listBooks() {
            const result = await requireDb().query(
                'SELECT * FROM books ORDER BY last_read_date DESC, date_added DESC'
            );
            return (result.values || []).map(parseRow);
        },

        async getBook(id) {
            const result = await requireDb().query('SELECT * FROM books WHERE id = ?', [id]);
            const row = (result.values || [])[0];
            return row ? parseRow(row) : null;
        },

        async putBook(record) {
            if (!record?.id) return;
            await requireDb().run(UPSERT, rowValues(toRow(record)));
        },

        /** Inserta muchos libros en una sola transacción — importar 100 libros
         *  con 100 transacciones separadas es un orden de magnitud más lento. */
        async putBooks(records = []) {
            const valid = records.filter((record) => record?.id);
            if (!valid.length) return;
            await requireDb().executeSet(
                valid.map((record) => ({ statement: UPSERT, values: rowValues(toRow(record)) })),
                true
            );
        },

        async deleteBook(id) {
            const connection = requireDb();
            await connection.run('DELETE FROM books WHERE id = ?', [id]);
            await connection.run(
                'INSERT OR REPLACE INTO deleted_books (id, deleted_at) VALUES (?, ?)',
                [id, Date.now()]
            );
            // El índice de contenido se borra con el libro. FTS5 no tiene clave
            // foránea, así que si no se limpia aquí, buscar seguiría devolviendo
            // fragmentos de un libro que ya no existe.
            await connection.executeSet([
                { statement: 'DELETE FROM book_content WHERE book_id = ?', values: [id] },
                { statement: 'DELETE FROM content_index WHERE book_id = ?', values: [id] },
            ]);
        },

        async listDeletedBooks() {
            const result = await requireDb().query('SELECT * FROM deleted_books');
            return Object.fromEntries((result.values || []).map((row) => [row.id, row.deleted_at]));
        },

        async getSetting(key) {
            const result = await requireDb().query('SELECT value FROM settings WHERE key = ?', [key]);
            const row = (result.values || [])[0];
            if (!row) return null;
            try {
                return JSON.parse(row.value);
            } catch {
                return null;
            }
        },

        async setSetting(key, value) {
            await requireDb().run(
                'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
                [key, JSON.stringify(value)]
            );
        },

        async countBooks() {
            const result = await requireDb().query('SELECT COUNT(*) AS total FROM books');
            return (result.values || [])[0]?.total || 0;
        },

        // ── Índice de contenido (FTS5) ───────────────────────────────────────

        /**
         * Guarda el índice de un libro, reemplazando el anterior si lo hubiera.
         *
         * Va en una sola transacción: si se corta a medias —cerrar la app
         * durante la indexación es lo normal— no puede quedar medio libro
         * indexado y marcado como completo, porque entonces buscar devolvería
         * resultados incompletos sin avisar de nada.
         */
        async indexBookContent(bookId, rows, version) {
            const connection = requireDb();
            const statements = [
                { statement: 'DELETE FROM book_content WHERE book_id = ?', values: [bookId] },
                ...rows.map((row) => ({
                    statement: 'INSERT INTO book_content (book_id, href, chapter, body) VALUES (?,?,?,?)',
                    values: [row.bookId, row.href, row.chapter, row.body],
                })),
                {
                    statement: `INSERT OR REPLACE INTO content_index (book_id, indexed_at, version, chapters)
                                VALUES (?,?,?,?)`,
                    values: [bookId, Date.now(), version, rows.length],
                },
            ];
            await connection.executeSet(statements);
        },

        /** Libros ya indexados y con qué versión, para saber qué falta. */
        async indexedBooks() {
            const result = await requireDb().query('SELECT book_id, version FROM content_index');
            return Object.fromEntries(
                (result.values || []).map((row) => [row.book_id, row.version])
            );
        },

        async removeBookContent(bookId) {
            const connection = requireDb();
            await connection.executeSet([
                { statement: 'DELETE FROM book_content WHERE book_id = ?', values: [bookId] },
                { statement: 'DELETE FROM content_index WHERE book_id = ?', values: [bookId] },
            ]);
        },

        /**
         * Busca en el contenido de todos los libros.
         *
         * `snippet()` devuelve el trozo con las coincidencias marcadas, que es
         * lo que hace la lista útil: sin él habría que abrir cada resultado
         * para saber si es el que buscabas.
         *
         * El orden es por `rank`, la relevancia de FTS5, no por fecha ni
         * título: si buscas una frase, lo que quieres arriba es donde mejor
         * encaja.
         */
        async searchContent(ftsQuery, limit = 60) {
            if (!ftsQuery) return [];
            try {
                const result = await requireDb().query(
                    `SELECT c.book_id, c.href, c.chapter,
                            snippet(book_content, 3, '«', '»', '…', 12) AS excerpt,
                            b.title, b.author, b.type
                       FROM book_content c
                       JOIN books b ON b.id = c.book_id
                      WHERE book_content MATCH ?
                      ORDER BY rank
                      LIMIT ?`,
                    [ftsQuery, limit]
                );
                return (result.values || []).map((row) => ({
                    bookId: row.book_id,
                    href: row.href,
                    chapter: row.chapter,
                    excerpt: row.excerpt,
                    title: row.title,
                    author: row.author,
                    type: row.type,
                }));
            } catch {
                // Una consulta que FTS5 no entiende no puede tumbar la
                // búsqueda: se devuelve vacío y la pantalla lo cuenta.
                return [];
            }
        },

        // El binario lo gestiona el plugin nativo; estos dos métodos existen para
        // cumplir el puerto y dejar claro dónde vive cada cosa.
        async readBookFile() {
            throw new Error('[storage] usa readBookBlob() de SafPicker: los binarios no pasan por SQLite.');
        },
        async writeBookFile() {
            throw new Error('[storage] el plugin nativo copia el fichero durante la importación.');
        },
    };
};
