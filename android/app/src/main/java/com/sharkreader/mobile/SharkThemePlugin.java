package com.sharkreader.mobile;

import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Material You: colores del sistema para la interfaz.
 *
 * Android 12 genera una paleta a partir del fondo de pantalla del usuario y la
 * expone como recursos de color. Una app nativa la aplica con `DynamicColors` y
 * ya está; aquí la interfaz es un WebView, así que hay que leer los valores y
 * pasarlos a CSS como variables.
 *
 * Se leen las rampas que hacen falta:
 *
 *  - `accent1`  el color principal derivado del fondo de pantalla.
 *  - `accent2`  su complementario apagado, para elementos secundarios.
 *  - `neutral1` los grises teñidos hacia el acento, que son los que hacen que
 *               la app parezca del mismo sistema y no un gris genérico pegado
 *               al lado.
 *
 * Cada rampa va del 0 (blanco) al 1000 (negro). Se devuelven los tonos que
 * usamos en lugar de los trece de cada rampa: mandar treinta y nueve colores al
 * WebView para usar ocho sería ruido.
 */
@CapacitorPlugin(name = "SharkTheme")
public class SharkThemePlugin extends Plugin {

    /**
     * ¿Hay paleta del sistema?
     *
     * Solo desde Android 12. Por debajo se responde que no en lugar de
     * inventar colores: una paleta «Material You» falsa sería peor que el tema
     * propio, porque prometería seguir el fondo de pantalla y no lo haría.
     */
    @PluginMethod
    public void getDynamicColors(PluginCall call) {
        JSObject result = new JSObject();

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            result.put("available", false);
            call.resolve(result);
            return;
        }

        try {
            JSObject colors = new JSObject();

            colors.put("accent100", hex(android.R.color.system_accent1_100));
            colors.put("accent200", hex(android.R.color.system_accent1_200));
            colors.put("accent300", hex(android.R.color.system_accent1_300));
            colors.put("accent500", hex(android.R.color.system_accent1_500));
            colors.put("accent600", hex(android.R.color.system_accent1_600));
            colors.put("accent700", hex(android.R.color.system_accent1_700));

            colors.put("accent2_200", hex(android.R.color.system_accent2_200));
            colors.put("accent2_500", hex(android.R.color.system_accent2_500));

            // Los neutros teñidos son lo que más se nota: son el fondo de toda
            // la app, y un gris puro al lado de un acento cálido canta.
            colors.put("neutral0", hex(android.R.color.system_neutral1_0));
            colors.put("neutral50", hex(android.R.color.system_neutral1_50));
            colors.put("neutral100", hex(android.R.color.system_neutral1_100));
            colors.put("neutral200", hex(android.R.color.system_neutral1_200));
            colors.put("neutral700", hex(android.R.color.system_neutral1_700));
            colors.put("neutral800", hex(android.R.color.system_neutral1_800));
            colors.put("neutral900", hex(android.R.color.system_neutral1_900));

            result.put("available", true);
            result.put("colors", colors);
        } catch (Exception error) {
            // Algunos fabricantes tocan estos recursos. Si algo falla, la app
            // se queda con su paleta propia, que siempre está.
            result.put("available", false);
        }

        call.resolve(result);
    }

    /** Recurso de color a «#RRGGBB», que es lo que entiende el CSS. */
    private String hex(int resourceId) {
        int color = getContext().getResources().getColor(resourceId, getContext().getTheme());
        return String.format("#%06X", 0xFFFFFF & color);
    }
}
