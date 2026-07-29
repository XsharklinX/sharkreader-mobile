package com.sharkreader.mobile;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SharkPickerPlugin.class);
        registerPlugin(SharkSpeechPlugin.class);
        super.onCreate(savedInstanceState);

        SharkPickerPlugin.setPendingIntent(getIntent());
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
