# Reglas de R8 para SharkReader Mobile.

# ── Capacitor ────────────────────────────────────────────────────────────────
# Los plugins se localizan por reflexión desde el puente de JavaScript: si R8
# renombra las clases o borra los métodos anotados, las llamadas desde el
# WebView dejan de encontrar nada y fallan en tiempo de ejecución, no al compilar.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.annotation.PermissionCallback <methods>;
}

# Nuestro plugin de selección de ficheros entra por la misma vía.
-keep class com.sharkreader.mobile.SharkPickerPlugin { *; }

# ── SQLite ───────────────────────────────────────────────────────────────────
-keep class com.getcapacitor.community.database.sqlite.** { *; }
-keep class io.requery.android.database.** { *; }

# El plugin de SQLite incluye Google Tink para el modo cifrado, aunque aquí se
# use 'no-encryption'. Tink referencia anotaciones de errorprone que no viajan
# en el APK — son de tiempo de compilación. R8 avisa de que faltan; no es un
# problema real, así que se silencian en lugar de añadir una dependencia que
# nadie va a ejecutar.
-dontwarn com.google.errorprone.annotations.**
-dontwarn javax.annotation.**
-dontwarn com.google.j2objc.annotations.**
-keep class com.google.crypto.tink.** { *; }

# Tink trae además un descargador de claves remoto (KeysDownloader) que depende
# del cliente HTTP de Google y de Joda-Time. Esa ruta no se ejecuta nunca: la
# base de datos se abre sin cifrado y no hay claves que descargar de ningún
# servidor. Se silencian las referencias en vez de arrastrar esas librerías.
-dontwarn com.google.api.client.http.**
-dontwarn org.joda.time.**

# ── Depuración ───────────────────────────────────────────────────────────────
# Conservar líneas hace legibles los informes de fallos de Play Console; el
# nombre de fichero original se oculta igualmente.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ── Voz neuronal sin conexión (sherpa-onnx) ──────────────────────────────────
# El código nativo lee los campos de las clases de configuración por su nombre
# (JNI). Si R8 los renombra, la voz falla solo en la versión de Play, que es
# la única que se ofusca. El AAR no trae reglas propias.
-keep class com.k2fsa.sherpa.onnx.** { *; }

# ── Servidor local (NanoHTTPD) y compresión de las voces ─────────────────────
-keep class fi.iki.elonen.** { *; }
-dontwarn org.apache.commons.compress.**
-dontwarn org.brotli.dec.**
-dontwarn com.github.luben.zstd.**
-dontwarn org.tukaani.xz.**
-dontwarn org.objectweb.asm.**
