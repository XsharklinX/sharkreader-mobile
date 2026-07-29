# Ficha de Google Play — SharkReader

Textos listos para pegar en Play Console. Longitudes ya comprobadas contra los
límites que impone la plataforma.

---

## Título (máx. 30 caracteres)

```
SharkReader: Lector EPUB PDF
```
*28 caracteres.*

## Descripción corta (máx. 80 caracteres)

```
Lector de EPUB y PDF sin cuenta, sin nube y sin anuncios. Todo en tu móvil.
```
*74 caracteres. Los tres «sin» son el argumento: es lo que nos separa del resto
de la categoría.*

## Descripción larga (máx. 4000 caracteres)

```
SharkReader es un lector de libros para quien lee en serio.

Sin cuenta. Sin nube. Sin anuncios. Sin suscripción. Tus libros y tu progreso
viven en tu móvil y no salen de ahí.

━━━━━━━━━━━━━━━━━━━━

📖 LECTURA

• EPUB, PDF, CBZ, TXT y Markdown
• Seis temas de lectura: oscuro, negro, sepia, crema, papel y noche
• Tamaño, interlineado, márgenes y fuente ajustables por libro
• Modo páginas o desplazamiento continuo
• Atenuador de pantalla deslizando por el borde, para leer de noche por debajo
  del brillo mínimo del sistema
• Modo dislexia con más aire entre letras y palabras
• Avance automático con seis velocidades
• Teclas de volumen para pasar página
• Índice con búsqueda y búsqueda dentro del libro
• Progreso de capítulo separado del progreso del libro, con minutos restantes
  calculados a partir de tu ritmo real

🔊 LECTURA EN VOZ ALTA

• Voz del sistema Android, sin conexión
• Sigue sonando con la pantalla apagada
• Control desde la notificación y desde los auriculares
• Toca un párrafo para saltar a esa parte
• Temporizador de apagado para escuchar antes de dormir

✍️ ANOTACIONES

• Subrayados en cuatro colores con notas
• Marcadores y panel filtrable por tipo y color
• Exportación a Markdown con frontmatter, lista para Obsidian
• Diccionario en seis idiomas, con caché que funciona sin conexión
• Vocabulario exportable
• Imagen de cita compartible con la portada del libro

📚 BIBLIOTECA

• Importa libros sueltos o una carpeta entera
• Detección de duplicados
• Series con detección de huecos: te dice cuál te falta
• Colecciones propias con emoji
• Portadas y metadata desde OpenLibrary
• Tu propia imagen como portada
• Búsqueda, filtros y orden

📊 PROGRESO

• Racha diaria con récord histórico
• Mapa de calor de tus días de lectura
• 59 logros en cuatro rarezas
• Sistema de niveles: de Aprendiz a Leyenda
• Metas diaria y semanal
• Recordatorio diario y resumen semanal

🔄 TUS DATOS SON TUYOS

• Backup completo exportable en un JSON
• Sincronización opcional por WebDAV con tu propio servidor (Nextcloud,
  ownCloud o el tuyo): sin cuenta de SharkReader de por medio
• Compatible con SharkReader para Windows: el progreso, los subrayados y los
  logros viajan entre el escritorio y el móvil

🔒 PRIVACIDAD DE VERDAD

• Cero recopilación de datos
• Sin publicidad ni telemetría
• Sin permisos de almacenamiento: los libros entran por el selector de Android
• Funciona entera sin conexión
• Código abierto

━━━━━━━━━━━━━━━━━━━━

SharkReader nació en el escritorio porque casi todos los lectores tenían algún
problema grave: eran de pago, pedían cuenta o mandaban los datos a servidores
ajenos. Esta es la misma idea, hecha para el móvil.

Gratis. Sin trucos.
```

*≈ 2 350 caracteres.*

---

## Categorización

| Campo | Valor |
|---|---|
| Categoría | Libros y obras de consulta |
| Etiquetas | lector, epub, pdf, libros, lectura, offline |
| Tipo | Aplicación |
| Público objetivo | 13 años en adelante |
| Contiene anuncios | No |
| Compras en la aplicación | No |

---

## Recursos gráficos que hay que preparar

| Recurso | Tamaño | Estado |
|---|---|---|
| Icono | 512 × 512 PNG 32 bits | **Pendiente**: hay que exportar el icono del escritorio a 512 px |
| Gráfico destacado | 1024 × 500 | **Pendiente** |
| Capturas de teléfono | mín. 2, máx. 8 · 16:9 o 9:16 | **Pendiente**: hacerlas con la app en un dispositivo |
| Capturas de tablet 7" y 10" | opcional | Pendiente |

**Capturas sugeridas, en este orden** — las dos primeras son lo único que ve la
mayoría:

1. Biblioteca con la tarjeta de continuar leyendo
2. Lector abierto en sepia, con el doble progreso visible
3. Ajustes de lectura con los seis temas
4. Subrayado con la barra de selección
5. Lectura en voz alta con la barra de reproducción
6. Progreso: racha, mapa de calor y logros
7. Ficha de libro
8. Diccionario abierto sobre una palabra

---

## Formulario de Seguridad de los Datos

| Pregunta | Respuesta |
|---|---|
| ¿Recopila o comparte datos de usuario? | **No** |
| ¿Los datos se cifran en tránsito? | No aplica |
| ¿Se pueden solicitar la eliminación de los datos? | Sí, desinstalando la app |
| ¿La app está dirigida a menores? | No |

Justificación de `INTERNET`: metadata de OpenLibrary, diccionario y sincronización
WebDAV opcional, las tres a petición explícita del usuario.

---

## Antes de subir

```bash
pnpm test          # todo en verde
pnpm core:diff     # 0 divergentes con el escritorio
pnpm apk:release   # AAB firmado
```

Y la lista corta:

- [ ] Keystore creado y respaldado fuera del repositorio
- [ ] `keystore.properties` en `android/` (está en .gitignore)
- [ ] Política de privacidad publicada en una URL estable
- [ ] Icono 512×512 y gráfico destacado exportados
- [ ] Al menos 2 capturas reales de dispositivo
- [ ] Cuestionario de clasificación de contenido completado
- [ ] Prueba cerrada con 12 testers durante 14 días
- [ ] `versionCode` mayor que el último subido
