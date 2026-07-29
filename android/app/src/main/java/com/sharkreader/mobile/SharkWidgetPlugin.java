package com.sharkreader.mobile;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Puente entre el WebView y el widget de continuar leyendo.
 *
 * El widget se dibuja en el proceso del lanzador y puede pedirse con la app
 * cerrada, así que no puede consultar la base de datos. La app le deja los
 * cuatro datos que necesita en `SharedPreferences` cada vez que cambian.
 */
@CapacitorPlugin(name = "SharkWidget")
public class SharkWidgetPlugin extends Plugin {

    @PluginMethod
    public void setCurrentBook(PluginCall call) {
        Context context = getContext();
        SharedPreferences.Editor editor = context
            .getSharedPreferences(ContinueWidget.PREFS, Context.MODE_PRIVATE)
            .edit();

        String id = call.getString("id");

        if (id == null || id.isEmpty()) {
            // Sin libro en curso —biblioteca vacía, todo terminado— se limpia.
            // Dejar el último leído ahí para siempre sería enseñar algo que ya
            // no refleja nada.
            editor.clear();
        } else {
            editor.putString(ContinueWidget.KEY_ID, id);
            editor.putString(ContinueWidget.KEY_TITLE, call.getString("title", "Libro"));
            editor.putString(ContinueWidget.KEY_AUTHOR, call.getString("author", ""));
            editor.putString(ContinueWidget.KEY_COVER, call.getString("cover", ""));
            editor.putInt(ContinueWidget.KEY_PROGRESS, call.getInt("progress", 0));
        }

        // `commit` y no `apply`: el redibujado va justo después y tiene que leer
        // lo recién escrito. Con `apply` la escritura es asíncrona y el widget
        // podría pintar los datos anteriores.
        editor.commit();

        ContinueWidget.refresh(context);
        call.resolve(new JSObject().put("ok", true));
    }
}
