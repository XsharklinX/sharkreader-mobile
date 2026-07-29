# SharkReader Mobile 🦈

**Lector de EPUB y PDF para Android. Local-first, gratuito, sin cuenta, sin nube.**

Port a Android de [SharkReader](../SharkReader-main) 3.6.0. Comparte el núcleo de
dominio con la versión de escritorio; la interfaz está construida desde cero para
una mano y un pulgar.

Estado actual: **v0.1.0 — Fase 0 (Cimientos)**. El APK arranca, navega entre las
cinco pantallas y ejecuta el núcleo compartido. Todavía no lee libros.

---

## Stack

| Capa | Tecnología |
|---|---|
| Contenedor nativo | Capacitor 7 |
| UI | React 19 |
| Bundler | Vite 8 (rolldown) |
| Lector EPUB | epub.js 0.3.93 |
| Lector PDF | pdf.js 5.x |
| Tests | Vitest 4 |
| Almacenamiento | SQLite + Filesystem *(v0.2.0)* |
| minSdk / targetSdk | 26 (Android 8) / 36 (Android 16) |

**Por qué Capacitor y no React Native:** epub.js y pdf.js son DOM puro. Cualquier
camino que no incluya un WebView obliga a reescribir el motor de lectura, que son
270 KB de lógica ya depurada. React Native acabaría metiendo un WebView de todas
formas, pero perdiendo la reutilización.

---

## Requisitos

- Node.js 20+
- pnpm 8+
- JDK 17
- Android SDK con plataforma 36 y build-tools 36
- `ANDROID_HOME` apuntando al SDK

---

## Desarrollo

```bash
pnpm install

pnpm dev            # servidor de Vite en el navegador
pnpm test           # tests del núcleo (Vitest, entorno Node)
pnpm build          # bundle web en dist/

pnpm sync           # build + copia el bundle al proyecto Android
pnpm android        # sync + abre Android Studio
pnpm android:run    # sync + instala en el dispositivo conectado
pnpm apk:debug      # APK de depuración
pnpm apk:release    # AAB firmado para Play (necesita keystore.properties)
```

Para depurar el WebView: `chrome://inspect` en Chrome de escritorio, con el
dispositivo conectado por USB y la depuración USB activada.

---

## Arquitectura

```
src/
├── core/       # copia literal de los módulos puros del escritorio — no editar aquí
├── ports/      # interfaces de plataforma (Storage, FilePicker, Tts, Notifier, Sync)
├── adapters/   # implementaciones para Android
├── screens/    # una pantalla por pestaña
├── ui/         # piezas compartidas de interfaz
├── reader/     # motores de lectura (v0.3.0)
└── styles/     # tokens y estilos globales
```

### La regla que sostiene el diseño

**Ningún fichero de `src/core/` puede importar de `src/ports/`.** La dependencia
va siempre hacia el núcleo, nunca al revés. Eso es lo que permite que los tests
corran en Node sin mocks de `window`, y lo que hace que el mismo código funcione
en Electron y en un WebView.

### El núcleo es una copia, no un paquete

`src/core/` contiene 30 módulos copiados **byte a byte** de
`SharkReader-main/src/`. Sincronizar es copiar el fichero encima, sin tocar
imports. El riesgo es que las dos copias se separen sin que nadie se dé cuenta,
así que hay una herramienta para verlo:

```bash
pnpm core:diff
```

Compara cada fichero contra el original y lista los que han divergido. Conviene
ejecutarlo antes de cada release.

> Cuando el port esté maduro, lo natural es convertir esto en un monorepo con
> `packages/core` compartido de verdad. Se hizo por copia para no tocar el
> proyecto de escritorio durante el desarrollo del móvil.

---

## Privacidad

Sin cuentas, sin telemetría, sin SDK de analítica. La app pide dos permisos:

- `INTERNET` — solo para portadas de OpenLibrary y sync WebDAV opcional
- `POST_NOTIFICATIONS` — recordatorios de lectura *(v0.5.0)*

Los libros entran por el Storage Access Framework, así que **no** se piden
permisos de almacenamiento amplio.

---

## Roadmap

| Versión | Fase | Contenido |
|---|---|---|
| v0.1.0 | Cimientos | Andamiaje, núcleo compartido, APK que arranca |
| v0.2.0 | Biblioteca | Importación vía SAF, SQLite, rejilla, metadata |
| v0.3.0 | Lector EPUB | epub.js, gestos, tipografía, modo oscuro |
| v0.4.0 | Anotaciones y PDF | Subrayados, notas, pdf.js, import de backup |
| v0.5.0 | Progreso | Racha, XP, 59 logros, Sharky, notificaciones |
| v0.6.0 | Voz y Workshop | TTS del sistema, 13 addons portables |
| v0.9.0 | Pulido | Accesibilidad, rendimiento, prueba cerrada |
| v1.0.0 | Lanzamiento | Ficha de Play, despliegue por fases |

Detalle completo en [docs/ROADMAP.md](docs/ROADMAP.md).
