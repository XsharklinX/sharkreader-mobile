import { extractEpubMeta } from '../core/epubMeta.js';
import { resizeCoverDataUrl } from '../core/coverResize.js';
import { toStoredBookRecord, getBookDedupKey, getBookTitleDedupKey } from '../core/bookModel.js';
import { readBookBlob } from '../adapters/SafPicker.js';

/**
 * Pipeline de importación.
 *
 * El plugin nativo ya ha dejado cada fichero copiado en el almacenamiento
 * privado, así que aquí solo queda leerlo para sacar metadata y portada, y
 * convertirlo en el `BookRecord` que entiende el núcleo compartido.
 *
 * La deduplicación reutiliza las mismas claves que el escritorio: por fichero
 * (`getBookDedupKey`) y por título+autor (`getBookTitleDedupKey`), para que
 * importar dos veces la misma carpeta no duplique la biblioteca.
 */

const stripExtension = (name) => String(name || '').replace(/\.[^/.]+$/, '');

/** Título legible a partir del nombre de fichero, como último recurso. */
const titleFromFileName = (name) =>
    stripExtension(name)
        .replace(/[_]+/g, ' ')
        .replace(/\s*\(\d+\)\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();

const blobToDataUrl = (blob) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });

/** Metadata y portada de un PDF: primera página rasterizada como miniatura. */
const extractPdfMeta = async (blob) => {
    const pdfjs = await import('pdfjs-dist');
    const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

    const buffer = await blob.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buffer }).promise;

    let title = '';
    let author = '';
    try {
        const { info } = await doc.getMetadata();
        title = (info?.Title || '').trim();
        author = (info?.Author || '').trim();
    } catch {
        // Muchos PDF no traen metadata; se cae al nombre de fichero.
    }

    let cover = null;
    try {
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const scale = Math.min(480 / viewport.width, 720 / viewport.height, 2);
        const scaled = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(scaled.width);
        canvas.height = Math.round(scaled.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaled }).promise;
        cover = canvas.toDataURL('image/jpeg', 0.82);
    } catch {
        // Sin portada no pasa nada: la tarjeta usa el color derivado del id.
    }

    const pageCount = doc.numPages;
    await doc.destroy();

    return { title, author, cover, pageCount };
};

/**
 * Convierte un fichero recién copiado en un `BookRecord`.
 * @param {import('../adapters/SafPicker.js').PickedBook} picked
 */
export const buildBookRecord = async (picked) => {
    const blob = await readBookBlob(picked.path);

    let title = '';
    let author = '';
    let cover = null;
    let extra = {};

    if (picked.type === 'pdf') {
        const meta = await extractPdfMeta(blob);
        title = meta.title;
        author = meta.author;
        cover = meta.cover;
        extra = { pageCount: meta.pageCount };
    } else {
        // extractEpubMeta espera algo con forma de File.
        const file = new File([blob], picked.name, { type: 'application/epub+zip' });
        const meta = await extractEpubMeta(file).catch(() => null);
        title = (meta?.title || '').trim();
        author = (meta?.creator || '').trim();
        cover = meta?.coverBase64 || null;
        extra = {
            description: meta?.description || '',
            publisher: meta?.publisher || '',
            // El escritorio guarda las etiquetas como cadena separada por comas,
            // no como array. Se respeta ese formato.
            tags: Array.isArray(meta?.subject) ? meta.subject.slice(0, 8).join(', ') : '',
        };
    }

    const coverBase64 = cover ? await resizeCoverDataUrl(cover) : null;
    const now = Date.now();

    return toStoredBookRecord(
        {
            id: picked.id,
            type: picked.type,
            originalTitle: title || titleFromFileName(picked.name),
            originalAuthor: author,
            coverBase64,
            // En Android sí hay ruta real: es la copia privada de la app, no la
            // ubicación original que eligió el usuario (esa se pierde por diseño).
            sourcePath: picked.path,
            dateAdded: now,
            updatedAt: now,
            ...extra,
        },
        {},
        { includeFile: false }
    );
};

/**
 * Importa una tanda de ficheros ya copiados, descartando los que ya están en la
 * biblioteca.
 *
 * @param {import('../adapters/SafPicker.js').PickedBook[]} picked
 * @param {Object[]} existing  Libros ya presentes.
 * @param {(progress: {done: number, total: number, name: string}) => void} [onProgress]
 */
export const importPickedBooks = async (picked, existing = [], onProgress) => {
    const seenFileKeys = new Set(existing.map(getBookDedupKey));
    const seenTitleKeys = new Set(existing.map(getBookTitleDedupKey));

    const imported = [];
    const duplicates = [];
    const failed = [];

    for (let index = 0; index < picked.length; index++) {
        const item = picked[index];
        onProgress?.({ done: index, total: picked.length, name: item.name });

        try {
            const record = await buildBookRecord(item);

            const fileKey = getBookDedupKey({ ...record, file: { name: item.name, size: item.size } });
            const titleKey = getBookTitleDedupKey(record);

            if (seenFileKeys.has(fileKey) || seenTitleKeys.has(titleKey)) {
                duplicates.push({ ...item, title: record.originalTitle });
                continue;
            }

            seenFileKeys.add(fileKey);
            seenTitleKeys.add(titleKey);
            imported.push({ ...record, fileSize: item.size });
        } catch (error) {
            failed.push({ name: item.name, reason: error?.message || 'error desconocido' });
        }
    }

    onProgress?.({ done: picked.length, total: picked.length, name: '' });
    return { imported, duplicates, failed };
};
