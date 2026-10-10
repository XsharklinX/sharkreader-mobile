// Uso: node scripts/probar-personajes.mjs ruta/al/libro.epub
//
// Saca los personajes y lugares de un EPUB con el mismo código que la app, para
// ver de un vistazo si la detección tiene sentido con un libro real.
import { readFileSync } from 'node:fs';
import { readEpubChapters } from '../src/library/useContentIndex.js';
import { analizarLibro, textoConParrafos } from '../src/reader/personajes.js';

const ruta = process.argv[2];
if (!ruta) {
    console.error('Falta la ruta del EPUB.');
    process.exit(1);
}

// En Node, JSZip no acepta `Blob`: se le da el buffer directamente.
const capitulos = await readEpubChapters(readFileSync(ruta));
const textos = capitulos.map((c) => textoConParrafos(c.html));
const inicio = performance.now();
const analisis = analizarLibro(textos);
const ms = Math.round(performance.now() - inicio);

console.log(`${textos.length} capítulos, ${textos.join(' ').length} caracteres, ${ms} ms`);
for (const d of analisis.slice(0, 30)) {
    console.log(`${d.tipo.padEnd(9)} ${String(d.total).padStart(4)}  cap. ${d.primero + 1}  ${d.nombre}`);
}
