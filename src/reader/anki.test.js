import { describe, expect, it } from 'vitest';
import { fraseConPalabra, resaltarEnFrase, vocabularioParaAnki } from './anki.js';

describe('anki', () => {
    it('encuentra la frase con la palabra, entera', () => {
        const parrafo = 'Era tarde. El hidalgo, enjuto de carnes, salió al campo. Nadie lo vio.';
        expect(fraseConPalabra(parrafo, 'enjuto')).toBe('El hidalgo, enjuto de carnes, salió al campo.');
        // No vale dentro de otra palabra.
        expect(fraseConPalabra('Un desenjutoso cualquiera.', 'enjuto')).toBe('');
        expect(fraseConPalabra(parrafo, 'molino')).toBe('');
    });

    it('recorta las frases kilométricas alrededor de la palabra', () => {
        const larga = `${'palabra '.repeat(60)}objetivo ${'otra '.repeat(80)}fin.`;
        const frase = fraseConPalabra(larga, 'objetivo');
        expect(frase.length).toBeLessThanOrEqual(282);
        expect(frase).toContain('objetivo');
        expect(frase.startsWith('…')).toBe(true);
        expect(frase.endsWith('…')).toBe(true);
    });

    it('pone la palabra en negrita y escapa el resto', () => {
        expect(resaltarEnFrase('Dijo <no> al Molino y al molino.', 'molino'))
            .toBe('Dijo &lt;no&gt; al <b>Molino</b> y al <b>molino</b>.');
    });

    it('escribe un fichero que Anki importa sin preguntar', () => {
        const salida = vocabularioParaAnki([
            { word: 'enjuto', lang: 'es', definition: 'Delgado,\tseco', bookName: 'Don Quijote', frase: 'Era enjuto de carnes.', traduccion: 'lean' },
            { word: 'hidalgo', lang: 'es', definition: '', bookName: '' },
        ]);
        const lineas = salida.trim().split('\n');
        expect(lineas.slice(0, 5)).toEqual([
            '#separator:tab', '#html:true', '#notetype:Basic', '#deck:SharkReader::Vocabulario', '#tags column:3',
        ]);
        const [anverso, reverso, etiquetas] = lineas[5].split('\t');
        expect(anverso).toContain('<b>enjuto</b>');
        expect(reverso).toContain('lean');
        expect(reverso).toContain('Delgado, seco');
        expect(etiquetas).toBe('sharkreader idioma-es don-quijote');
        // Sin reverso, la palabra: Anki no admite tarjetas con un lado vacío.
        expect(lineas[6].split('\t')[1]).toBe('hidalgo');
        expect(lineas).toHaveLength(7);
    });
});
