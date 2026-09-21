import { describe, it, expect } from 'vitest';
import {
    ventanaDe, visibleDe, paginaVisible, altoEstimado, VENTANA,
} from './pdfScroll.js';

describe('ventanaDe', () => {
    it('pinta unas cuantas por delante y por detrás', () => {
        expect(ventanaDe(10, 500)).toEqual({ desde: 10 - VENTANA, hasta: 10 + VENTANA });
    });

    it('no se sale por el principio ni por el final', () => {
        expect(ventanaDe(1, 500).desde).toBe(1);
        expect(ventanaDe(500, 500).hasta).toBe(500);
    });

    it('con un documento de una página, esa página', () => {
        expect(ventanaDe(1, 1)).toEqual({ desde: 1, hasta: 1 });
    });
});

describe('visibleDe', () => {
    it('una página entera dentro se ve entera', () => {
        expect(visibleDe({ top: 100, bottom: 400 }, 800)).toBe(300);
    });

    it('lo que sobresale por arriba no cuenta', () => {
        expect(visibleDe({ top: -200, bottom: 100 }, 800)).toBe(100);
    });

    it('lo que sobresale por abajo tampoco', () => {
        expect(visibleDe({ top: 700, bottom: 1200 }, 800)).toBe(100);
    });

    it('una página fuera de pantalla no se ve nada', () => {
        expect(visibleDe({ top: 900, bottom: 1200 }, 800)).toBe(0);
        expect(visibleDe(null, 800)).toBe(0);
    });
});

describe('paginaVisible', () => {
    it('gana la que más ocupa, no la que asoma primero', () => {
        // Desplazando siempre se ven trozos de dos páginas. La que dirías si te
        // preguntaran es la que llena la pantalla.
        const cajas = [
            { pagina: 3, top: -500, bottom: 100 },
            { pagina: 4, top: 100, bottom: 800 },
        ];
        expect(paginaVisible(cajas, 800)).toBe(4);
    });

    it('con el borde justo en medio no tiembla', () => {
        // Empate exacto: gana la de arriba, siempre la misma. Con la regla al
        // revés el número bailaría entre dos valores al quedarse ahí parado.
        const cajas = [
            { pagina: 7, top: -200, bottom: 400 },
            { pagina: 8, top: 400, bottom: 1000 },
        ];
        expect(paginaVisible(cajas, 800)).toBe(7);
    });

    it('sin nada visible no inventa una página', () => {
        expect(paginaVisible([], 800)).toBe(0);
        expect(paginaVisible([{ pagina: 2, top: 900, bottom: 1200 }], 800)).toBe(0);
    });
});

describe('altoEstimado', () => {
    it('reserva un hueco con la proporción de la primera página', () => {
        expect(altoEstimado(400, 1.5)).toBe(600);
    });

    it('sin proporción conocida usa la de un folio', () => {
        // A4: alto entre ancho. Es la apuesta correcta para un PDF.
        expect(altoEstimado(1000, 0)).toBe(1414);
    });
});
