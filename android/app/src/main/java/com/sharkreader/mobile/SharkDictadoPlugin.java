package com.sharkreader.mobile;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

/**
 * Notas dictadas.
 *
 * Escribir una nota abre el teclado, que tapa media página —justo el texto que
 * se está comentando— y con una mano es incómodo. Aquí se habla y se escribe
 * solo, con el reconocimiento de voz de Android **pidiendo que sea sin
 * conexión** (`EXTRA_PREFER_OFFLINE`): en los móviles que tienen el idioma
 * descargado, la voz no sale del teléfono.
 *
 * El permiso de micrófono se pide la primera vez que se pulsa el botón, nunca
 * al abrir la app.
 */
@CapacitorPlugin(
    name = "SharkDictado",
    permissions = { @Permission(alias = "microfono", strings = { Manifest.permission.RECORD_AUDIO }) }
)
public class SharkDictadoPlugin extends Plugin {

    private SpeechRecognizer reconocedor;
    private PluginCall llamada;

    @PluginMethod
    public void disponible(PluginCall call) {
        JSObject salida = new JSObject();
        salida.put("disponible", SpeechRecognizer.isRecognitionAvailable(getContext()));
        call.resolve(salida);
    }

    @PluginMethod
    public void escuchar(PluginCall call) {
        if (getPermissionState("microfono") != PermissionState.GRANTED) {
            requestPermissionForAlias("microfono", call, "trasPermiso");
            return;
        }
        empezar(call);
    }

    @PermissionCallback
    private void trasPermiso(PluginCall call) {
        if (getPermissionState("microfono") == PermissionState.GRANTED) empezar(call);
        else call.reject("Sin permiso de micrófono.");
    }

    private void empezar(PluginCall call) {
        String idioma = call.getString("idioma", "es-ES");
        getActivity().runOnUiThread(() -> {
            terminar();
            if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
                call.reject("Este teléfono no tiene reconocimiento de voz.");
                return;
            }
            llamada = call;
            reconocedor = SpeechRecognizer.createSpeechRecognizer(getContext());
            reconocedor.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) { notificar("estado", "escuchando"); }
                @Override public void onBeginningOfSpeech() { }
                @Override public void onRmsChanged(float rmsdB) { }
                @Override public void onBufferReceived(byte[] buffer) { }
                @Override public void onEndOfSpeech() { notificar("estado", "procesando"); }
                @Override public void onEvent(int eventType, Bundle params) { }

                @Override
                public void onPartialResults(Bundle resultados) {
                    String texto = primero(resultados);
                    if (texto != null) notificar("parcial", texto);
                }

                @Override
                public void onResults(Bundle resultados) {
                    PluginCall c = llamada;
                    llamada = null;
                    if (c != null) {
                        JSObject salida = new JSObject();
                        salida.put("texto", primero(resultados) == null ? "" : primero(resultados));
                        c.resolve(salida);
                    }
                    terminar();
                }

                @Override
                public void onError(int codigo) {
                    PluginCall c = llamada;
                    llamada = null;
                    if (c != null) {
                        if (codigo == SpeechRecognizer.ERROR_NO_MATCH || codigo == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                            JSObject salida = new JSObject();
                            salida.put("texto", "");
                            c.resolve(salida);
                        } else {
                            c.reject(codigo == SpeechRecognizer.ERROR_NETWORK || codigo == SpeechRecognizer.ERROR_NETWORK_TIMEOUT
                                ? "Para dictar sin conexión hay que descargar el idioma en los ajustes de voz de Android."
                                : "No se ha podido reconocer la voz.");
                        }
                    }
                    terminar();
                }
            });

            Intent intento = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intento.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intento.putExtra(RecognizerIntent.EXTRA_LANGUAGE, idioma);
            intento.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            intento.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
            // Una nota puede llevar pausas para pensar: no cortar al primer silencio.
            intento.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L);
            reconocedor.startListening(intento);
        });
    }

    @PluginMethod
    public void parar(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (reconocedor != null) reconocedor.stopListening();
        });
        call.resolve();
    }

    private void notificar(String tipo, String valor) {
        JSObject datos = new JSObject();
        datos.put(tipo, valor);
        notifyListeners(tipo, datos);
    }

    private static String primero(Bundle resultados) {
        ArrayList<String> lista = resultados == null ? null : resultados.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return lista == null || lista.isEmpty() ? null : lista.get(0);
    }

    private void terminar() {
        if (reconocedor != null) {
            try { reconocedor.destroy(); } catch (Throwable ignorado) { }
            reconocedor = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        getActivity().runOnUiThread(this::terminar);
        super.handleOnDestroy();
    }
}
