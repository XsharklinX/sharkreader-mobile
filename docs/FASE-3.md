# Fase 3 — Anotaciones y backup (v0.4.0)

Estado: **implementada, sin probar en dispositivo**.

Con esta fase la app deja de ser un lector y pasa a ser un lector serio: se
puede subrayar, anotar y, sobre todo, **traer la biblioteca del escritorio**.

---

## El cambio estructural: gestos dentro del iframe

La Fase 2 dejó una contrapartida documentada: la capa de gestos iba por encima
del iframe de epub.js, lo que impedía seleccionar texto. Subrayar exige
selección, así que había que resolverlo antes que nada.

**Antes** — una capa transparente a pantalla completa por encima del iframe.
Recibía todos los toques; el iframe no recibía ninguno.

**Ahora** — los manejadores se registran *dentro* del documento de cada capítulo,
usando el hook de contenido de epub.js:

```js
rendition.hooks.content.register((contents) => {
    contents.document.addEventListener('pointerdown', ...);
});
```

Conviven las dos cosas porque el gesto se descarta si hay texto marcado:
`shouldIgnore: () => Boolean(engine.selectionText())`. Un dedo que estaba
seleccionando no pasa página.

Dos detalles que hicieron falta:

- **`getWidth`** — el documento de un iframe no tiene `clientWidth`, así que las
  zonas de toque se calculaban contra el ancho de la ventana. Ahora el ancho se
  inyecta desde el contenedor.
- **Repintado de subrayados** — epub.js dibuja los subrayados como overlays SVG,
  no viven en el EPUB. Hay que volver a añadirlos en cada apertura desde
  `book.bookmarks`.

---

## Anotaciones

### Formato

Idéntico al del escritorio, porque un backup tiene que poder ir y venir sin
conversiones:

```
{ cfi, note, date, color, kind }
```

En los subrayados, `note` guarda un JSON con el texto marcado y el comentario —
el formato estructurado que `normalizeAnnotationText` del núcleo ya entiende. Los
tests lo verifican **contra las funciones del núcleo compartido**, no contra una
copia local de las reglas: si el escritorio cambia el formato, estos tests fallan.

### Interacción

Mantener pulsado sobre el texto abre la barra de selección: cuatro colores como
botones de 44 px (en escritorio bastan 16 px en un menú contextual; aquí no),
más nota, copiar y cerrar. Añadir una nota abre una hoja con el texto citado
arriba, para no perder de vista qué se está anotando.

El panel de anotaciones filtra por tipo y por color, con contadores. Tocar una
entrada salta a esa posición; el botón de borrar está separado para no pulsarlo
al saltar.

En PDF la posición es el número de página serializado, el mismo convenio que usa
el escritorio.

---

## Backup: el puente con el escritorio

Toda la lógica difícil ya estaba resuelta y probada en el núcleo compartido:
`validateBackupData`, `migrateBackupToLatest`, `mergeBackupData`. Esta fase solo
mueve bytes y decide qué hacer con el resultado.

**Se fusiona, no se reemplaza.** Si el móvil ya tiene libros con progreso, el
merge compara timestamps por grupo de campos (progreso, metadata, anotaciones) y
se queda con lo más reciente de cada lado. Perder progreso de lectura al
restaurar sería el peor fallo posible en una app de este tipo, así que hay tests
específicos para las dos direcciones:

- El backup es más antiguo que el móvil → gana el móvil.
- El backup es más reciente → se adopta.
- Un libro que solo está en el móvil no desaparece.

Se acepta tanto un `.json` suelto como un ZIP completo (del que se lee
`sharkreader-backup.json`, la fuente de verdad).

**Limitación honesta:** un backup JSON trae la metadata pero no los ficheros. Los
libros que no estén ya en el móvil aparecen con su progreso, sus anotaciones y su
portada, pero hay que importar el EPUB para poder abrirlos. La pantalla de
ajustes lo dice explícitamente en vez de dejar que el usuario lo descubra al
tocar un libro que no abre.

### Exportar

Backup en JSON y anotaciones en Markdown, ambos por el diálogo de compartir de
Android — el equivalente móvil de "guardar como": el usuario decide si va a
Drive, a un correo o a otra app.

---

## Estado

| | |
|---|---|
| Tests | **305** (26 ficheros) |
| APK debug | 25 MB |
| AAB para Play | 12 MB |

Tests nuevos en esta fase: 26 (17 de anotaciones, 9 de fusión de backup).

---

## Sin verificar

Sigue sin ejecutarse en un Android real. Lo nuevo que hay que comprobar, por
orden de riesgo:

1. **Selección de texto dentro del iframe.** Es el cambio con más incertidumbre:
   el comportamiento de la selección en un WebView de Android dentro de un
   iframe es la parte menos predecible de todo el proyecto.
2. **Que los subrayados se repinten** al reabrir un libro y sigan en su sitio al
   cambiar el tamaño de letra (el CFI debería aguantar, pero hay que verlo).
3. **El diálogo de compartir** con un fichero de la caché — que Android conceda
   acceso a la app receptora.
4. **Importar un backup real** exportado desde SharkReader 3.6.
