package com.sharkreader.mobile;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.SystemClock;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * La luz que hay alrededor, para que la página se adapte sola.
 *
 * ## Para qué
 *
 * Entrar en un cuarto a oscuras con la página en blanco a todo brillo, o salir
 * al sol con el tema noche, obliga a abrir menús en mitad de la lectura. El
 * sensor de luz ambiente del teléfono ya sabe lo que hay; esto solo se lo pasa
 * al lector, que es quien decide qué hacer (`confortLuz.js`).
 *
 * ## Lo que cuesta
 *
 * El sensor de luz es de los más baratos del teléfono, pero aun así se escucha
 * solo mientras el lector lo pide y se suelta al irse a segundo plano. Y no se
 * manda cada lectura: el sensor puede dar decenas por segundo y al lector le
 * basta con una cada medio segundo como mucho, o cuando la luz cambia de verdad.
 *
 * No hace falta ningún permiso.
 */
@CapacitorPlugin(name = "SharkLuz")
public class SharkLuzPlugin extends Plugin implements SensorEventListener {

    /** Entre dos avisos, como poco. */
    private static final long INTERVALO_MS = 500;
    /** Un cambio menor que esto (en proporción) no se avisa. */
    private static final float CAMBIO_MINIMO = 0.12f;

    private SensorManager sensores;
    private Sensor sensor;
    private boolean pedido = false;
    private boolean escuchando = false;
    private long ultimoAviso = 0;
    private float ultimoLux = -1;

    @Override
    public void load() {
        sensores = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        sensor = sensores != null ? sensores.getDefaultSensor(Sensor.TYPE_LIGHT) : null;
    }

    @PluginMethod
    public void disponible(PluginCall call) {
        JSObject salida = new JSObject();
        salida.put("disponible", sensor != null);
        call.resolve(salida);
    }

    @PluginMethod
    public void empezar(PluginCall call) {
        if (sensor == null) {
            call.reject("Este teléfono no tiene sensor de luz.");
            return;
        }
        pedido = true;
        registrar();
        call.resolve();
    }

    @PluginMethod
    public void parar(PluginCall call) {
        pedido = false;
        soltar();
        call.resolve();
    }

    private void registrar() {
        if (escuchando || sensor == null || sensores == null) return;
        ultimoLux = -1;
        escuchando = sensores.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL);
    }

    private void soltar() {
        if (!escuchando || sensores == null) return;
        sensores.unregisterListener(this);
        escuchando = false;
    }

    @Override
    protected void handleOnPause() {
        soltar();
        super.handleOnPause();
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (pedido) registrar();
    }

    @Override
    protected void handleOnDestroy() {
        soltar();
        super.handleOnDestroy();
    }

    @Override
    public void onSensorChanged(SensorEvent evento) {
        if (evento.values == null || evento.values.length == 0) return;
        float lux = Math.max(0f, evento.values[0]);
        long ahora = SystemClock.elapsedRealtime();

        boolean primero = ultimoLux < 0;
        float referencia = Math.max(1f, ultimoLux);
        boolean cambio = Math.abs(lux - ultimoLux) / referencia >= CAMBIO_MINIMO;
        if (!primero && (!cambio || ahora - ultimoAviso < INTERVALO_MS)) return;

        ultimoLux = lux;
        ultimoAviso = ahora;
        JSObject datos = new JSObject();
        datos.put("lux", lux);
        notifyListeners("luz", datos);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int precision) {
        // La precisión del sensor de luz no cambia nada de lo que se hace con él.
    }
}
