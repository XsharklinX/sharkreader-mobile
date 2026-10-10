import { registerPlugin } from '@capacitor/core';

/**
 * Reconocimiento de texto de páginas escaneadas.
 *
 * El reconocimiento lo hace ML Kit en el teléfono (`SharkOcrPlugin.java`). Aquí
 * está lo demás: pintar la página, convertir lo reconocido a la forma de los
 * trozos de pdf.js —para que el modo lectura no distinga un PDF de verdad de un
 * escaneado— y guardar el resultado, porque reconocer una página cuesta medio
 * segundo y no hay razón para hacerlo dos veces.
 */
const SharkOcr = registerPlugin('SharkOcr');

/**
 * Escala a la que se pinta la página para reconocerla.
 *
 * ML Kit quiere letras de unos 16 a 24 píxeles de alto. Un folio a escala 2
 * deja el cuerpo de texto ahí; más es memoria y tiempo sin ganar aciertos, y
 * menos empieza a confundir la «e» con la «c».
 */
export const ESCALA_OCR = 2;

/**
 * Pasa las líneas de ML Kit a trozos con la forma de pdf.js.
 *
 * ML Kit mide en píxeles de la imagen con el origen arriba; pdf.js en unidades
 * del folio con el origen abajo y la `y` en la línea base. Se deshace la escala,
 * se da la vuelta al eje y se toma como base el pie de la caja.
 *
 * El cuerpo de letra se aproxima por el alto de la caja: incluye ascendentes y
 * descendentes, así que se recorta un poco para que sea comparable con el de un
 * PDF con texto y los títulos se sigan detectando por tamaño.
 *
 * @param {Array<{texto: string, x: number, y: number, ancho: number, alto: number}>} lineas
 * @param {{ escala: number, altoFolio: number }} medidas
 */
export const lineasATrozos = (lineas = [], { escala = ESCALA_OCR, altoFolio }) => lineas
    .filter((linea) => linea?.texto?.trim())
    .map((linea) => {
        const cuerpo = (linea.alto / escala) * 0.78;
        return {
            str: linea.texto,
            width: linea.ancho / escala,
            height: cuerpo,
            transform: [cuerpo, 0, 0, cuerpo, linea.x / escala, altoFolio - (linea.y + linea.alto) / escala],
        };
    });

const claveDe = (libro, pagina) => `ocr:${libro}:${pagina}`;

/**
 * @param {Object} opciones
 * @param {Object} [opciones.storage] puerto de almacenamiento, para recordar lo reconocido
 * @param {string} [opciones.libro] id del libro
 * @param {(pagina: number) => void} [opciones.alEmpezar] para avisar de que se está reconociendo
 */
export const crearOcrDePdf = ({ storage, libro, alEmpezar } = {}) => async (numero, pdfPage) => {
    const clave = libro ? claveDe(libro, numero) : null;
    if (clave && storage) {
        const guardado = await storage.getSetting(clave).catch(() => null);
        if (Array.isArray(guardado)) return guardado;
    }

    alEmpezar?.(numero);

    const vista = pdfPage.getViewport({ scale: ESCALA_OCR });
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(vista.width);
    lienzo.height = Math.round(vista.height);
    const contexto = lienzo.getContext('2d');
    // Fondo blanco: un JPEG de un lienzo transparente sale negro, y sobre negro
    // no se reconoce nada.
    contexto.fillStyle = '#fff';
    contexto.fillRect(0, 0, lienzo.width, lienzo.height);
    await pdfPage.render({ canvasContext: contexto, viewport: vista }).promise;
    const imagen = lienzo.toDataURL('image/jpeg', 0.85);
    lienzo.width = 0;
    lienzo.height = 0;

    const resultado = await SharkOcr.reconocer({ imagen });
    const altoFolio = pdfPage.getViewport({ scale: 1 }).height;
    const trozos = lineasATrozos(resultado?.lineas || [], { escala: ESCALA_OCR, altoFolio });

    if (clave && storage) storage.setSetting(clave, trozos).catch(() => {});
    return trozos;
};

export { SharkOcr };
