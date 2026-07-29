// Descarga las fuentes de lectura y las deja empaquetadas en src/fonts/.
//
//   pnpm fonts
//
// Se bajan de Google Fonts, que sirve variantes ya subconjuntadas por rango
// Unicode. Solo se guardan `latin` y `latin-ext`: cubren el español completo
// —acentos, eñe, apertura de interrogación— y dejan fuera el cirílico y el
// griego, que triplicarían el peso sin aportar nada a nuestros lectores.
//
// Las tres fuentes son de licencia libre (SIL Open Font License), así que
// pueden viajar dentro del APK sin condiciones más allá de conservar el aviso
// de licencia, que se escribe junto a los ficheros.

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'src', 'fonts');

/**
 * Se pide como un navegador moderno para que la API devuelva woff2 y, cuando
 * existe, la versión variable. Con un agente antiguo devolvería ttf y pesaría
 * el triple.
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const FONTS = [
    {
        id: 'literata',
        family: 'Literata',
        // Variable en tamaño óptico y peso: un solo fichero sirve para el
        // cuerpo de texto y para las negritas.
        query: 'Literata:opsz,wght@7..72,400;7..72,700',
        why: 'Cuerpo de lectura. Encargada por Google para leer libros en pantalla.',
    },
    {
        id: 'source-serif',
        family: 'Source Serif 4',
        query: 'Source+Serif+4:opsz,wght@8..60,400;8..60,700',
        why: 'Alternativa con más carácter para quien encuentre Literata neutra.',
    },
    {
        id: 'atkinson',
        family: 'Atkinson Hyperlegible',
        query: 'Atkinson+Hyperlegible:wght@400;700',
        why: 'Del Braille Institute. Formas muy diferenciadas para baja visión y dislexia.',
    },
];

/** Rangos que nos interesan. El resto se descarta. */
const WANTED = ['latin', 'latin-ext'];

const fetchText = async (url) => {
    const response = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!response.ok) throw new Error(`${response.status} al pedir ${url}`);
    return response.text();
};

/**
 * Parte el CSS de Google en bloques @font-face y se queda con los que
 * corresponden a los subconjuntos que queremos. Cada bloque va precedido de un
 * comentario con el nombre del subconjunto, que es cómo se identifica.
 */
const parseFaces = (css) => {
    const faces = [];
    const blocks = css.split('/*').slice(1);

    for (const block of blocks) {
        const subset = block.slice(0, block.indexOf('*/')).trim();
        if (!WANTED.includes(subset)) continue;

        const url = block.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
        const weight = block.match(/font-weight:\s*([^;]+);/)?.[1]?.trim() || '400';
        const style = block.match(/font-style:\s*([^;]+);/)?.[1]?.trim() || 'normal';
        const unicodeRange = block.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim() || '';

        if (url) faces.push({ subset, url, weight, style, unicodeRange });
    }
    return faces;
};

await mkdir(OUT, { recursive: true });

const declarations = [];
/** Ficheros ya escritos, por hash de contenido. */
const written = new Map();
let totalBytes = 0;

for (const font of FONTS) {
    process.stdout.write(`${font.family}… `);

    const css = await fetchText(`https://fonts.googleapis.com/css2?family=${font.query}&display=swap`);
    const faces = parseFaces(css);

    if (faces.length === 0) {
        console.log('sin variantes utilizables, se omite');
        continue;
    }

    let index = 0;
    for (const face of faces) {
        const response = await fetch(face.url, { headers: { 'User-Agent': UA } });
        if (!response.ok) continue;

        const buffer = Buffer.from(await response.arrayBuffer());

        // Una fuente variable cubre todos los pesos con un único fichero, así
        // que Google devuelve el mismo binario para regular y negrita. Sin
        // deduplicar, cada familia pesaría el doble en el APK para nada.
        const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 8);
        let fileName = written.get(hash);

        if (!fileName) {
            fileName = `${font.id}-${face.subset}-${hash}.woff2`;
            await writeFile(resolve(OUT, fileName), buffer);
            written.set(hash, fileName);
            totalBytes += buffer.length;
        }

        index += 1;

        declarations.push(
            `@font-face {\n`
            + `    font-family: '${font.family}';\n`
            + `    font-style: ${face.style};\n`
            + `    font-weight: ${face.weight};\n`
            + `    font-display: swap;\n`
            + `    src: url('./${fileName}') format('woff2');\n`
            + (face.unicodeRange ? `    unicode-range: ${face.unicodeRange};\n` : '')
            + `}`
        );
    }

    console.log(`${index} variantes`);
}

const header = [
    '/* Generado por scripts/fetch-fonts.mjs — no editar a mano.',
    ' *',
    ' * Fuentes de lectura empaquetadas en la app. Solo subconjuntos latin y',
    ' * latin-ext: cubren el español completo sin arrastrar cirílico ni griego.',
    ' *',
    ...FONTS.map((font) => ` * · ${font.family}: ${font.why}`),
    ' *',
    ' * Todas con licencia SIL Open Font License 1.1.',
    ' */',
].join('\n');

await writeFile(
    resolve(OUT, 'fonts.css'),
    `${header}\n\n${declarations.join('\n\n')}\n`,
    'utf8'
);

await writeFile(
    resolve(OUT, 'LICENCIAS.txt'),
    [
        'Fuentes empaquetadas en SharkReader Mobile',
        '',
        ...FONTS.map((font) => `${font.family} — SIL Open Font License 1.1`),
        '',
        'La OFL permite empaquetar y redistribuir estas fuentes dentro de una',
        'aplicación, incluso comercial, siempre que se conserve este aviso y no',
        'se vendan las fuentes por separado.',
        '',
        'Texto completo: https://scripts.sil.org/OFL',
    ].join('\n'),
    'utf8'
);

console.log(`\nListo. ${(totalBytes / 1024).toFixed(0)} KB en ${OUT}`);
