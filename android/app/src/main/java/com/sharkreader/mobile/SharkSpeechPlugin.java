package com.sharkreader.mobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Puente entre la lectura en voz alta de JavaScript y el servicio en primer
 * plano de Android.
 *
 * La síntesis sigue ocurriendo en JavaScript con el motor del sistema; este
 * plugin solo se ocupa de que el proceso siga vivo con la app en segundo plano
 * y de traer de vuelta los botones de la notificación y de los auriculares.
 */
@CapacitorPlugin(name = "SharkSpeech")
public class SharkSpeechPlugin extends Plugin {

    private static SharkSpeechPlugin instance;

    @Override
    public void load() {
        instance = this;
        SpeechService.setCommandListener(this::emitCommand);
    }

    /** Llamado desde el receiver de la notificación. */
    public static void dispatch(String command) {
        if (instance != null) instance.emitCommand(command);
    }

    private void emitCommand(String command) {
        JSObject payload = new JSObject();
        payload.put("command", command);
        notifyListeners("speechCommand", payload);
    }

    /**
     * Arranca el servicio o actualiza su notificación. Se llama al empezar a
     * leer y cada vez que cambia el estado o el capítulo.
     */
    @PluginMethod
    public void start(PluginCall call) {
        String title = call.getString("title", "SharkReader");
        String chapter = call.getString("chapter", "");
        boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", true));

        try {
            SpeechService.update(getContext(), title, chapter, playing);
            call.resolve();
        } catch (Exception error) {
            // Si el sistema rechaza el servicio en primer plano (permiso de
            // notificaciones denegado), la lectura sigue funcionando con la app
            // abierta; solo se pierde el segundo plano.
            call.reject("No se pudo iniciar el servicio de lectura: " + error.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        SpeechService.stop(getContext());
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        SpeechService.setCommandListener(null);
        instance = null;
        super.handleOnDestroy();
    }
}
