import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { pdfConTinta } from './exportarTinta.js';

describe('pdfConTinta', () => {
    it('añade los trazos como anotaciones Ink en su página', async () => {
        const original = await PDFDocument.create();
        original.addPage([595, 842]);
        original.addPage([595, 842]);
        const bytes = await original.save();

        const trazos = {
            2: [
                { herramienta: 'boligrafo', color: '#c62828', ancho: 0.004, puntos: [[0.1, 0.1, 0.5], [0.3, 0.12, 0.8]] },
                { herramienta: 'marcador', color: '#ffd400', ancho: 0.018, puntos: [[0.1, 0.5, 0.5], [0.6, 0.5, 0.5]] },
            ],
        };
        const geometria = async () => ({ convertir: (x, y) => [x * 595, (1 - y) * 842], ancho: 595 });
        const salida = await pdfConTinta(bytes, trazos, geometria);

        const leido = await PDFDocument.load(salida);
        const [primera, segunda] = leido.getPages();
        expect(primera.node.Annots()).toBeUndefined();
        const anotaciones = segunda.node.Annots();
        expect(anotaciones.size()).toBe(2);
        const texto = new TextDecoder('latin1').decode(salida);
        expect((texto.match(/\/Subtype \/Ink/g) || []).length).toBe(2);
        expect(texto).toContain('/CA 0.35');
    });
});
