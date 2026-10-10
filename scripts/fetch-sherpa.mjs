// Uso: node scripts/fetch-sherpa.mjs
//
// Descarga la librería de voz neuronal sin conexión (sherpa-onnx, Apache-2.0)
// a android/app/libs/sherpa-onnx.aar si todavía no está. Son 39 MB con las
// cuatro arquitecturas, y por eso no va en el repositorio: el AAB de Play solo
// entrega la del móvil que instala (unos 10 MB).
//
// Se ejecuta solo antes de compilar el APK o el AAB (ver package.json).
import { existsSync, mkdirSync, statSync, createWriteStream, renameSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const VERSION = '1.13.8';
const URL_AAR = `https://github.com/k2-fsa/sherpa-onnx/releases/download/v${VERSION}/sherpa-onnx-static-link-onnxruntime-${VERSION}.aar`;
const TAMANO = 38691998;
const destino = new URL('../android/app/libs/sherpa-onnx.aar', import.meta.url);

if (existsSync(destino) && statSync(destino).size === TAMANO) {
    console.log(`sherpa-onnx ${VERSION} ya está.`);
    process.exit(0);
}

mkdirSync(new URL('../android/app/libs/', import.meta.url), { recursive: true });
console.log(`Descargando sherpa-onnx ${VERSION}…`);
const respuesta = await fetch(URL_AAR);
if (!respuesta.ok) {
    console.error(`No se pudo descargar (${respuesta.status}).`);
    process.exit(1);
}
const temporal = new URL('../android/app/libs/sherpa-onnx.aar.part', import.meta.url);
await pipeline(Readable.fromWeb(respuesta.body), createWriteStream(temporal));
if (statSync(temporal).size !== TAMANO) {
    console.error('El fichero descargado no tiene el tamaño esperado.');
    process.exit(1);
}
renameSync(temporal, destino);
console.log('Listo.');
