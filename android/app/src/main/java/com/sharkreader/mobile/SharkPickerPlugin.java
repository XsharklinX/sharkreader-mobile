package com.sharkreader.mobile;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Selección de libros a través del Storage Access Framework.
 *
 * Android no da rutas de fichero: el usuario elige en el selector del sistema y
 * la app recibe una URI `content://`. Este plugin resuelve dos cosas que desde
 * JavaScript no se pueden hacer:
 *
 *  1. Abrir el selector de documentos y el de carpetas.
 *  2. Copiar cada libro al almacenamiento privado de la app **de forma nativa**,
 *     sin cruzar el puente de Capacitor. Pasar un EPUB de 8 MB a JavaScript en
 *     base64 costaría segundos y triplicaría la memoria; copiarlo con streams de
 *     Java es inmediato.
 *
 * Lo que vuelve a JavaScript es solo metadata más una ruta local, que el WebView
 * puede leer con `Capacitor.convertFileSrc()` + `fetch()`.
 */
@CapacitorPlugin(name = "SharkPicker")
public class SharkPickerPlugin extends Plugin {

    private static final String BOOKS_DIR = "books";

    private static final String[] BOOK_MIME_TYPES = {
        "application/epub+zip",
        "application/pdf",
        "application/octet-stream" // algunos proveedores no etiquetan bien los EPUB
    };

    /** Profundidad máxima al recorrer una carpeta, para no perderse en un árbol enorme. */
    private static final int MAX_TREE_DEPTH = 6;

    /** Tope de ficheros por importación, para que una carpeta gigante no bloquee la app. */
    private static final int MAX_FILES = 2000;

    // ─────────────────────────── métodos expuestos ───────────────────────────

    private static final String[] BACKUP_MIME_TYPES = {
        "application/json",
        "application/zip",
        "text/plain",
        "application/octet-stream"
    };

    @PluginMethod
    public void pickBooks(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, BOOK_MIME_TYPES);
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        startActivityForResult(call, intent, "handlePickedBooks");
    }

    /**
     * Selector para ficheros de backup (.json y .zip).
     *
     * Necesita su propio filtro: con los tipos MIME de libro, un backup aparece
     * en gris y no se puede elegir.
     */
    @PluginMethod
    public void pickBackup(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, BACKUP_MIME_TYPES);
        startActivityForResult(call, intent, "handlePickedBooks");
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        startActivityForResult(call, intent, "handlePickedFolder");
    }

    /** Borra el fichero copiado de un libro que se elimina de la biblioteca. */
    @PluginMethod
    public void deleteBookFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("Falta el parámetro 'path'.");
            return;
        }
        File file = new File(path);
        boolean insideBooksDir = file.getAbsolutePath()
            .startsWith(booksDir().getAbsolutePath() + File.separator);
        if (!insideBooksDir) {
            call.reject("La ruta está fuera del almacenamiento de libros.");
            return;
        }
        JSObject result = new JSObject();
        result.put("deleted", file.exists() && file.delete());
        call.resolve(result);
    }

    // ─────────────────────────── respuestas del sistema ───────────────────────

    @ActivityCallback
    private void handlePickedBooks(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK) {
            call.resolve(emptyResult());
            return;
        }

        Intent data = result.getData();
        List<Uri> uris = new ArrayList<>();
        if (data != null) {
            if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                for (int i = 0; i < count; i++) {
                    uris.add(data.getClipData().getItemAt(i).getUri());
                }
            } else if (data.getData() != null) {
                uris.add(data.getData());
            }
        }

        importUris(call, uris);
    }

    @ActivityCallback
    private void handlePickedFolder(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.resolve(emptyResult());
            return;
        }

        Uri treeUri = result.getData().getData();
        if (treeUri == null) {
            call.resolve(emptyResult());
            return;
        }

        // Sin esto el permiso se pierde al reiniciar la app. No lo necesitamos
        // para la importación en sí (copiamos ahora mismo), pero sí para poder
        // volver a leer la carpeta más adelante.
        try {
            int flags = result.getData().getFlags()
                & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            getContext().getContentResolver().takePersistableUriPermission(treeUri, flags);
        } catch (SecurityException ignored) {
            // Algunos proveedores no conceden permiso persistente; la importación
            // puntual funciona igual.
        }

        importUris(call, collectBooksInTree(treeUri));
    }

    // ─────────────────────────── recorrido y copia ────────────────────────────

    /** Recorre el árbol de la carpeta elegida en anchura y recoge los EPUB y PDF. */
    private List<Uri> collectBooksInTree(Uri treeUri) {
        List<Uri> found = new ArrayList<>();
        Deque<Object[]> queue = new ArrayDeque<>();
        queue.add(new Object[]{DocumentsContract.getTreeDocumentId(treeUri), 0});

        while (!queue.isEmpty() && found.size() < MAX_FILES) {
            Object[] entry = queue.poll();
            String documentId = (String) entry[0];
            int depth = (Integer) entry[1];

            Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, documentId);
            String[] projection = {
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE,
            };

            try (Cursor cursor = getContext().getContentResolver()
                    .query(childrenUri, projection, null, null, null)) {
                if (cursor == null) continue;
                while (cursor.moveToNext() && found.size() < MAX_FILES) {
                    String childId = cursor.getString(0);
                    String name = cursor.getString(1);
                    String mime = cursor.getString(2);

                    if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                        if (depth < MAX_TREE_DEPTH) {
                            queue.add(new Object[]{childId, depth + 1});
                        }
                    } else if (isBook(name, mime)) {
                        found.add(DocumentsContract.buildDocumentUriUsingTree(treeUri, childId));
                    }
                }
            } catch (Exception ignored) {
                // Una carpeta ilegible no debe abortar el resto de la importación.
            }
        }
        return found;
    }

    private boolean isBook(String name, String mime) {
        if (mime != null && (mime.equals("application/epub+zip") || mime.equals("application/pdf"))) {
            return true;
        }
        if (name == null) return false;
        String lower = name.toLowerCase(Locale.ROOT);
        return lower.endsWith(".epub") || lower.endsWith(".pdf");
    }

    /** Copia cada URI al almacenamiento privado y devuelve la lista de resultados. */
    private void importUris(PluginCall call, List<Uri> uris) {
        JSArray books = new JSArray();
        int failed = 0;

        for (Uri uri : uris) {
            try {
                JSObject book = copyToPrivateStorage(uri);
                if (book != null) books.put(book);
                else failed++;
            } catch (Exception e) {
                failed++;
            }
        }

        JSObject result = new JSObject();
        result.put("books", books);
        result.put("failed", failed);
        call.resolve(result);
    }

    private JSObject copyToPrivateStorage(Uri uri) throws Exception {
        String displayName = queryDisplayName(uri);
        String extension = extensionOf(displayName);
        String id = UUID.randomUUID().toString();

        File target = new File(booksDir(), id + "." + extension);
        long bytes = 0;

        try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
            if (input == null) return null;
            try (OutputStream output = new FileOutputStream(target)) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                    bytes += read;
                }
            }
        }

        if (bytes == 0) {
            target.delete();
            return null;
        }

        JSObject book = new JSObject();
        book.put("id", id);
        book.put("name", displayName);
        book.put("type", extension);
        book.put("size", bytes);
        book.put("path", target.getAbsolutePath());
        book.put("uri", uri.toString());
        return book;
    }

    /**
     * Extensión real del fichero. Se respeta la del nombre original en lugar de
     * asumir epub: por aquí también entran los backups (.json y .zip), y
     * renombrarlos a .epub haría muy confuso inspeccionar el almacenamiento.
     */
    private String extensionOf(String displayName) {
        String lower = displayName.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".pdf")) return "pdf";
        if (lower.endsWith(".json")) return "json";
        if (lower.endsWith(".zip")) return "zip";
        return "epub";
    }

    private String queryDisplayName(Uri uri) {
        String[] projection = {OpenableColumns.DISPLAY_NAME};
        try (Cursor cursor = getContext().getContentResolver()
                .query(uri, projection, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (name != null && !name.isEmpty()) return name;
            }
        } catch (Exception ignored) {
        }
        String fallback = uri.getLastPathSegment();
        return fallback != null ? fallback : "libro.epub";
    }

    private File booksDir() {
        File dir = new File(getContext().getFilesDir(), BOOKS_DIR);
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private JSObject emptyResult() {
        JSObject result = new JSObject();
        result.put("books", new JSArray());
        result.put("failed", 0);
        result.put("cancelled", true);
        return result;
    }
}
