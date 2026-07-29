// Crea el keystore de firma y su fichero de credenciales.
//
//   pnpm keystore
//
// El keystore se genera **en tu máquina** y nunca entra al repositorio: tanto el
// .jks como keystore.properties están en .gitignore. La contraseña se genera al
// azar y se escribe solo en ese fichero — no se imprime por pantalla, para que
// no acabe en un historial de terminal ni en un log.
//
// AVISO IMPORTANTE: haz una copia de seguridad del .jks y de keystore.properties
// fuera del proyecto. Con Play App Signing activado Google puede ayudarte a
// recuperar el acceso, pero sin esa red de seguridad perder la clave significa
// no poder actualizar nunca más la app publicada.

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ANDROID = resolve(HERE, '..', 'android');
const KEYSTORE = resolve(ANDROID, 'sharkreader-release.jks');
const PROPERTIES = resolve(ANDROID, 'keystore.properties');
const ALIAS = 'sharkreader';

if (existsSync(KEYSTORE)) {
    console.log(`El keystore ya existe: ${KEYSTORE}`);
    console.log('Si de verdad quieres uno nuevo, muévelo o bórralo primero.');
    console.log('Ojo: cambiar de clave impide actualizar una app ya publicada.');
    process.exit(0);
}

// 32 bytes en base64url: suficiente entropía y sin caracteres que compliquen
// el escapado en Gradle o en la línea de comandos.
const password = randomBytes(32).toString('base64url');

const dname = [
    'CN=SharkReader',
    'OU=SharkReader',
    'O=SharkReader',
    'L=Unknown',
    'ST=Unknown',
    'C=ES',
].join(', ');

console.log('Generando el keystore de firma…');

try {
    execFileSync('keytool', [
        '-genkeypair',
        '-v',
        '-keystore', KEYSTORE,
        '-alias', ALIAS,
        '-keyalg', 'RSA',
        '-keysize', '4096',
        // 10 000 días: Play exige que el certificado siga siendo válido hasta
        // bien pasado 2033.
        '-validity', '10000',
        '-storepass', password,
        '-keypass', password,
        '-dname', dname,
    ], { stdio: ['ignore', 'ignore', 'inherit'] });
} catch (error) {
    console.error('\nNo se pudo ejecutar keytool.');
    console.error('Viene con el JDK: comprueba que está en el PATH (java -version).');
    process.exit(1);
}

writeFileSync(
    PROPERTIES,
    [
        '# Credenciales de firma. NO subir a ningún repositorio.',
        '# Generado por scripts/create-keystore.mjs',
        `storeFile=${KEYSTORE.replace(/\\/g, '/')}`,
        `storePassword=${password}`,
        `keyAlias=${ALIAS}`,
        `keyPassword=${password}`,
        '',
    ].join('\n'),
    'utf8'
);

console.log(`
Listo.

  Keystore     ${KEYSTORE}
  Credenciales ${PROPERTIES}

La contraseña se ha generado al azar y está escrita en keystore.properties.
No se muestra aquí a propósito.

Los dos ficheros están en .gitignore. Haz una copia de seguridad de ambos
fuera del proyecto: si los pierdes tras publicar, no podrás actualizar la app.

Ahora ya puedes generar el AAB firmado:

  pnpm apk:release
`);
