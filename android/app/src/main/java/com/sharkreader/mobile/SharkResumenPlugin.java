package com.sharkreader.mobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.genai.common.DownloadCallback;
import com.google.mlkit.genai.common.FeatureStatus;
import com.google.mlkit.genai.common.GenAiException;
import com.google.mlkit.genai.summarization.Summarization;
import com.google.mlkit.genai.summarization.SummarizationRequest;
import com.google.mlkit.genai.summarization.SummarizationResult;
import com.google.mlkit.genai.summarization.Summarizer;
import com.google.mlkit.genai.summarization.SummarizerOptions;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Resumen con la IA que trae el teléfono (Gemini Nano, vía ML Kit GenAI).
 *
 * ## En qué teléfonos
 *
 * Solo en los que tienen Gemini Nano a través de AICore (Pixel 9 y posteriores
 * y algunos Galaxy recientes, por ahora). `estado()` lo dice; en los demás la
 * app usa las frases clave (`resumen.js`) y lo explica.
 *
 * ## En qué idioma
 *
 * El modelo solo resume en inglés, japonés y coreano. Para un libro en español
 * la app traduce primero al inglés y luego el resumen de vuelta, con la
 * traducción del propio teléfono. Aquí siempre se recibe y se devuelve inglés.
 *
 * Nada sale del teléfono.
 */
@CapacitorPlugin(name = "SharkResumen")
public class SharkResumenPlugin extends Plugin {

    private final ExecutorService hilo = Executors.newSingleThreadExecutor();
    private Summarizer resumidor;

    private synchronized Summarizer resumidor() {
        if (resumidor == null) {
            SummarizerOptions opciones = SummarizerOptions.builder(getContext())
                .setInputType(SummarizerOptions.InputType.ARTICLE)
                .setOutputType(SummarizerOptions.OutputType.THREE_BULLETS)
                .setLanguage(SummarizerOptions.Language.ENGLISH)
                .setLongInputAutoTruncationEnabled(true)
                .build();
            resumidor = Summarization.getClient(opciones);
        }
        return resumidor;
    }

    /** «disponible», «descargable», «descargando» o «no». */
    @PluginMethod
    public void estado(PluginCall call) {
        hilo.execute(() -> {
            JSObject salida = new JSObject();
            try {
                ListenableFuture<Integer> futuro = resumidor().checkFeatureStatus();
                int estado = futuro.get();
                String texto;
                if (estado == FeatureStatus.AVAILABLE) texto = "disponible";
                else if (estado == FeatureStatus.DOWNLOADABLE) texto = "descargable";
                else if (estado == FeatureStatus.DOWNLOADING) texto = "descargando";
                else texto = "no";
                salida.put("estado", texto);
            } catch (Throwable error) {
                // Sin AICore, sin Google Play Services, un móvil antiguo: no hay.
                salida.put("estado", "no");
            }
            call.resolve(salida);
        });
    }

    /** Pide a Android que baje el modelo, si hace falta. */
    @PluginMethod
    public void descargar(PluginCall call) {
        try {
            resumidor().downloadFeature(new DownloadCallback() {
                @Override
                public void onDownloadStarted(long bytes) {
                    JSObject datos = new JSObject();
                    datos.put("total", bytes);
                    notifyListeners("descarga", datos);
                }

                @Override
                public void onDownloadProgress(long bytes) {
                    JSObject datos = new JSObject();
                    datos.put("hecho", bytes);
                    notifyListeners("descarga", datos);
                }

                @Override
                public void onDownloadCompleted() {
                    call.resolve();
                }

                @Override
                public void onDownloadFailed(GenAiException error) {
                    call.reject("No se pudo preparar la IA del teléfono: " + error.getMessage());
                }
            });
        } catch (Throwable error) {
            call.reject("Este teléfono no tiene IA integrada.");
        }
    }

    /** Resume un texto en inglés en hasta tres viñetas. */
    @PluginMethod
    public void resumir(PluginCall call) {
        String texto = call.getString("texto", "");
        if (texto.trim().length() < 400) {
            // El modelo pide más de 400 caracteres; con menos no hay qué resumir.
            JSObject salida = new JSObject();
            salida.put("resumen", "");
            call.resolve(salida);
            return;
        }
        hilo.execute(() -> {
            try {
                SummarizationRequest peticion = SummarizationRequest.builder(texto).build();
                SummarizationResult resultado = resumidor().runInference(peticion).get();
                JSObject salida = new JSObject();
                salida.put("resumen", resultado.getSummary());
                call.resolve(salida);
            } catch (Throwable error) {
                call.reject("No se pudo resumir: " + error.getMessage());
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (resumidor != null) {
            resumidor.close();
            resumidor = null;
        }
        hilo.shutdownNow();
        super.handleOnDestroy();
    }
}
