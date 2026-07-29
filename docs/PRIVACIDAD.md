# Política de privacidad de SharkReader Mobile

**Última actualización: 29 de julio de 2026**

SharkReader Mobile (`com.sharkreader.mobile`) es una aplicación de lectura de
libros electrónicos para Android, desarrollada por David Bonilla.

Esta política existe porque Google Play la exige, pero el resumen cabe en una
línea: **la app no recopila ningún dato personal y no tiene servidores propios.**

---

## Qué datos se recogen

**Ninguno.**

SharkReader no tiene cuentas de usuario, no pide registro, no incluye SDK de
analítica, no muestra publicidad y no envía información a ningún servidor
propio. No existe ningún servidor de SharkReader.

---

## Qué se guarda y dónde

Todo lo siguiente se almacena **exclusivamente en tu dispositivo**, en el
almacenamiento privado de la aplicación:

| Dato | Para qué |
|---|---|
| Los ficheros EPUB, PDF, CBZ, TXT y Markdown que importas | Poder leerlos |
| Título, autor, portada y etiquetas | Organizar la biblioteca |
| Posición de lectura y porcentaje de progreso | Reanudar donde lo dejaste |
| Subrayados, notas y marcadores | Tus anotaciones |
| Minutos leídos, racha, logros y metas | Las estadísticas de lectura |
| Preferencias de lectura y de la app | Recordar cómo te gusta leer |
| Palabras guardadas en el vocabulario | La lista de vocabulario |

Nada de esto sale del dispositivo salvo que **tú** lo exportes, lo compartas o
configures una sincronización.

Al desinstalar la aplicación, Android borra todos estos datos.

---

## Conexiones a internet

La app funciona por completo sin conexión. Solo sale a internet en estos casos,
y siempre porque tú lo pides:

**1. Buscar metadata y portadas (OpenLibrary)**
Cuando pulsas «Metadata» en la ficha de un libro, se envía el título y el autor
a `openlibrary.org` para buscar la portada y los datos de catálogo. No se envía
nada más ni se identifica tu dispositivo. Se rige por la
[política de privacidad de Internet Archive](https://archive.org/about/terms.php).

**2. Diccionario**
Al consultar una palabra se envía **solo esa palabra** a `dictionaryapi.dev`. No
se envía el libro, el contexto ni ningún identificador. Las definiciones se
guardan en caché en tu dispositivo para poder consultarlas después sin conexión.

**3. Sincronización WebDAV (opcional, desactivada por defecto)**
Si la configuras, la app se conecta **a tu propio servidor** —Nextcloud,
ownCloud o el que indiques— con las credenciales que tú introduces. Los datos
viajan del dispositivo a tu servidor y no pasan por ninguna infraestructura
nuestra. Las credenciales se guardan en el almacenamiento privado de la app.

Si nunca usas estas tres funciones, la app no hace **ninguna** conexión de red.

---

## Permisos que solicita la aplicación

| Permiso | Para qué | Obligatorio |
|---|---|---|
| `INTERNET` | Las tres funciones de arriba | No: la app funciona sin ellas |
| `POST_NOTIFICATIONS` | Recordatorio diario y resumen semanal | No: se pide al activar la función |
| `FOREGROUND_SERVICE` y `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Que la lectura en voz alta continúe con la pantalla apagada | No: solo se usa al leer en voz alta |

**La app no pide permisos de almacenamiento.** Los libros se seleccionan a
través del Storage Access Framework de Android, que solo da acceso a los
ficheros que tú eliges, uno a uno o por carpeta.

No se solicita acceso a contactos, ubicación, cámara, micrófono, calendario,
llamadas ni SMS.

---

## Compartir con terceros

La aplicación **no comparte, vende ni cede datos a terceros**. No hay
integraciones publicitarias ni de análisis.

Cuando usas «Compartir» —una imagen de cita, un backup, tus anotaciones o tu
vocabulario— eres tú quien elige la aplicación de destino, y a partir de ese
momento el contenido se rige por la política de esa aplicación.

---

## Menores

La aplicación no está dirigida específicamente a menores, pero tampoco recopila
datos de nadie, por lo que no recoge información de menores de ninguna edad.

---

## Cambios en esta política

Si en el futuro se añade alguna función que implique tratamiento de datos, esta
política se actualizará antes de publicar esa versión, y el cambio se indicará
en las notas de la versión.

---

## Contacto

Para cualquier duda sobre privacidad:

- Correo: syzcompartido@gmail.com
- Incidencias: https://github.com/XsharklinX/SharkReader/issues

---

## Formulario de Seguridad de los Datos de Google Play

Para dejar constancia de lo declarado en Play Console:

- **¿Recopila datos de usuario?** No
- **¿Comparte datos con terceros?** No
- **¿Los datos se cifran en tránsito?** No aplica: no se transmiten datos propios
- **¿Se pueden eliminar los datos?** Sí, desinstalando la app o borrando su
  almacenamiento desde los ajustes de Android
