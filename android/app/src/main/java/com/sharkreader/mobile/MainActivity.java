package com.sharkreader.mobile;

import android.content.Intent;
import android.os.Bundle;
import android.view.KeyEvent;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SharkPickerPlugin.class);
        registerPlugin(SharkSpeechPlugin.class);
        registerPlugin(SharkKeysPlugin.class);
        super.onCreate(savedInstanceState);

        SharkPickerPlugin.setPendingIntent(getIntent());
    }

    /**
     * Teclas de volumen para pasar página.
     *
     * Solo se interceptan mientras el lector lo pide: fuera de él, el volumen
     * tiene que seguir siendo el volumen. Se consume también el ACTION_UP para
     * que el sistema no muestre el control de volumen al soltar.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (SharkKeysPlugin.isCapturing()) {
            int code = event.getKeyCode();
            if (code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_VOLUME_DOWN) {
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    SharkKeysPlugin.emit(code == KeyEvent.KEYCODE_VOLUME_UP ? "up" : "down");
                }
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    /**
     * La actividad es `singleTask`, así que abrir un segundo libro desde otra
     * app no la vuelve a crear: llega por aquí. Sin este método, "Abrir con
     * SharkReader" solo funcionaría con la app cerrada.
     */
    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        SharkPickerPlugin.setPendingIntent(intent);
    }
}
