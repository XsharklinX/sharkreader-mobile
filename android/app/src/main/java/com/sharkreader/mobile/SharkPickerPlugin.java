package com.sharkreader.mobile;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
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
        "application/x-cbz",
        "application/vnd.comicbook+zip",
        "text/plain",
        "text/markdown",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
        "application/zip",
        "application/octet-stream" // muchos proveedores no etiquetan bien EPUB ni CBZ
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

    /**
     * Selector de imagen para portadas propias.
     *
     * Devuelve la imagen en base64 en lugar de copiarla al almacenamiento: una
     * portada ya redimensionada son unas decenas de KB, y guardarla dentro del
     * registro del libro es lo que hace que viaje en el backup.
     */
    @PluginMethod
    public void pickImage(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        startActivityForResult(call, intent, "handlePickedImage");
    }

    @ActivityCallback
    private void handlePickedImage(PluginCall call, ActivityResult result) {
        if (call == null) return;

        JSObject payload = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            payload.put("dataUrl", null);
            call.resolve(payload);
            return;
        }

        Uri uri = result.getData().getData();
        if (uri == null) {
            payload.put("dataUrl", null);
            call.resolve(payload);
            return;
        }

        try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
            if (input == null) throw new Exception("no se pudo abrir la imagen");

            java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
            byte[] chunk = new byte[32 * 1024];
            int read;
            long total = 0;
            while ((read = input.read(chunk)) != -1) {
                total += read;
                // Tope de 12 MB: una foto de galería puede ser enorme y aquí
                // solo se necesita una portada.
                if (total > 12L * 1024 * 1024) throw new Exception("la imagen es demasiado grande");
                buffer.write(chunk, 0, read);
            }

            String mime = getContext().getContentResolver().getType(uri);
            if (mime == null) mime = "image/jpeg";
            String base64 = android.util.Base64.encodeToString(
                buffer.toByteArray(), android.util.Base64.NO_WRAP
            );

            payload.put("dataUrl", "data:" + mime + ";base64," + base64);
            call.resolve(payload);
        } catch (Exception error) {
            call.reject("No se pudo leer la imagen: " + error.getMessage());
        }
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        startActivityForResult(call, intent, "handlePickedFolder");
    }

    // ── Carpeta de copias de seguridad ───────────────────────────────────────
    //
    // **Por qué una carpeta elegida por el usuario y no un directorio de la app.**
    // Una copia guardada dentro de la app no protege de lo único de lo que hay
    // que protegerse: borrar los datos de la app o desinstalarla se lleva la copia
    // junto con lo que copiaba. Una carpeta del almacenamiento compartido sí
    // sobrevive, y con el Storage Access Framework no hace falta pedir ningún
    // permiso de almacenamiento: el usuario elige una vez, Android recuerda el
    // permiso y la app solo puede tocar esa carpeta.

    /**
     * Pide al usuario una carpeta donde guardar las copias, y **retiene el
     * permiso**.
     *
     * `takePersistableUriPermission` es lo que hace que el acceso siga siendo
     * válido después de reiniciar el teléfono. Sin esa llamada la URI serviría
     * solo durante esta ejecución, que es justo cuando no se necesita.
     */
    @PluginMethod
    public void pickBackupFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "handleBackupFolder");
    }

    @ActivityCallback
    private void handleBackupFolder(PluginCall call, ActivityResult result) {
        if (call == null) return;

        JSObject out = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            out.put("uri", null);
            out.put("cancelled", true);
            call.resolve(out);
            return;
        }

        Uri treeUri = result.getData().getData();
        try {
            getContext().getContentResolver().takePersistableUriPermission(
                treeUri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            );
        } catch (Exception ignored) {
            // Algunos proveedores no admiten permiso persistente. Se sigue: la
            // carpeta servirá al menos mientras dure esta sesión, y al volver se
            // pedirá otra vez.
        }

        out.put("uri", treeUri.toString());
        out.put("label", readTreeName(treeUri));
        call.resolve(out);
    }

    /** ¿Seguimos teniendo permiso sobre esta carpeta? */
    @PluginMethod
    public void hasBackupFolder(PluginCall call) {
        String uri = call.getString("uri");
        JSObject out = new JSObject();
        out.put("ok", uri != null && holdsPermission(Uri.parse(uri)));
        call.resolve(out);
    }

    /**
     * Escribe una copia en la carpeta elegida.
     *
     * Si ya había un fichero con ese nombre se borra antes: el proveedor de
     * documentos, al crear uno repetido, no sobrescribe sino que añade «(1)» al
     * nombre, y en pocas semanas la carpeta tendría cincuenta copias con nombres
     * inútiles en vez de las que se quieren conservar.
     */
    @PluginMethod
    public void writeBackup(PluginCall call) {
        String tree = call.getString("uri");
        String name = call.getString("name");
        String data = call.getString("data");
        if (tree == null || name == null || data == null) {
            call.reject("Faltan datos para guardar la copia.");
            return;
        }

        try {
            Uri treeUri = Uri.parse(tree);
            Uri dir = DocumentsContract.buildDocumentUriUsingTree(
                treeUri, DocumentsContract.getTreeDocumentId(treeUri));

            Uri existing = findInTree(treeUri, name);
            if (existing != null) {
                try {
                    DocumentsContract.deleteDocument(getContext().getContentResolver(), existing);
                } catch (Exception ignored) {
                    // Si no se puede borrar, se escribirá con nombre nuevo.
                }
            }

            Uri file = DocumentsContract.createDocument(
                getContext().getContentResolver(), dir, "application/json", name);
            if (file == null) {
                call.reject("La carpeta de copias no admite escritura.");
                return;
            }

            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            try (OutputStream out = getContext().getContentResolver().openOutputStream(file, "wt")) {
                if (out == null) throw new Exception("sin flujo de escritura");
                out.write(bytes);
            }

            JSObject result = new JSObject();
            result.put("uri", file.toString());
            result.put("size", bytes.length);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No se pudo guardar la copia: " + error.getMessage());
        }
    }

    /** Las copias que hay en la carpeta, de la más reciente a la más antigua. */
    @PluginMethod
    public void listBackups(PluginCall call) {
        String tree = call.getString("uri");
        JSArray files = new JSArray();
        if (tree == null) {
            JSObject out = new JSObject();
            out.put("files", files);
            call.resolve(out);
            return;
        }

        try {
            Uri treeUri = Uri.parse(tree);
            Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(
                treeUri, DocumentsContract.getTreeDocumentId(treeUri));

            List<JSObject> found = new ArrayList<>();
            try (Cursor cursor = getContext().getContentResolver().query(children, new String[] {
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_SIZE,
                DocumentsContract.Document.COLUMN_LAST_MODIFIED,
            }, null, null, null)) {
                while (cursor != null && cursor.moveToNext()) {
                    String name = cursor.getString(1);
                    if (name == null || !name.toLowerCase(Locale.ROOT).endsWith(".json")) continue;
                    JSObject item = new JSObject();
                    item.put("uri", DocumentsContract.buildDocumentUriUsingTree(treeUri, cursor.getString(0)).toString());
                    item.put("name", name);
                    item.put("size", cursor.getLong(2));
                    item.put("modified", cursor.getLong(3));
                    found.add(item);
                }
            }

            // Ordenadas por fecha, la más reciente primero: al restaurar, la de
            // arriba es la que el usuario quiere.
            found.sort((a, b) -> Long.compare(b.optLong("modified", 0L), a.optLong("modified", 0L)));
            for (JSObject item : found) files.put(item);

            JSObject out = new JSObject();
            out.put("files", files);
            call.resolve(out);
        } catch (Exception error) {
            call.reject("No se pudo leer la carpeta de copias: " + error.getMessage());
        }
    }

    /** Devuelve el contenido de una copia, en base64. */
    @PluginMethod
    public void readBackup(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) {
            call.reject("Falta la copia que leer.");
            return;
        }

        try (InputStream in = getContext().getContentResolver().openInputStream(Uri.parse(uri))) {
            if (in == null) throw new Exception("sin flujo de lectura");
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int read;
            while ((read = in.read(chunk)) > 0) buffer.write(chunk, 0, read);

            JSObject out = new JSObject();
            out.put("data", Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP));
            call.resolve(out);
        } catch (Exception error) {
            call.reject("No se pudo leer la copia: " + error.getMessage());
        }
    }

    /** Borra una copia. Se usa al rotar: solo se guardan las últimas. */
    @PluginMethod
    public void deleteBackup(PluginCall call) {
        String uri = call.getString("uri");
        JSObject out = new JSObject();
        if (uri == null) {
            out.put("ok", false);
            call.resolve(out);
            return;
        }
        try {
            out.put("ok", DocumentsContract.deleteDocument(
                getContext().getContentResolver(), Uri.parse(uri)));
        } catch (Exception error) {
            out.put("ok", false);
        }
        call.resolve(out);
    }

    /** ¿Está el permiso persistente todavía concedido para esta carpeta? */
    private boolean holdsPermission(Uri treeUri) {
        try {
            for (android.content.UriPermission held
                    : getContext().getContentResolver().getPersistedUriPermissions()) {
                if (held.getUri().equals(treeUri) && held.isWritePermission()) return true;
            }
        } catch (Exception ignored) {
            // Sin permisos que consultar.
        }
        return false;
    }

    /** Busca un fichero por nombre dentro de la carpeta elegida. */
    private Uri findInTree(Uri treeUri, String name) {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(
            treeUri, DocumentsContract.getTreeDocumentId(treeUri));
        try (Cursor cursor = getContext().getContentResolver().query(children, new String[] {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        }, null, null, null)) {
            while (cursor != null && cursor.moveToNext()) {
                if (name.equals(cursor.getString(1))) {
                    return DocumentsContract.buildDocumentUriUsingTree(treeUri, cursor.getString(0));
                }
            }
        } catch (Exception ignored) {
            // Carpeta ilegible: se tratará como si el fichero no existiera.
        }
        return null;
    }

    /** Nombre legible de la carpeta, para poder enseñarlo en los ajustes. */
    private String readTreeName(Uri treeUri) {
        try {
            Uri doc = DocumentsContract.buildDocumentUriUsingTree(
                treeUri, DocumentsContract.getTreeDocumentId(treeUri));
            try (Cursor cursor = getContext().getContentResolver().query(doc, new String[] {
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            }, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) return cursor.getString(0);
            }
        } catch (Exception ignored) {
            // Sin nombre: los ajustes enseñarán uno genérico.
        }
        return "Carpeta elegida";
    }

    // ── Apertura desde otras apps ────────────────────────────────────────────

    /** URI pendiente de un intent ACTION_VIEW, a la espera de que JavaScript la pida. */
    private static Uri pendingUri;

    /**
     * Guarda la URI de un "Abrir con SharkReader". No se procesa aquí porque el
     * puente con JavaScript todavía no existe cuando llega el intent: se deja
     * pendiente y la app la reclama al arrancar.
     */
    public static void setPendingIntent(Intent intent) {
        if (intent == null) return;
        if (!Intent.ACTION_VIEW.equals(intent.getAction())) return;
        Uri data = intent.getData();
        if (data == null) return;

        // Los accesos directos del icono y el widget también llegan como
        // ACTION_VIEW, pero con esquema propio: no son ficheros que copiar sino
        // órdenes de «abre este libro que ya tienes». Sin este descarte, tocar
        // un acceso directo intentaría importar «sharkreader://book/<id>» como
        // si fuera un EPUB.
        if ("sharkreader".equals(data.getScheme())) return;

        pendingUri = data;
    }

    /**
     * Devuelve el libro que se pidió abrir desde otra app, ya copiado al
     * almacenamiento privado, o `null` si no había ninguno.
     */
    @PluginMethod
    public void consumePendingOpen(PluginCall call) {
        Uri uri = pendingUri;
        pendingUri = null;

        JSObject result = new JSObject();
        if (uri == null) {
            result.put("book", null);
            call.resolve(result);
            return;
        }

        try {
            JSObject book = copyToPrivateStorage(uri);
            result.put("book", book);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No se pudo abrir el fichero: " + error.getMessage());
        }
    }

    /**
     * Sobrescribe un fichero ya copiado. Se usa al convertir un TXT o un
     * Markdown en EPUB durante la importación.
     */
    @PluginMethod
    public void writeBookFile(PluginCall call) {
        String path = call.getString("path");
        String data = call.getString("data");
        if (path == null || data == null) {
            call.reject("Faltan los parámetros 'path' o 'data'.");
            return;
        }

        File file = new File(path);
        if (!isInsideBooksDir(file)) {
            call.reject("La ruta está fuera del almacenamiento de libros.");
            return;
        }

        try (OutputStream output = new FileOutputStream(file)) {
            output.write(android.util.Base64.decode(data, android.util.Base64.DEFAULT));
            call.resolve();
        } catch (Exception error) {
            call.reject("No se pudo escribir el fichero: " + error.getMessage());
        }
    }

    /**
     * Guarda un libro descargado de un catálogo OPDS.
     *
     * No pasa por el selector de ficheros porque el usuario no ha elegido nada
     * del sistema: el fichero viene de la red. Se le da el mismo trato que a
     * uno importado —nombre aleatorio dentro del directorio privado— para que
     * el resto de la app no tenga que distinguir de dónde salió.
     */
    @PluginMethod
    public void saveDownloadedBook(PluginCall call) {
        String name = call.getString("name");
        String data = call.getString("data");
        if (name == null || data == null) {
            call.reject("Faltan los parámetros 'name' o 'data'.");
            return;
        }

        try {
            String extension = extensionOf(name);
            if (extension.isEmpty()) extension = "epub";

            File target = new File(booksDir(), UUID.randomUUID().toString() + "." + extension);
            try (OutputStream output = new FileOutputStream(target)) {
                output.write(android.util.Base64.decode(data, android.util.Base64.DEFAULT));
            }

            JSObject result = new JSObject();
            result.put("path", target.getAbsolutePath());
            result.put("name", name);
            result.put("size", target.length());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No se pudo guardar el libro: " + error.getMessage());
        }
    }

    /**
     * Cuánto ocupa la app, desglosado.
     *
     * Una biblioteca de 200 libros son cientos de megas y hasta ahora no había
     * forma de saberlo desde la app. Se mide el directorio privado por partes
     * para que el usuario sepa qué puede borrar sin perder libros.
     */
    @PluginMethod
    public void getStorageUsage(PluginCall call) {
        File filesDir = getContext().getFilesDir();
        long books = sizeOf(new File(filesDir, BOOKS_DIR));
        long cache = sizeOf(getContext().getCacheDir());
        // La base de datos guarda metadata, progreso, anotaciones y las portadas
        // en base64: es lo segundo que más ocupa después de los propios libros.
        long database = sizeOf(new File(filesDir.getParentFile(), "databases"));

        JSObject result = new JSObject();
        result.put("books", books);
        result.put("database", database);
        result.put("cache", cache);
        result.put("total", books + database + cache);
        call.resolve(result);
    }

    /** Borra la caché. Nunca toca libros ni base de datos. */
    @PluginMethod
    public void clearCache(PluginCall call) {
        long freed = sizeOf(getContext().getCacheDir());
        deleteContents(getContext().getCacheDir());

        JSObject result = new JSObject();
        result.put("freed", freed);
        call.resolve(result);
    }

    private long sizeOf(File file) {
        if (file == null || !file.exists()) return 0;
        if (file.isFile()) return file.length();

        long total = 0;
        File[] children = file.listFiles();
        if (children == null) return 0;
        for (File child : children) total += sizeOf(child);
        return total;
    }

    private void deleteContents(File dir) {
        if (dir == null || !dir.isDirectory()) return;
        File[] children = dir.listFiles();
        if (children == null) return;
        for (File child : children) {
            if (child.isDirectory()) deleteContents(child);
            child.delete();
        }
    }

    /** El almacenamiento privado es la única zona en la que el plugin escribe o borra. */
    private boolean isInsideBooksDir(File file) {
        return file.getAbsolutePath().startsWith(booksDir().getAbsolutePath() + File.separator);
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
        if (!isInsideBooksDir(file)) {
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
        return lower.endsWith(".epub") || lower.endsWith(".pdf")
            || lower.endsWith(".cbz") || lower.endsWith(".txt")
            || lower.endsWith(".md") || lower.endsWith(".markdown");
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
        if (lower.endsWith(".cbz")) return "cbz";
        if (lower.endsWith(".txt")) return "txt";
        if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "md";
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
