package com.sharkreader.mobile;

import android.os.Build;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executor;

/**
 * Bloqueo de la app con huella, cara o el PIN del dispositivo.
 *
 * Para qué sirve en un lector: la biblioteca dice qué lees, cuánto y a qué
 * hora, y las notas subrayadas suelen ser lo más personal que hay en la app.
 * Que alguien coja el móvil desbloqueado y lo vea todo es el caso real.
 *
 * ## Lo que este bloqueo es y lo que no
 *
 * **No cifra nada.** Los libros y la base de datos siguen en el almacenamiento
 * privado de la app, protegidos por el aislamiento de Android, igual que antes.
 * Esto es una puerta en la interfaz: impide que alguien con el móvil en la mano
 * abra la app, no que alguien con acceso al sistema de ficheros lea los datos.
 * Prometer lo contrario sería mentir sobre algo que importa.
 *
 * ## Por qué se admite también el PIN
 *
 * `DEVICE_CREDENTIAL` deja usar el patrón o el PIN además de la biometría. Sin
 * eso, quien no tenga huella registrada —o la tenga y le falle con las manos
 * mojadas— se quedaría fuera de su propia biblioteca sin alternativa.
 */
@CapacitorPlugin(name = "SharkLock")
public class SharkLockPlugin extends Plugin {

    /** Autenticadores admitidos: biometría de cualquier nivel, o credencial del móvil. */
    private static final int ALLOWED =
        BiometricManager.Authenticators.BIOMETRIC_WEAK
        | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    /**
     * ¿Se puede pedir autenticación en este dispositivo?
     *
     * Se distingue «no hay hardware» de «hay pero no está configurado», porque
     * al usuario hay que decirle cosas distintas: en el segundo caso puede
     * arreglarlo yendo a los ajustes del sistema.
     */
    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        BiometricManager manager = BiometricManager.from(getContext());

        int status = manager.canAuthenticate(ALLOWED);

        switch (status) {
            case BiometricManager.BIOMETRIC_SUCCESS:
                result.put("available", true);
                result.put("reason", "ok");
                break;
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                result.put("available", false);
                result.put("reason", "not-enrolled");
                break;
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                result.put("available", false);
                result.put("reason", "no-hardware");
                break;
            default:
                result.put("available", false);
                result.put("reason", "unavailable");
        }

        call.resolve(result);
    }

    /**
     * Pide autenticación.
     *
     * Resuelve siempre —nunca rechaza— con `{ ok, reason }`. Un error de
     * autenticación no es un error de programación: que el usuario cancele es
     * el camino normal, y tratarlo como excepción obligaría a envolver cada
     * llamada en un try/catch para el caso más frecuente.
     */
    @PluginMethod
    public void authenticate(PluginCall call) {
        String title = call.getString("title", "SharkReader");
        String subtitle = call.getString("subtitle", "Desbloquea tu biblioteca");

        FragmentActivity activity = getActivity();
        if (activity == null) {
            call.resolve(new JSObject().put("ok", false).put("reason", "no-activity"));
            return;
        }

        activity.runOnUiThread(() -> {
            Executor executor = ContextCompat.getMainExecutor(getContext());

            BiometricPrompt prompt = new BiometricPrompt(activity, executor,
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        call.resolve(new JSObject().put("ok", true).put("reason", "ok"));
                    }

                    @Override
                    public void onAuthenticationError(int code, CharSequence message) {
                        JSObject payload = new JSObject().put("ok", false);
                        // Distinguir la cancelación del fallo real importa: si
                        // el usuario cancela, la app se queda bloqueada en
                        // silencio; si el sistema falla, hay que contarlo.
                        boolean cancelled =
                            code == BiometricPrompt.ERROR_USER_CANCELED
                            || code == BiometricPrompt.ERROR_NEGATIVE_BUTTON
                            || code == BiometricPrompt.ERROR_CANCELED;
                        payload.put("reason", cancelled ? "cancelled" : "error");
                        payload.put("message", message == null ? "" : message.toString());
                        call.resolve(payload);
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        // Huella no reconocida: el sistema deja reintentar solo,
                        // así que aquí no se hace nada. Resolver ahora cerraría
                        // el diálogo tras el primer dedo mal puesto.
                    }
                });

            BiometricPrompt.PromptInfo.Builder info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle(subtitle);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                info.setAllowedAuthenticators(ALLOWED);
            } else {
                // Por debajo de Android 11 no se pueden combinar biometría y
                // credencial en la misma llamada: se pide biometría y se ofrece
                // el botón de credencial del sistema.
                info.setDeviceCredentialAllowed(true);
            }

            prompt.authenticate(info.build());
        });
    }
}
