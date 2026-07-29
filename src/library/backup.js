import JSZip from 'jszip';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { validateBackupData, BackupValidationError } from '../core/backupValidation.js';
import { migrateBackupToLatest } from '../core/backupMigrations.js';
import { mergeBackupData, buildPortableBackup } from '../core/backupMerge.js';
import { hydrateStoredBook, toStoredBookRecord } from '../core/bookModel.js';
import {
    buildAnnotationEntries,
    groupAnnotationsByBook,
    buildAnnotationExportContent,
    buildAnnotationExportFileName,
} from '../core/annotationExport.js';

/**
 * Backup portable: el puente con la versión de escritorio.
 *
 * Toda la lógica difícil —validar, migrar de esquema, fusionar campo a campo
 * respetando timestamps y tombstones— ya está resuelta y probada en el núcleo
 * compartido. Aquí solo se mueven bytes y se decide qué hacer con el resultado.
 */

const BACKUP_JSON = 'sharkreader-backup.json';

/** Lee el backup de un fichero suelto (.json) o de un ZIP completo. */
export const parseBackupFile = async (blob, fileName = '') => {
    const isZip = /\.zip$/i.test(fileName) || blob.type === 'application/zip';

    let raw;
    if (isZip) {
        const zip = await JSZip.loadAsync(blob);
        // El ZIP trae varios ficheros de conveniencia, pero la fuente de verdad
        // es siempre sharkreader-backup.json.
        const entry = zip.file(BACKUP_JSON)
            || zip.file(new RegExp(`${BACKUP_JSON}$`))?.[0];
        if (!entry) {
            throw new Error(`El ZIP no contiene ${BACKUP_JSON}.`);
        }
        raw = JSON.parse(await entry.async('string'));
    } else {
        raw = JSON.parse(await blob.text());
    }

    // Nunca confiar en un backup sin validarlo: puede venir de otra versión,
    // estar truncado o haber sido editado a mano.
    const migrated = migrateBackupToLatest(raw);
    return validateBackupData(migrated);
};

/**
 * Fusiona un backup importado con la biblioteca actual.
 *
 * No sustituye: fusiona. Si el móvil ya tiene libros con progreso, el merge del
 * núcleo compara timestamps por grupo de campos (progreso, metadata,
 * anotaciones) y se queda con lo más reciente de cada lado.
 *
 * @returns {{books: Object[], stats: Object, summary: Object}}
 */
export const mergeIntoLibrary = (incoming, currentBooks = [], currentStats = {}) => {
    const local = buildPortableBackup({
        books: currentBooks.map((book) => toStoredBookRecord(book, {}, { includeFile: false })),
        deletedBooks: {},
        categories: [],
        collections: [],
        stats: currentStats,
        user: {},
        workshop: {},
        achievements: {},
        settingsUpdatedAt: Date.now(),
    });

    const merged = mergeBackupData(local, incoming);
    const before = new Set(currentBooks.map((book) => book.id));

    return {
        books: merged.books.map(hydrateStoredBook),
        stats: merged.stats || currentStats,
        achievements: merged.achievements || {},
        summary: {
            total: merged.books.length,
            added: merged.books.filter((book) => !before.has(book.id)).length,
            updated: merged.books.filter((book) => before.has(book.id)).length,
        },
    };
};

/**
 * Los libros importados de un backup de escritorio llegan sin fichero: el ZIP
 * completo sí lo trae, pero el JSON suelto no. Un libro sin binario se puede
 * consultar (progreso, anotaciones, portada) pero no abrir.
 */
export const isBookReadable = (book) => Boolean(book.sourcePath);

// Pendiente (v0.6.0): extraer los EPUB/PDF que trae un ZIP completo y
// emparejarlos con sus registros. Hoy el ZIP se usa solo para leer
// `sharkreader-backup.json`, así que un backup completo restaura metadata,
// progreso y anotaciones, pero los ficheros hay que importarlos aparte.
// El emparejamiento fiable entre `books/*.epub` del ZIP y cada registro
// necesita una clave que hoy no viaja en el backup.

/** Construye el backup portable de esta app, listo para compartir. */
export const buildBackup = (books, stats = {}, achievements = {}) =>
    buildPortableBackup({
        books: books.map((book) => toStoredBookRecord(book, {}, { includeFile: false })),
        deletedBooks: {},
        categories: [],
        collections: [],
        stats,
        user: {},
        workshop: {},
        achievements,
        settingsUpdatedAt: Date.now(),
    });

/**
 * Escribe un fichero de texto en el almacenamiento de la app y abre el diálogo
 * de compartir de Android. Es el equivalente móvil de "guardar como": el
 * usuario elige si va a Drive, a un correo o a otra app.
 */
export const shareTextFile = async (fileName, content, title) => {
    await Filesystem.writeFile({
        path: fileName,
        data: content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
        recursive: true,
    });
    const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
    await Share.share({ title, url: uri, dialogTitle: title });
};

/** Exporta las anotaciones de un libro (o de toda la biblioteca) a Markdown. */
export const exportAnnotations = async (books, bookId = null) => {
    const entries = buildAnnotationEntries(books, { bookId });
    if (entries.length === 0) {
        throw new Error('No hay anotaciones que exportar.');
    }

    const grouped = groupAnnotationsByBook(entries);
    const { content, ext } = buildAnnotationExportContent(grouped, 'md', bookId || 'library');
    const fileName = `${buildAnnotationExportFileName(grouped)}.${ext || 'md'}`;

    await shareTextFile(fileName, content, 'Exportar anotaciones');
    return { fileName, count: entries.length };
};

export { BackupValidationError };
