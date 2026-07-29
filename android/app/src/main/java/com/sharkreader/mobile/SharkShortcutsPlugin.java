package com.sharkreader.mobile;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * Accesos directos a libros desde el icono de la app.
 *
 * Mantener pulsado el icono de SharkReader ofrece los últimos libros leídos y
 * los abre directamente. Ahorra tres toques —abrir, buscar en la biblioteca,
 * tocar el libro— en la acción que se repite todos los días.
 *
 * Son **dinámicos**: cambian según lo que se esté leyendo, a diferencia de los
 * estáticos del manifiesto, que son siempre los mismos. Un acceso directo a
 * «tu último libro» solo sirve si sabe cuál es.
 *
 * Android limita cuántos admite —normalmente cuatro o cinco— y lo dice en
 * tiempo de ejecución, así que se pregunta en lugar de suponer.
 */
@CapacitorPlugin(name = "SharkShortcuts")
public class SharkShortcutsPlugin extends Plugin {

    /** Tope propio: aunque el sistema admita más, una lista larga deja de ser un atajo. */
    private static final int MAX_SHORTCUTS = 4;

    /**
     * Publica los accesos directos.
     *
     * Recibe id, título y ruta de portada de cada libro. Se reemplazan todos de
     * golpe en lugar de ir añadiendo: la lista es un reflejo del estado actual,
     * y añadir dejaría libros ya terminados ahí para siempre.
     */
    @PluginMethod
    public void setBooks(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) {
            // Por debajo de Android 7.1 no existen los accesos directos. No es
            // un error: la app funciona igual, solo sin este atajo.
            call.resolve(new JSObject().put("supported", false));
            return;
        }

        JSArray books = call.getArray("books");
        if (books == null) {
            call.reject("Faltan los libros.");
            return;
        }

        Context context = getContext();
        ShortcutManager manager = context.getSystemService(ShortcutManager.class);
        if (manager == null) {
            call.resolve(new JSObject().put("supported", false));
            return;
        }

        int limit = Math.min(MAX_SHORTCUTS, manager.getMaxShortcutCountPerActivity());
        List<ShortcutInfo> shortcuts = new ArrayList<>();

        try {
            for (int i = 0; i < books.length() && shortcuts.size() < limit; i++) {
                JSObject book = JSObject.fromJSONObject(books.getJSONObject(i));
                String id = book.getString("id");
                String title = book.getString("title", "Libro");
                String coverPath = book.getString("cover", null);

                if (id == null || id.isEmpty()) continue;

                Intent intent = new Intent(context, MainActivity.class);
                intent.setAction(Intent.ACTION_VIEW);
                // El id viaja en la propia URI del intent: el WebView lo lee al
                // arrancar y abre ese libro. Usar un extra no bastaría porque
                // Android reutiliza la actividad si ya estaba viva.
                intent.setData(Uri.parse("sharkreader://book/" + id));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

                ShortcutInfo.Builder builder = new ShortcutInfo.Builder(context, "book-" + id)
                    .setShortLabel(shorten(title, 12))
                    .setLongLabel(shorten(title, 28))
                    .setIntent(intent);

                Icon icon = coverIcon(coverPath);
                if (icon != null) builder.setIcon(icon);

                shortcuts.add(builder.build());
            }

            manager.setDynamicShortcuts(shortcuts);
            call.resolve(new JSObject()
                .put("supported", true)
                .put("count", shortcuts.size()));
        } catch (Exception error) {
            call.reject("No se pudieron crear los accesos directos: " + error.getMessage());
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N_MR1) {
            ShortcutManager manager = getContext().getSystemService(ShortcutManager.class);
            if (manager != null) manager.removeAllDynamicShortcuts();
        }
        call.resolve();
    }

    /**
     * Portada como icono, si existe y se puede leer.
     *
     * Se reduce a 128 px: el sistema la muestra a unos 48 dp y guardar la
     * portada entera en el registro de accesos directos —que vive en memoria
     * del lanzador— sería desperdiciarla.
     */
    private Icon coverIcon(String path) {
        if (path == null || path.isEmpty()) return null;
        try {
            File file = new File(Uri.parse(path).getPath());
            if (!file.exists()) return null;

            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(file.getAbsolutePath(), bounds);

            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = Math.max(1, bounds.outHeight / 128);

            Bitmap bitmap = BitmapFactory.decodeFile(file.getAbsolutePath(), options);
            if (bitmap == null) return null;

            return Icon.createWithBitmap(bitmap);
        } catch (Exception error) {
            // Sin portada el acceso directo sale con el icono de la app, que es
            // peor pero sigue funcionando.
            return null;
        }
    }

    private String shorten(String text, int max) {
        if (text == null) return "Libro";
        String trimmed = text.trim();
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max - 1) + "…";
    }
}
