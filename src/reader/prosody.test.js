import { describe, it, expect } from 'vitest';
import {
    pauseAfter, isParagraphBreak, silenceBetween,
    rankVoices, bestVoice, qualityRank, QUALITY_ORDER,
} from './prosody.js';

describe('pauseAfter', () => {
    it('un punto pide más pausa que una coma', () => {
        // Es la diferencia entre leer y dictar: un motor de voz no añade ningún
        // silencio, devuelve el control en cuanto suena la última sílaba.
        expect(pauseAfter('Cerró la puerta.')).toBeGreaterThan(pauseAfter('Cerró la puerta,'));
    });

    it('los dos puntos anuncian y piden pausa marcada', () => {
        expect(pauseAfter('Dijo lo siguiente:')).toBeGreaterThan(pauseAfter('Dijo esto,'));
    });

    it('reconoce el punto detrás del cierre de comillas', () => {
        // «Se fue.» acaba en comilla, no en punto, pero cierra idea igual.
        expect(pauseAfter('«Se fue.»')).toBe(pauseAfter('Se fue.'));
    });

    it('un fragmento cortado a mitad de frase apenas se pausa', () => {
        // El troceador corta también por longitud: una pausa larga ahí sonaría
        // como un corte donde no hay ninguno.
        expect(pauseAfter('caminaba despacio hacia la')).toBeLessThan(100);
    });

    it('a más velocidad, pausas más cortas', () => {
        expect(pauseAfter('Fin.', 2)).toBeLessThan(pauseAfter('Fin.', 1));
    });

    it('pero nunca desaparecen del todo', () => {
        // Sin suelo, a velocidad alta se vuelve un dictado otra vez.
        expect(pauseAfter('Fin.', 4)).toBeGreaterThanOrEqual(50);
    });

    it('un fragmento vacío no pausa', () => {
        expect(pauseAfter('')).toBe(0);
        expect(pauseAfter('   ')).toBe(0);
        expect(pauseAfter(null)).toBe(0);
    });

    it('devuelve enteros: son milisegundos de espera', () => {
        expect(Number.isInteger(pauseAfter('Fin.', 1.25))).toBe(true);
    });
});

describe('isParagraphBreak', () => {
    it('detecta un párrafo nuevo tras cerrar idea', () => {
        expect(isParagraphBreak('Se marchó sin decir nada.', 'Al día siguiente llovía.')).toBe(true);
    });

    it('detecta el arranque de un diálogo', () => {
        expect(isParagraphBreak('Nadie contestó.', '—¿Estás ahí?')).toBe(true);
    });

    it('no hay párrafo si la frase anterior no cerró', () => {
        expect(isParagraphBreak('caminaba hacia la', 'casa de su madre')).toBe(false);
    });

    it('no hay párrafo si lo siguiente va en minúscula', () => {
        expect(isParagraphBreak('Se fue.', 'y nadie lo vio')).toBe(false);
    });

    it('aguanta entradas vacías', () => {
        expect(isParagraphBreak('', 'Algo')).toBe(false);
        expect(isParagraphBreak('Algo.', '')).toBe(false);
    });
});

describe('silenceBetween', () => {
    it('entre párrafos se pausa más que entre frases', () => {
        const between = silenceBetween('Se fue.', 'Y no volvió más.');
        const inside = silenceBetween('Se fue.', 'sin mirar atrás.');
        expect(between).toBeGreaterThan(inside);
    });

    it('el último fragmento solo lleva su propia pausa', () => {
        expect(silenceBetween('Fin.', null)).toBe(pauseAfter('Fin.'));
    });
});

describe('qualityRank', () => {
    it('ordena de peor a mejor', () => {
        expect(qualityRank('very-low')).toBeLessThan(qualityRank('normal'));
        expect(qualityRank('normal')).toBeLessThan(qualityRank('very-high'));
    });

    it('una calidad desconocida cae en el medio, no al fondo', () => {
        // Las voces del respaldo no traen calidad: hundirlas las dejaría fuera
        // aunque fueran las únicas disponibles.
        expect(qualityRank(null)).toBe(QUALITY_ORDER.indexOf('normal'));
        expect(qualityRank('inventada')).toBe(QUALITY_ORDER.indexOf('normal'));
    });
});

describe('rankVoices', () => {
    const voices = [
        { id: 'a', name: 'Inglesa buena', lang: 'en-US', quality: 'very-high', network: false },
        { id: 'b', name: 'Española mala', lang: 'es-ES', quality: 'very-low', network: false },
        { id: 'c', name: 'Española buena', lang: 'es-ES', quality: 'high', network: false },
        { id: 'd', name: 'Española de red', lang: 'es-ES', quality: 'very-high', network: true },
    ];

    it('el idioma manda sobre la calidad', () => {
        // Una voz inglesa leyendo español es ininteligible, por buena que sea.
        expect(rankVoices(voices, 'es')[0].lang).toMatch(/^es/);
    });

    it('entre las del idioma, primero la de más calidad', () => {
        const spanish = rankVoices(voices, 'es').filter((v) => v.lang.startsWith('es'));
        expect(qualityRank(spanish[0].quality)).toBeGreaterThanOrEqual(qualityRank(spanish[1].quality));
    });

    it('una voz sin conexión gana a una de red de la misma calidad', () => {
        // Las de red suenan mejor pero se cortan sin cobertura a mitad de
        // capítulo y consumen datos leyendo un libro entero.
        const ranked = rankVoices([
            { id: 'net', name: 'Red', lang: 'es-ES', quality: 'high', network: true },
            { id: 'local', name: 'Local', lang: 'es-ES', quality: 'high', network: false },
        ], 'es');
        expect(ranked[0].id).toBe('local');
    });

    it('no muta la lista original', () => {
        const original = [...voices];
        rankVoices(voices, 'es');
        expect(voices).toEqual(original);
    });

    it('acepta el idioma con región o sin ella', () => {
        expect(rankVoices(voices, 'es-MX')[0].lang).toMatch(/^es/);
    });
});

describe('bestVoice', () => {
    it('elige la mejor del idioma, no la primera de la lista', () => {
        // Android no ordena su lista por nada: antes se cogía la que tocara y
        // podía ser la de calidad «very-low».
        const best = bestVoice([
            { id: 'mala', lang: 'es-ES', quality: 'very-low', network: false },
            { id: 'buena', lang: 'es-ES', quality: 'very-high', network: false },
        ], 'es');
        expect(best.id).toBe('buena');
    });

    it('sin voces devuelve null en vez de romperse', () => {
        expect(bestVoice([], 'es')).toBeNull();
        expect(bestVoice(undefined, 'es')).toBeNull();
    });
});
