# Fases 1 y 2 — Biblioteca y lectores (v0.2.0 → v0.3.0)

Estado: **implementadas, sin probar en dispositivo**.

Prioridad acordada: biblioteca y lectura. Logros, Sharky y Workshop se quedan
como estaban en la Fase 0 (listados pero sin funcionalidad).

---

## Fase 1 — Biblioteca (v0.2.0)

### Cómo entran los libros

Android no da rutas de fichero. El usuario elige a través del selector del
sistema y la app recibe una URI `content://` con permiso temporal. El plugin
nativo [`SharkPickerPlugin.java`](../android/app/src/main/java/com/sharkreader/mobile/SharkPickerPlugin.java)
resuelve las dos piezas que no se pueden hacer desde JavaScript:

1. Abrir `ACTION_OPEN_DOCUMENT` (ficheros sueltos, selección múltiple) y
   `ACTION_OPEN_DOCUMENT_TREE` (carpeta completa, recorrida en anchura hasta 6
   niveles y 2000 ficheros).
2. **Copiar cada libro al almacenamiento privado con streams de Java**, sin
   cruzar el puente de Capacitor.

Ese segundo punto es la decisión importante. Pasar un EPUB de 8 MB a JavaScript
en base64 costaría segundos y triplicaría la memoria; copiarlo en nativo es
inmediato. Lo que vuelve a JavaScript es solo metadata y una ruta local, que el
WebView lee después con `Capacitor.convertFileSrc()` + `fetch()`.

Efecto secundario útil: como el fichero se copia, `sourcePath` vuelve a tener
sentido en móvil — apunta a la copia privada. El roadmap daba por perdido ese
campo; en la práctica se conserva.

### Almacenamiento

[`SqliteStorage.js`](../src/adapters/SqliteStorage.js) guarda el `BookRecord`
completo del escritorio en una columna JSON y **extrae aparte las columnas por
las que se consulta** (título, autor, progreso, favorito, fechas, serie).

Así el núcleo compartido sigue viendo la misma estructura que en Electron
—`toStoredBookRecord` y `hydrateStoredBook` funcionan sin tocar una línea— y a la
vez hay índices reales para ordenar y filtrar. Los binarios nunca entran en la
base de datos.

La importación masiva usa una sola transacción: importar 100 libros con 100
transacciones separadas es un orden de magnitud más lento.

### Importación

[`importBooks.js`](../src/library/importBooks.js) saca metadata y portada:

- **EPUB** — `epubMeta.js` del núcleo compartido, sin cambios.
- **PDF** — metadata del documento y primera página rasterizada como portada.

Las portadas pasan por `resizeCoverDataUrl` antes de guardarse, igual que en
escritorio. La deduplicación usa las mismas dos claves (`getBookDedupKey` por
fichero y `getBookTitleDedupKey` por título+autor), así que reimportar la misma
carpeta no duplica nada.

---

## Fase 2 — Lectores (v0.3.0)

### EPUB

| Pieza | Fichero |
|---|---|
| Motor sobre epub.js | [`EpubEngine.js`](../src/reader/EpubEngine.js) |
| Gestos | [`useGestures.js`](../src/reader/useGestures.js) |
| Tipografía y temas | [`typography.js`](../src/reader/typography.js) |
| Pantalla | [`ReaderScreen.jsx`](../src/reader/ReaderScreen.jsx) |

**Gestos.** La pantalla se reparte en tres zonas verticales: 28% izquierda
(atrás), 44% centro (mostrar u ocultar la interfaz), 28% derecha (adelante).
Deslizar horizontalmente también pasa página, con umbrales que distinguen un
gesto real de un roce al hacer scroll. Cubierto por 12 tests.

**Modo oscuro universal.** Muchos EPUB traen `color` y `background-color` en su
propio CSS o en atributos en línea. Las reglas de tema usan `!important` y
apuntan a los elementos concretos, igual que en escritorio; sin eso, un libro con
fondo blanco fijo sigue saliendo blanco.

**Mapa de localizaciones.** Calcular el porcentaje leído requiere que epub.js
recorra el libro entero, lo que tarda segundos en un libro largo. Se calcula una
vez y se guarda en `settings`; la segunda apertura es inmediata.

**Contrapartida conocida.** La capa de gestos va por encima del iframe porque
epub.js se queda todos los eventos de puntero. Mientras esté activa **no se
puede seleccionar texto**. No estorba ahora (los subrayados son de la v0.4.0),
pero habrá que desactivarla en modo selección cuando lleguen.

### PDF

[`PdfReaderScreen.jsx`](../src/reader/PdfReaderScreen.jsx) sobre pdf.js: los
mismos gestos, zoom, índice con destinos resueltos a número de página, y barra
para saltar. El modo oscuro invierte el canvas (`invert(1) hue-rotate(180deg)`)
porque no hay texto que estilar.

### Sesión de lectura

[`useReadingClock.js`](../src/library/useReadingClock.js) suma un minuto al libro
y a las estadísticas por cada minuto en primer plano. **El reloj se para cuando
la app pasa a segundo plano** — si no, dejar el móvil en el bolsillo con el
lector abierto inflaría la racha. Las rachas las calcula `applyReadingMinute` del
núcleo compartido, así que salen idénticas a las del escritorio.

### Botón atrás

Dentro del lector vuelve a la biblioteca; fuera de la pestaña principal vuelve a
ella; en la raíz sale de la app. Sin esto, atrás cerraría la app siempre — la
queja número uno en las reseñas de apps web empaquetadas.

---

## Problemas encontrados y resueltos

**Bucle infinito de renders.** `onProgress` cambia de identidad en cada render
del padre y estaba en las dependencias de un efecto que lo llamaba: llamada →
render → nuevo `onProgress` → efecto otra vez. Resuelto guardándolo en una ref en
los dos lectores. Se detectó revisando el cableado, no en ejecución.

**R8 contra Google Tink.** El plugin de SQLite arrastra Tink (para el modo
cifrado, que no usamos) y este referencia anotaciones de errorprone y un
descargador de claves HTTP que no viajan en el APK. El build de release falló.
Resuelto con reglas `-dontwarn` en
[`proguard-rules.pro`](../android/app/proguard-rules.pro), donde también se
protegen por reflexión las clases de Capacitor y el plugin propio.

> Esta es exactamente la sorpresa que se evitó al activar R8 en la Fase 0 en vez
> de en la 7: apareció ahora, con margen, y no la semana del lanzamiento.

---

## Tamaños

| Artefacto | Tamaño |
|---|---|
| APK debug | 27 MB |
| APK release universal | 21 MB |
| **AAB para Play** | **12 MB** |

El AAB es la cifra que cuenta: Play reparte solo la arquitectura de cada
dispositivo. Muy por debajo del objetivo de 40 MB.

---

## Sin verificar todavía

Nada de esto se ha ejecutado en un Android real. Lo que hay que comprobar en
cuanto haya dispositivo, por orden de riesgo:

1. **El selector SAF** — que devuelve ficheros y que la copia nativa funciona.
2. **Apertura de un EPUB grande** — tiempo hasta la primera página y cuánto tarda
   el mapa de localizaciones la primera vez.
3. **Zonas de toque** — que la capa de gestos recibe los eventos por encima del
   iframe. Es la parte con más incertidumbre del diseño.
4. **Persistencia de posición** — cerrar la app y reabrir en el mismo párrafo.
5. **Rendimiento del scroll** de la rejilla con 100+ portadas.

Para depurar: `chrome://inspect` en Chrome de escritorio con el dispositivo
conectado por USB.
