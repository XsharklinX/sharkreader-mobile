package com.sharkreader.mobile;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

/**
 * Reconocimiento de texto de una página escaneada, en el teléfono.
 *
 * ## Para qué
 *
 * Un PDF escaneado es una pila de fotos: no se puede buscar, seleccionar,
 * escuchar ni leer en modo libro, porque no hay texto. Apuntes fotocopiados,
 * libros antiguos y documentos del trabajo vienen casi siempre así.
 *
 * ## Por qué ML Kit y por qué la versión empaquetada
 *
 * Funciona sin conexión y sin coste, y el modelo latino (español, inglés,
 * francés, alemán, italiano, portugués…) va **dentro de la app**: la otra
 * variante lo descarga Google Play Services la primera vez, y entonces «sin
 * conexión» dejaría de ser verdad justo la primera vez que alguien lo prueba en
 * el metro. Son unos 4 MB por arquitectura, y el AAB solo entrega la del móvil.
 *
 * La página nunca sale del teléfono.
 *
 * ## Lo que devuelve
 *
 * Líneas con su caja, en píxeles de la imagen recibida. Convertirlas a la forma
 * de los trozos de pdf.js es cosa de JavaScript (`Ocr.js`), que es donde está el
 * resto del reflujo y donde se puede probar.
 */
@CapacitorPlugin(name = "SharkOcr")
public class SharkOcrPlugin extends Plugin {

    private TextRecognizer reconocedor;

    private synchronized TextRecognizer reconocedor() {
        if (reconocedor == null) {
            reconocedor = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        }
        return reconocedor;
    }

    /**
     * Reconoce el texto de una imagen.
     *
     * Recibe la página ya pintada por pdf.js como `data:` JPEG o PNG. Pintarla
     * en JavaScript evita tener que abrir el PDF dos veces —una en el WebView y
     * otra en nativo— con su memoria duplicada.
     */
    @PluginMethod
    public void reconocer(PluginCall call) {
        String datos = call.getString("imagen");
        if (datos == null || datos.isEmpty()) {
            call.reject("Falta la imagen.");
            return;
        }

        final Bitmap mapa;
        try {
            int coma = datos.indexOf(',');
            byte[] bytes = Base64.decode(coma >= 0 ? datos.substring(coma + 1) : datos, Base64.DEFAULT);
            mapa = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Throwable error) {
            call.reject("La imagen no se pudo leer: " + error);
            return;
        }
        if (mapa == null) {
            call.reject("La imagen no se pudo leer.");
            return;
        }

        final int ancho = mapa.getWidth();
        final int alto = mapa.getHeight();

        reconocedor().process(InputImage.fromBitmap(mapa, 0))
            .addOnSuccessListener(texto -> {
                JSArray lineas = new JSArray();
                for (Text.TextBlock bloque : texto.getTextBlocks()) {
                    for (Text.Line linea : bloque.getLines()) {
                        Rect caja = linea.getBoundingBox();
                        if (caja == null) continue;
                        JSObject l = new JSObject();
                        l.put("texto", linea.getText());
                        l.put("x", caja.left);
                        l.put("y", caja.top);
                        l.put("ancho", caja.width());
                        l.put("alto", caja.height());
                        lineas.put(l);
                    }
                }
                mapa.recycle();

                JSObject salida = new JSObject();
                salida.put("lineas", lineas);
                salida.put("ancho", ancho);
                salida.put("alto", alto);
                call.resolve(salida);
            })
            .addOnFailureListener(error -> {
                mapa.recycle();
                call.reject("No se pudo reconocer el texto: " + error.getMessage());
            });
    }

    @Override
    protected void handleOnDestroy() {
        if (reconocedor != null) {
            reconocedor.close();
            reconocedor = null;
        }
        super.handleOnDestroy();
    }
}
