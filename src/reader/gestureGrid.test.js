import { describe, it, expect } from 'vitest';
import {
    zoneIndexAt, actionAt, normalizeGrid, withZone, mirrorGrid, canTurnPages,
    DEFAULT_GESTURE_GRID, tapZoneWidth,
} from './gestureGrid.js';

const W = 400;
const H = 900;

describe('zoneIndexAt', () => {
    it('numera como el teclado numérico, de arriba abajo', () => {
        expect(zoneIndexAt(10, 10, W, H)).toBe(0);
        expect(zoneIndexAt(200, 10, W, H)).toBe(1);
        expect(zoneIndexAt(390, 10, W, H)).toBe(2);
        expect(zoneIndexAt(10, 450, W, H)).toBe(3);
        expect(zoneIndexAt(200, 450, W, H)).toBe(4);
        expect(zoneIndexAt(390, 890, W, H)).toBe(8);
    });

    it('las columnas laterales son estrechas, las filas van en tercios', () => {
        const side = tapZoneWidth(W);
        expect(zoneIndexAt(side + 1, 10, W, H)).toBe(1);
        // Justo por debajo de un tercio sigue siendo la fila de arriba.
        expect(zoneIndexAt(200, H / 3 - 1, W, H)).toBe(1);
        expect(zoneIndexAt(200, H / 3 + 1, W, H)).toBe(4);
    });

    it('no se sale de la rejilla en el borde inferior', () => {
        // `y === height` daría fila 3 sin el tope, y con ella un índice 9 que no
        // existe: la zona quedaría muerta justo en el borde.
        expect(zoneIndexAt(200, H, W, H)).toBe(7);
    });

    it('cae en la fila del medio si no se conoce el alto', () => {
        expect(zoneIndexAt(200, 0, W, 0)).toBe(4);
    });
});

describe('actionAt', () => {
    it('sin rejilla configurada se comporta como siempre', () => {
        // Una función nueva no puede cambiarle los gestos a quien nunca entre
        // en la pantalla de configuración.
        expect(actionAt(null, 10, 450, W, H)).toBe('prev');
        expect(actionAt(null, 200, 450, W, H)).toBe('chrome');
        expect(actionAt(null, 390, 450, W, H)).toBe('next');
    });

    it('usa la acción configurada de esa zona', () => {
        const grid = withZone(DEFAULT_GESTURE_GRID, 1, 'bookmark');
        expect(actionAt(grid, 200, 10, W, H)).toBe('bookmark');
        // Las demás no cambian.
        expect(actionAt(grid, 200, 450, W, H)).toBe('chrome');
    });

    it('una zona con acción inventada cae a la de por defecto, no muere', () => {
        const grid = [...DEFAULT_GESTURE_GRID];
        grid[0] = 'teletransportarse';
        expect(actionAt(grid, 10, 10, W, H)).toBe('prev');
    });
});

describe('normalizeGrid', () => {
    it('completa una rejilla corta sin descartar lo válido', () => {
        // Un ajuste guardado por una versión anterior no puede dejar la
        // pantalla muerta ni perder lo que el usuario sí había configurado.
        const result = normalizeGrid(['bookmark', 'toc']);
        expect(result).toHaveLength(9);
        expect(result[0]).toBe('bookmark');
        expect(result[1]).toBe('toc');
        expect(result[8]).toBe(DEFAULT_GESTURE_GRID[8]);
    });

    it('aguanta basura', () => {
        expect(normalizeGrid(null)).toEqual(DEFAULT_GESTURE_GRID);
        expect(normalizeGrid('nueve')).toEqual(DEFAULT_GESTURE_GRID);
        expect(normalizeGrid([1, 2, 3])).toEqual(DEFAULT_GESTURE_GRID);
    });
});

describe('withZone', () => {
    it('no muta la rejilla original', () => {
        const original = [...DEFAULT_GESTURE_GRID];
        withZone(original, 4, 'speech');
        expect(original).toEqual(DEFAULT_GESTURE_GRID);
    });

    it('ignora índices y acciones que no existen', () => {
        expect(withZone(DEFAULT_GESTURE_GRID, 99, 'toc')).toEqual(DEFAULT_GESTURE_GRID);
        expect(withZone(DEFAULT_GESTURE_GRID, 0, 'volar')).toEqual(DEFAULT_GESTURE_GRID);
    });
});

describe('mirrorGrid', () => {
    it('intercambia las columnas laterales y deja la central', () => {
        const mirrored = mirrorGrid(DEFAULT_GESTURE_GRID);
        expect(mirrored[0]).toBe('next');
        expect(mirrored[2]).toBe('prev');
        expect(mirrored[1]).toBe('chrome');
    });

    it('aplicarlo dos veces devuelve el original', () => {
        expect(mirrorGrid(mirrorGrid(DEFAULT_GESTURE_GRID))).toEqual(DEFAULT_GESTURE_GRID);
    });
});

describe('canTurnPages', () => {
    it('la rejilla por defecto pasa página en los dos sentidos', () => {
        expect(canTurnPages(DEFAULT_GESTURE_GRID)).toBe(true);
    });

    it('detecta que no queda forma de avanzar tocando', () => {
        // Es una configuración legítima, pero también a la que se llega
        // trasteando: hay que poder avisar.
        expect(canTurnPages(Array(9).fill('chrome'))).toBe(false);
    });

    it('detecta que solo se puede avanzar, no retroceder', () => {
        expect(canTurnPages(Array(9).fill('next'))).toBe(false);
    });
});

describe('modo una mano', () => {
    it('reconoce los ajustes de una mano', async () => {
        const { PRESETS_GRID, presetDe } = await import('./gestureGrid.js');
        expect(presetDe(PRESETS_GRID.diestro)).toBe('diestro');
        expect(presetDe(PRESETS_GRID.normal)).toBe('normal');
        expect(presetDe(['next', 'next', 'next', 'next', 'next', 'next', 'next', 'next', 'next'])).toBeNull();
    });

    it('con una mano casi todo avanza y atrás queda en la esquina del pulgar', async () => {
        const { PRESETS_GRID, actionAt } = await import('./gestureGrid.js');
        // Diestro: abajo a la derecha, atrás; en el centro, adelante.
        expect(actionAt(PRESETS_GRID.diestro, 390, 780, 400, 800)).toBe('prev');
        expect(actionAt(PRESETS_GRID.diestro, 200, 400, 400, 800)).toBe('next');
        expect(actionAt(PRESETS_GRID.zurdo, 10, 780, 400, 800)).toBe('prev');
    });

    it('lo sugiere solo si nueve de cada diez toques caen en un lado', async () => {
        const { sugerirUnaMano } = await import('./gestureGrid.js');
        expect(sugerirUnaMano({ izquierda: 2, derecha: 38 })).toBe('diestro');
        expect(sugerirUnaMano({ izquierda: 10, derecha: 30 })).toBeNull();
        expect(sugerirUnaMano({ izquierda: 0, derecha: 10 })).toBeNull();
    });
});
