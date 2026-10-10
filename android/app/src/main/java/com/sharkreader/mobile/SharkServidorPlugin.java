package com.sharkreader.mobile;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import fi.iki.elonen.NanoHTTPD;

/**
 * Un servidor web pequeño dentro de la app, solo en la red de casa.
 *
 * ## Para qué
 *
 * 1. **Pasar libros del ordenador al móvil.** En el móvil sale una dirección y
 *    un QR; en el navegador del ordenador, se arrastran los libros a esa página
 *    y aparecen en la biblioteca. Sin cable, sin buscar carpetas en el móvil y
 *    sin subir nada a la nube de nadie.
 * 2. **Hablar con SharkReader de escritorio.** Posición, subrayados y libros van
 *    de uno a otro por la wifi de casa, sin servidor de por medio. Esas
 *    peticiones se reenvían a JavaScript, que es donde vive la fusión de copias
 *    (`backupMerge`), y se responde con lo que diga.
 *
 * ## Seguridad
 *
 * - Solo escucha mientras la pantalla que lo abrió está abierta. Al salir, se
 *   para.
 * - La dirección lleva una clave aleatoria de seis caracteres (`/k7f2qa`): sin
 *   ella, todo responde 404. Otra persona en la misma wifi no puede subir nada
 *   ni leer nada sin ver la pantalla del móvil.
 * - Solo se aceptan ficheros de libro, y con un tope de tamaño.
 *
 * ## Por qué nativo
 *
 * Un WebView no puede abrir un puerto. Y los libros se escriben a disco a
 * medida que llegan, sin pasar por JavaScript: un PDF de 200 MB en base64 por
 * el puente de Capacitor no cabría en memoria.
 */
@CapacitorPlugin(name = "SharkServidor")
public class SharkServidorPlugin extends Plugin {

    private static final int PUERTO_INICIAL = 8080;
    private static final long TAMANO_MAXIMO = 1024L * 1024 * 1024;
    private static final long ESPERA_JS_SEG = 30;
    private static final String[] EXTENSIONES = {"epub", "pdf", "cbz", "txt", "md", "markdown", "docx"};
    /** Sin 0/o, 1/l/i: la clave se puede tener que teclear. */
    private static final String ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789";

    private Servidor servidor;
    private String clave;
    private final Map<String, Respuesta> pendientes = new ConcurrentHashMap<>();
    private final SecureRandom azar = new SecureRandom();

    private static class Respuesta {
        final CountDownLatch listo = new CountDownLatch(1);
        int estado = 200;
        String tipo = "application/json";
        String cuerpo = "";
    }

    @PluginMethod
    public void iniciar(PluginCall call) {
        String ip = direccionLocal();
        if (ip == null) {
            call.reject("Conecta el móvil a una wifi para recibir libros.");
            return;
        }

        if (servidor == null) {
            clave = nuevaClave();
            Servidor nuevo = null;
            for (int puerto = PUERTO_INICIAL; puerto < PUERTO_INICIAL + 12; puerto++) {
                try {
                    Servidor candidato = new Servidor(puerto);
                    candidato.start(NanoHTTPD.SOCKET_READ_TIMEOUT, true);
                    nuevo = candidato;
                    break;
                } catch (IOException ocupado) {
                    // Otro programa tiene el puerto: se prueba el siguiente.
                }
            }
            if (nuevo == null) {
                call.reject("No se ha encontrado un puerto libre.");
                return;
            }
            servidor = nuevo;
        }

        JSObject salida = new JSObject();
        salida.put("ip", ip);
        salida.put("puerto", servidor.getListeningPort());
        salida.put("clave", clave);
        salida.put("direccion", "http://" + ip + ":" + servidor.getListeningPort() + "/" + clave);
        call.resolve(salida);
    }

    @PluginMethod
    public void parar(PluginCall call) {
        detener();
        call.resolve();
    }

    /** Lo que JavaScript contesta a una petición de la API. */
    @PluginMethod
    public void responder(PluginCall call) {
        String id = call.getString("id");
        Respuesta respuesta = id != null ? pendientes.get(id) : null;
        if (respuesta != null) {
            respuesta.estado = call.getInt("estado", 200);
            respuesta.tipo = call.getString("tipo", "application/json");
            respuesta.cuerpo = call.getString("cuerpo", "");
            respuesta.listo.countDown();
        }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        detener();
        super.handleOnDestroy();
    }

    private void detener() {
        if (servidor != null) {
            servidor.stop();
            servidor = null;
        }
        for (Respuesta pendiente : pendientes.values()) pendiente.listo.countDown();
        pendientes.clear();
        clave = null;
    }

    private String nuevaClave() {
        StringBuilder texto = new StringBuilder();
        for (int i = 0; i < 6; i++) texto.append(ALFABETO.charAt(azar.nextInt(ALFABETO.length())));
        return texto.toString();
    }

    /**
     * La IPv4 de la wifi (o del punto de acceso, si el móvil lo comparte).
     *
     * Se recorren las interfaces en lugar de preguntar a WifiManager: no pide
     * permisos y también encuentra la red cuando el móvil **es** el router.
     */
    private String direccionLocal() {
        String cualquiera = null;
        try {
            for (NetworkInterface interfaz : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!interfaz.isUp() || interfaz.isLoopback()) continue;
                String nombre = interfaz.getName().toLowerCase(Locale.ROOT);
                for (InetAddress direccion : Collections.list(interfaz.getInetAddresses())) {
                    if (!(direccion instanceof Inet4Address) || !direccion.isSiteLocalAddress()) continue;
                    String ip = direccion.getHostAddress();
                    if (nombre.startsWith("wlan") || nombre.startsWith("ap") || nombre.startsWith("swlan")) return ip;
                    if (cualquiera == null && !nombre.startsWith("rmnet")) cualquiera = ip;
                }
            }
        } catch (Exception ignorado) {
            return null;
        }
        return cualquiera;
    }

    private static String extensionDe(String nombre) {
        int punto = nombre.lastIndexOf('.');
        return punto >= 0 ? nombre.substring(punto + 1).toLowerCase(Locale.ROOT) : "";
    }

    private static boolean aceptada(String extension) {
        for (String valida : EXTENSIONES) if (valida.equals(extension)) return true;
        return false;
    }

    private class Servidor extends NanoHTTPD {
        Servidor(int puerto) {
            super(puerto);
        }

        @Override
        public Response serve(IHTTPSession sesion) {
            if (Method.OPTIONS.equals(sesion.getMethod())) return conCors(newFixedLengthResponse(Response.Status.NO_CONTENT, MIME_PLAINTEXT, ""));

            String ruta = sesion.getUri();
            String prefijo = "/" + clave;
            if (clave == null || !(ruta.equals(prefijo) || ruta.startsWith(prefijo + "/"))) {
                return conCors(newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain; charset=utf-8",
                    "No encontrado. Abre la dirección completa que enseña el móvil."));
            }
            String resto = ruta.substring(prefijo.length());

            try {
                if (resto.isEmpty() || resto.equals("/")) return conCors(pagina());
                if (resto.equals("/subir") && Method.POST.equals(sesion.getMethod())) return conCors(recibir(sesion));
                if (resto.startsWith("/api/")) return conCors(reenviar(sesion, resto.substring(4)));
            } catch (Exception error) {
                return conCors(newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain; charset=utf-8",
                    "Error: " + error.getMessage()));
            }
            return conCors(newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain; charset=utf-8", "No encontrado."));
        }

        private Response conCors(Response respuesta) {
            // SharkReader de escritorio llama desde otro origen.
            respuesta.addHeader("Access-Control-Allow-Origin", "*");
            respuesta.addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            respuesta.addHeader("Access-Control-Allow-Headers", "Content-Type");
            respuesta.addHeader("Cache-Control", "no-store");
            return respuesta;
        }

        private Response pagina() throws IOException {
            try (InputStream entrada = getContext().getResources().openRawResource(R.raw.recibir_libros)) {
                ByteArrayOutputStream salida = new ByteArrayOutputStream();
                copiar(entrada, salida, Long.MAX_VALUE);
                return newFixedLengthResponse(Response.Status.OK, "text/html; charset=utf-8",
                    new String(salida.toByteArray(), StandardCharsets.UTF_8));
            }
        }

        /**
         * Recibe un libro: el cuerpo es el fichero tal cual, sin multipart.
         *
         * La página de subida manda un fichero por petición con su nombre en la
         * URL. Así no hay que interpretar `multipart/form-data`, que es donde
         * suelen romperse los servidores pequeños con ficheros grandes.
         */
        private Response recibir(IHTTPSession sesion) throws IOException {
            String nombre = primero(sesion.getParameters().get("nombre"));
            if (nombre == null || nombre.trim().isEmpty()) nombre = "libro.epub";
            nombre = new File(nombre).getName();
            String extension = extensionDe(nombre);
            if (!aceptada(extension)) {
                return newFixedLengthResponse(Response.Status.BAD_REQUEST, "text/plain; charset=utf-8",
                    "SharkReader no abre ficheros ." + extension);
            }

            long largo = Long.parseLong(sesion.getHeaders().getOrDefault("content-length", "0"));
            if (largo <= 0 || largo > TAMANO_MAXIMO) {
                return newFixedLengthResponse(Response.Status.BAD_REQUEST, "text/plain; charset=utf-8",
                    "El fichero está vacío o pasa de 1 GB.");
            }

            JSObject aviso = new JSObject();
            aviso.put("nombre", nombre);
            aviso.put("tamano", largo);
            notifyListeners("recibiendo", aviso);

            File carpeta = new File(getContext().getFilesDir(), "books");
            if (!carpeta.exists()) carpeta.mkdirs();
            String id = UUID.randomUUID().toString();
            File destino = new File(carpeta, id + "." + extension);

            long escritos;
            try (OutputStream salida = new FileOutputStream(destino)) {
                escritos = copiar(sesion.getInputStream(), salida, largo);
            }
            if (escritos < largo) {
                destino.delete();
                return newFixedLengthResponse(Response.Status.BAD_REQUEST, "text/plain; charset=utf-8",
                    "La subida se cortó a medias.");
            }

            JSObject libro = new JSObject();
            libro.put("id", id);
            libro.put("name", nombre);
            libro.put("type", extension);
            libro.put("size", escritos);
            libro.put("path", destino.getAbsolutePath());
            notifyListeners("recibido", libro, true);

            return newFixedLengthResponse(Response.Status.OK, "application/json", "{\"ok\":true}");
        }

        /**
         * Pasa una petición de la API a JavaScript y espera su respuesta.
         *
         * El hilo del servidor se queda esperando —es un hilo por petición—
         * mientras JavaScript prepara lo que haya que devolver.
         */
        private Response reenviar(IHTTPSession sesion, String ruta) throws IOException {
            String cuerpo = "";
            long largo = Long.parseLong(sesion.getHeaders().getOrDefault("content-length", "0"));
            if (largo > 0) {
                ByteArrayOutputStream salida = new ByteArrayOutputStream();
                copiar(sesion.getInputStream(), salida, Math.min(largo, 64L * 1024 * 1024));
                cuerpo = new String(salida.toByteArray(), StandardCharsets.UTF_8);
            }

            String id = UUID.randomUUID().toString();
            Respuesta respuesta = new Respuesta();
            pendientes.put(id, respuesta);

            JSObject peticion = new JSObject();
            peticion.put("id", id);
            peticion.put("metodo", sesion.getMethod().name());
            peticion.put("ruta", ruta);
            peticion.put("cuerpo", cuerpo);
            notifyListeners("peticion", peticion, true);

            try {
                if (!respuesta.listo.await(ESPERA_JS_SEG, TimeUnit.SECONDS)) {
                    return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, MIME_PLAINTEXT, "El móvil no ha respondido a tiempo.");
                }
            } catch (InterruptedException interrumpido) {
                Thread.currentThread().interrupt();
                return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, MIME_PLAINTEXT, "Interrumpido.");
            } finally {
                pendientes.remove(id);
            }

            byte[] bytes = respuesta.cuerpo.getBytes(StandardCharsets.UTF_8);
            return newFixedLengthResponse(estadoDe(respuesta.estado), respuesta.tipo,
                new ByteArrayInputStream(bytes), bytes.length);
        }
    }

    private static NanoHTTPD.Response.IStatus estadoDe(int codigo) {
        for (NanoHTTPD.Response.Status estado : NanoHTTPD.Response.Status.values()) {
            if (estado.getRequestStatus() == codigo) return estado;
        }
        return NanoHTTPD.Response.Status.OK;
    }

    private static String primero(java.util.List<String> valores) {
        return valores == null || valores.isEmpty() ? null : valores.get(0);
    }

    private static long copiar(InputStream entrada, OutputStream salida, long maximo) throws IOException {
        byte[] bufer = new byte[64 * 1024];
        long total = 0;
        while (total < maximo) {
            int leidos = entrada.read(bufer, 0, (int) Math.min(bufer.length, maximo - total));
            if (leidos == -1) break;
            salida.write(bufer, 0, leidos);
            total += leidos;
        }
        return total;
    }
}
