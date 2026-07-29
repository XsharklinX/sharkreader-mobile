package com.sharkreader.mobile;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Recibe los toques en los botones de la notificación de lectura y los reenvía
 * al plugin, que a su vez los emite hacia JavaScript.
 *
 * Hace falta un receiver aparte porque las acciones de una notificación se
 * disparan como broadcast, no llegan al servicio directamente.
 */
public class SpeechCommandReceiver extends BroadcastReceiver {

    public static final String ACTION_COMMAND = "com.sharkreader.mobile.SPEECH_COMMAND";
    public static final String EXTRA_COMMAND = "command";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION_COMMAND.equals(intent.getAction())) return;
        String command = intent.getStringExtra(EXTRA_COMMAND);
        if (command == null) return;

        SharkSpeechPlugin.dispatch(command);

        if ("stop".equals(command)) {
            SpeechService.stop(context);
        }
    }
}
