import { describe, it, expect } from 'vitest';
import {
    resolveSheetDrag, sheetOffset, scrimOpacity, CLOSE_DISTANCE,
} from './sheetDrag.js';

describe('resolveSheetDrag', () => {
    it('un tirón largo cierra', () => {
        expect(resolveSheetDrag(CLOSE_DISTANCE + 1, 400).close).toBe(true);
    });

    it('un tirón corto y lento no cierra', () => {
        // Bajar treinta píxeles en medio segundo es tantear, no cerrar.
        expect(resolveSheetDrag(30, 500).close).toBe(false);
    });

    it('un tirón corto pero rápido cierra', () => {
        expect(resolveSheetDrag(40, 50).close).toBe(true);
    });

    it('subir nunca cierra', () => {
        expect(resolveSheetDrag(-200, 100).close).toBe(false);
    });

    it('sin movimiento no cierra: es un toque en el asa', () => {
        expect(resolveSheetDrag(0, 10).close).toBe(false);
    });
});

describe('sheetOffset', () => {
    it('hacia abajo sigue al dedo exactamente', () => {
        expect(sheetOffset(120)).toBe(120);
    });

    it('hacia arriba apenas se mueve', () => {
        // La hoja ya está arriba: no hay nada que enseñar por encima.
        expect(sheetOffset(-100)).toBeCloseTo(-12);
    });
});

describe('scrimOpacity', () => {
    it('en reposo el velo está entero', () => {
        expect(scrimOpacity(0, 900)).toBe(1);
    });

    it('se aclara al bajar la hoja', () => {
        expect(scrimOpacity(300, 900)).toBeLessThan(1);
        expect(scrimOpacity(300, 900)).toBeGreaterThan(0);
    });

    it('nunca baja de cero', () => {
        expect(scrimOpacity(5000, 900)).toBe(0);
    });

    it('sin altura medida no oscurece a ciegas', () => {
        expect(scrimOpacity(300, 0)).toBe(1);
    });
});
