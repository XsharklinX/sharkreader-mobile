// Compara src/core/ con el original de SharkReader escritorio.
//
// El núcleo de esta app es una copia literal de los módulos puros del escritorio.
// La ventaja es que sincronizar es copiar un fichero; el riesgo es que las dos
// copias se separen sin que nadie se entere. Este script hace visible ese riesgo.
//
//   pnpm core:diff              compara contra la ruta por defecto
//   pnpm core:diff <ruta>       compara contra otro checkout
//
// Salida: 0 si todo coincide, 1 si hay diferencias.

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE_CORE = resolve(HERE, '..', 'src', 'core');
const DEFAULT_DESKTOP = resolve(HERE, '..', '..', 'SharkReader-main', 'src');

const desktopSrc = resolve(process.argv[2] || DEFAULT_DESKTOP);

const sha = (buffer) => createHash('sha256').update(buffer).digest('hex').slice(0, 12);

if (!existsSync(desktopSrc)) {
    console.error(`No encuentro el origen: ${desktopSrc}`);
    console.error('Pásalo como argumento: pnpm core:diff <ruta-a-SharkReader-main/src>');
    process.exit(2);
}

const files = (await readdir(MOBILE_CORE)).filter((name) => name.endsWith('.js')).sort();

const same = [];
const changed = [];
const orphan = [];

for (const name of files) {
    const origin = join(desktopSrc, name);
    if (!existsSync(origin)) {
        orphan.push(name);
        continue;
    }
    const [mine, theirs] = await Promise.all([
        readFile(join(MOBILE_CORE, name)),
        readFile(origin),
    ]);
    if (sha(mine) === sha(theirs)) same.push(name);
    else changed.push({ name, mine: sha(mine), theirs: sha(theirs) });
}

console.log(`\nNúcleo compartido — ${files.length} ficheros`);
console.log(`Origen: ${desktopSrc}\n`);
console.log(`  idénticos   ${same.length}`);
console.log(`  divergentes ${changed.length}`);
console.log(`  sin origen  ${orphan.length}`);

if (changed.length) {
    console.log('\nDivergentes (móvil / escritorio):');
    changed.forEach(({ name, mine, theirs }) => {
        console.log(`  ${name.padEnd(28)} ${mine}  ${theirs}`);
    });
    console.log('\nDecide en cada caso: copiar el del escritorio encima, o');
    console.log('llevar el cambio del móvil al escritorio.');
}

if (orphan.length) {
    console.log('\nSolo existen en móvil:');
    orphan.forEach((name) => console.log(`  ${name}`));
}

console.log('');
process.exit(changed.length ? 1 : 0);
