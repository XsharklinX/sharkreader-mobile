package com.sharkreader.mobile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.common.model.RemoteModelManager;
import com.google.mlkit.nl.translate.TranslateLanguage;
import com.google.mlkit.nl.translate.TranslateRemoteModel;
import com.google.mlkit.nl.translate.Translation;
import com.google.mlkit.nl.translate.Translator;
import com.google.mlkit.nl.translate.TranslatorOptions;

import java.util.HashMap;
import java.util.Map;

/**
 * Traducción en el teléfono.
 *
 * ## Para qué
 *
 * Leer en otro idioma con la traducción de un párrafo justo debajo, sin salir
 * del libro ni copiar y pegar en un traductor. Es lo que más piden quienes leen
 * para aprender un idioma.
 *
 * ## Privacidad
 *
 * ML Kit traduce **en el dispositivo**: el texto del libro no sale del teléfono.
 * Lo único que va a internet es la descarga de cada modelo de idioma (unos 30
 * MB), una sola vez, y solo cuando el usuario lo pide. Se puede limitar a wifi.
 */
@CapacitorPlugin(name = "SharkTraduccion")
public class SharkTraduccionPlugin extends Plugin {

    private final Map<String, Translator> traductores = new HashMap<>();

    private synchronized Translator traductor(String de, String a) {
        String clave = de + ">" + a;
        Translator existente = traductores.get(clave);
        if (existente != null) return existente;
        Translator nuevo = Translation.getClient(new TranslatorOptions.Builder()
            .setSourceLanguage(de)
            .setTargetLanguage(a)
            .build());
        traductores.put(clave, nuevo);
        return nuevo;
    }

    private static String codigo(String idioma) {
        return idioma == null ? null : TranslateLanguage.fromLanguageTag(idioma);
    }

    /** Idiomas cuyo modelo ya está en el teléfono. */
    @PluginMethod
    public void descargados(PluginCall call) {
        RemoteModelManager.getInstance().getDownloadedModels(TranslateRemoteModel.class)
            .addOnSuccessListener(modelos -> {
                JSArray lista = new JSArray();
                for (TranslateRemoteModel modelo : modelos) lista.put(modelo.getLanguage());
                JSObject salida = new JSObject();
                salida.put("idiomas", lista);
                call.resolve(salida);
            })
            .addOnFailureListener(error -> call.reject("No se pudo consultar: " + error.getMessage()));
    }

    /** Descarga los modelos de un par de idiomas, si faltan. */
    @PluginMethod
    public void preparar(PluginCall call) {
        String de = codigo(call.getString("de"));
        String a = codigo(call.getString("a"));
        if (de == null || a == null) {
            call.reject("Ese idioma no se puede traducir en el teléfono.");
            return;
        }
        DownloadConditions.Builder condiciones = new DownloadConditions.Builder();
        if (call.getBoolean("soloWifi", true)) condiciones.requireWifi();
        traductor(de, a).downloadModelIfNeeded(condiciones.build())
            .addOnSuccessListener(nada -> call.resolve())
            .addOnFailureListener(error -> call.reject("No se pudo descargar el idioma: " + error.getMessage()));
    }

    /** Traduce una lista de textos, en orden. Los modelos tienen que estar ya. */
    @PluginMethod
    public void traducir(PluginCall call) {
        String de = codigo(call.getString("de"));
        String a = codigo(call.getString("a"));
        JSArray textos = call.getArray("textos");
        if (de == null || a == null || textos == null) {
            call.reject("Faltan los idiomas o el texto.");
            return;
        }
        Translator t = traductor(de, a);
        String[] salida = new String[textos.length()];
        traducirDesde(t, textos, salida, 0, call);
    }

    private void traducirDesde(Translator t, JSArray textos, String[] salida, int i, PluginCall call) {
        if (i >= salida.length) {
            JSArray lista = new JSArray();
            for (String s : salida) lista.put(s);
            JSObject resultado = new JSObject();
            resultado.put("textos", lista);
            call.resolve(resultado);
            return;
        }
        String texto = textos.optString(i, "");
        if (texto.trim().isEmpty()) {
            salida[i] = "";
            traducirDesde(t, textos, salida, i + 1, call);
            return;
        }
        t.translate(texto)
            .addOnSuccessListener(traducido -> {
                salida[i] = traducido;
                traducirDesde(t, textos, salida, i + 1, call);
            })
            .addOnFailureListener(error -> call.reject("No se pudo traducir: " + error.getMessage()));
    }

    @Override
    protected void handleOnDestroy() {
        for (Translator t : traductores.values()) t.close();
        traductores.clear();
        super.handleOnDestroy();
    }
}
