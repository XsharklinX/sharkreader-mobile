package com.sharkreader.mobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Teclas de volumen para pasar página.
 *
 * Es de las funciones más pedidas por quien lee mucho: permite avanzar sin
 * tapar el texto con el dedo, y usar el móvil en un soporte o con guantes.
 *
 * El plugin solo guarda si la captura está activa; quien intercepta las teclas
 * de verdad es la actividad, que es donde llegan los eventos.
 */
@CapacitorPlugin(name = "SharkKeys")
public class SharkKeysPlugin extends Plugin {

    private static SharkKeysPlugin instance;
    private static boolean captureVolumeKeys = false;

    @Override
    public void load() {
        instance = this;
    }

    public static boolean isCapturing() {
        return captureVolumeKeys;
    }

    /** Llamado desde MainActivity cuando se pulsa subir o bajar volumen. */
    public static void emit(String direction) {
        if (instance == null) return;
        JSObject payload = new JSObject();
        payload.put("direction", direction);
        instance.notifyListeners("volumeKey", payload);
    }

    /**
     * Activa o desactiva la captura. Fuera del lector se desactiva siempre: si
     * el volumen dejara de funcionar en la biblioteca, la app parecería rota.
     */
    @PluginMethod
    public void setCapture(PluginCall call) {
        captureVolumeKeys = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        captureVolumeKeys = false;
        instance = null;
        super.handleOnDestroy();
    }
}
