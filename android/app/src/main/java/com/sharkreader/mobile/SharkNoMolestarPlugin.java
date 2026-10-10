package com.sharkreader.mobile;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * No molestar mientras lees.
 *
 * Con un libro abierto, el teléfono pasa a «solo prioritarias»: las alarmas y
 * las llamadas de los contactos que el usuario tiene marcados siguen entrando;
 * el resto de notificaciones esperan. Al cerrar el libro o salir de la app, se
 * deja exactamente como estaba.
 *
 * ## Reglas que no se rompen
 *
 *  - **Si el usuario ya tenía su propio «no molestar», no se toca.** Ni al
 *    entrar ni al salir: solo se deshace lo que hizo la app.
 *  - **Si al salir el modo ya no es el que puso la app** —el usuario lo cambió
 *    desde los ajustes rápidos mientras leía—, gana el usuario y no se toca.
 *  - **Si la app muere con el modo puesto**, se recuerda en las preferencias y
 *    se restaura al volver a abrirla. Nunca se queda nadie en silencio por un
 *    cierre inesperado.
 *
 * Android solo deja hacer esto con un acceso que concede el usuario en su
 * propia pantalla de ajustes; la app no lo pide nunca por su cuenta, solo al
 * encender la opción.
 */
@CapacitorPlugin(name = "SharkNoMolestar")
public class SharkNoMolestarPlugin extends Plugin {

    private static final String PREFS = "sharkreader_no_molestar";
    private static final String PUESTO = "puesto";
    private static final String ANTERIOR = "anterior";
    private static final int MODO_LECTURA = NotificationManager.INTERRUPTION_FILTER_PRIORITY;

    private NotificationManager gestor() {
        return (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private boolean permitido() {
        NotificationManager nm = gestor();
        return nm != null && nm.isNotificationPolicyAccessGranted();
    }

    @Override
    public void load() {
        // Un cierre inesperado con el modo puesto: se deshace al arrancar.
        restaurar();
    }

    @PluginMethod
    public void estado(PluginCall call) {
        JSObject salida = new JSObject();
        salida.put("permitido", permitido());
        salida.put("activo", prefs().getBoolean(PUESTO, false));
        call.resolve(salida);
    }

    /** Abre la pantalla de Android donde se concede el acceso. */
    @PluginMethod
    public void pedirPermiso(PluginCall call) {
        try {
            Intent intento = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
            intento.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intento);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se ha podido abrir el ajuste de No molestar.");
        }
    }

    @PluginMethod
    public void activar(PluginCall call) {
        JSObject salida = new JSObject();
        NotificationManager nm = gestor();
        if (nm == null || !permitido()) {
            salida.put("activo", false);
            call.resolve(salida);
            return;
        }
        SharedPreferences p = prefs();
        if (!p.getBoolean(PUESTO, false)) {
            int actual = nm.getCurrentInterruptionFilter();
            // Ya tenía su propio silencio: es suyo, no se toca.
            if (actual != NotificationManager.INTERRUPTION_FILTER_ALL) {
                salida.put("activo", false);
                call.resolve(salida);
                return;
            }
            p.edit().putBoolean(PUESTO, true).putInt(ANTERIOR, actual).commit();
            nm.setInterruptionFilter(MODO_LECTURA);
        }
        salida.put("activo", true);
        call.resolve(salida);
    }

    @PluginMethod
    public void desactivar(PluginCall call) {
        restaurar();
        call.resolve();
    }

    private void restaurar() {
        SharedPreferences p = prefs();
        if (!p.getBoolean(PUESTO, false)) return;
        NotificationManager nm = gestor();
        if (nm != null && permitido() && nm.getCurrentInterruptionFilter() == MODO_LECTURA) {
            nm.setInterruptionFilter(p.getInt(ANTERIOR, NotificationManager.INTERRUPTION_FILTER_ALL));
        }
        p.edit().putBoolean(PUESTO, false).commit();
    }

    @Override
    protected void handleOnDestroy() {
        restaurar();
        super.handleOnDestroy();
    }
}
