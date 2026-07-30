package com.sharkreader.mobile;

import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Puente entre la lectura en voz alta de JavaScript y el servicio en primer
 * plano de Android.
 *
 * La síntesis sigue ocurriendo en JavaScript con el motor del sistema; este
 * plugin se ocupa de que el proceso siga vivo con la app en segundo plano, de
 * traer de vuelta los botones de la notificación y de los auriculares, y de
 * enumerar las voces **con su calidad**.
 *
 * Lo último hace falta porque el plugin de Capacitor devuelve solo nombre e
 * idioma. Android sí sabe la calidad de cada voz —`Voice.getQuality()`— y si
 * necesita conexión, y en un móvil con tres voces españolas la diferencia entre
 * la mejor y la peor es enorme. Sin este dato se estaba cogiendo la primera de
 * la lista, que no viene ordenada por nada.
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

    /** Motor de voz, solo para consultar la lista. La síntesis va por JS. */
    private TextToSpeech probe;
    private boolean probeReady = false;

    /**
     * Voces del sistema con su calidad y si necesitan conexión.
     *
     * El motor tarda en inicializarse, así que la primera llamada puede llegar
     * antes de que esté listo. En ese caso se devuelve la lista vacía en lugar de
     * bloquear: quien llama vuelve a pedirla y entretanto usa la del plugin de
     * Capacitor, que siempre responde aunque sea con menos datos.
     */
    @PluginMethod
    public void listVoices(PluginCall call) {
        if (probe == null) {
            probe = new TextToSpeech(getContext(), status -> {
                probeReady = status == TextToSpeech.SUCCESS;
            });
        }

        JSObject result = new JSObject();
        JSArray voices = new JSArray();

        if (!probeReady) {
            result.put("ready", false);
            result.put("voices", voices);
            call.resolve(result);
            return;
        }

        try {
            Set<Voice> available = probe.getVoices();
            if (available != null) {
                List<Voice> sorted = new ArrayList<>(available);
                for (Voice voice : sorted) {
                    JSObject item = new JSObject();
                    item.put("id", voice.getName());
                    item.put("name", prettyName(voice));
                    item.put("lang", voice.getLocale() != null ? voice.getLocale().toLanguageTag() : "");
                    item.put("quality", qualityName(voice.getQuality()));
                    item.put("network", voice.isNetworkConnectionRequired());
                    voices.put(item);
                }
            }
            result.put("ready", true);
            result.put("voices", voices);
            call.resolve(result);
        } catch (Exception error) {
            // Algunos fabricantes lanzan aquí con motores de terceros mal
            // instalados. Sin voces la app sigue leyendo con la voz por defecto.
            result.put("ready", false);
            result.put("voices", voices);
            call.resolve(result);
        }
    }

    /**
     * Nombre legible.
     *
     * Android devuelve identificadores como «es-es-x-eef-local». Para el usuario
     * eso no significa nada, así que se compone algo con el idioma y se deja el
     * identificador para distinguir dos voces del mismo idioma.
     */
    private String prettyName(Voice voice) {
        String raw = voice.getName();
        if (voice.getLocale() == null) return raw;

        String display = voice.getLocale().getDisplayName();
        // El sufijo suele ser lo único que distingue dos voces del mismo idioma.
        String suffix = raw.length() > 6 ? raw.substring(raw.lastIndexOf('-') + 1) : raw;
        return display + " · " + suffix;
    }

    private String qualityName(int quality) {
        switch (quality) {
            case Voice.QUALITY_VERY_HIGH: return "very-high";
            case Voice.QUALITY_HIGH:      return "high";
            case Voice.QUALITY_LOW:       return "low";
            case Voice.QUALITY_VERY_LOW:  return "very-low";
            default:                      return "normal";
        }
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
        // El motor de consulta también se apaga: un TextToSpeech sin cerrar deja
        // el servicio del sistema enganchado al proceso.
        if (probe != null) {
            probe.shutdown();
            probe = null;
        }
        super.handleOnDestroy();
    }
}
