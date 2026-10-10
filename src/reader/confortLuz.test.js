import { describe, it, expect, vi } from 'vitest';
import { nivelDe, suavizar, ajustesPara, describir, createConfortLuz, ESPERA_MS } from './confortLuz.js';

describe('nivelDe', () => {
    it('reparte la luz en cuatro situaciones', () => {
        expect(nivelDe(2)).toBe('oscuro');
        expect(nivelDe(30)).toBe('tenue');
        expect(nivelDe(300)).toBe('interior');
        expect(nivelDe(20000)).toBe('claro');
    });

    it('rozar el umbral no cambia de nivel', () => {
        // Límite oscuro/tenue en 8 lux.
        expect(nivelDe(9, 'oscuro')).toBe('oscuro');
        expect(nivelDe(11, 'oscuro')).toBe('tenue');
        expect(nivelDe(7, 'tenue')).toBe('tenue');
        expect(nivelDe(5, 'tenue')).toBe('oscuro');
    });
});

describe('suavizar', () => {
    it('la primera lectura se toma tal cual', () => {
        expect(suavizar(null, 100)).toBe(100);
    });

    it('un pico aislado se nota poco', () => {
        expect(suavizar(10, 10000)).toBeLessThan(100);
    });
});

describe('ajustesPara', () => {
    const base = { theme: 'dark', dim: 0, warm: 0 };

    it('a oscuras propone noche cálida y menos brillo', () => {
        expect(ajustesPara('oscuro', { base })).toMatchObject({ theme: 'warmnight' });
        expect(ajustesPara('oscuro', { base }).dim).toBeGreaterThan(0);
    });

    it('con luz normal deja lo que el usuario tenía', () => {
        expect(ajustesPara('interior', { base })).toEqual(base);
    });

    it('con mucha luz pasa a un tema claro si el del usuario es oscuro', () => {
        expect(ajustesPara('claro', { base }).theme).toBe('paper');
        expect(ajustesPara('claro', { base: { ...base, theme: 'sepia' } }).theme).toBe('sepia');
    });

    it('lo que el usuario corrigió para esa situación manda', () => {
        const aprendidos = { oscuro: { theme: 'sepia', dim: 0.2, warm: 0 } };
        expect(ajustesPara('oscuro', { base, aprendidos })).toEqual(aprendidos.oscuro);
    });
});

describe('describir', () => {
    it('dice la situación, el tema y el brillo', () => {
        expect(describir('oscuro', { theme: 'warmnight', dim: 0.4 }, () => 'Noche cálida'))
            .toBe('A oscuras · noche cálida · brillo 60 %');
    });
});

describe('createConfortLuz', () => {
    it('la primera lectura fija el nivel en el acto', () => {
        const alCambiar = vi.fn();
        const confort = createConfortLuz({ alCambiar });
        confort.leer(3, 0);
        expect(alCambiar).toHaveBeenCalledWith('oscuro');
    });

    it('un cambio de luz breve no cambia la página', () => {
        const alCambiar = vi.fn();
        const confort = createConfortLuz({ alCambiar });
        confort.leer(300, 0);
        for (let t = 100; t < 1500; t += 100) confort.leer(5000, t);
        for (let t = 1500; t < 9000; t += 500) confort.leer(300, t);
        expect(alCambiar).toHaveBeenCalledTimes(1);
    });

    it('un cambio que se mantiene se aplica tras la espera', () => {
        const alCambiar = vi.fn();
        const confort = createConfortLuz({ alCambiar });
        confort.leer(300, 0);
        for (let t = 500; t <= 500 + ESPERA_MS * 3; t += 500) confort.leer(2, t);
        expect(alCambiar).toHaveBeenLastCalledWith('oscuro');
        expect(confort.nivel()).toBe('oscuro');
    });
});
