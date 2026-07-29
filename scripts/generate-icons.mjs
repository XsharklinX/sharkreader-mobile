// Genera los iconos de Android a partir del icono original de SharkReader
// escritorio, para que las dos apps se vean iguales en el sistema.
//
//   pnpm icons            usa ../SharkReader-main/icon.png
//   pnpm icons <ruta>     usa otro origen
//
// Produce:
//   mipmap-*dpi/ic_launcher.png            icono clásico (Android 8 en adelante
//                                          también lo usa como respaldo)
//   mipmap-*dpi/ic_launcher_round.png      variante redonda
//   mipmap-*dpi/ic_launcher_foreground.png capa frontal del icono adaptativo
//   values/ic_launcher_background.xml      color de fondo, tomado del original

import { Jimp } from 'jimp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RES = resolve(HERE, '..', 'android', 'app', 'src', 'main', 'res');
const SOURCE = resolve(process.argv[2] || resolve(HERE, '..', '..', 'SharkReader-main', 'icon.png'));

// Tamaños del icono clásico, en píxeles, por densidad.
const LAUNCHER_SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

// El icono adaptativo se dibuja sobre un lienzo de 108 dp del que el sistema
// solo garantiza que se vean los 72 dp centrales: el resto lo puede recortar
// cualquier máscara (círculo, squircle, gota). Por eso el dibujo se encoge al
// 62% del lienzo — así no se recorta nada del logo, con cualquier máscara.
const ADAPTIVE_SIZES = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
const SAFE_RATIO = 0.62;

const source = await Jimp.read(SOURCE);
console.log(`Origen: ${SOURCE} (${source.width}x${source.height})`);

// El original no es cuadrado. Se recorta al cuadrado centrado más grande
// posible en lugar de deformarlo.
const side = Math.min(source.width, source.height);
const square = source.clone().crop({
    x: Math.round((source.width - side) / 2),
    y: Math.round((source.height - side) / 2),
    w: side,
    h: side,
});

// Color de fondo del icono adaptativo: se toma de una esquina del original,
// para que la capa frontal se funda con el fondo en vez de recortarse contra él.
const corner = square.getPixelColor(2, 2);
const backgroundHex = `#${(corner >>> 8).toString(16).padStart(6, '0').toUpperCase()}`;
console.log(`Color de fondo tomado del original: ${backgroundHex}`);

const write = async (density, name, image) => {
    const dir = resolve(RES, `mipmap-${density}`);
    await mkdir(dir, { recursive: true });
    await image.write(resolve(dir, name));
};

for (const [density, size] of Object.entries(LAUNCHER_SIZES)) {
    const icon = square.clone().resize({ w: size, h: size });
    await write(density, 'ic_launcher.png', icon);
    await write(density, 'ic_launcher_round.png', icon.clone());
}
console.log(`Iconos clásicos: ${Object.keys(LAUNCHER_SIZES).length} densidades x2`);

for (const [density, canvasSize] of Object.entries(ADAPTIVE_SIZES)) {
    const artSize = Math.round(canvasSize * SAFE_RATIO);
    const offset = Math.round((canvasSize - artSize) / 2);

    const canvas = new Jimp({ width: canvasSize, height: canvasSize, color: 0x00000000 });
    canvas.composite(square.clone().resize({ w: artSize, h: artSize }), offset, offset);

    await write(density, 'ic_launcher_foreground.png', canvas);
}
console.log(`Capa frontal adaptativa: ${Object.keys(ADAPTIVE_SIZES).length} densidades`);

await mkdir(resolve(RES, 'values'), { recursive: true });
await writeFile(
    resolve(RES, 'values', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<!-- Generado por scripts/generate-icons.mjs a partir del icono de escritorio. -->
<resources>
    <color name="ic_launcher_background">${backgroundHex}</color>
</resources>
`,
    'utf8'
);

console.log('Listo.');
