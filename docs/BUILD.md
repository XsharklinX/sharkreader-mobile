# Compilar y publicar

## Comandos

```bash
pnpm install          # una vez

pnpm test             # 335 tests, entorno Node
pnpm build            # bundle web en dist/
pnpm sync             # build + copia el bundle al proyecto Android

pnpm apk:debug        # APK instalable para probar
pnpm apk:release      # AAB para Google Play
```

`pnpm sync` va incluido en los dos últimos, así que no hace falta ejecutarlo
aparte.

### Dónde quedan los artefactos

| Comando | Fichero |
|---|---|
| `pnpm apk:debug` | `android/app/build/outputs/apk/debug/app-debug.apk` |
| `pnpm apk:release` | `android/app/build/outputs/bundle/release/app-release.aab` |

### Instalar el APK en un dispositivo

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

O copiar el `.apk` al móvil y abrirlo, permitiendo la instalación de orígenes
desconocidos.

Para ver la consola del WebView: `chrome://inspect` en Chrome de escritorio con
el dispositivo conectado por USB y la depuración USB activada. Es la única forma
razonable de depurar el lector.

---

## Firma para Google Play

El AAB se genera **sin firmar** mientras no exista `keystore.properties`. Play no
acepta un bundle sin firmar, así que este paso hace falta una vez.

### 1. Crear el keystore

Deliberadamente no está generado en el repositorio: la clave de firma es una
credencial personal, y una vez publicada la app, perderla o filtrarla es un
problema serio. Créalo tú:

```bash
keytool -genkeypair -v \
  -keystore sharkreader-release.jks \
  -alias sharkreader \
  -keyalg RSA -keysize 4096 -validity 10000
```

Te pedirá una contraseña y algunos datos. Guarda el `.jks` **fuera del
repositorio** y haz una copia de seguridad: con Play App Signing activado
Google puede ayudarte a recuperar el acceso, pero sin él la clave perdida
significa no poder actualizar nunca la app publicada.

### 2. Declarar las credenciales

Crea `android/keystore.properties` (ya está en `.gitignore`):

```properties
storeFile=C:/ruta/segura/sharkreader-release.jks
storePassword=tu-contraseña
keyAlias=sharkreader
keyPassword=tu-contraseña
```

### 3. Compilar firmado

```bash
pnpm apk:release
```

Gradle detecta el fichero y firma automáticamente. Sin él, el build sigue
funcionando pero el bundle sale sin firmar — útil para comprobar que compila sin
tener las claves a mano.

---

## Versionado

Al preparar una versión hay que tocar dos sitios:

- `package.json` → `version`
- `android/app/build.gradle` → `versionName` (visible) y `versionCode` (entero,
  **siempre creciente**; Play rechaza un bundle cuyo `versionCode` no supere al
  último subido).

| Versión | versionCode |
|---|---|
| 0.1.0 | 1 |
| 0.3.0 | 3 |
| 0.4.0 | 4 |
| 0.5.0 | 5 |

---

## Antes de subir a Play

```bash
pnpm test          # todo en verde
pnpm core:diff     # 0 divergentes con el escritorio
pnpm apk:release   # AAB firmado
```

El resto del expediente de tienda (ficha, capturas, política de privacidad,
formulario de Seguridad de los Datos) está en el roadmap de producto.

### Configuración actual

| | |
|---|---|
| Paquete | `com.sharkreader.mobile` |
| minSdk | 26 (Android 8) |
| targetSdk | 36 (Android 16) |
| R8 y shrinkResources | activados en release |
| Tamaño del AAB | ~12 MB |
