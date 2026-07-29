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
        async init() {
            if (db) return;

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
