import { comoAnotacionPdf } from './tinta.js';

/**
 * El PDF con lo escrito a mano, para llevárselo.
 *
 * Los trazos van como **anotaciones «Ink»** de verdad, no pintados encima de la
 * página: en Acrobat, en Drive o en el visor del ordenador se ven, se pueden
 * ocultar y se pueden borrar uno a uno, igual que si se hubieran hecho allí. El
 * PDF original no se toca; se comparte una copia.
 *
 * `geometria(pagina)` devuelve `{ convertir(x, y), ancho }` para esa página:
 * lo calcula quien tiene pdf.js abierto, que sabe de giros y de cajas.
 *
 * pdf-lib se carga solo aquí: son 500 KB que no hacen falta para leer.
 */
export const pdfConTinta = async (bytes, porPagina, geometria) => {
    const { PDFDocument, PDFName } = await import('pdf-lib');
    const documento = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const paginas = documento.getPages();
    const ctx = documento.context;

    for (const [clave, trazos] of Object.entries(porPagina || {})) {
        const numero = Number(clave);
        const pagina = paginas[numero - 1];
        if (!pagina || !trazos?.length) continue;
        const { convertir, ancho } = await geometria(numero);

        const referencias = trazos.map((trazo) => {
            const a = comoAnotacionPdf(trazo, convertir, ancho);
            const recursos = a.opacidad < 1
                ? { ExtGState: { GS0: { Type: 'ExtGState', CA: a.opacidad, ca: a.opacidad } } }
                : {};
            const apariencia = ctx.register(ctx.stream(a.apariencia.contenido, {
                Type: 'XObject',
                Subtype: 'Form',
                BBox: [0, 0, a.apariencia.ancho, a.apariencia.alto],
                Resources: recursos,
            }));
            return ctx.register(ctx.obj({
                Type: 'Annot',
                Subtype: 'Ink',
                Rect: a.rect,
                InkList: [a.inkList],
                C: a.color,
                CA: a.opacidad,
                BS: { W: a.grosor, S: 'S' },
                // Imprimible: si se imprime el PDF, lo escrito sale.
                F: 4,
                NM: `sharkreader-${numero}-${Math.random().toString(36).slice(2, 10)}`,
                T: 'SharkReader',
                AP: { N: apariencia },
                P: pagina.ref,
            }));
        });

        const existentes = pagina.node.lookup(PDFName.of('Annots'));
        if (existentes && typeof existentes.push === 'function') {
            referencias.forEach((r) => existentes.push(r));
        } else {
            pagina.node.set(PDFName.of('Annots'), ctx.obj(referencias));
        }
    }

    return documento.save({ useObjectStreams: false });
};
