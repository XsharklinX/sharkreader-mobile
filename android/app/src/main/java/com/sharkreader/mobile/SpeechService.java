package com.sharkreader.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.view.KeyEvent;

import androidx.core.app.NotificationCompat;

/**
 * Servicio en primer plano para la lectura en voz alta.
 *
 * Sin esto, Android congela los temporizadores del WebView poco después de
 * salir de la app y la voz se corta: la lectura en voz alta solo servía con la
 * pantalla encendida y la app delante, que es justo cuando menos falta hace.
 *
 * El servicio no sintetiza nada — de eso sigue encargándose el motor del
 * sistema desde JavaScript. Lo que hace es mantener el proceso vivo y publicar
 * una sesión multimedia, para que la notificación y los botones de los
 * auriculares controlen la reproducción.
 */
public class SpeechService extends Service {

    public static final String ACTION_START = "com.sharkreader.mobile.SPEECH_START";
    public static final String ACTION_UPDATE = "com.sharkreader.mobile.SPEECH_UPDATE";
    public static final String ACTION_STOP = "com.sharkreader.mobile.SPEECH_STOP";

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_CHAPTER = "chapter";
    public static final String EXTRA_PLAYING = "playing";

    private static final String CHANNEL_ID = "sharkreader_speech";
    private static final int NOTIFICATION_ID = 4201;

    /** Puente con el plugin: los botones de la notificación llegan a JavaScript por aquí. */
    public interface CommandListener {
        void onCommand(String command);
    }

    private static CommandListener listener;

    public static void setCommandListener(CommandListener value) {
        listener = value;
    }

    private static void emit(String command) {
        if (listener != null) listener.onCommand(command);
    }

    private MediaSessionCompat session;
    private String title = "SharkReader";
    private String chapter = "";
    private boolean playing = true;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();

        session = new MediaSessionCompat(this, "SharkReaderSpeech");
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { emit("play"); }
            @Override public void onPause() { emit("pause"); }
            @Override public void onStop() { emit("stop"); }
            @Override public void onSkipToNext() { emit("next"); }
            @Override public void onSkipToPrevious() { emit("previous"); }

            @Override
            public boolean onMediaButtonEvent(Intent mediaButtonEvent) {
                KeyEvent event = mediaButtonEvent.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
                if (event != null && event.getAction() == KeyEvent.ACTION_DOWN) {
                    switch (event.getKeyCode()) {
                        case KeyEvent.KEYCODE_HEADSETHOOK:
                        case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                            emit("toggle");
                            return true;
                        default:
                            break;
                    }
                }
                return super.onMediaButtonEvent(mediaButtonEvent);
            }
        });
        session.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;

        if (ACTION_STOP.equals(action)) {
            stopSelf();
            return START_NOT_STICKY;
        }

        if (intent != null) {
            if (intent.hasExtra(EXTRA_TITLE)) title = intent.getStringExtra(EXTRA_TITLE);
            if (intent.hasExtra(EXTRA_CHAPTER)) chapter = intent.getStringExtra(EXTRA_CHAPTER);
            if (intent.hasExtra(EXTRA_PLAYING)) playing = intent.getBooleanExtra(EXTRA_PLAYING, true);
        }

        updateSessionState();
        startForeground(NOTIFICATION_ID, buildNotification());
        return START_NOT_STICKY;
    }

    private void updateSessionState() {
        session.setPlaybackState(new PlaybackStateCompat.Builder()
            .setActions(PlaybackStateCompat.ACTION_PLAY
                | PlaybackStateCompat.ACTION_PAUSE
                | PlaybackStateCompat.ACTION_PLAY_PAUSE
                | PlaybackStateCompat.ACTION_STOP
                | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS)
            .setState(
                playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN,
                1f
            )
            .build());
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPending = PendingIntent.getActivity(
            this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(chapter.isEmpty() ? "Lectura en voz alta" : chapter)
            .setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
            .setContentIntent(openPending)
            .setOngoing(playing)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                .setMediaSession(session.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2));

        builder.addAction(action(android.R.drawable.ic_media_previous, "Anterior", "previous"));
        builder.addAction(playing
            ? action(android.R.drawable.ic_media_pause, "Pausar", "pause")
            : action(android.R.drawable.ic_media_play, "Reanudar", "play"));
        builder.addAction(action(android.R.drawable.ic_media_next, "Siguiente", "next"));
        builder.addAction(action(android.R.drawable.ic_menu_close_clear_cancel, "Detener", "stop"));

        return builder.build();
    }

    private NotificationCompat.Action action(int icon, String label, String command) {
        Intent intent = new Intent(this, SpeechCommandReceiver.class);
        intent.setAction(SpeechCommandReceiver.ACTION_COMMAND);
        intent.putExtra(SpeechCommandReceiver.EXTRA_COMMAND, command);

        PendingIntent pending = PendingIntent.getBroadcast(
            this, command.hashCode(), intent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
        return new NotificationCompat.Action(icon, label, pending);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID, "Lectura en voz alta", NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Controles mientras SharkReader lee un libro en voz alta.");
        channel.setShowBadge(false);
        channel.setSound(null, null);
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    @Override
    public void onDestroy() {
        if (session != null) {
            session.setActive(false);
            session.release();
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /** Arranca o actualiza la notificación desde el plugin. */
    public static void update(Context context, String title, String chapter, boolean playing) {
        Intent intent = new Intent(context, SpeechService.class);
        intent.setAction(ACTION_UPDATE);
        intent.putExtra(EXTRA_TITLE, title);
        intent.putExtra(EXTRA_CHAPTER, chapter);
        intent.putExtra(EXTRA_PLAYING, playing);
        context.startForegroundService(intent);
    }

    public static void stop(Context context) {
        Intent intent = new Intent(context, SpeechService.class);
        intent.setAction(ACTION_STOP);
        context.startService(intent);
    }
}
