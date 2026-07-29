package com.sharkreader.mobile;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.widget.RemoteViews;

import java.io.File;

/**
 * Widget de «continuar leyendo».
 *
 * Enseña el libro actual con su portada y su progreso, y al tocarlo lo abre por
 * donde ibas. Es el atajo que más sentido tiene en una app de lectura: quien lee
 * a diario vuelve siempre al mismo libro, y llegar hasta él cuesta abrir la app,
 * esperar a que cargue la biblioteca y encontrarlo.
 *
 * ## De dónde saca los datos
 *
 * De `SharedPreferences`, no de la base de datos. Un widget se dibuja en el
 * proceso del lanzador y puede pedirse a cualquier hora, incluso con la app
 * cerrada; abrir SQLite ahí sería lento y podría chocar con la conexión de la
 * app si está viva. El WebView escribe estos cuatro datos cada vez que cambia
 * el libro en curso, y aquí solo se leen.
 */
public class ContinueWidget extends AppWidgetProvider {

    public static final String PREFS = "shark_widget";
    public static final String KEY_ID = "book_id";
    public static final String KEY_TITLE = "book_title";
    public static final String KEY_AUTHOR = "book_author";
    public static final String KEY_COVER = "book_cover";
    public static final String KEY_PROGRESS = "book_progress";

    /** Fuerza el redibujado de todas las instancias del widget. */
    public static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(
            new android.content.ComponentName(context, ContinueWidget.class)
        );
        if (ids.length > 0) {
            new ContinueWidget().onUpdate(context, manager, ids);
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        String bookId = prefs.getString(KEY_ID, null);
        String title = prefs.getString(KEY_TITLE, null);
        String author = prefs.getString(KEY_AUTHOR, "");
        String cover = prefs.getString(KEY_COVER, null);
        int progress = prefs.getInt(KEY_PROGRESS, 0);

        for (int widgetId : widgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_continue);

            if (bookId == null || title == null) {
                // Sin libro empezado el widget no se queda en blanco: explica
                // qué va a aparecer ahí y abre la app.
                views.setTextViewText(R.id.widget_title, "Sin lectura en curso");
                views.setTextViewText(R.id.widget_author, "Abre un libro para verlo aquí");
                views.setViewVisibility(R.id.widget_progress, android.view.View.GONE);
                views.setImageViewResource(R.id.widget_cover, R.mipmap.ic_launcher);
                views.setOnClickPendingIntent(R.id.widget_root, openApp(context, null));
            } else {
                views.setTextViewText(R.id.widget_title, title);
                views.setTextViewText(R.id.widget_author, author);
                views.setViewVisibility(R.id.widget_progress, android.view.View.VISIBLE);
                views.setProgressBar(R.id.widget_progress, 100, progress, false);
                views.setTextViewText(R.id.widget_percent, progress + " %");

                Bitmap bitmap = loadCover(cover);
                if (bitmap != null) views.setImageViewBitmap(R.id.widget_cover, bitmap);
                else views.setImageViewResource(R.id.widget_cover, R.mipmap.ic_launcher);

                views.setOnClickPendingIntent(R.id.widget_root, openApp(context, bookId));
            }

            manager.updateAppWidget(widgetId, views);
        }
    }

    /**
     * Intent que abre la app, y el libro si se conoce.
     *
     * `FLAG_IMMUTABLE` es obligatorio desde Android 12 y además es lo correcto:
     * nadie que reciba este intent debería poder cambiarle el destino.
     */
    private PendingIntent openApp(Context context, String bookId) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        if (bookId != null) intent.setData(Uri.parse("sharkreader://book/" + bookId));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        return PendingIntent.getActivity(
            context,
            bookId == null ? 0 : bookId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    /**
     * Portada reducida.
     *
     * El tamaño importa aquí más que en otros sitios: un RemoteViews viaja
     * entre procesos y Android limita el tamaño de la transacción. Una portada
     * a resolución completa puede superar ese límite y hacer que el widget no
     * se dibuje, sin más aviso que un hueco en la pantalla de inicio.
     */
    private Bitmap loadCover(String path) {
        if (path == null || path.isEmpty()) return null;
        try {
            File file = new File(Uri.parse(path).getPath());
            if (!file.exists()) return null;

            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(file.getAbsolutePath(), bounds);

            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = Math.max(1, bounds.outHeight / 240);

            return BitmapFactory.decodeFile(file.getAbsolutePath(), options);
        } catch (Exception error) {
            return null;
        }
    }
}
