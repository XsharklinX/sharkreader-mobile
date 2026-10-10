package com.sharkreader.mobile;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.util.Base64;
import android.view.View;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;

/**
 * Una foto de la página que se está viendo.
 *
 * ## El problema que resuelve
 *
 * Para doblar una hoja hay que dibujarla dos veces: plana a un lado del doblez y
 * reflejada al otro. Hasta ahora esas dos copias eran dos iframes con el HTML de
 * la página, y para que cupieran en memoria se les quitaban **todas las
 * imágenes** y se sustituían por un hueco transparente del mismo tamaño.
 *
 * En una página de texto no se nota. En una portada, una lámina o un cómic la
 * página **es** la imagen: al apoyar el dedo, la hoja se quedaba completamente en
 * blanco. Es lo que se veía en el teléfono al doblar la cubierta de cualquier
 * libro, y lo mismo en los libros ilustrados.
 *
 * ## Por qué nativo
 *
 * Desde JavaScript no hay forma de convertir el DOM en un mapa de bits. El
 * primer intento usó html2canvas, que clona el documento y lo vuelve a maquetar:
 * sus columnas caen en otras coordenadas y siempre devolvía la primera página
 * del capítulo, además de tardar unos 200 ms.
 *
 * Android sí sabe hacerlo, y de la única forma que es exacta: pedirle a la vista
 * que se dibuje sobre un lienzo. Lo que sale es **lo que hay en la pantalla**,
 * con sus imágenes, sus SVG, sus fondos y su tipografía, sin volver a maquetar
 * nada y sin que pueda salir otra página que la que se está viendo.
 *
 * ## Por qué la memoria deja de depender del libro
 *
 * Una foto de la pantalla ocupa lo que ocupa la pantalla: en este teléfono,
 * 720×1640 a media escala son unos 590 KB en memoria y bastante menos como JPEG.
 * Da igual que el libro pese ocho megas o que la lámina sea de 4000 píxeles de
 * ancho: la foto mide siempre lo mismo. Con los iframes, en cambio, el coste
 * crecía con el capítulo.
 */
@CapacitorPlugin(name = "SharkCapture")
public class SharkCapturePlugin extends Plugin {

    /**
     * A la mitad de resolución.
     *
     * La copia se ve durante un gesto, en movimiento, doblada y bajo una sombra.
     * A media escala no se distingue de la página y cuesta la cuarta parte de
     * memoria y de tiempo de compresión.
     */
    private static final float ESCALA = 0.5f;

    /**
     * Calidad del JPEG.
     *
     * 72 es el punto donde el texto todavía no enseña el halo del bloque y el
     * fichero ya es cuatro veces más pequeño que un PNG. Se usa JPEG y no PNG
     * porque comprimir un PNG de pantalla completa cuesta más de 200 ms —más que
     * todo el presupuesto del gesto— y aquí no hay transparencia que conservar.
     */
    private static final int CALIDAD = 72;

    /**
     * Devuelve la pantalla actual como un `data:` de JPEG.
     *
     * Se llama **antes** del gesto, cuando la página acaba de asentarse, no
     * mientras el dedo está apoyado: así el coste no cae dentro del arrastre y
     * al tocar la foto ya está hecha.
     */
    @PluginMethod
    public void capture(PluginCall call) {
        // Dibujar una vista es cosa del hilo de la interfaz. Desde el hilo del
        // puente, unas versiones de Android lanzan y otras devuelven un lienzo a
        // medio pintar, que es peor porque no se nota hasta que se ve.
        getActivity().runOnUiThread(() -> {
            try {
                View vista = getBridge().getWebView();
                int ancho = vista.getWidth();
                int alto = vista.getHeight();

                if (ancho <= 0 || alto <= 0) {
                    call.reject("La vista todavía no tiene tamaño.");
                    return;
                }

                int w = Math.max(1, Math.round(ancho * ESCALA));
                int h = Math.max(1, Math.round(alto * ESCALA));

                // RGB_565 y no ARGB_8888: la mitad de memoria, y no hay nada
                // transparente que guardar porque detrás de la página no se ve.
                Bitmap foto = Bitmap.createBitmap(w, h, Bitmap.Config.RGB_565);
                Canvas lienzo = new Canvas(foto);
                lienzo.setMatrix(escalaDe());
                vista.draw(lienzo);

                ByteArrayOutputStream salida = new ByteArrayOutputStream();
                foto.compress(Bitmap.CompressFormat.JPEG, CALIDAD, salida);
                foto.recycle();

                String base64 = Base64.encodeToString(salida.toByteArray(), Base64.NO_WRAP);

                JSObject out = new JSObject();
                out.put("image", "data:image/jpeg;base64," + base64);
                out.put("width", ancho);
                out.put("height", alto);
                call.resolve(out);
            } catch (Throwable error) {
                // Un fallo aquí no puede tumbar la lectura: quien llama se queda
                // sin foto y el pliegue usa el camino de antes.
                call.reject("No se pudo fotografiar la página: " + error);
            }
        });
    }

    private Matrix escalaDe() {
        Matrix matriz = new Matrix();
        matriz.setScale(ESCALA, ESCALA);
        return matriz;
    }
}
