package com.sharkreader.mobile;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.k2fsa.sherpa.onnx.GeneratedAudio;
import com.k2fsa.sherpa.onnx.OfflineTts;
import com.k2fsa.sherpa.onnx.OfflineTtsConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig;

import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream;
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/**
 * Voz natural sin internet.
 *
 * ## Para qué
 *
 * La voz del sistema suena robótica en muchos móviles, y la voz natural pasaba
 * por un servidor de pago. Aquí la voz es una red neuronal (Piper, sobre
 * sherpa-onnx) que corre **en el teléfono**: suena como una persona, funciona
 * en el metro y no cuesta nada por uso.
 *
 * ## Qué hace este plugin
 *
 *  - Descarga una voz cuando el usuario la pide (unos 67 MB) y la descomprime
 *    en el almacenamiento privado de la app. Nada se descarga solo.
 *  - Convierte una frase en audio y la reproduce, y devuelve la promesa cuando
 *    termina de sonar: la cola de frases (`useSpeech`) no cambia.
 *  - Prepara la frase siguiente mientras suena la actual. Generar una frase
 *    cuesta unas décimas de segundo en un móvil medio; sin esto, entre frase y
 *    frase habría un silencio que se nota.
 *
 * El texto nunca sale del teléfono.
 */
@CapacitorPlugin(name = "SharkVozLocal")
public class SharkVozLocalPlugin extends Plugin {

    private static final String CARPETA = "voces";

    /** Un hilo para generar audio (la red neuronal) y otro para descargar. */
    private final ExecutorService generador = Executors.newSingleThreadExecutor();
    private final ExecutorService descargas = Executors.newSingleThreadExecutor();

    private OfflineTts tts;
    private String vozCargada;
    private AudioTrack pista;
    private volatile boolean parado = false;
    private volatile boolean cancelarDescarga = false;

    /** La siguiente frase, ya generada o generándose. */
    private String preparadaTexto;
    private float preparadaVelocidad;
    private Future<GeneratedAudio> preparada;

    private File carpetaVoces() {
        File dir = new File(getContext().getFilesDir(), CARPETA);
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private File modeloDe(File dir) {
        File[] ficheros = dir.listFiles((d, nombre) -> nombre.endsWith(".onnx"));
        return ficheros != null && ficheros.length > 0 ? ficheros[0] : null;
    }

    // ── Voces instaladas ────────────────────────────────────────────────────

    @PluginMethod
    public void instaladas(PluginCall call) {
        JSArray lista = new JSArray();
        File[] dirs = carpetaVoces().listFiles(File::isDirectory);
        if (dirs != null) {
            for (File dir : dirs) {
                if (modeloDe(dir) != null && new File(dir, "tokens.txt").exists()) lista.put(dir.getName());
            }
        }
        JSObject salida = new JSObject();
        salida.put("voces", lista);
        call.resolve(salida);
    }

    @PluginMethod
    public void borrar(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.contains("/") || id.contains("..")) {
            call.reject("Voz no válida.");
            return;
        }
        if (id.equals(vozCargada)) liberar();
        borrarTodo(new File(carpetaVoces(), id));
        call.resolve();
    }

    private void borrarTodo(File f) {
        File[] hijos = f.listFiles();
        if (hijos != null) for (File h : hijos) borrarTodo(h);
        f.delete();
    }

    // ── Descargar ───────────────────────────────────────────────────────────

    /**
     * Descarga una voz (`.tar.bz2`) y la deja lista en `voces/<id>/`.
     * Avisa del avance con el evento `progreso`.
     */
    @PluginMethod
    public void descargar(PluginCall call) {
        String id = call.getString("id");
        String url = call.getString("url");
        if (id == null || url == null || id.contains("/") || id.contains("..") || !url.startsWith("https://")) {
            call.reject("Voz no válida.");
            return;
        }
        cancelarDescarga = false;
        descargas.execute(() -> {
            File temporal = new File(getContext().getCacheDir(), id + ".tar.bz2");
            File destino = new File(carpetaVoces(), id);
            File provisional = new File(carpetaVoces(), id + ".parte");
            try {
                HttpURLConnection conexion = (HttpURLConnection) new URL(url).openConnection();
                conexion.setInstanceFollowRedirects(true);
                conexion.setConnectTimeout(15000);
                conexion.setReadTimeout(30000);
                long total = conexion.getContentLengthLong();
                long hecho = 0;
                long ultimoAviso = 0;
                try (InputStream entrada = new BufferedInputStream(conexion.getInputStream());
                     OutputStream salida = new FileOutputStream(temporal)) {
                    byte[] bufer = new byte[64 * 1024];
                    int leidos;
                    while ((leidos = entrada.read(bufer)) != -1) {
                        if (cancelarDescarga) throw new InterruptedException("cancelada");
                        salida.write(bufer, 0, leidos);
                        hecho += leidos;
                        if (hecho - ultimoAviso > 512 * 1024) {
                            ultimoAviso = hecho;
                            avisar(id, "descargando", hecho, total);
                        }
                    }
                }

                avisar(id, "instalando", hecho, total);
                borrarTodo(provisional);
                provisional.mkdirs();
                try (TarArchiveInputStream tar = new TarArchiveInputStream(
                        new BZip2CompressorInputStream(new BufferedInputStream(new FileInputStream(temporal))))) {
                    TarArchiveEntry entrada;
                    while ((entrada = tar.getNextEntry()) != null) {
                        if (cancelarDescarga) throw new InterruptedException("cancelada");
                        // Sin la carpeta de arriba («vits-piper-…/»), y nada que
                        // intente salir de la carpeta de la voz.
                        String nombre = entrada.getName();
                        int barra = nombre.indexOf('/');
                        String relativo = barra >= 0 ? nombre.substring(barra + 1) : nombre;
                        if (relativo.isEmpty() || relativo.contains("..")) continue;
                        File fichero = new File(provisional, relativo);
                        if (entrada.isDirectory()) {
                            fichero.mkdirs();
                            continue;
                        }
                        File padre = fichero.getParentFile();
                        if (padre != null) padre.mkdirs();
                        try (OutputStream salida = new FileOutputStream(fichero)) {
                            byte[] bufer = new byte[64 * 1024];
                            int leidos;
                            while ((leidos = tar.read(bufer)) != -1) salida.write(bufer, 0, leidos);
                        }
                    }
                }
                if (modeloDe(provisional) == null) throw new IllegalStateException("El paquete no trae el modelo.");
                borrarTodo(destino);
                if (!provisional.renameTo(destino)) throw new IllegalStateException("No se pudo instalar.");
                avisar(id, "lista", hecho, total);
                call.resolve();
            } catch (InterruptedException cancelada) {
                borrarTodo(provisional);
                call.reject("Descarga cancelada.");
            } catch (Exception error) {
                borrarTodo(provisional);
                call.reject("No se pudo descargar la voz: " + error.getMessage());
            } finally {
                temporal.delete();
            }
        });
    }

    @PluginMethod
    public void cancelarDescarga(PluginCall call) {
        cancelarDescarga = true;
        call.resolve();
    }

    private void avisar(String id, String fase, long hecho, long total) {
        JSObject datos = new JSObject();
        datos.put("id", id);
        datos.put("fase", fase);
        datos.put("hecho", hecho);
        datos.put("total", total);
        notifyListeners("progreso", datos);
    }

    // ── Hablar ──────────────────────────────────────────────────────────────

    private synchronized OfflineTts cargar(String id) {
        if (tts != null && id.equals(vozCargada)) return tts;
        liberar();
        File dir = new File(carpetaVoces(), id);
        File modelo = modeloDe(dir);
        if (modelo == null) throw new IllegalStateException("Esa voz no está descargada.");

        OfflineTtsVitsModelConfig vits = new OfflineTtsVitsModelConfig();
        vits.setModel(modelo.getAbsolutePath());
        vits.setTokens(new File(dir, "tokens.txt").getAbsolutePath());
        vits.setDataDir(new File(dir, "espeak-ng-data").getAbsolutePath());

        OfflineTtsModelConfig modeloConfig = new OfflineTtsModelConfig();
        modeloConfig.setVits(vits);
        // Dos hilos: la mitad de los núcleos grandes de un móvil medio, y deja
        // aire para que la interfaz no se atasque mientras se genera.
        modeloConfig.setNumThreads(2);
        modeloConfig.setProvider("cpu");

        OfflineTtsConfig config = new OfflineTtsConfig();
        config.setModel(modeloConfig);

        tts = new OfflineTts(null, config);
        vozCargada = id;
        return tts;
    }

    private synchronized void liberar() {
        preparada = null;
        preparadaTexto = null;
        if (tts != null) {
            try { tts.release(); } catch (Throwable ignorado) { }
            tts = null;
        }
        vozCargada = null;
    }

    /** Genera la frase siguiente mientras suena la actual. */
    @PluginMethod
    public void preparar(PluginCall call) {
        String id = call.getString("id");
        String texto = call.getString("texto", "");
        float velocidad = call.getFloat("velocidad", 1f);
        if (id == null || texto.trim().isEmpty()) {
            call.resolve();
            return;
        }
        synchronized (this) {
            preparadaTexto = texto;
            preparadaVelocidad = velocidad;
            preparada = generador.submit(() -> cargar(id).generate(texto, 0, velocidad));
        }
        call.resolve();
    }

    /** Dice una frase y resuelve cuando ha terminado de sonar. */
    @PluginMethod
    public void hablar(PluginCall call) {
        String id = call.getString("id");
        String texto = call.getString("texto", "");
        float velocidad = call.getFloat("velocidad", 1f);
        if (id == null) {
            call.reject("Falta la voz.");
            return;
        }
        parado = false;
        new Thread(() -> {
            try {
                Future<GeneratedAudio> futuro;
                synchronized (this) {
                    boolean coincide = preparada != null && texto.equals(preparadaTexto) && velocidad == preparadaVelocidad;
                    futuro = coincide ? preparada : generador.submit(() -> cargar(id).generate(texto, 0, velocidad));
                    preparada = null;
                    preparadaTexto = null;
                }
                GeneratedAudio audio = futuro.get();
                if (!parado && audio != null && audio.getSamples().length > 0) {
                    reproducir(audio.getSamples(), audio.getSampleRate());
                }
                call.resolve();
            } catch (Exception error) {
                call.reject("No se pudo generar la voz: " + error.getMessage());
            }
        }, "voz-local").start();
    }

    private void reproducir(float[] muestras, int frecuencia) throws InterruptedException {
        AudioTrack nueva = new AudioTrack.Builder()
            .setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build())
            .setAudioFormat(new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                .setSampleRate(frecuencia)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build())
            .setBufferSizeInBytes(muestras.length * 4)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build();
        nueva.write(muestras, 0, muestras.length, AudioTrack.WRITE_BLOCKING);
        synchronized (this) { pista = nueva; }
        nueva.play();
        // Se espera a que suene entera, mirando la cabeza de reproducción: con
        // MODE_STATIC no hay evento de fin fiable en todas las versiones.
        while (!parado) {
            int pos = nueva.getPlaybackHeadPosition();
            if (pos >= muestras.length) break;
            if (nueva.getPlayState() == AudioTrack.PLAYSTATE_STOPPED) break;
            Thread.sleep(30);
        }
        synchronized (this) {
            try { nueva.stop(); } catch (IllegalStateException ignorado) { }
            nueva.release();
            if (pista == nueva) pista = null;
        }
    }

    @PluginMethod
    public void parar(PluginCall call) {
        parado = true;
        synchronized (this) {
            preparada = null;
            preparadaTexto = null;
            if (pista != null) {
                try { pista.stop(); } catch (IllegalStateException ignorado) { }
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void pausar(PluginCall call) {
        synchronized (this) { if (pista != null) pista.pause(); }
        call.resolve();
    }

    @PluginMethod
    public void reanudar(PluginCall call) {
        synchronized (this) { if (pista != null) pista.play(); }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        parado = true;
        liberar();
        generador.shutdownNow();
        descargas.shutdownNow();
        super.handleOnDestroy();
    }
}
