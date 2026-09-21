import { describe, it, expect } from 'vitest';
import {
    COPIAS, CADA_MS, nombreCopia, tocaCopiar, sobran, resumenCopias,
} from './autoBackup.js';

const DIA = 24 * 60 * 60 * 1000;

describe('nombreCopia', () => {
    it('el nombre ordena por sí solo', () => {
        // Año-mes-día con ceros: ordenar alfabéticamente es ordenar por fecha,
        // y así la rotación no depende de la fecha del sistema de ficheros.
        expect(nombreCopia(new Date(2026, 8, 7))).toBe('sharkreader-2026-09-07.json');
        expect(nombreCopia(new Date(2026, 11, 25))).toBe('sharkreader-2026-12-25.json');
    });

    it('nombres de días distintos se ordenan bien entre sí', () => {
        const a = nombreCopia(new Date(2026, 8, 9));
        const b = nombreCopia(new Date(2026, 9, 1));
        expect([b, a].sort()).toEqual([a, b]);
    });
});

describe('tocaCopiar', () => {
    it('sin carpeta elegida, no', () => {
        // No hay dónde escribir.
        expect(tocaCopiar({ carpeta: null, libros: 10, ultima: 0 })).toBe(false);
    });

    it('con la biblioteca vacía, no', () => {
        // Una copia vacía encima de las buenas sería peor que no copiar: es
        // exactamente cómo se pierde todo mientras parece que hay respaldo.
        expect(tocaCopiar({ carpeta: 'content://x', libros: 0, ultima: 0 })).toBe(false);
    });

    it('la primera vez, sí', () => {
        expect(tocaCopiar({ carpeta: 'content://x', libros: 3, ultima: 0 })).toBe(true);
    });

    it('recién copiado, no', () => {
        const ahora = 10 * DIA;
        expect(tocaCopiar({ carpeta: 'content://x', libros: 3, ultima: ahora - 1000 }, ahora)).toBe(false);
    });

    it('pasado el plazo, sí', () => {
        const ahora = 10 * DIA;
        expect(tocaCopiar({ carpeta: 'content://x', libros: 3, ultima: ahora - CADA_MS }, ahora)).toBe(true);
    });
});

describe('sobran', () => {
    const copia = (name) => ({ name, uri: `content://doc/${name}` });

    it('con pocas copias no sobra ninguna', () => {
        const copias = [copia('sharkreader-2026-09-07.json'), copia('sharkreader-2026-09-06.json')];
        expect(sobran(copias)).toEqual([]);
    });

    it('pasadas las que se conservan, sobran las más antiguas', () => {
        const copias = [];
        for (let d = 20; d >= 1; d -= 1) {
            copias.push(copia(`sharkreader-2026-09-${String(d).padStart(2, '0')}.json`));
        }
        const fuera = sobran(copias);
        expect(fuera).toHaveLength(20 - COPIAS);
        // Se va la más antigua, no la más nueva. Al revés sería una máquina de
        // destruir respaldos.
        expect(fuera.map((c) => c.name)).toContain('sharkreader-2026-09-01.json');
        expect(fuera.map((c) => c.name)).not.toContain('sharkreader-2026-09-20.json');
    });

    it('no toca ficheros que no son nuestros', () => {
        // La carpeta es del usuario y puede tener cualquier cosa dentro. Borrar
        // algo que no hemos escrito nosotros sería imperdonable.
        const copias = [
            copia('tesis-final.json'),
            copia('sharkreader-2026-09-07.json'),
            copia('notas.json'),
        ];
        expect(sobran(copias, 0).map((c) => c.name)).toEqual(['sharkreader-2026-09-07.json']);
    });

    it('el orden lo da el nombre, no la fecha del sistema de ficheros', () => {
        // Hay proveedores de documentos que devuelven la fecha en cero.
        const copias = [
            { name: 'sharkreader-2026-09-01.json', uri: 'a', modified: 0 },
            { name: 'sharkreader-2026-09-09.json', uri: 'b', modified: 0 },
        ];
        expect(sobran(copias, 1).map((c) => c.name)).toEqual(['sharkreader-2026-09-01.json']);
    });
});

describe('resumenCopias', () => {
    it('sin carpeta invita a elegir una', () => {
        expect(resumenCopias({}).activo).toBe(false);
    });

    it('dice cuándo fue la última, no solo que está activado', () => {
        // «Activado» no informa de nada: lo que quieres saber es si tu copia de
        // hoy existe.
        const ahora = 10 * DIA;
        expect(resumenCopias({ carpeta: 'x', ultima: ahora }, ahora).detalle).toContain('hoy');
        expect(resumenCopias({ carpeta: 'x', ultima: ahora - DIA }, ahora).detalle).toContain('ayer');
        expect(resumenCopias({ carpeta: 'x', ultima: ahora - 3 * DIA }, ahora).detalle).toContain('3 días');
    });

    it('con carpeta pero sin copias todavía lo dice', () => {
        expect(resumenCopias({ carpeta: 'x', ultima: 0 }).detalle).toContain('Todavía sin copias');
    });
});
