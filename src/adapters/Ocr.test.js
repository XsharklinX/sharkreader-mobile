import { describe, it, expect, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ reconocer: vi.fn() }) }));

const { lineasATrozos } = await import('./Ocr.js');
const { reflujo } = await import('../reader/pdfReflow.js');

describe('lineasATrozos', () => {
    it('deshace la escala y da la vuelta al eje vertical', () => {
        const [trozo] = lineasATrozos(
            [{ texto: 'Hola', x: 80, y: 100, ancho: 200, alto: 40 }],
            { escala: 2, altoFolio: 800 }
        );
        expect(trozo.str).toBe('Hola');
        expect(trozo.width).toBe(100);
        // Pie de la caja: (100 + 40) / 2 = 70 desde arriba → 730 desde abajo.
        expect(trozo.transform[5]).toBe(730);
        expect(trozo.transform[4]).toBe(40);
    });

    it('descarta las líneas vacías', () => {
        expect(lineasATrozos([{ texto: '  ', x: 0, y: 0, ancho: 1, alto: 1 }], { altoFolio: 800 })).toEqual([]);
    });

    it('lo reconocido se convierte en párrafos como un PDF con texto', () => {
        const lineas = [
            { texto: 'El arrendatario se obliga a conservar la finca en el estado en que', x: 120, y: 300, ancho: 1000, alto: 30 },
            { texto: 'la recibe y a devolverla al término del contrato.', x: 120, y: 340, ancho: 760, alto: 30 },
        ];
        const trozos = lineasATrozos(lineas, { escala: 2, altoFolio: 842 });
        const bloques = reflujo([{ numero: 3, trozos, ancho: 595, alto: 842 }]);
        expect(bloques).toHaveLength(1);
        expect(bloques[0].texto).toBe(
            'El arrendatario se obliga a conservar la finca en el estado en que la recibe y a devolverla al término del contrato.'
        );
    });
});
