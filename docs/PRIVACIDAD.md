# Política de privacidad de SharkReader

**Última actualización: 7 de octubre de 2026 · versión 1.0**

SharkReader (`com.sharkreader.mobile`) es una aplicación de lectura de libros
electrónicos para Android, desarrollada por David Bonilla.

En una línea: **SharkReader no tiene cuentas, ni publicidad, ni servidores
propios, y tus libros, notas y estadísticas no salen de tu teléfono salvo que
tú los envíes.** Esta página explica con detalle cada excepción.

La versión publicada de esta política está en
`https://xsharklinx.github.io/SharkReader/privacidad.html` (copia en HTML de
este documento, en `docs/privacidad.html`).

---

## 1. Lo que se guarda en tu teléfono

Todo esto vive **solo en el almacenamiento privado de la app**:

| Dato | Para qué |
|---|---|
| Los libros que importas (EPUB, PDF, CBZ, TXT, Markdown, DOCX) | Poder leerlos |
| Título, autor, portada, etiquetas y colecciones | Organizar la biblioteca |
| Posición de lectura y progreso | Volver a donde lo dejaste |
| Subrayados, notas, marcadores y lo escrito a mano sobre los PDF | Tus anotaciones |
| Palabras guardadas en el vocabulario y su frase de contexto | Repasar vocabulario |
| Tiempo leído, rachas, metas y logros | Tus estadísticas |
| Preferencias de lectura y de la app | Recordar cómo te gusta leer |
| Voces y modelos de idioma descargados | Que funcionen sin conexión |

Nada de esto se envía a ningún sitio salvo que **tú** lo exportes, lo compartas
o actives una sincronización. Al desinstalar la app, Android lo borra todo.

## 2. Cuándo se conecta a internet

La app se puede usar entera sin conexión. Solo sale a internet en estos casos:

| Destino | Qué se envía | Cuándo |
|---|---|---|
| `openlibrary.org` (Internet Archive) | Título y autor de un libro | Al buscar información o portada, o al usar «Ordenar la biblioteca» |
| `dictionaryapi.dev` | Solo la palabra consultada | Al buscar una palabra en el diccionario |
| Google (modelos de ML Kit) | Nada tuyo: se descarga el modelo de un idioma | La primera vez que traduces, usas ayudas de vocabulario o reconoces el texto de un escaneado en ese idioma |
| Google (IA del teléfono, AICore) | Nada tuyo: Android descarga su modelo | Solo si pulsas «Usar la IA del teléfono para resumir» |
| `github.com` (proyecto sherpa-onnx) | Nada tuyo: se descarga una voz | Solo al descargar una «voz natural sin conexión» |
| Tu ordenador, en tu wifi | Posición, subrayados y notas | Solo si emparejas SharkReader de escritorio; no pasa por internet |
| Tu servidor WebDAV | Tu biblioteca y progreso | Solo si configuras la sincronización con **tu** servidor |
| El proxy de voces que configures | El texto que se lee en voz alta | Solo si configuras un proxy de voces neuronales propio |

**La traducción, el reconocimiento de texto y los resúmenes se hacen en el
teléfono.** Lo que traduces, reconoces o resumes no sale de él.

## 3. Diagnósticos de Google ML Kit

La traducción, el reconocimiento de texto de los escaneados y los resúmenes usan
las bibliotecas **ML Kit de Google**, que funcionan en el teléfono. Según la
documentación de Google, ML Kit envía a Google **datos de diagnóstico y uso**:
modelo del dispositivo y versión de Android, nombre y versión de la app,
métricas de rendimiento, configuración usada (por ejemplo, los idiomas),
códigos de error y, en las funciones de IA, identificadores técnicos.

- Viajan **cifrados (HTTPS)** y Google declara que **no los cede a terceros**.
- **No incluyen** el texto de tus libros, lo que traduces ni tus notas.
- Solo se producen si usas alguna de esas tres funciones.

Detalle oficial: <https://developers.google.com/ml-kit/android-data-disclosure>.

## 4. Dictar notas (micrófono)

El botón «Dictar la nota» usa el **reconocimiento de voz del propio Android**.
La app pide que se haga **sin conexión**, y si tu teléfono tiene el idioma
descargado, la voz no sale de él. Si no lo tiene, el servicio de voz del
sistema (normalmente Google) puede procesarla en sus servidores según su propia
política. SharkReader **no graba ni guarda audio**: solo recibe el texto.

El permiso de micrófono se pide la primera vez que pulsas el botón, nunca antes.

## 5. Permisos

| Permiso | Para qué | ¿Hace falta? |
|---|---|---|
| Internet y estado de la red | Lo descrito en el apartado 2 | No: la app funciona sin conexión |
| Notificaciones | Recordatorios de lectura y resumen semanal | No: se pide al activarlos |
| Servicio en primer plano (reproducción) y mantener activo | Que la lectura en voz alta siga con la pantalla apagada | Solo al leer en voz alta |
| Huella / biometría | Bloquear la app, si lo activas | No |
| Micrófono | Dictar notas | Se pide al pulsar «Dictar» |
| Acceso a «No molestar» | Silenciar avisos mientras lees, si lo activas | Lo concedes tú en los ajustes de Android |
| Vibración | Respuesta al pasar páginas | No |
| Arranque del teléfono | Volver a programar los recordatorios tras reiniciar | Solo con recordatorios |

**La app no pide acceso a tus archivos.** Los libros se eligen con el selector
de Android, que solo da acceso a lo que tú escoges. Tampoco pide contactos,
ubicación, cámara, calendario, llamadas ni SMS.

## 6. Compartir con terceros

SharkReader **no vende, cede ni comparte** tus datos. No hay publicidad ni
analítica propia. Cuando usas «Compartir» —una cita, un PDF con tus notas, las
tarjetas de Anki, una copia de seguridad— eres tú quien elige la app de
destino, y desde ese momento se rige por la política de esa app.

## 7. Borrar tus datos

No hay cuenta que borrar. Todo se elimina desinstalando la app o desde
*Ajustes de Android › Aplicaciones › SharkReader › Almacenamiento › Borrar datos*.
Dentro de la app puedes borrar libros, anotaciones, vocabulario y voces
descargadas uno a uno.

## 8. Menores

La app no está dirigida a menores y no recoge datos personales de nadie.

## 9. Cambios

Si una versión futura cambia algo de esto, la política se actualizará antes de
publicarla y se indicará en las notas de la versión.

## 10. Contacto

- Correo: contactoyerlindavid@gmail.com
- Incidencias: https://github.com/XsharklinX/SharkReader/issues
