# Fase 0 — Cimientos (v0.1.0)

Estado: **completada**.

Objetivo: montar el proyecto y demostrar que el núcleo del escritorio se ejecuta
dentro de un WebView de Android. Nada visible para el usuario final.

## Entregado

| Entregable | Resultado |
|---|---|
| Proyecto standalone | `SharkReader-Mobile/`, sin tocar `SharkReader-main/` |
| Núcleo compartido | 30 módulos + 21 ficheros de test, copiados sin modificar |
| Tests | 246 pasando en Node |
| Capa de puertos | 5 interfaces definidas, adaptadores de Android con stubs |
| Armazón de la app | 5 pestañas, temas oscuro/claro/sepia, zonas seguras |
| Proyecto Android | Capacitor 7, `com.sharkreader.mobile`, minSdk 26 / targetSdk 36 |
| APK de depuración | 4,1 MB, compila |
| Build de release | R8 y shrinkResources activados desde el principio — 1,1 MB |
| Firma | `keystore.properties` leído desde Gradle, fuera del repositorio |
| Intent filters | `application/epub+zip` y `application/pdf` declarados |
| Guardián de divergencia | `pnpm core:diff` |

## Decisiones tomadas

**Copia del núcleo en vez de monorepo.** El roadmap original movía el proyecto
Electron a `apps/desktop/`. Se descartó para no tocar el proyecto de escritorio.
Coste: sincronización manual. Mitigación: los ficheros son copias literales, así
que sincronizar es sobrescribir, y `pnpm core:diff` detecta cualquier deriva.

**Directorio `core/` plano.** El roadmap proponía subcarpetas por dominio
(`books/`, `reading/`…). Se descartó: obligaría a reescribir los imports de cada
fichero y rompería la propiedad de "copia literal". Los 30 módulos importan solo
de hermanos, así que en plano funcionan sin editar una línea.

**R8 activado en la Fase 0, no en la 7.** El roadmap lo situaba en el pulido
final. Adelantarlo cuesta unos minutos de build y evita la sorpresa clásica de
"funciona en debug, se rompe en release" justo antes de publicar.

**minSdk 26 en vez del 23 por defecto de Capacitor.** Por debajo de Android 8 el
WebView del sistema es demasiado antiguo para epub.js, y quedan pocos
dispositivos.

**targetSdk 36.** Es el nivel que Google Play exige para apps nuevas.

## Pendiente antes de la Fase 1

- **Icono de la app.** El del escritorio (`icon.png`) es de 257×265 px: no llega
  ni para el icono adaptativo de Android ni para los 512×512 que pide Play.
  Hace falta un original de 1024×1024. Mientras tanto, el APK lleva el icono por
  defecto de Capacitor.
- **Probar en dispositivo físico.** El APK compila, pero todavía no se ha
  instalado en un Android real. Es lo primero que hay que hacer.

## Cómo verificar la fase

```bash
pnpm test        # 246 tests en verde
pnpm apk:debug   # genera android/app/build/outputs/apk/debug/app-debug.apk
```

Instalar el APK y comprobar en la pantalla **Biblioteca** que la tarjeta "Núcleo
compartido" muestra 59 logros, 16 addons y el esquema de backup v4. Si esos
números aparecen, los 30 módulos del escritorio se están ejecutando dentro del
WebView.
