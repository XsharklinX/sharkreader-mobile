/**
 * De dónde sale el texto de cada página de un PDF.
 *
 * Normalmente, de pdf.js (`getTextContent`). Si la página es un escaneado y hay
 * reconocimiento de texto disponible, del OCR del teléfono. Quien lee —el modo
 * lectura, la búsqueda, la voz— no tiene que saber cuál de los dos fue: recibe
 * siempre trozos con la misma forma que los de pdf.js.
 *
 * Las coordenadas se devuelven **relativas al folio**: algunos PDF tienen el
 * origen de la página desplazado (`view` no empieza en 0,0), y `pdfReflow`
 * decide qué es cabecera y qué es columna por la posición en el folio.
 */

/** Lo mínimo de texto para dar una página por buena sin pedir OCR. */
const CON_TEXTO = 20;

/**
 * @param {Object} doc documento de pdf.js
 * @param {Object} [opciones]
 * @param {(numero: number, pagina: Object) => Promise<Object[]|null>} [opciones.ocr]
 *   Reconoce una página sin texto. Devuelve trozos con la forma de pdf.js, o
 *   `null` si no puede.
 */
export const crearFuentePdf = (doc, { ocr } = {}) => {
    const cache = new Map();

    const leer = async (numero) => {
        const pagina = await doc.getPage(numero);
        const [x0, y0, x1, y1] = pagina.view || [0, 0, 0, 0];
        const ancho = x1 - x0;
        const alto = y1 - y0;

        let trozos = [];
        try {
            const contenido = await pagina.getTextContent();
            trozos = (contenido.items || [])
                .filter((item) => typeof item.str === 'string')
                .map((item) => ({
                    str: item.str,
                    width: item.width,
                    height: item.height,
                    transform: [...item.transform.slice(0, 4), item.transform[4] - x0, item.transform[5] - y0],
                }));
        } catch {
            trozos = [];
        }

        let reconocida = false;
        const letras = trozos.reduce((n, t) => n + t.str.trim().length, 0);
        if (letras < CON_TEXTO && ocr) {
            const deOcr = await ocr(numero, pagina).catch(() => null);
            if (deOcr?.length) {
                trozos = deOcr;
                reconocida = true;
            }
        }

        return { numero, trozos, ancho, alto, reconocida };
    };

    return {
        total: doc.numPages,
        /** Una página, leída una sola vez por sesión. */
        pagina(numero) {
            if (!cache.has(numero)) {
                cache.set(numero, leer(numero).catch((error) => {
                    cache.delete(numero);
                    throw error;
                }));
            }
            return cache.get(numero);
        },
        /** Varias páginas seguidas, en orden. */
        async paginas(desde, hasta) {
            const lista = [];
            for (let n = desde; n <= Math.min(hasta, doc.numPages); n += 1) {
                lista.push(await this.pagina(n));
            }
            return lista;
        },
    };
};
