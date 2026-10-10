// Uso: node scripts/generar-frecuencias.mjs carpeta-con-los-txt
//
// Genera `src/reader/frecuencias/<idioma>.json` a partir de las listas de
// FrequencyWords (https://github.com/hermitdave/FrequencyWords, contenido
// CC-BY-SA 4.0): `content/2018/<idioma>/<idioma>_50k.txt`.
//
// Se quedan las 25.000 primeras palabras, en orden de frecuencia, sin números,
// sin palabras de una letra y sin las que llevan signos. Es lo que necesitan las
// ayudas de vocabulario para decidir qué palabra es rara para cada nivel.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const IDIOMAS = ['en', 'es', 'fr', 'de', 'it', 'pt'];
const MAXIMO = 25000;
const origen = process.argv[2];
if (!origen) {
    console.error('Falta la carpeta con los ficheros <idioma>.txt');
    process.exit(1);
}

const destino = new URL('../src/reader/frecuencias/', import.meta.url);
mkdirSync(destino, { recursive: true });

for (const idioma of IDIOMAS) {
    const lineas = readFileSync(join(origen, `${idioma}.txt`), 'utf8').split(/\r?\n/);
    const palabras = [];
    const vistas = new Set();
    for (const linea of lineas) {
        const palabra = linea.split(' ')[0]?.trim().toLocaleLowerCase(idioma);
        if (!palabra || palabra.length < 2 || !/^\p{L}+$/u.test(palabra) || vistas.has(palabra)) continue;
        vistas.add(palabra);
        palabras.push(palabra);
        if (palabras.length >= MAXIMO) break;
    }
    writeFileSync(new URL(`${idioma}.json`, destino), JSON.stringify(palabras));
    console.log(`${idioma}: ${palabras.length} palabras`);
}
