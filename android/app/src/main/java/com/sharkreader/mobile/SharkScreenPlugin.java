package com.sharkreader.mobile;

import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Que la pantalla no se apague mientras se lee.
 *
 * ## Por qué hace falta nativo
 *
 * El tiempo de apagado del sistema suele ser medio minuto, y está pensado para
 * apps que se tocan. Leyendo no se toca nada: una página larga se lee en más de
 * treinta segundos sin mover un dedo, y la pantalla se apaga a mitad de párrafo.
 * Es de las cosas que más molestan de un lector y de las que menos cuestan.
 *
 * Se hace con `FLAG_KEEP_SCREEN_ON` y no con la API de bloqueo de despertar del
 * navegador porque esta es la única que **siempre** está: la del navegador
 * depende de la versión del WebView, y un ajuste que funciona en unos teléfonos
 * sí y en otros no es peor que no tenerlo.
 *
 * ## Lo importante es soltarlo
 *
 * El indicador vive en la ventana de la actividad, así que sobrevive a salir del
 * libro si nadie lo quita. Una app de lectura que deja la pantalla encendida
 * para siempre se come la batería sin que se entienda por qué, así que se quita
 * al cerrar el libro y también al dejar la app en segundo plano.
 */
@CapacitorPlugin(name = "SharkScreen")
public class SharkScreenPlugin extends Plugin {

    /**
     * Lo que el lector ha pedido, que no es lo mismo que lo que hay puesto.
     *
     * Al irse a segundo plano el indicador se quita, pero el libro sigue abierto:
     * hace falta recordar que lo quería para volver a ponerlo al regresar. Sin
     * esto, salir a mirar una notificación y volver dejaba la pantalla
     * apagándose sola durante el resto de la lectura.
     */
    private boolean deseado = false;

    @PluginMethod
    public void keepAwake(PluginCall call) {
        deseado = true;
        aplicar(true, call);
    }

    @PluginMethod
    public void allowSleep(PluginCall call) {
        deseado = false;
        aplicar(false, call);
    }

    /** ¿Está la pantalla retenida ahora mismo? Para poder comprobarlo desde fuera. */
    @PluginMethod
    public void isKeptAwake(PluginCall call) {
        JSObject out = new JSObject();
        try {
            int flags = getActivity().getWindow().getAttributes().flags;
            out.put("value", (flags & WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) != 0);
        } catch (Exception error) {
            out.put("value", false);
        }
        call.resolve(out);
    }

    private void aplicar(boolean retener, PluginCall call) {
        // El indicador se toca en el hilo de la interfaz: hacerlo desde el hilo
        // del puente lanza una excepción en algunas versiones de Android y el
        // ajuste se queda a medias sin decir nada.
        getActivity().runOnUiThread(() -> {
            if (retener) {
                getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        });
        call.resolve();
    }

    /**
     * Al dejar la app, se suelta.
     *
     * No basta con quitarlo al cerrar el libro: si se sale de la app con un libro
     * abierto, la ventana se queda con el indicador puesto y la pantalla del
     * teléfono no se apaga aunque SharkReader ya no esté delante.
     */
    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        getActivity().runOnUiThread(() ->
            getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
    }

    /** Y al volver con el libro todavía abierto, se repone. */
    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (!deseado) return;
        getActivity().runOnUiThread(() ->
            getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
    }
}
